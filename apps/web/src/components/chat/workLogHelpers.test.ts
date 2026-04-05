import { describe, expect, it } from "vitest";

import type { WorkLogEntry } from "../../session-logic";
import {
  categorizeWorkEntry,
  computeReasoningDuration,
  computeWorkLogHeaderStats,
  groupWorkEntriesIntoSections,
  parseSkillName,
  parseSubAgentDescription,
} from "./workLogHelpers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid WorkLogEntry with sensible defaults. */
function makeEntry(overrides: Partial<WorkLogEntry> & { id?: string }): WorkLogEntry {
  return {
    id: overrides.id ?? "e1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
    label: overrides.label ?? "Some action",
    tone: overrides.tone ?? "tool",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// categorizeWorkEntry
// ---------------------------------------------------------------------------

describe("categorizeWorkEntry", () => {
  it("returns 'reasoning' when tone is thinking", () => {
    expect(categorizeWorkEntry(makeEntry({ tone: "thinking" }))).toBe("reasoning");
  });

  it("returns 'reasoning' for 'Reasoning update' label prefix regardless of tone", () => {
    expect(
      categorizeWorkEntry(makeEntry({ label: "Reasoning update: step 1", tone: "tool" })),
    ).toBe("reasoning");
  });

  it("returns 'sub-agent' for collab_agent_tool_call itemType", () => {
    expect(
      categorizeWorkEntry(makeEntry({ itemType: "collab_agent_tool_call", tone: "tool" })),
    ).toBe("sub-agent");
  });

  it("returns 'sub-agent' for 'Subagent task' label prefix", () => {
    expect(categorizeWorkEntry(makeEntry({ label: "Subagent task: research" }))).toBe("sub-agent");
  });

  it("returns 'sub-agent' for 'Agent:' label prefix", () => {
    expect(categorizeWorkEntry(makeEntry({ label: "Agent: coder" }))).toBe("sub-agent");
  });

  it("returns 'command' for command_execution itemType", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "command_execution" }))).toBe("command");
  });

  it("returns 'command' when entry has a command field", () => {
    expect(categorizeWorkEntry(makeEntry({ command: "npm install" }))).toBe("command");
  });

  it("returns 'file-read' for requestKind === file-read", () => {
    expect(categorizeWorkEntry(makeEntry({ requestKind: "file-read" }))).toBe("file-read");
  });

  it("returns 'file-read' for image_view itemType", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "image_view" }))).toBe("file-read");
  });

  it("returns 'file-write' for requestKind === file-change", () => {
    expect(categorizeWorkEntry(makeEntry({ requestKind: "file-change" }))).toBe("file-write");
  });

  it("returns 'file-write' for file_change itemType", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "file_change" }))).toBe("file-write");
  });

  it("returns 'file-write' when changedFiles is present and no command/detail", () => {
    expect(
      // omit command and detail entirely so exactOptionalPropertyTypes is satisfied
      categorizeWorkEntry(makeEntry({ changedFiles: ["src/foo.ts"] })),
    ).toBe("file-write");
  });

  it("does NOT return 'file-write' when changedFiles is present but command is also set", () => {
    // command takes priority
    expect(
      categorizeWorkEntry(makeEntry({ changedFiles: ["src/foo.ts"], command: "git commit" })),
    ).toBe("command");
  });

  it("does NOT return 'file-write' when changedFiles is present but detail is also set", () => {
    // detail present → falls through to tool-call catch-all since no other condition matches
    expect(
      categorizeWorkEntry(makeEntry({ changedFiles: ["src/foo.ts"], detail: "some detail" })),
    ).toBe("tool-call");
  });

  it("returns 'web-search' for web_search itemType", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "web_search" }))).toBe("web-search");
  });

  it("returns 'tool-call' for mcp_tool_call itemType (catch-all)", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "mcp_tool_call" }))).toBe("tool-call");
  });

  it("returns 'tool-call' for dynamic_tool_call itemType (catch-all)", () => {
    expect(categorizeWorkEntry(makeEntry({ itemType: "dynamic_tool_call" }))).toBe("tool-call");
  });

  it("returns 'tool-call' when no specific condition matches", () => {
    expect(categorizeWorkEntry(makeEntry({ tone: "info" }))).toBe("tool-call");
  });

  it("reasoning takes priority over sub-agent when tone is thinking and label has Agent: prefix", () => {
    expect(categorizeWorkEntry(makeEntry({ tone: "thinking", label: "Agent: thinking" }))).toBe(
      "reasoning",
    );
  });

  it("returns 'skill' for a Skill tool invocation label", () => {
    expect(
      categorizeWorkEntry(
        makeEntry({ label: 'Tool call — Skill: {"skill":"code-review:code-review"}' }),
      ),
    ).toBe("skill");
  });

  it("returns 'skill' when toolTitle is 'Skill'", () => {
    expect(categorizeWorkEntry(makeEntry({ toolTitle: "Skill" }))).toBe("skill");
  });

  it("returns 'skill' for dashed-separator variant", () => {
    expect(
      categorizeWorkEntry(
        makeEntry({ label: 'Tool call - Skill: {"skill":"superpowers:brainstorming"}' }),
      ),
    ).toBe("skill");
  });

  it("does NOT return 'skill' for a label that just mentions skill casually", () => {
    expect(categorizeWorkEntry(makeEntry({ label: "Reading skill documentation" }))).toBe(
      "tool-call",
    );
  });
});

