# Work Log Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visually separate reasoning, tool calls, terminal commands, file operations, and sub-agents inside the existing work log card so each type is immediately distinguishable.

**Architecture:** Pure render-layer change. We add a `workLogHelpers.ts` module with categorization/grouping utilities, then update the work log card renderer in `MessagesTimeline.tsx` to use sectioned rendering: collapsible reasoning blocks, per-type styled tool rows, and a smart summary header. No changes to the data model, timeline grouping, or virtualizer.

**Tech Stack:** React, Tailwind CSS, lucide-react icons, existing `WorkLogEntry` type from `session-logic.ts`.

---

### Task 1: Add work log categorization and grouping helpers

**Files:**

- Create: `apps/web/src/components/chat/workLogHelpers.ts`
- Create: `apps/web/src/components/chat/workLogHelpers.test.ts`

These helpers categorize individual `WorkLogEntry` items and group consecutive entries of the same category into sections for rendering.

- [ ] **Step 1: Write the failing tests for categorization**

```ts
// apps/web/src/components/chat/workLogHelpers.test.ts
import { describe, expect, it } from "vitest";
import {
  categorizeWorkEntry,
  groupWorkEntriesIntoSections,
  computeReasoningDuration,
  computeWorkLogHeaderStats,
  parseSubAgentDescription,
} from "./workLogHelpers";
import type { WorkLogEntry } from "../../session-logic";

function makeEntry(overrides: Partial<WorkLogEntry> & { id: string }): WorkLogEntry {
  return {
    createdAt: "2026-01-01T00:00:00Z",
    label: "Test entry",
    tone: "tool",
    ...overrides,
  };
}

describe("categorizeWorkEntry", () => {
  it("categorizes thinking tone as reasoning", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "1", tone: "thinking" }))).toBe("reasoning");
  });

  it("categorizes 'Reasoning update' label as reasoning", () => {
    expect(
      categorizeWorkEntry(
        makeEntry({ id: "2", tone: "info", label: "Reasoning update - Searching for foo" }),
      ),
    ).toBe("reasoning");
  });

  it("categorizes command_execution as command", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "3", itemType: "command_execution" }))).toBe(
      "command",
    );
  });

  it("categorizes entry with command field as command", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "4", command: "git status" }))).toBe("command");
  });

  it("categorizes file-read requestKind as file-read", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "5", requestKind: "file-read" }))).toBe("file-read");
  });

  it("categorizes image_view as file-read", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "6", itemType: "image_view" }))).toBe("file-read");
  });

  it("categorizes file-change requestKind as file-write", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "7", requestKind: "file-change" }))).toBe(
      "file-write",
    );
  });

  it("categorizes file_change itemType as file-write", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "8", itemType: "file_change" }))).toBe("file-write");
  });

  it("categorizes entry with changedFiles but no command/detail as file-write", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "9", changedFiles: ["src/foo.ts"] }))).toBe(
      "file-write",
    );
  });

  it("categorizes web_search as web-search", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "10", itemType: "web_search" }))).toBe("web-search");
  });

  it("categorizes collab_agent_tool_call as sub-agent", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "11", itemType: "collab_agent_tool_call" }))).toBe(
      "sub-agent",
    );
  });

  it("categorizes Subagent task label as sub-agent", () => {
    expect(
      categorizeWorkEntry(
        makeEntry({ id: "12", label: 'Subagent task - Agent: {"description":"foo"}' }),
      ),
    ).toBe("sub-agent");
  });

  it("falls back to tool-call for mcp_tool_call", () => {
    expect(categorizeWorkEntry(makeEntry({ id: "13", itemType: "mcp_tool_call" }))).toBe(
      "tool-call",
    );
  });

  it("falls back to tool-call for unknown entries", () => {
    expect(
      categorizeWorkEntry(makeEntry({ id: "14", tone: "info", label: "Something else" })),
    ).toBe("tool-call");
  });
});

describe("groupWorkEntriesIntoSections", () => {
  it("groups consecutive reasoning entries into one section", () => {
    const entries = [
      makeEntry({ id: "1", tone: "thinking", label: "Reasoning update - step 1" }),
      makeEntry({ id: "2", tone: "thinking", label: "Reasoning update - step 2" }),
      makeEntry({ id: "3", itemType: "command_execution", command: "ls" }),
    ];
    const sections = groupWorkEntriesIntoSections(entries);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.kind).toBe("reasoning");
    expect(sections[0]!.entries).toHaveLength(2);
    expect(sections[1]!.kind).toBe("tool");
    expect(sections[1]!.entries).toHaveLength(1);
  });

  it("splits reasoning interrupted by a tool call into two sections", () => {
    const entries = [
      makeEntry({ id: "1", tone: "thinking" }),
      makeEntry({ id: "2", itemType: "file_change", changedFiles: ["a.ts"] }),
      makeEntry({ id: "3", tone: "thinking" }),
    ];
    const sections = groupWorkEntriesIntoSections(entries);
    expect(sections).toHaveLength(3);
    expect(sections[0]!.kind).toBe("reasoning");
    expect(sections[1]!.kind).toBe("tool");
    expect(sections[2]!.kind).toBe("reasoning");
  });
});

describe("computeReasoningDuration", () => {
  it("returns duration in seconds between first and last entry", () => {
    const entries = [
      makeEntry({ id: "1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "2", createdAt: "2026-01-01T00:00:05Z" }),
      makeEntry({ id: "3", createdAt: "2026-01-01T00:00:12Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("12s");
  });

  it("returns formatted minutes for longer durations", () => {
    const entries = [
      makeEntry({ id: "1", createdAt: "2026-01-01T00:00:00Z" }),
      makeEntry({ id: "2", createdAt: "2026-01-01T00:01:30Z" }),
    ];
    expect(computeReasoningDuration(entries)).toBe("1m 30s");
  });

  it("returns null for a single entry", () => {
    const entries = [makeEntry({ id: "1", createdAt: "2026-01-01T00:00:00Z" })];
    expect(computeReasoningDuration(entries)).toBeNull();
  });
});

describe("computeWorkLogHeaderStats", () => {
  it("counts entries by category", () => {
    const entries = [
      makeEntry({ id: "1", tone: "thinking" }),
      makeEntry({ id: "2", tone: "thinking" }),
      makeEntry({ id: "3", itemType: "command_execution", command: "ls" }),
      makeEntry({ id: "4", requestKind: "file-read" }),
      makeEntry({ id: "5", requestKind: "file-change" }),
      makeEntry({ id: "6", requestKind: "file-change" }),
      makeEntry({ id: "7", itemType: "web_search" }),
      makeEntry({ id: "8", itemType: "collab_agent_tool_call" }),
    ];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toEqual([
      { label: "1 command", count: 1 },
      { label: "Read 1 file", count: 1 },
      { label: "Edited 2 files", count: 2 },
      { label: "1 search", count: 1 },
      { label: "1 sub-agent", count: 1 },
    ]);
  });

  it("omits categories with zero entries", () => {
    const entries = [makeEntry({ id: "1", itemType: "command_execution", command: "ls" })];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toEqual([{ label: "1 command", count: 1 }]);
  });

  it("returns empty array for only reasoning entries", () => {
    const entries = [makeEntry({ id: "1", tone: "thinking" })];
    const stats = computeWorkLogHeaderStats(entries);
    expect(stats).toEqual([]);
  });
});

describe("parseSubAgentDescription", () => {
  it("extracts description from JSON-style label", () => {
    const label =
      'Subagent task - Agent: {"description":"Implement Task 2: McpService","prompt":"You are implementing..."}';
    expect(parseSubAgentDescription(label)).toBe("Implement Task 2: McpService");
  });

  it("extracts description from detail field", () => {
    expect(parseSubAgentDescription("Subagent task", '{"description":"Code quality review"}')).toBe(
      "Code quality review",
    );
  });

  it("returns cleaned label when no JSON found", () => {
    expect(parseSubAgentDescription("Subagent task - Something plain")).toBe("Something plain");
  });

  it("returns fallback for empty label", () => {
    expect(parseSubAgentDescription("Subagent task")).toBe("Running sub-agent");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && bun run test -- --reporter=verbose workLogHelpers`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the helpers**

