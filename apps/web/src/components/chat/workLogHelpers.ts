/**
 * Work log categorization and grouping helpers.
 *
 * These utilities are used to classify individual WorkLogEntry items into
 * semantic categories and then group consecutive same-class entries into
 * sections for the chat work-log panel.
 */

import type { WorkLogEntry } from "../../session-logic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Semantic category for a single work-log entry. */
export type WorkEntryCategory =
  | "reasoning"
  | "command"
  | "file-read"
  | "file-write"
  | "web-search"
  | "sub-agent"
  | "skill"
  | "tool-call";

/** A run of consecutive entries that belong to the same high-level section. */
export type WorkLogSection =
  | { kind: "reasoning"; entries: WorkLogEntry[] }
  | { kind: "tool"; entries: WorkLogEntry[] };

/** A single stat item shown in the work-log header (e.g. "Read 3 files"). */
export interface WorkLogStat {
  label: string;
  count: number;
}

// ---------------------------------------------------------------------------
// categorizeWorkEntry
// ---------------------------------------------------------------------------

/**
 * Maps a WorkLogEntry to one of the semantic WorkEntryCategory values.
 *
 * Priority order is important: reasoning > sub-agent > command > file-read >
 * file-write > web-search > skill > tool-call (catch-all).
 */
export function categorizeWorkEntry(entry: WorkLogEntry): WorkEntryCategory {
  // 1. Reasoning: explicit "thinking" tone or label prefix
  if (entry.tone === "thinking" || entry.label.startsWith("Reasoning update")) {
    return "reasoning";
  }

  // 2. Sub-agent: collab agent item type or common label prefixes
  if (
    entry.itemType === "collab_agent_tool_call" ||
    entry.label.startsWith("Subagent task") ||
    entry.label.startsWith("Agent:")
  ) {
    return "sub-agent";
  }

  // 3. Command: command_execution item type or presence of command field
  if (entry.itemType === "command_execution" || entry.command != null) {
    return "command";
  }

  // 4. File-read: explicit approval kind or image_view item type
  if (entry.requestKind === "file-read" || entry.itemType === "image_view") {
    return "file-read";
  }

  // 5. File-write: file-change approval kind, file_change item type, or
  //    changedFiles present without a command or detail (pure write event)
  if (
    entry.requestKind === "file-change" ||
    entry.itemType === "file_change" ||
    (entry.changedFiles != null && entry.command == null && entry.detail == null)
  ) {
    return "file-write";
  }

  // 6. Web-search
  if (entry.itemType === "web_search") {
    return "web-search";
  }

  // 7. Skill: Skill tool invocation — label contains '— Skill: {' pattern with a "skill" key.
  //    e.g. 'Tool call — Skill: {"skill":"code-review:code-review"}'
  if (SKILL_LABEL_RE.test(entry.label) || entry.toolTitle === "Skill") {
    return "skill";
  }

  // 8. Catch-all: generic tool call
  return "tool-call";
}

/** Matches labels produced by the Skill tool: "… Skill: {"skill":"..."}" */
const SKILL_LABEL_RE = /[—-]\s*Skill:\s*\{[^}]*"skill"\s*:/;

// ---------------------------------------------------------------------------
// groupWorkEntriesIntoSections
// ---------------------------------------------------------------------------

/**
 * Groups consecutive entries of the same high-level type into sections.
 *
 * "reasoning" entries → reasoning section.
 * All other categories → tool section.
 *
 * A new section begins whenever the high-level type changes.
 */