// ---------------------------------------------------------------------------
// parseSkillName
// ---------------------------------------------------------------------------

describe("parseSkillName", () => {
  it("extracts and title-cases the skill name from a full Skill tool label", () => {
    expect(parseSkillName('Tool call — Skill: {"skill":"code-review:code-review"}')).toBe(
      "Code Review",
    );
  });

  it("uses only the segment after the last colon in a namespaced skill", () => {
    expect(parseSkillName('Tool call — Skill: {"skill":"superpowers:brainstorming"}')).toBe(
      "Brainstorming",
    );
  });

  it("handles multi-word slugs separated by dashes", () => {
    expect(parseSkillName('Tool call — Skill: {"skill":"superpowers:writing-plans"}')).toBe(
      "Writing Plans",
    );
  });

  it("falls back to 'Skill' when label contains no parseable JSON", () => {
    expect(parseSkillName("Tool call — Skill: something")).toBe("Skill");
  });

  it("falls back to 'Skill' for an empty label", () => {
    expect(parseSkillName("")).toBe("Skill");
  });
});

// ---------------------------------------------------------------------------
// groupWorkEntriesIntoSections
// ---------------------------------------------------------------------------

describe("groupWorkEntriesIntoSections", () => {
  it("returns empty array for empty input", () => {
    expect(groupWorkEntriesIntoSections([])).toEqual([]);
  });

  it("groups a single reasoning entry into a reasoning section", () => {
    const entry = makeEntry({ tone: "thinking" });
    const sections = groupWorkEntriesIntoSections([entry]);
    expect(sections).toEqual([{ kind: "reasoning", entries: [entry] }]);
  });

  it("groups a single tool entry into a tool section", () => {
    const entry = makeEntry({ itemType: "command_execution", command: "ls" });
    const sections = groupWorkEntriesIntoSections([entry]);
    expect(sections).toEqual([{ kind: "tool", entries: [entry] }]);
  });

  it("merges consecutive reasoning entries into one section", () => {
    const e1 = makeEntry({ id: "e1", tone: "thinking" });
    const e2 = makeEntry({ id: "e2", label: "Reasoning update: step 2", tone: "tool" });
    const sections = groupWorkEntriesIntoSections([e1, e2]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({ kind: "reasoning", entries: [e1, e2] });
  });

  it("merges consecutive tool entries into one section", () => {
    const e1 = makeEntry({ id: "e1", command: "npm install" });
    const e2 = makeEntry({ id: "e2", itemType: "file_change" });
    const sections = groupWorkEntriesIntoSections([e1, e2]);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toEqual({ kind: "tool", entries: [e1, e2] });
  });

  it("starts a new reasoning section after a tool interruption", () => {
    const r1 = makeEntry({ id: "r1", tone: "thinking" });
    const t1 = makeEntry({ id: "t1", command: "ls" });
    const r2 = makeEntry({ id: "r2", label: "Reasoning update: step 2" });
    const sections = groupWorkEntriesIntoSections([r1, t1, r2]);
    expect(sections).toHaveLength(3);
    expect(sections[0]).toEqual({ kind: "reasoning", entries: [r1] });
    expect(sections[1]).toEqual({ kind: "tool", entries: [t1] });
    expect(sections[2]).toEqual({ kind: "reasoning", entries: [r2] });
  });

  it("handles reasoning → tool → tool → reasoning → tool correctly", () => {
    const r1 = makeEntry({ id: "r1", tone: "thinking" });
    const t1 = makeEntry({ id: "t1", command: "ls" });
    const t2 = makeEntry({ id: "t2", itemType: "file_change" });
    const r2 = makeEntry({ id: "r2", label: "Reasoning update: 2" });
    const t3 = makeEntry({ id: "t3", itemType: "web_search" });
    const sections = groupWorkEntriesIntoSections([r1, t1, t2, r2, t3]);
    expect(sections).toHaveLength(4);
    expect(sections[0]).toEqual({ kind: "reasoning", entries: [r1] });
    expect(sections[1]).toEqual({ kind: "tool", entries: [t1, t2] });
    expect(sections[2]).toEqual({ kind: "reasoning", entries: [r2] });
    expect(sections[3]).toEqual({ kind: "tool", entries: [t3] });
  });
});

// ---------------------------------------------------------------------------
// computeReasoningDuration
// ---------------------------------------------------------------------------

describe("computeReasoningDuration", () => {
  it("returns null for a single entry", () => {
    const entries = [makeEntry({ createdAt: "2026-01-01T00:00:00Z" })];
    expect(computeReasoningDuration(entries)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeReasoningDuration([])).toBeNull();
  });

  it("returns 'Xs' for durations under a minute", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:00:12Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("12s");
  });

  it("returns 'Xm Ys' for durations over a minute", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:01:15Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("1m 15s");
  });

  it("returns 'Xm' when there are no remaining seconds", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:02:00Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("2m");
  });

  it("returns '0s' for zero-duration (same timestamps)", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("0s");
  });

  it("returns null when end is before start", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:10Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBeNull();
  });

  it("returns null for invalid timestamps", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "not-a-date" }),
      makeEntry({ id: "e2", createdAt: "also-not-a-date" }),
    ];
    expect(computeReasoningDuration(entries)).toBeNull();
  });

  it("uses first and last entries only (ignores intermediate)", () => {
    const entries = [
      makeEntry({ id: "e1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "e2", createdAt: "2026-01-01T00:00:30Z" }), // middle: ignored for span
      makeEntry({ id: "e3", createdAt: "2026-01-01T00:00:45Z" }),
    ];
    // span is 0s → 45s = 45s
    expect(computeReasoningDuration(entries)).toBe("45s");
  });
});