```ts
// apps/web/src/components/chat/workLogHelpers.ts
import type { WorkLogEntry } from "../../session-logic";

// --- Entry categorization ---

export type WorkEntryCategory =
  | "reasoning"
  | "command"
  | "file-read"
  | "file-write"
  | "web-search"
  | "sub-agent"
  | "tool-call";

export function categorizeWorkEntry(entry: WorkLogEntry): WorkEntryCategory {
  // Reasoning: thinking tone or "Reasoning update" label prefix
  if (entry.tone === "thinking" || entry.label.startsWith("Reasoning update")) {
    return "reasoning";
  }

  // Sub-agent: collab_agent_tool_call or label containing "Subagent" / "Agent:"
  if (
    entry.itemType === "collab_agent_tool_call" ||
    entry.label.startsWith("Subagent task") ||
    entry.label.startsWith("Agent:")
  ) {
    return "sub-agent";
  }

  // Command: command_execution itemType or has command field
  if (entry.itemType === "command_execution" || entry.command) {
    return "command";
  }

  // File read: file-read requestKind or image_view
  if (entry.requestKind === "file-read" || entry.itemType === "image_view") {
    return "file-read";
  }

  // File write: file-change requestKind, file_change itemType, or has changedFiles
  if (
    entry.requestKind === "file-change" ||
    entry.itemType === "file_change" ||
    ((entry.changedFiles?.length ?? 0) > 0 && !entry.command && !entry.detail)
  ) {
    return "file-write";
  }

  // Web search
  if (entry.itemType === "web_search") {
    return "web-search";
  }

  // Everything else: mcp_tool_call, dynamic_tool_call, unknown
  return "tool-call";
}

// --- Grouping consecutive entries into sections ---

export interface WorkLogSection {
  kind: "reasoning" | "tool";
  entries: WorkLogEntry[];
}

/**
 * Groups consecutive work entries into sections.
 * Consecutive reasoning entries become a "reasoning" section.
 * All other entries (regardless of specific category) become "tool" sections.
 * If reasoning is interrupted by a non-reasoning entry, a new reasoning section
 * starts when reasoning resumes.
 */
export function groupWorkEntriesIntoSections(
  entries: ReadonlyArray<WorkLogEntry>,
): WorkLogSection[] {
  const sections: WorkLogSection[] = [];

  for (const entry of entries) {
    const isReasoning = categorizeWorkEntry(entry) === "reasoning";
    const sectionKind = isReasoning ? "reasoning" : "tool";
    const lastSection = sections.at(-1);

    if (lastSection && lastSection.kind === sectionKind) {
      lastSection.entries.push(entry);
    } else {
      sections.push({ kind: sectionKind, entries: [entry] });
    }
  }

  return sections;
}

// --- Reasoning duration ---

/**
 * Computes a human-readable duration string from the first to last entry timestamps.
 * Returns null if there's only one entry (no meaningful duration).
 */
export function computeReasoningDuration(entries: ReadonlyArray<WorkLogEntry>): string | null {
  if (entries.length < 2) return null;

  const firstCreatedAt = entries[0]!.createdAt;
  const lastCreatedAt = entries[entries.length - 1]!.createdAt;

  const startMs = Date.parse(firstCreatedAt);
  const endMs = Date.parse(lastCreatedAt);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  const elapsedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (elapsedSeconds === 0) return null;

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

// --- Header stats ---

export interface WorkLogStat {
  label: string;
  count: number;
}

/**
 * Computes summary stats for the work log header.
 * Reasoning entries are excluded from the stats (they have their own section).
 * Only categories with count > 0 are included.
 */
export function computeWorkLogHeaderStats(entries: ReadonlyArray<WorkLogEntry>): WorkLogStat[] {
  let commands = 0;
  let reads = 0;
  let writes = 0;
  let searches = 0;
  let subAgents = 0;
  let toolCalls = 0;

  for (const entry of entries) {
    const category = categorizeWorkEntry(entry);
    switch (category) {
      case "reasoning":
        break;
      case "command":
        commands++;
        break;
      case "file-read":
        reads++;
        break;
      case "file-write":
        writes++;
        break;
      case "web-search":
        searches++;
        break;
      case "sub-agent":
        subAgents++;
        break;
      case "tool-call":
        toolCalls++;
        break;
    }
  }

  const stats: WorkLogStat[] = [];

  if (commands > 0) {
    stats.push({ label: commands === 1 ? "1 command" : `${commands} commands`, count: commands });
  }
  if (reads > 0) {
    stats.push({ label: reads === 1 ? "Read 1 file" : `Read ${reads} files`, count: reads });
  }
  if (writes > 0) {
    stats.push({
      label: writes === 1 ? "Edited 1 file" : `Edited ${writes} files`,
      count: writes,
    });
  }
  if (searches > 0) {
    stats.push({
      label: searches === 1 ? "1 search" : `${searches} searches`,
      count: searches,
    });
  }
  if (subAgents > 0) {
    stats.push({
      label: subAgents === 1 ? "1 sub-agent" : `${subAgents} sub-agents`,
      count: subAgents,
    });
  }
  if (toolCalls > 0) {
    stats.push({
      label: toolCalls === 1 ? "1 tool call" : `${toolCalls} tool calls`,
      count: toolCalls,
    });
  }

  return stats;
}

// --- Sub-agent description parsing ---

/**
 * Extracts a clean description from a sub-agent work entry's label or detail.
 * The raw label often contains JSON like: 'Subagent task - Agent: {"description":"Implement..."}'
 * We parse out the description field for clean display.
 */
export function parseSubAgentDescription(label: string, detail?: string): string {
  // Try to extract from JSON in label
  const jsonMatch = label.match(/\{[^}]*"description"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) {
    return jsonMatch[1];
  }

  // Try to extract from detail field
  if (detail) {
    const detailJsonMatch = detail.match(/\{[^}]*"description"\s*:\s*"([^"]+)"/);
    if (detailJsonMatch?.[1]) {
      return detailJsonMatch[1];
    }
  }

  // Strip "Subagent task - " or "Subagent task - Agent: " prefix and return the rest
  const cleaned = label.replace(/^Subagent task\s*-\s*(?:Agent:\s*)?/i, "").trim();

  return cleaned.length > 0 ? cleaned : "Running sub-agent";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && bun run test -- --reporter=verbose workLogHelpers`