export function groupWorkEntriesIntoSections(entries: WorkLogEntry[]): WorkLogSection[] {
  const sections: WorkLogSection[] = [];

  for (const entry of entries) {
    const category = categorizeWorkEntry(entry);
    const sectionKind = category === "reasoning" ? "reasoning" : "tool";

    const last = sections[sections.length - 1];
    if (last && last.kind === sectionKind) {
      // Continue the current section
      last.entries.push(entry);
    } else {
      // Start a new section
      sections.push({ kind: sectionKind, entries: [entry] });
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// computeReasoningDuration
// ---------------------------------------------------------------------------

/**
 * Returns a human-readable duration string (e.g. "12s" or "1m 4s") spanning
 * the createdAt timestamps of the first and last entry in the array.
 *
 * Returns null when there is only one entry (no meaningful span to show) or
 * when timestamps are invalid / in the wrong order.
 */
export function computeReasoningDuration(entries: WorkLogEntry[]): string | null {
  if (entries.length < 2) return null;

  const start = Date.parse(entries[0]!.createdAt);
  const end = Date.parse(entries[entries.length - 1]!.createdAt);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;

  const ms = end - start;
  const totalSeconds = Math.round(ms / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${totalSeconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

// ---------------------------------------------------------------------------
// computeWorkLogHeaderStats
// ---------------------------------------------------------------------------

// Mapping from category to a human-readable singular/plural label template.
const CATEGORY_LABEL: Partial<Record<WorkEntryCategory, (count: number) => string>> = {
  command: (n) => `${n === 1 ? "1 command" : `${n} commands`}`,
  "file-read": (n) => `Read ${n} ${n === 1 ? "file" : "files"}`,
  "file-write": (n) => `Edited ${n} ${n === 1 ? "file" : "files"}`,
  "web-search": (n) => `${n === 1 ? "1 search" : `${n} searches`}`,
  "sub-agent": (n) => `${n === 1 ? "1 sub-agent" : `${n} sub-agents`}`,
  skill: (n) => `${n === 1 ? "1 skill" : `${n} skills`}`,
  "tool-call": (n) => `${n === 1 ? "1 tool call" : `${n} tool calls`}`,
};

/**
 * Aggregates a group of entries by category (excluding reasoning entries) and
 * returns an ordered array of { label, count } stats for display in the
 * work-log section header.
 *
 * Returns an empty array when all entries are reasoning entries.
 */
export function computeWorkLogHeaderStats(entries: WorkLogEntry[]): WorkLogStat[] {
  const counts = new Map<WorkEntryCategory, number>();

  for (const entry of entries) {
    const category = categorizeWorkEntry(entry);
    if (category === "reasoning") continue; // reasoning is shown separately
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const stats: WorkLogStat[] = [];
  for (const [category, count] of counts) {
    const labelFn = CATEGORY_LABEL[category];
    if (labelFn) {
      stats.push({ label: labelFn(count), count });
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// parseSubAgentDescription
// ---------------------------------------------------------------------------

/** Attempt to extract "description" from a JSON string. */
function extractDescriptionFromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "description" in parsed) {
      const desc = (parsed as Record<string, unknown>)["description"];
      if (typeof desc === "string" && desc.trim().length > 0) {
        return desc.trim();
      }
    }
  } catch {
    // Not valid JSON — try extracting via regex as a fallback
    const match = /"description"\s*:\s*"([^"]+)"/.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Attempt to extract the `subagent_type` field from a JSON string. */
function extractSubagentTypeFromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "subagent_type" in parsed) {
      const raw = (parsed as Record<string, unknown>)["subagent_type"];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
  } catch {
    const match = /"subagent_type"\s*:\s*"([^"]+)"/.exec(text);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Attempt to extract the `prompt` field from a JSON string. */
function extractPromptFromJson(text: string): string | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "prompt" in parsed) {
      const raw = (parsed as Record<string, unknown>)["prompt"];
      if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
    }
  } catch {
    // Capture the full JSON string token (quotes included) so escapes are interpreted by JSON.parse.
    const match = /"prompt"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(text);
    if (match?.[1]) {
      try {
        const parsed: unknown = JSON.parse(`[${match[1]}]`);
        if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === "string") {
          const s = parsed[0].trim();
          if (s.length > 0) return s;
        }
      } catch {
        // ignore — treat as unparsable
      }
    }
  }
  return null;
}

/**
 * Convert a subagent_type slug ("general-purpose", "brand-voice:content-generation")
 * to a readable title ("General Purpose", "Brand Voice – Content Generation").
 */
export function formatSubagentType(slug: string): string {
  return slug
    .split(":")
    .map((part) =>
      part
        .split("-")
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
        .join(" "),
    )
    .join(" – ");
}

/** Parse the sub-agent's type slug from the label or detail JSON. */
export function parseSubAgentType(label: string, detail?: string): string | null {
  return (
    extractSubagentTypeFromJson(label) ?? (detail ? extractSubagentTypeFromJson(detail) : null)
  );
}

/** Parse the sub-agent's prompt body (the instructions) from label or detail. */
export function parseSubAgentPrompt(label: string, detail?: string): string | null {
  return extractPromptFromJson(label) ?? (detail ? extractPromptFromJson(detail) : null);
}

/**
 * Extracts a clean description from a sub-agent label or its detail string.
 *
 * Strategy:
 * 1. Try to parse the label as JSON and extract the "description" field.
 * 2. Try the detail string in the same way.
 * 3. Fall back to a stripped version of the label (remove JSON-like noise).
 * 4. Ultimate fallback: "Running sub-agent".
 */
// ---------------------------------------------------------------------------
// parseSkillName
// ---------------------------------------------------------------------------

/**
 * Extracts a clean, human-readable skill name from a Skill tool invocation label.
 *
 * The raw label looks like: 'Tool call — Skill: {"skill":"code-review:code-review"}'
 * We extract the "skill" value and convert the slug into a readable title.
 *
 * Strategy:
 * 1. Parse the JSON portion and read the "skill" key.
 * 2. Regex fallback if full JSON parse fails.
 * 3. Convert slug (e.g. "code-review:code-review") → "Code Review".
 * 4. Ultimate fallback: "Skill".
 */
export function parseSkillName(label: string): string {
  // Extract the JSON-like fragment after "Skill: "
  const jsonMatch = /Skill:\s*(\{[^}]+\})/.exec(label);
  const jsonFragment = jsonMatch?.[1];

  let slug: string | null = null;

  if (jsonFragment) {
    try {
      const parsed: unknown = JSON.parse(jsonFragment);
      if (parsed && typeof parsed === "object" && "skill" in parsed) {
        const raw = (parsed as Record<string, unknown>)["skill"];
        if (typeof raw === "string" && raw.trim().length > 0) {
          slug = raw.trim();
        }
      }
    } catch {
      // Regex fallback
      const match = /"skill"\s*:\s*"([^"]+)"/.exec(jsonFragment);
      if (match?.[1]) slug = match[1];
    }
  }

  if (!slug) return "Skill";

  // Convert "namespace:name" → use only the name segment after the last ":"
  const namePart = slug.split(":").at(-1) ?? slug;
  // Convert slug-style (dashes) to Title Case: "code-review" → "Code Review"
  return namePart
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function parseSubAgentDescription(label: string, detail?: string): string {
  const fromLabel = extractDescriptionFromJson(label);
  if (fromLabel) return fromLabel;

  if (detail) {
    const fromDetail = extractDescriptionFromJson(detail);
    if (fromDetail) return fromDetail;
  }

  // Strip common prefixes (with optional colon/space separator) and JSON-looking noise
  const stripped = label
    .replace(/^(Subagent task|Agent):?\s*/i, "")
    .replace(/\{.*\}/s, "")
    .trim();

  if (stripped.length > 0) return stripped;

  return "Running sub-agent";
}
