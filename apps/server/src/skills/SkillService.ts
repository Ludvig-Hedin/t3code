/**
 * SkillService — Server-side skill discovery and management.
 *
 * Discovers skills from standard agent skill directories at global (~/) and project
 * (cwd) level, Claude Code plugin marketplaces, and a managed directory for
 * user-created skills. Follows the Agent Skills standard: agentskills.io
 *
 * Discovery supports both flat layout (skills/NAME/SKILL.md) and nested/packaged
 * layout (skills/PROVIDER/NAME/SKILL.md) used by gstack and similar packages.
 *
 * @module SkillService
 */
import * as os from "node:os";

import { SkillDraft, SkillError, SkillGenerateResult, type SkillInfo } from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path, Schema, ServiceMap } from "effect";

import { ServerConfig } from "../config";

// --- SKILL.md frontmatter parser ---

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
// Matches single-line values: `name: my-skill`
const NAME_RE = /(?:^|\n)name:\s*['"]?(.+?)['"]?\s*(?:\n|$)/m;
// Matches single-line description values
const DESCRIPTION_INLINE_RE = /(?:^|\n)description:\s*['"]?(.+?)['"]?\s*(?:\n|$)/m;
// Matches YAML block scalars (| or >) followed by indented lines
const DESCRIPTION_BLOCK_RE = /(?:^|\n)description:\s*[|>]-?\s*\n((?:[ \t]+.+\n?)+)/m;

interface ParsedSkill {
  name: string;
  description: string;
  content: string;
}

/** Parse a SKILL.md file's raw text into structured fields. */
function parseSkillMd(raw: string): ParsedSkill | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const frontmatter = match[1] ?? "";
  const body = (match[2] ?? "").trim();

  const nameMatch = frontmatter.match(NAME_RE);
  if (!nameMatch?.[1]) return null;

  // Try block scalar first (description: | or description: >), then inline
  let description: string;
  const blockMatch = frontmatter.match(DESCRIPTION_BLOCK_RE);
  if (blockMatch?.[1]) {
    // Strip leading indentation and join block scalar lines into one sentence
    description = blockMatch[1]
      .split("\n")
      .map((line) => line.replace(/^[ \t]+/, ""))
      .filter((line) => line.length > 0)
      .join(" ")
      .trim();
  } else {
    const inlineMatch = frontmatter.match(DESCRIPTION_INLINE_RE);
    // Skip if the "value" is just a YAML block indicator (| or >)
    const inlineVal = (inlineMatch?.[1] ?? "").trim();
    description = /^[|>]/.test(inlineVal) ? "" : inlineVal;
  }

  if (!nameMatch[1] || !description) return null;

  return {
    name: nameMatch[1].trim(),
    description,
    content: body,
  };
}

/** Serialize a skill draft back to SKILL.md format with YAML frontmatter. */
function serializeSkillMd(input: { name: string; description: string; content: string }): string {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "---",
    "",
    input.content.trim(),
    "",
  ].join("\n");
}

// --- AI generation system prompt ---

const SKILL_GENERATION_SYSTEM_PROMPT = `You are a skill generator for AI coding assistants following the Agent Skills standard (agentskills.io).

Generate a SKILL.md file from the user's natural language description. Output ONLY the raw SKILL.md content.

Rules:
- name: kebab-case, max 64 chars, lowercase letters/numbers/hyphens only, descriptive but short
- description: a single clear sentence, max 120 chars
- Body: clear, actionable instructions for the AI agent

Required sections in the body:
## Role
Who/what the AI should act as for this skill.

## When to use
Specific triggers or scenarios when this skill should be invoked.

## Instructions
Numbered, concrete steps the AI should follow.

Start with --- frontmatter. No explanations, no code fences, no extra text before or after.`;

/**
 * Generate a SKILL.md template from a natural language description
 * without calling an external API. Used as fallback when no API key is available.
 */