Expected: All tests PASS

- [ ] **Step 5: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/workLogHelpers.ts apps/web/src/components/chat/workLogHelpers.test.ts
git commit -m "feat(web): add work log categorization and grouping helpers"
```

---

### Task 2: Add the collapsible ReasoningBlock component

**Files:**

- Create: `apps/web/src/components/chat/ReasoningBlock.tsx`
- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx` (import only — no rendering changes yet)

- [ ] **Step 1: Create the ReasoningBlock component**

```tsx
// apps/web/src/components/chat/ReasoningBlock.tsx
import { memo, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";
import { computeReasoningDuration } from "./workLogHelpers";

interface ReasoningBlockProps {
  entries: ReadonlyArray<WorkLogEntry>;
  /** Whether the AI is still actively working on this turn */
  isActivelyWorking: boolean;
  /** Whether this is the last section in the work group (used for auto-open) */
  isLastSection: boolean;
}

export const ReasoningBlock = memo(function ReasoningBlock(props: ReasoningBlockProps) {
  const { entries, isActivelyWorking, isLastSection } = props;

  // Auto-open when actively reasoning (last section + AI working), otherwise collapsed
  const shouldAutoOpen = isActivelyWorking && isLastSection;
  const [manualToggle, setManualToggle] = useState<boolean | null>(null);

  // Reset manual toggle when auto-open state changes
  const prevShouldAutoOpen = useRef(shouldAutoOpen);
  useEffect(() => {
    if (prevShouldAutoOpen.current !== shouldAutoOpen) {
      setManualToggle(null);
      prevShouldAutoOpen.current = shouldAutoOpen;
    }
  }, [shouldAutoOpen]);

  const isOpen = manualToggle ?? shouldAutoOpen;

  const duration = computeReasoningDuration(entries);
  const summaryText = duration ? `Thought for ${duration}` : "Thinking…";

  return (
    <div className="py-0.5">
      <button
        type="button"
        className="group flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors duration-150 hover:bg-muted/30"
        onClick={() => setManualToggle((prev) => !(prev ?? shouldAutoOpen))}
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/40 transition-transform duration-200",
            isOpen && "rotate-90",
          )}
        />
        <span className="text-[11px] text-muted-foreground/50 italic">{summaryText}</span>
        {shouldAutoOpen && (
          <span className="ml-1 size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/40" />
        )}
      </button>
      {isOpen && (
        <div className="ml-[18px] mt-1 border-l border-muted-foreground/15 pl-2.5">
          {entries.map((entry) => {
            // Strip "Reasoning update - " prefix for cleaner display
            const text = entry.label.replace(/^Reasoning update\s*[-–—]\s*/i, "").trim();
            return (
              <p
                key={entry.id}
                className="truncate py-[1px] text-[10px] leading-4 text-muted-foreground/40"
                title={text || entry.label}
              >
                {text || entry.label}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ReasoningBlock.tsx
git commit -m "feat(web): add collapsible ReasoningBlock component"
```

