/**
 * humanizeToolDetail
 *
 * Transforms raw tool-call detail strings (of the form "{toolName}: {JSON_or_plain_text}")
 * into short, natural-language summaries suitable for the "Clean view" of the
 * chat work log.
 *
 * Goal: show ALL relevant info (paths, patterns, line ranges, skill names,
 * etc.) but without raw JSON noise. We never hide information — we just format
 * it for humans.
 *
 * Example transformations:
 *   'Grep: {"pattern":"foo","path":"/repo/project/src"}'
 *     → 'Searched for "foo" in src'
 *   'Read: {"file_path":"/repo/project/src/app.ts","offset":10,"limit":5}'
 *     → 'Read src/app.ts (lines 11–15)'
 *   'Skill: {"skill":"superpowers:systematic-debugging"}'
 *     → 'Used skill: Superpowers – Systematic Debugging'
 *   'Bash: npm run build'
 *     → 'Ran: npm run build'
 */

import { truncate } from "@t3tools/shared/String";

const MAX_VALUE_LENGTH = 80;
const COMMON_SHELL_NAMES = new Set(["sh", "bash", "zsh", "fish"]);

// ---------------------------------------------------------------------------
// Path / string helpers
// ---------------------------------------------------------------------------

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function truncateValue(value: string): string {
  return truncate(value, MAX_VALUE_LENGTH);
}

function quoteValue(value: string): string {
  return `"${truncateValue(value)}"`;
}

/**
 * Convert an absolute path to a relative one by stripping the project root
 * prefix. Returns the original value when no match is possible.
 */
export function relativizePath(absolutePath: string, cwd: string | undefined): string {
  if (!cwd) {
    return absolutePath;
  }

  const normalizedPath = normalizePathSeparators(absolutePath);
  const normalizedCwd = normalizePathSeparators(cwd).replace(/\/+$/, "");

  if (normalizedPath === normalizedCwd) {
    return ".";
  }

  const prefix = `${normalizedCwd}/`;
  if (!normalizedPath.startsWith(prefix)) {
    return absolutePath;
  }

  return normalizedPath.slice(prefix.length);
}