// ---------------------------------------------------------------------------
// computeWorkLogHeaderStats
// ---------------------------------------------------------------------------

describe("computeWorkLogHeaderStats", () => {
  it("returns empty array for empty entries", () => {
    expect(computeWorkLogHeaderStats([])).toEqual([]);
  });

  it("returns empty array when all entries are reasoning", () => {
    const entries = [
      makeEntry({ id: "e1", tone: "thinking" }),
      makeEntry({ id: "e2", label: "Reasoning update: x" }),
    ];
    expect(computeWorkLogHeaderStats(entries)).toEqual([]);
  });

  it("counts commands correctly", () => {
    const entries = [
      makeEntry({ id: "e1", command: "ls" }),
      makeEntry({ id: "e2", command: "npm install" }),
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "2 commands", count: 2 });
  });

  it("uses singular label for a single command", () => {
    const stats = computeWorkLogHeaderStats([makeEntry({ command: "ls" })]);
    expect(stats).toContainEqual({ label: "1 command", count: 1 });
  });

  it("counts file-reads correctly", () => {
    const entries = [
      makeEntry({ id: "e1", requestKind: "file-read" }),
      makeEntry({ id: "e2", itemType: "image_view" }),
      makeEntry({ id: "e3", requestKind: "file-read" }),
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "Read 3 files", count: 3 });
  });

  it("counts file-writes correctly", () => {
    const entries = [makeEntry({ id: "e1", requestKind: "file-change" })];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "Edited 1 file", count: 1 });
  });

  it("counts web-searches correctly", () => {
    const entries = [
      makeEntry({ id: "e1", itemType: "web_search" }),
      makeEntry({ id: "e2", itemType: "web_search" }),
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "2 searches", count: 2 });
  });

  it("counts sub-agents correctly", () => {
    const entries = [makeEntry({ id: "e1", itemType: "collab_agent_tool_call" })];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "1 sub-agent", count: 1 });
  });

  it("counts tool-calls correctly", () => {
    const entries = [
      makeEntry({ id: "e1", itemType: "mcp_tool_call" }),
      makeEntry({ id: "e2", itemType: "dynamic_tool_call" }),
      makeEntry({ id: "e3", itemType: "mcp_tool_call" }),
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toContainEqual({ label: "3 tool calls", count: 3 });
  });

  it("aggregates multiple categories in a mixed group", () => {
    const entries = [
      makeEntry({ id: "e1", command: "npm run build" }),
      makeEntry({ id: "e2", requestKind: "file-read" }),
      makeEntry({ id: "e3", requestKind: "file-change" }),
      makeEntry({ id: "e4", tone: "thinking" }), // excluded
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toHaveLength(3);
    expect(stats).toContainEqual({ label: "1 command", count: 1 });
    expect(stats).toContainEqual({ label: "Read 1 file", count: 1 });
    expect(stats).toContainEqual({ label: "Edited 1 file", count: 1 });
  });
});