---

### Task 3: Add per-type styled WorkEntryRow component

**Files:**

- Create: `apps/web/src/components/chat/WorkEntryRow.tsx`

This replaces the `SimpleWorkEntryRow` in the new rendering path. It handles command, file-read, file-write, web-search, sub-agent, and generic tool-call entries with per-type visual treatment.

- [ ] **Step 1: Create the WorkEntryRow component**

```tsx
// apps/web/src/components/chat/WorkEntryRow.tsx
import { memo } from "react";
import {
  EyeIcon,
  GlobeIcon,
  HammerIcon,
  GitBranchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";
import {
  categorizeWorkEntry,
  parseSubAgentDescription,
  type WorkEntryCategory,
} from "./workLogHelpers";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";

// --- Icon mapping by category ---

function categoryIcon(category: WorkEntryCategory): LucideIcon {
  switch (category) {
    case "command":
      return TerminalIcon;
    case "file-read":
      return EyeIcon;
    case "file-write":
      return SquarePenIcon;
    case "web-search":
      return GlobeIcon;
    case "sub-agent":
      return GitBranchIcon;
    case "tool-call":
      // Refine by itemType for tool calls
      return WrenchIcon;
    default:
      return WrenchIcon;
  }
}

function refinedToolCallIcon(entry: WorkLogEntry): LucideIcon {
  if (entry.itemType === "dynamic_tool_call") return HammerIcon;
  if (entry.itemType === "mcp_tool_call") return WrenchIcon;
  return WrenchIcon;
}

// --- Color mapping by category ---

function categoryTextClass(category: WorkEntryCategory): string {
  switch (category) {
    case "command":
      return "text-muted-foreground/80";
    case "file-write":
      return "text-muted-foreground/75";
    case "file-read":
      return "text-muted-foreground/55";
    case "web-search":
      return "text-muted-foreground/70";
    case "sub-agent":
      return "text-muted-foreground/80";
    case "tool-call":
      return "text-muted-foreground/60";
    default:
      return "text-muted-foreground/60";
  }
}

function categoryIconClass(category: WorkEntryCategory): string {
  switch (category) {
    case "command":
      return "text-foreground/70";
    case "file-write":
      return "text-foreground/65";
    case "file-read":
      return "text-foreground/50";
    case "web-search":
      return "text-foreground/60";
    case "sub-agent":
      return "text-blue-400/70 dark:text-blue-400/70";
    case "tool-call":
      return "text-foreground/55";
    default:
      return "text-foreground/55";
  }
}

// --- Display text derivation ---

interface DisplayContent {
  primary: string;
  secondary?: string;
  primaryMono?: boolean;
}

function deriveDisplayContent(entry: WorkLogEntry, category: WorkEntryCategory): DisplayContent {
  switch (category) {
    case "command": {
      const command = entry.command ?? normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
      // Show rationale from detail as secondary line
      const secondary = entry.detail && entry.detail !== command ? entry.detail : undefined;
      return { primary: command, secondary, primaryMono: true };
    }

    case "file-read": {
      const filePath =
        entry.changedFiles?.[0] ?? entry.detail ?? normalizeCompactToolLabel(entry.label);
      // Strip "Reasoning update - " or "Reading " prefix
      const cleanPath = filePath
        .replace(/^Reasoning update\s*[-–—]\s*/i, "")
        .replace(/^Reading\s+/i, "");
      return { primary: `Read ${cleanPath}`, primaryMono: false };
    }

    case "file-write": {
      const filePath =
        entry.changedFiles?.[0] ?? entry.detail ?? normalizeCompactToolLabel(entry.label);
      const cleanPath = filePath
        .replace(/^Reasoning update\s*[-–—]\s*/i, "")
        .replace(/^Writing\s+/i, "");
      return { primary: `Wrote ${cleanPath}`, primaryMono: false };
    }

    case "web-search": {
      // Try to extract search query from detail or command
      const query = entry.detail ?? entry.command;
      if (query) {
        return { primary: `Searched for ${query}` };
      }
      const cleaned = normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
      return { primary: cleaned || "Web search" };
    }

    case "sub-agent": {
      const description = parseSubAgentDescription(entry.label, entry.detail);
      return { primary: `Sub-agent: ${description}` };
    }

    case "tool-call": {
      const heading = normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
      const preview = entry.command ?? entry.detail ?? entry.changedFiles?.[0];
      if (preview && preview !== heading) {
        return { primary: heading, secondary: preview };
      }
      return { primary: heading || entry.label };
    }

    default:
      return { primary: entry.label };
  }
}

// --- Component ---

interface WorkEntryRowProps {
  entry: WorkLogEntry;
}

export const WorkEntryRow = memo(function WorkEntryRow(props: WorkEntryRowProps) {
  const { entry } = props;
  const category = categorizeWorkEntry(entry);
  const Icon = category === "tool-call" ? refinedToolCallIcon(entry) : categoryIcon(category);
  const display = deriveDisplayContent(entry, category);
  const isSubAgent = category === "sub-agent";
  const isError = entry.tone === "error";

  return (
    <div className={cn("rounded-lg px-1 py-1", isSubAgent && "border-l-2 border-blue-400/30 pl-2")}>
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center pt-[1px]",
            isError ? "text-rose-400/70" : categoryIconClass(category),
          )}
        >
          <Icon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn(
              "truncate text-[11px] leading-5",
              isError ? "text-rose-300/60" : categoryTextClass(category),
              display.primaryMono && "font-mono",
            )}
            title={display.primary}
          >
            {display.primary}
          </p>
          {display.secondary && (
            <p
              className="truncate text-[10px] leading-4 text-muted-foreground/40"
              title={display.secondary}
            >
              {display.secondary}
            </p>
          )}
        </div>
      </div>

      {/* Show changed files for file-write entries that also have additional context */}
      {category === "file-write" && (entry.changedFiles?.length ?? 0) > 1 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-7">
          {entry.changedFiles?.slice(1, 5).map((filePath) => (
            <span
              key={`${entry.id}:${filePath}`}
              className="rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {(entry.changedFiles?.length ?? 0) > 5 && (
            <span className="px-1 text-[10px] text-muted-foreground/45">
              +{(entry.changedFiles?.length ?? 0) - 5}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/web && bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/WorkEntryRow.tsx
git commit -m "feat(web): add per-type styled WorkEntryRow component"
```