// ---------------------------------------------------------------------------
// JSON extraction helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  payload: Record<string, unknown>,
  ...keys: ReadonlyArray<string>
): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readNumberField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseJsonPayload(payload: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatRelativePath(path: string | null, cwd: string | undefined): string | null {
  if (!path) return null;
  return relativizePath(path, cwd);
}

function formatLineRange(offset: number | null, limit: number | null): string | null {
  if (offset === null || limit === null || limit <= 0) {
    return null;
  }
  const startLine = offset + 1;
  const endLine = offset + limit;
  return `lines ${startLine}\u2013${endLine}`;
}

function formatAbsoluteLineRange(startLine: number, endLine: number): string {
  return `lines ${startLine}\u2013${endLine}`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function basename(path: string): string {
  const normalized = stripTrailingSlash(normalizePathSeparators(path));
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

function formatPathLabel(path: string, cwd: string | undefined): string {
  return formatRelativePath(path, cwd) ?? path;
}

function formatQuotedList(values: ReadonlyArray<string>): string {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return quoteValue(values[0]!);
  }
  if (values.length === 2) {
    return `${quoteValue(values[0]!)} or ${quoteValue(values[1]!)}`;
  }
  return `${values
    .slice(0, -1)
    .map((value) => quoteValue(value))
    .join(", ")}, or ${quoteValue(values[values.length - 1]!)}`;
}

function formatPathList(paths: ReadonlyArray<string>, cwd: string | undefined): string {
  const formatted = paths.map((path) => formatPathLabel(path, cwd));
  if (formatted.length === 0) {
    return "project files";
  }
  if (formatted.length === 1) {
    return formatted[0]!;
  }
  if (formatted.length === 2) {
    return `${formatted[0]!} and ${formatted[1]!}`;
  }
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]!}`;
}

function compressPaths(paths: ReadonlyArray<string>): string[] {
  const normalized = [
    ...new Set(paths.map((path) => stripTrailingSlash(normalizePathSeparators(path)))),
  ];
  return normalized.filter(
    (candidate, index) =>
      !normalized.some(
        (other, otherIndex) =>
          otherIndex !== index && (candidate === other || candidate.startsWith(`${other}/`)),
      ),
  );
}

type QuoteState = "'" | '"' | null;

export function splitTopLevelShell(input: string, delimiter: "&&" | "|"): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: QuoteState = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    const next = input[index + 1];

    if (char === "\\" && quote !== "'") {
      current += char;
      if (next !== undefined) {
        current += next;
        index += 1;
      }
      continue;
    }

    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'";
      current += char;
      continue;
    }

    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"';
      current += char;
      continue;
    }

    if (quote === null) {
      if (delimiter === "&&" && char === "&" && next === "&") {
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          parts.push(trimmed);
        }
        current = "";
        index += 1;
        continue;
      }
      if (delimiter === "|" && char === "|") {
        if (next === "|") {
          current += char;
          current += next;
          index += 1;
          continue;
        }
        const trimmed = current.trim();
        if (trimmed.length > 0) {
          parts.push(trimmed);
        }
        current = "";
        continue;
      }
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    parts.push(trimmed);
  }

  return parts;
}

function tokenizeShellCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: QuoteState = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;

    if (char === "\\" && quote !== "'") {
      const next = input[index + 1];
      if (next !== undefined) {
        current += next;
        index += 1;
      }
      continue;
    }

    if (char === "'" && quote !== '"') {
      quote = quote === "'" ? null : "'";
      continue;
    }

    if (char === '"' && quote !== "'") {
      quote = quote === '"' ? null : '"';
      continue;
    }

    if (quote === null && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function unwrapShellWrapper(command: string): string {
  const tokens = tokenizeShellCommand(command.trim());
  if (tokens.length < 3) {
    return command.trim();
  }

  const shellBinary = basename(tokens[0]!).toLowerCase();
  const invocationFlag = tokens[1]!;
  if (!COMMON_SHELL_NAMES.has(shellBinary) || !invocationFlag.includes("c")) {
    return command.trim();
  }

  return tokens[2]!.trim();
}

function humanizePwdCommand(): string {
  return "Print the current folder";
}

function lowerCaseFirstCharacter(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function humanizeCatCommand(tokens: ReadonlyArray<string>, cwd: string | undefined): string | null {
  if (tokens.length !== 2) {
    return null;
  }
  return `Show ${formatPathLabel(tokens[1]!, cwd)}`;
}

function humanizeSedCommand(tokens: ReadonlyArray<string>, cwd: string | undefined): string | null {
  if (tokens[0] !== "sed") {
    return null;
  }

  const filePath = tokens.at(-1);
  const rangeTokenIndex = tokens.findIndex((token) => /^(\d+),(\d+)p$/.test(token));
  if (!filePath || rangeTokenIndex === -1) {
    return null;
  }

  const match = /^(\d+),(\d+)p$/.exec(tokens[rangeTokenIndex]!);
  if (!match) {
    return null;
  }

  const startLine = Number.parseInt(match[1]!, 10);
  const endLine = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
    return null;
  }

  return `Print ${formatAbsoluteLineRange(startLine, endLine)} of ${formatPathLabel(filePath, cwd)}`;
}

function formatRgPattern(pattern: string): string {
  const terms = pattern
    .split("|")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  if (terms.length === 0) {
    return quoteValue(pattern);
  }
  return formatQuotedList(terms);
}

function humanizeRgFilesCommand(tokens: ReadonlyArray<string>): string {
  const globPatterns: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if ((token === "-g" || token === "--glob") && tokens[index + 1]) {
      globPatterns.push(tokens[index + 1]!);
      index += 1;
    }
  }

  const includePatterns = globPatterns.filter((pattern) => !pattern.startsWith("!"));
  const hasProjectMetadata =
    includePatterns.includes("PROJECT.md") ||
    includePatterns.includes("AGENTS.md") ||
    includePatterns.includes("package.json");
  const hasSourceDirectories = includePatterns.some((pattern) =>
    ["src/**", "app/**", "components/**", "pages/**", "routes/**", "ui/**"].includes(pattern),
  );

  if (hasProjectMetadata && hasSourceDirectories) {
    return "List key project files and source directories";
  }

  return "List matching files";
}

function humanizeRgSearchCommand(tokens: ReadonlyArray<string>, cwd: string | undefined): string {
  let pattern: string | null = null;
  const paths: string[] = [];
  const excludeHints: string[] = [];

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;

    if (token === "-n" || token === "--line-number") {
      continue;
    }

    if (token === "-g" || token === "--glob") {
      const glob = tokens[index + 1];
      if (glob) {
        if (glob.startsWith("!")) {
          excludeHints.push(glob.slice(1));
        }
        index += 1;
      }
      continue;
    }

    if (token.startsWith("-")) {
      continue;
    }

    if (pattern === null) {
      pattern = token;
      continue;
    }

    paths.push(token);
  }

  const normalizedPaths = compressPaths(paths);
  const scope = formatPathList(normalizedPaths, cwd);
  const skipNodeModules = excludeHints.some((hint) => hint.includes("node_modules"));
  const suffix = skipNodeModules ? " (skip node_modules)" : "";

  if (!pattern) {
    return `Search in ${scope}${suffix}`;
  }

  return `Search in ${scope} for ${formatRgPattern(pattern)}${suffix}`;
}

function humanizeRgCommand(tokens: ReadonlyArray<string>, cwd: string | undefined): string | null {
  if (tokens[0] !== "rg") {
    return null;
  }

  if (tokens.includes("--files")) {
    return humanizeRgFilesCommand(tokens);
  }

  return humanizeRgSearchCommand(tokens, cwd);
}

function humanizeHeadSuffix(tokens: ReadonlyArray<string>): string | null {
  if (tokens[0] !== "head") {
    return null;
  }

  const countIndex = tokens.findIndex((token) => token === "-n" || token === "--lines");
  if (countIndex === -1 || !tokens[countIndex + 1]) {
    return null;
  }

  const count = Number.parseInt(tokens[countIndex + 1]!, 10);
  if (!Number.isFinite(count)) {
    return null;
  }

  return `(first ${count} matches)`;
}

function humanizeSingleShellCommand(command: string, cwd: string | undefined): string | null {
  const normalized = unwrapShellWrapper(command);
  const pipeline = splitTopLevelShell(normalized, "|");
  const headSuffix =
    pipeline.length === 2 ? humanizeHeadSuffix(tokenizeShellCommand(pipeline[1]!)) : null;
  const baseCommand = pipeline[0]!;
  const tokens = tokenizeShellCommand(baseCommand);
  if (tokens.length === 0) {
    return null;
  }

  let description: string | null = null;
  switch (tokens[0]) {
    case "pwd":
      description = humanizePwdCommand();
      break;
    case "cat":
      description = humanizeCatCommand(tokens, cwd);
      break;
    case "sed":
      description = humanizeSedCommand(tokens, cwd);
      break;
    case "rg":
      description = humanizeRgCommand(tokens, cwd);
      break;
    default:
      description = `Run ${normalized}`;
      break;
  }

  if (!description) {
    return null;
  }

  return headSuffix ? `${description} ${headSuffix}` : description;
}

export function humanizeShellCommand(command: string, cwd: string | undefined): string | null {
  const normalized = unwrapShellWrapper(command);
  if (normalized.length === 0) {
    return null;
  }

  const steps = splitTopLevelShell(normalized, "&&");
  const descriptions = steps
    .map((step) => humanizeSingleShellCommand(step, cwd))
    .filter((description): description is string => description !== null);

  if (descriptions.length === 0) {
    return null;
  }

  if (descriptions.length === 1) {
    return `${descriptions[0]!}.`;
  }

  return `${descriptions[0]!}, then ${descriptions
    .slice(1)
    .map((description) => lowerCaseFirstCharacter(description))
    .join(", then ")}.`;
}

// ---------------------------------------------------------------------------
// Skill slug formatting
// ---------------------------------------------------------------------------

/**
 * Convert a skill slug like "superpowers:systematic-debugging" into a
 * human-readable phrase like "Superpowers – Systematic Debugging".
 *
 * Preserves namespace info (user explicitly asked to see it).
 */
export function formatSkillSlug(slug: string): string {
  const parts = slug.split(":").filter((p) => p.length > 0);
  if (parts.length === 0) return slug;
  // Use en-dash to separate namespace from skill name for readability.
  return parts.map(slugToTitleCase).join(" \u2013 ");
}

function slugToTitleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Unknown tool fallback — show the first useful field instead of hiding info
// ---------------------------------------------------------------------------

/**
 * Build a brief inline summary of an unknown tool's JSON input. Picks common
 * descriptive fields first; falls back to the first string value. This keeps
 * the user informed about what the tool did rather than just showing its name.
 */
function summarizeUnknownJsonInput(
  payload: Record<string, unknown>,
  cwd: string | undefined,
): string | null {
  const pathKeys = ["file_path", "path", "notebook_path"];
  for (const key of pathKeys) {
    const raw = readStringField(payload, key);
    if (raw) return relativizePath(raw, cwd);
  }

  const descriptiveKeys = ["query", "description", "pattern", "command", "url", "name", "title"];
  for (const key of descriptiveKeys) {
    const raw = readStringField(payload, key);
    if (raw) return truncateValue(raw);
  }

  // Last resort: show the first string value we can find, prefixed with its key
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string" && value.trim().length > 0) {
      return `${key}: ${truncateValue(value.trim())}`;
    }
    if (typeof value === "number") {
      return `${key}: ${value}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Humanize the raw detail string attached to a tool-call work-log entry.
 *
 * Returns a human-readable string, or `null` when the format is unexpected
 * (so the caller can fall back to the raw display).
 */
export function humanizeToolDetail(detail: string, cwd: string | undefined): string | null {
  const match = /^([^:]+):\s*([\s\S]+)$/.exec(detail.trim());
  if (!match) {
    return null;
  }

  const toolName = match[1]?.trim();
  const payloadText = match[2]?.trim();
  if (!toolName || !payloadText) {
    return null;
  }

  const jsonPayload = parseJsonPayload(payloadText);

  switch (toolName) {
    case "Grep": {
      if (!jsonPayload) return null;
      const pattern = readStringField(jsonPayload, "pattern");
      if (!pattern) return null;
      const path = formatRelativePath(readStringField(jsonPayload, "path"), cwd);
      const glob = readStringField(jsonPayload, "glob");
      const type = readStringField(jsonPayload, "type");
      const outputMode = readStringField(jsonPayload, "output_mode");

      const scope = path
        ? `in ${path}`
        : glob
          ? `in files matching ${quoteValue(glob)}`
          : type
            ? `in ${type} files`
            : "in project files";

      const modeSuffix =
        outputMode === "files_with_matches"
          ? " (listing matching files)"
          : outputMode === "count"
            ? " (counting matches)"
            : "";

      return `Searched for ${quoteValue(pattern)} ${scope}${modeSuffix}`;
    }

    case "Read": {
      if (!jsonPayload) return null;
      const filePath = formatRelativePath(readStringField(jsonPayload, "file_path", "path"), cwd);
      if (!filePath) return null;
      const lineRange = formatLineRange(
        readNumberField(jsonPayload, "offset"),
        readNumberField(jsonPayload, "limit"),
      );
      return lineRange ? `Read ${filePath} (${lineRange})` : `Read ${filePath}`;
    }

    case "Edit": {
      if (!jsonPayload) return null;
      const filePath = formatRelativePath(readStringField(jsonPayload, "file_path", "path"), cwd);
      if (!filePath) return null;
      const replaceAll = jsonPayload.replace_all === true;
      return replaceAll ? `Edited ${filePath} (replace all)` : `Edited ${filePath}`;
    }

    case "MultiEdit": {
      if (!jsonPayload) return null;
      const filePath = formatRelativePath(readStringField(jsonPayload, "file_path", "path"), cwd);
      if (!filePath) return null;
      const editsVal = jsonPayload.edits;
      const editCount = Array.isArray(editsVal) ? editsVal.length : null;
      return editCount
        ? `Edited ${filePath} (${editCount} change${editCount === 1 ? "" : "s"})`
        : `Edited ${filePath}`;
    }

    case "Write": {
      if (!jsonPayload) return null;
      const filePath = formatRelativePath(readStringField(jsonPayload, "file_path", "path"), cwd);
      return filePath ? `Wrote ${filePath}` : null;
    }

    case "NotebookEdit": {
      if (!jsonPayload) return null;
      const filePath = formatRelativePath(
        readStringField(jsonPayload, "notebook_path", "file_path"),
        cwd,
      );
      return filePath ? `Edited notebook ${filePath}` : null;
    }

    case "Glob": {
      if (!jsonPayload) return null;
      const pattern = readStringField(jsonPayload, "pattern");
      if (!pattern) return null;
      const path = formatRelativePath(readStringField(jsonPayload, "path"), cwd);
      return path
        ? `Found files matching ${quoteValue(pattern)} in ${path}`
        : `Found files matching ${quoteValue(pattern)}`;
    }

    case "Agent":
    case "Task": {
      if (!jsonPayload) return null;
      const description = readStringField(jsonPayload, "description");
      const subagentType = readStringField(jsonPayload, "subagent_type");
      if (description && subagentType) {
        return `Delegated to ${formatSkillSlug(subagentType)}: ${truncateValue(description)}`;
      }
      if (description) return `Delegated: ${truncateValue(description)}`;
      if (subagentType) return `Delegated to ${formatSkillSlug(subagentType)}`;
      return null;
    }

    case "WebFetch": {
      if (!jsonPayload) return null;
      const url = readStringField(jsonPayload, "url");
      return url ? `Fetched ${truncateValue(url)}` : null;
    }

    case "WebSearch": {
      if (!jsonPayload) return null;
      const query = readStringField(jsonPayload, "query", "q");
      return query ? `Searched web for ${quoteValue(query)}` : null;
    }

    case "Bash": {
      if (jsonPayload) {
        const command = readStringField(jsonPayload, "command", "cmd");
        if (command) {
          return humanizeShellCommand(command, cwd) ?? `Run ${truncateValue(command)}`;
        }
      }
      return humanizeShellCommand(payloadText, cwd) ?? `Run ${truncateValue(payloadText)}`;
    }

    case "Skill": {
      // Skill invocations: show the full "namespace – name" so the user can
      // tell which skill was used without opening raw view.
      if (!jsonPayload) return "Used skill";
      const slug = readStringField(jsonPayload, "skill");
      const args = readStringField(jsonPayload, "args");
      if (!slug) return args ? `Used skill (${truncateValue(args)})` : "Used skill";
      const formattedName = formatSkillSlug(slug);
      return args
        ? `Used skill: ${formattedName} (${truncateValue(args)})`
        : `Used skill: ${formattedName}`;
    }

    case "TodoWrite": {
      if (!jsonPayload) return "Updated todo list";
      const todos = jsonPayload.todos;
      if (Array.isArray(todos)) {
        return `Updated todo list (${todos.length} item${todos.length === 1 ? "" : "s"})`;
      }
      return "Updated todo list";
    }

    case "ToolSearch": {
      if (!jsonPayload) return "Loaded tool schema";
      const query = readStringField(jsonPayload, "query");
      return query ? `Loaded tools matching ${quoteValue(query)}` : "Loaded tool schema";
    }

    default: {
      // Unknown tool: preserve the tool name and append a brief description
      // of its input so the user doesn't lose information.
      if (jsonPayload) {
        const summary = summarizeUnknownJsonInput(jsonPayload, cwd);
        return summary ? `${toolName}: ${summary}` : toolName;
      }
      // Non-JSON unknown payload — show the raw text, truncated.
      return `${toolName}: ${truncateValue(payloadText)}`;
    }
  }
}