function generateSkillTemplate(description: string): string {
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/);
  const name = words.slice(0, 5).join("-").slice(0, 64).replace(/-+$/, "");
  const shortDesc = description.length > 120 ? `${description.slice(0, 117)}...` : description;
  return [
    "---",
    `name: ${name}`,
    `description: ${shortDesc}`,
    "---",
    "",
    "## Role",
    "",
    `You are an expert assistant. ${description}`,
    "",
    "## When to use",
    "",
    `Use this skill when asked to ${description.toLowerCase().slice(0, 120)}.`,
    "",
    "## Instructions",
    "",
    "1. Read the request carefully and identify what is needed.",
    "2. Apply your expertise to complete the task accurately.",
    "3. Verify your output meets the requirements before responding.",
    "",
    "## Output format",
    "",
    "Provide clear, well-structured output appropriate to the request.",
  ].join("\n");
}

// --- External skill directory patterns ---
// These follow the directory layouts used by Claude Code, Codex, and other agents.
const EXTERNAL_DIRS = [".claude", ".agents"] as const;

// --- Service interface ---

export interface SkillServiceShape {
  /** List all discovered + managed skills. */
  readonly list: Effect.Effect<readonly SkillInfo[], SkillError>;

  /** Save (create or update) a managed skill. Writes SKILL.md to the managed directory. */
  readonly save: (draft: {
    readonly name: string;
    readonly description: string;
    readonly content: string;
  }) => Effect.Effect<SkillInfo, SkillError>;

  /** Remove a managed skill by name. Deletes the skill directory. */
  readonly remove: (name: string) => Effect.Effect<void, SkillError>;

  /** Generate a SKILL.md from a natural language description using AI or template fallback. */
  readonly generate: (
    description: string,
  ) => Effect.Effect<typeof SkillGenerateResult.Type, SkillError>;
}

export class SkillService extends ServiceMap.Service<SkillService, SkillServiceShape>()(
  "t3/skills/SkillService",
) {}

// --- Live implementation ---