---

### Task 4: Refactor the work log card renderer to use sectioned layout

**Files:**

- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx:1-50` (imports)
- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx:306-354` (work log card renderer)

This is the core integration task. We replace the flat list of `SimpleWorkEntryRow` with sectioned rendering using `ReasoningBlock` and `WorkEntryRow`, plus the new smart header.

- [ ] **Step 1: Add new imports to MessagesTimeline.tsx**

At the top of the file, add these imports alongside the existing ones:

```tsx
// Add to existing imports in MessagesTimeline.tsx
import { ChevronRightIcon, GitBranchIcon } from "lucide-react";
import { ReasoningBlock } from "./ReasoningBlock";
import { WorkEntryRow } from "./WorkEntryRow";
import { groupWorkEntriesIntoSections, computeWorkLogHeaderStats } from "./workLogHelpers";
```

Note: `ChevronRightIcon` and `GitBranchIcon` may already be transitively available but we need them in imports. Keep all existing imports — only add new ones.

- [ ] **Step 2: Replace the work log card renderer**

In `MessagesTimeline.tsx`, find the block inside `renderRowContent` that handles `row.kind === "work"` (approximately lines 314–354). Replace **only the return JSX** inside the IIFE — keep the local variables (`groupId`, `groupedEntries`, `isExpanded`, `hasOverflow`, `visibleEntries`, `hiddenCount`). Replace `onlyToolEntries`, `showHeader`, and `groupLabel` with the new logic.