// ---------------------------------------------------------------------------
// parseSubAgentDescription
// ---------------------------------------------------------------------------

describe("parseSubAgentDescription", () => {
  it("extracts description from a valid JSON label", () => {
    const label = JSON.stringify({ description: "Write a unit test", task: "testing" });
    expect(parseSubAgentDescription(label)).toBe("Write a unit test");
  });

  it("extracts description from the detail string when label is not valid JSON", () => {
    const label = "Agent: some task";
    const detail = JSON.stringify({ description: "Detailed sub-task" });
    expect(parseSubAgentDescription(label, detail)).toBe("Detailed sub-task");
  });

  it("extracts description from partial JSON using regex fallback", () => {
    // malformed JSON that still contains the description key
    const label = '{"description": "Fix the bug", broken}';
    expect(parseSubAgentDescription(label)).toBe("Fix the bug");
  });

  it("strips 'Subagent task' prefix when no JSON is present", () => {
    expect(parseSubAgentDescription("Subagent task: run linter")).toBe("run linter");
  });

  it("strips 'Agent:' prefix when no JSON is present", () => {
    expect(parseSubAgentDescription("Agent: deploy service")).toBe("deploy service");
  });

  it("returns the label as-is when there is no prefix and no JSON", () => {
    expect(parseSubAgentDescription("Do something useful")).toBe("Do something useful");
  });

  it("returns fallback 'Running sub-agent' when label is empty after stripping", () => {
    expect(parseSubAgentDescription("Agent:")).toBe("Running sub-agent");
  });

  it("prefers JSON description in label over detail", () => {
    const label = JSON.stringify({ description: "From label" });
    const detail = JSON.stringify({ description: "From detail" });
    expect(parseSubAgentDescription(label, detail)).toBe("From label");
  });

  it("trims whitespace from extracted description", () => {
    const label = JSON.stringify({ description: "  trimmed  " });
    expect(parseSubAgentDescription(label)).toBe("trimmed");
  });
});