export const makeSkillService = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  const home = os.homedir();

  /** The managed skills directory where user-created skills are stored. */
  const managedDir = pathService.join(config.stateDir, "skills");

  /** Build the absolute path for a managed skill's SKILL.md file. */
  const managedPath = (name: string) => pathService.join(managedDir, name, "SKILL.md");

  /**
   * Scan a `skills/` root directory for SKILL.md files, going up to 2 levels deep.
   *
   * Handles both layouts:
   *   - Flat:    skills/NAME/SKILL.md          (agentskills.io standard)
   *   - Nested:  skills/PROVIDER/NAME/SKILL.md  (gstack, packaged skill sets)
   */
  const scanSkillsRoot = (skillsRoot: string): Effect.Effect<readonly string[]> =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(skillsRoot);
      if (!exists) return [] as readonly string[];

      const entries = yield* fs
        .readDirectory(skillsRoot)
        .pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

      const results: string[] = [];
      for (const entry of entries) {
        const entryPath = pathService.join(skillsRoot, entry);

        // Level 1: skills/NAME/SKILL.md
        const directSkillMd = pathService.join(entryPath, "SKILL.md");
        if (yield* fs.exists(directSkillMd)) {
          results.push(directSkillMd);
        }

        // Level 2: skills/PROVIDER/NAME/SKILL.md (gstack-style nested)
        // Only scan subdirs when this entry itself is a directory
        const subEntries = yield* fs
          .readDirectory(entryPath)
          .pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

        for (const subEntry of subEntries) {
          const nestedSkillMd = pathService.join(entryPath, subEntry, "SKILL.md");
          if (yield* fs.exists(nestedSkillMd)) {
            results.push(nestedSkillMd);
          }
        }
      }
      return results;
    }).pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

  /**
   * Scan Claude Code plugin marketplace directories for installed plugin skills.
   *
   * Marketplace layout: marketplaces/MARKETPLACE/plugins/PLUGIN_NAME/skills/SKILL_NAME/SKILL.md
   * We skip `cache/` subdirs (version-pinned download artifacts, not installed skills).
   */
  const scanPluginMarketplaces = (marketplacesRoot: string): Effect.Effect<readonly string[]> =>
    Effect.gen(function* () {
      const exists = yield* fs.exists(marketplacesRoot);
      if (!exists) return [] as readonly string[];

      const marketplaces = yield* fs
        .readDirectory(marketplacesRoot)
        .pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

      const results: string[] = [];
      for (const marketplace of marketplaces) {
        // Skip caches — these are downloaded but not "installed" marketplace entries
        if (marketplace === "cache") continue;

        const pluginsDir = pathService.join(marketplacesRoot, marketplace, "plugins");
        const pluginDirExists = yield* fs.exists(pluginsDir);
        if (!pluginDirExists) continue;

        const plugins = yield* fs
          .readDirectory(pluginsDir)
          .pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

        for (const plugin of plugins) {
          const skillsRoot = pathService.join(pluginsDir, plugin, "skills");
          // Each plugin's skills/ dir follows the flat layout: skills/NAME/SKILL.md
          const pluginSkills = yield* scanSkillsRoot(skillsRoot);
          for (const p of pluginSkills) results.push(p);
        }

        // Also scan external_plugins (Figma, Discord, etc.)
        const externalPluginsDir = pathService.join(
          marketplacesRoot,
          marketplace,
          "external_plugins",
        );
        const externalExists = yield* fs.exists(externalPluginsDir);
        if (externalExists) {
          const externalPlugins = yield* fs
            .readDirectory(externalPluginsDir)
            .pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

          for (const plugin of externalPlugins) {
            const skillsRoot = pathService.join(externalPluginsDir, plugin, "skills");
            const pluginSkills = yield* scanSkillsRoot(skillsRoot);
            for (const p of pluginSkills) results.push(p);
          }
        }
      }
      return results;
    }).pipe(Effect.catch(() => Effect.succeed([] as readonly string[])));

  /**
   * Read and parse a SKILL.md file. Returns null if the file is unreadable or has invalid frontmatter.
   */
  const readSkillFile = (filePath: string, isManaged: boolean): Effect.Effect<SkillInfo | null> =>
    Effect.gen(function* () {
      const raw = yield* fs.readFileString(filePath);
      const parsed = parseSkillMd(raw);
      if (!parsed) return null;

      return {
        name: parsed.name,
        description: parsed.description,
        location: filePath,
        content: parsed.content,
        managed: isManaged,
      } satisfies SkillInfo;
    }).pipe(Effect.catch(() => Effect.succeed(null)));

  // --- Service methods ---

  const list: SkillServiceShape["list"] = Effect.gen(function* () {
    const skills = new Map<string, SkillInfo>();

    /**
     * Discovery order (later overrides earlier on name collision):
     * 1. ~/.claude/skills/*  (Claude global — flat + nested)
     * 2. ~/.agents/skills/*  (agent standard global — flat + nested)
     * 3. ~/.claude/plugins/marketplaces/* (Claude Code plugin marketplace)
     * 4. ${cwd}/.claude/skills/* (project-level Claude)
     * 5. ${cwd}/.agents/skills/* (project-level agent standard)
     * 6. ${stateDir}/skills/* (managed — always wins)
     */

    // 1 & 2: Global skill directories (flat + 2-level nested for packaged sets)
    for (const dir of EXTERNAL_DIRS) {
      const skillsRoot = pathService.join(home, dir, "skills");
      const paths = yield* scanSkillsRoot(skillsRoot);
      for (const p of paths) {
        const skill = yield* readSkillFile(p, false);
        if (skill) skills.set(skill.name, skill);
      }
    }

    // 3: Claude Code plugin marketplace skills
    const marketplacesRoot = pathService.join(home, ".claude", "plugins", "marketplaces");
    const pluginPaths = yield* scanPluginMarketplaces(marketplacesRoot);
    for (const p of pluginPaths) {
      const skill = yield* readSkillFile(p, false);
      if (skill) skills.set(skill.name, skill);
    }

    // 4 & 5: Project-level skill directories
    for (const dir of EXTERNAL_DIRS) {
      const skillsRoot = pathService.join(config.cwd, dir, "skills");
      const paths = yield* scanSkillsRoot(skillsRoot);
      for (const p of paths) {
        const skill = yield* readSkillFile(p, false);
        if (skill) skills.set(skill.name, skill);
      }
    }

    // 6: Managed skills (our own directory — always wins on name collision)
    const managedPaths = yield* scanSkillsRoot(managedDir);
    for (const p of managedPaths) {
      const skill = yield* readSkillFile(p, true);
      if (skill) skills.set(skill.name, skill);
    }

    // Return sorted by name for consistent ordering
    return Array.from(skills.values()).toSorted((a, b) => a.name.localeCompare(b.name));
  });

  const save: SkillServiceShape["save"] = (draft) =>
    Effect.gen(function* () {
      // Validate draft fields using the SkillDraft schema from contracts
      const validated = yield* Schema.decodeEffect(SkillDraft)(draft).pipe(
        Effect.mapError(
          (cause) =>
            new SkillError({
              detail: `Invalid skill draft: ${String(cause)}`,
              cause,
            }),
        ),
      );

      const filePath = managedPath(validated.name);
      const dirPath = pathService.dirname(filePath);

      // Ensure the skill directory exists
      yield* fs.makeDirectory(dirPath, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new SkillError({
              detail: `Failed to create skill directory: ${String(cause)}`,
              cause,
            }),
        ),
      );

      // Write the SKILL.md file
      const serialized = serializeSkillMd(validated);
      yield* fs.writeFileString(filePath, serialized).pipe(
        Effect.mapError(
          (cause) =>
            new SkillError({
              detail: `Failed to write skill file: ${String(cause)}`,
              cause,
            }),
        ),
      );

      return {
        name: validated.name,
        description: validated.description,
        location: filePath,
        content: validated.content.trim(),
        managed: true,
      } satisfies SkillInfo;
    });

  const remove: SkillServiceShape["remove"] = (name) =>
    Effect.gen(function* () {
      const filePath = managedPath(name);
      const dirPath = pathService.dirname(filePath);

      const exists = yield* fs.exists(dirPath).pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) {
        return yield* new SkillError({
          detail: `Managed skill "${name}" not found.`,
        });
      }

      yield* fs.remove(dirPath, { recursive: true }).pipe(
        Effect.mapError(
          (cause) =>
            new SkillError({
              detail: `Failed to remove skill "${name}": ${String(cause)}`,
              cause,
            }),
        ),
      );
    });

  const generate: SkillServiceShape["generate"] = (description) =>
    Effect.gen(function* () {
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (apiKey) {
        // Real AI generation via Anthropic Messages API
        const content = yield* Effect.tryPromise(async () => {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-haiku-3-5-20241022",
              max_tokens: 2048,
              system: SKILL_GENERATION_SYSTEM_PROMPT,
              messages: [{ role: "user", content: description }],
            }),
          });

          if (!response.ok) {
            throw new Error(
              `Anthropic API responded with ${response.status}: ${response.statusText}`,
            );
          }

          const data = (await response.json()) as {
            content: Array<{ type: string; text: string }>;
          };
          const text = data.content.find((c) => c.type === "text")?.text;
          if (!text) throw new Error("Empty response from Anthropic API");
          return text.trim();
        }).pipe(
          Effect.mapError((e) => new SkillError({ detail: `AI generation failed: ${String(e)}` })),
        );

        return { content, method: "ai" as const };
      }

      // Fallback: smart template generation (no API key required)
      return { content: generateSkillTemplate(description), method: "template" as const };
    });

  return { list, save, remove, generate } satisfies SkillServiceShape;
});

export const SkillServiceLive = Layer.effect(SkillService, makeSkillService);