Replace the entire `{row.kind === "work" && (() => { ... })()}` block with:

```tsx
{
  row.kind === "work" &&
    (() => {
      const groupId = row.id;
      const groupedEntries = row.groupedEntries;
      const isExpanded = expandedWorkGroups[groupId] ?? false;
      const hasOverflow = groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
      const visibleEntries =
        hasOverflow && !isExpanded
          ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
          : groupedEntries;
      const hiddenCount = groupedEntries.length - visibleEntries.length;

      // New: compute header stats and sections
      const headerStats = computeWorkLogHeaderStats(groupedEntries);
      const sections = groupWorkEntriesIntoSections(visibleEntries);

      // Determine if this is the last work group and the AI is still working
      // (used for auto-opening the last reasoning block)
      const isLastWorkGroup =
        isWorking &&
        rows.indexOf(rows.findLast((r) => r.kind === "work") as (typeof rows)[number]) ===
          rows.indexOf(row as (typeof rows)[number]);

      return (
        <div className="rounded-xl border border-border/45 bg-card/25 px-2 py-1.5">
          {/* Header: always shown now */}
          <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-2">
              {isWorking && isLastWorkGroup && (
                <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400/60" />
              )}
              {headerStats.length > 0 ? (
                <p className="text-[9px] tracking-wide text-muted-foreground/50">
                  {headerStats.map((s) => s.label).join(" · ")}
                </p>
              ) : (
                <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/50">
                  Work log ({groupedEntries.length})
                </p>
              )}
            </div>
            {hasOverflow && (
              <button
                type="button"
                className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 transition-colors duration-150 hover:text-foreground/75"
                onClick={() => onToggleWorkGroup(groupId)}
              >
                {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
              </button>
            )}
          </div>

          {/* Sectioned content */}
          <div className="space-y-0.5">
            {sections.map((section, sectionIndex) => {
              if (section.kind === "reasoning") {
                return (
                  <ReasoningBlock
                    key={`reasoning:${section.entries[0]!.id}`}
                    entries={section.entries}
                    isActivelyWorking={isWorking && isLastWorkGroup}
                    isLastSection={sectionIndex === sections.length - 1}
                  />
                );
              }

              // Tool section: render each entry with per-type styling
              return section.entries.map((workEntry) => (
                <WorkEntryRow key={`work-row:${workEntry.id}`} entry={workEntry} />
              ));
            })}
          </div>
        </div>
      );
    })();
}
```

