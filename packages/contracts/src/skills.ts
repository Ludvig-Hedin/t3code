/**
 * Skills — Shared schemas for the Agent Skills system.
 *
 * Defines types for skill discovery, creation, and deletion following
 * the Agent Skills standard (agentskills.io). Skills are folders containing
 * a SKILL.md file with YAML frontmatter (name, description) and markdown
 * instructions that agents can discover and use.
 *
 * @module Skills
 */
import { Schema } from "effect";

// --- Read model returned by the server ---
// Uses Schema.Struct (not Schema.Class) so plain JSON objects decode correctly
// over RPC — Schema.Class requires class instances which don't survive JSON round-trips.

export const SkillInfo = Schema.Struct({
  /** Skill name (lowercase, hyphens, 1-64 chars) */
  name: Schema.String,
  /** Human-readable description of what the skill does */
  description: Schema.String,
  /** Absolute path to the SKILL.md file on disk */
  location: Schema.String,
  /** Markdown body content (everything after the YAML frontmatter) */
  content: Schema.String,
  /** True if the skill lives in t3code's managed directory and can be deleted */
  managed: Schema.Boolean,
});

export type SkillInfo = typeof SkillInfo.Type;

// --- Input for creating / updating a managed skill ---

/** Validated skill name: lowercase alphanumeric + hyphens, 1-64 chars */
const SkillName = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/),
);

export class SkillDraft extends Schema.Class<SkillDraft>("SkillDraft")({
  name: SkillName,
  description: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024)),
  content: Schema.String,
}) {}

// --- Input for deleting a managed skill ---

export class SkillDeleteInput extends Schema.Class<SkillDeleteInput>("SkillDeleteInput")({
  name: Schema.String.check(Schema.isNonEmpty()),
}) {}

// --- Input for AI-generating a skill from natural language ---

export class SkillGenerateInput extends Schema.Class<SkillGenerateInput>("SkillGenerateInput")({
  /** Natural language description of what the skill should do */
  description: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(2000)),
}) {}

// --- Result of AI skill generation ---

export const SkillGenerateResult = Schema.Struct({
  /** Generated SKILL.md content (frontmatter + body) */
  content: Schema.String,
  /** Whether real AI was used or a smart template fallback */
  method: Schema.Literals(["ai", "template"]),
});
export type SkillGenerateResult = typeof SkillGenerateResult.Type;

// --- Error type ---

export class SkillError extends Schema.TaggedErrorClass<SkillError>()("SkillError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return this.detail;
  }
}