- [ ] **Step 3: Verify it compiles and renders**

Run: `cd apps/web && bun run typecheck`
Expected: No errors

- [ ] **Step 4: Run existing tests to check for regressions**

Run: `cd apps/web && bun run test -- --reporter=verbose MessagesTimeline`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/MessagesTimeline.tsx
git commit -m "feat(web): refactor work log card to use sectioned layout with reasoning blocks"
```

---

### Task 5: Update height estimation for new layout

**Files:**

- Modify: `apps/web/src/components/chat/MessagesTimeline.logic.ts:160-175` (`estimateWorkRowHeight`)

The new layout has different height characteristics: reasoning blocks are either collapsed (single row ~28px) or expanded (varies), and tool entries might have a secondary line. Update the height estimator.

- [ ] **Step 1: Update estimateWorkRowHeight**

In `MessagesTimeline.logic.ts`, replace the `estimateWorkRowHeight` function:

```ts
function estimateWorkRowHeight(
  row: Extract<MessagesTimelineRow, { kind: "work" }>,
  input: {
    expandedWorkGroups?: Readonly<Record<string, boolean>>;
  },
): number {
  const isExpanded = input.expandedWorkGroups?.[row.id] ?? false;
  const hasOverflow = row.groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
  const visibleEntries =
    hasOverflow && !isExpanded ? MAX_VISIBLE_WORK_LOG_ENTRIES : row.groupedEntries.length;

  // Header is always shown now (stats strip or "Work log (N)")
  const headerHeight = 26;
  const cardChrome = 28;

  // Count reasoning entries vs tool entries in visible range for more accurate estimation.
  // Reasoning blocks collapse to ~28px each when closed.
  // Tool entries are ~32px each (or ~44px with secondary line).
  let reasoningBlockCount = 0;
  let toolEntryCount = 0;
  let inReasoningRun = false;

  const visibleSlice =
    hasOverflow && !isExpanded
      ? row.groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
      : row.groupedEntries;

  for (const entry of visibleSlice) {
    const isReasoning = entry.tone === "thinking" || entry.label.startsWith("Reasoning update");
    if (isReasoning) {
      if (!inReasoningRun) {
        reasoningBlockCount++;
        inReasoningRun = true;
      }
    } else {
      inReasoningRun = false;
      toolEntryCount++;
    }
  }

  // Reasoning blocks: collapsed ~28px each
  // Tool entries: ~34px each (slightly taller with possible secondary line)
  return cardChrome + headerHeight + reasoningBlockCount * 28 + toolEntryCount * 34;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/web && bun run typecheck`
Expected: No errors

- [ ] **Step 3: Run existing tests**

Run: `cd apps/web && bun run test -- --reporter=verbose MessagesTimeline.logic`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/MessagesTimeline.logic.ts
git commit -m "fix(web): update work row height estimation for sectioned layout"
```

---

### Task 6: Clean up — remove unused SimpleWorkEntryRow and old helpers

**Files:**

- Modify: `apps/web/src/components/chat/MessagesTimeline.tsx` (remove `SimpleWorkEntryRow`, `workToneIcon`, `workToneClass`, `workEntryPreview`, `workEntryIcon`, `toolWorkEntryHeading`, `capitalizePhrase` if no longer used)

- [ ] **Step 1: Check which functions are still referenced**

Search the file for remaining references to `SimpleWorkEntryRow`, `workToneIcon`, `workToneClass`, `workEntryPreview`, `workEntryIcon`, `toolWorkEntryHeading`, `capitalizePhrase`. If none of these are used anymore after the Task 4 changes, remove them.

Keep any function that is still imported or used elsewhere.

- [ ] **Step 2: Remove unused functions**

Remove the following from `MessagesTimeline.tsx` (only if confirmed unused):

- `SimpleWorkEntryRow` component (~lines 840-896)
- `workToneIcon` function (~lines 752-778)
- `workToneClass` function (~lines 780-784)
- `workEntryPreview` function (~lines 787-798)
- `workEntryIcon` function (~lines 800-823)
- `toolWorkEntryHeading` function (~lines 833-838)
- `capitalizePhrase` function (~lines 825-831)

Also remove any now-unused icon imports from the top of the file (e.g., `ZapIcon`, `BotIcon` if only used by removed functions).

- [ ] **Step 3: Verify no regressions**

Run: `cd apps/web && bun run typecheck && bun run test -- --reporter=verbose MessagesTimeline`
Expected: No errors, all tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/MessagesTimeline.tsx
git commit -m "refactor(web): remove unused SimpleWorkEntryRow and old work entry helpers"
```

---

### Task 7: Final verification and lint

**Files:** None (verification only)

- [ ] **Step 1: Run full typecheck**

Run: `bun typecheck`
Expected: No errors across all packages

- [ ] **Step 2: Run linter**

Run: `bun lint`
Expected: No errors

- [ ] **Step 3: Run formatter**

Run: `bun fmt`
Expected: No formatting issues

- [ ] **Step 4: Run all web tests**

Run: `cd apps/web && bun run test`
Expected: All tests pass

- [ ] **Step 5: Visual verification**

Start the dev server with `bun dev` and verify:

1. Work log cards render with the new sectioned layout
2. Reasoning entries appear as collapsible "Thought for Xs" blocks
3. Reasoning blocks auto-open when AI is working, collapse when done
4. Terminal commands show in mono with rationale below
5. File reads show "Read filepath"
6. File writes show "Wrote filepath"
7. Sub-agents show "Sub-agent: description" with blue left border
8. Header shows stats strip ("Read 10 files · Edited 3 files · 5 commands")
9. Pulsing dot appears on active work groups
10. Show more/less toggle still works
11. Scrolling and virtualizer behavior is unchanged

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore(web): work log visual redesign final verification"
```
