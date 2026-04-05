# Work Log Visual Redesign

## Problem

All work log entries (reasoning, tool calls, sub-agents, terminal commands, file operations) look identical — same icon, same text style, same formatting. The result is a wall of undifferentiated muted text that's hard to scan and provides no meaningful information hierarchy.

## Solution

Visually separate work log entries by type inside the existing work log card. No structural changes to the timeline, virtualizer, or data model.

## Design

### 1. Reasoning Blocks

Consecutive reasoning entries (entries with `tone === "thinking"` or label starting with "Reasoning update") within a work group merge into a single collapsible `<details>` block.

- **Summary line:** "Thought for Xs" — duration computed from `createdAt` of first to last reasoning entry in the block.
- **Expanded content:** Each reasoning step as a line of muted text (`text-muted-foreground/50`), with a subtle left border accent.
- **Auto-open:** The block renders expanded when the AI is currently working AND this reasoning block is the most recent content in the group.
- **Auto-collapse:** Once the AI finishes the turn, or non-reasoning entries appear after the block, it collapses.
- **Multiple blocks:** If reasoning is interrupted by a tool call then resumes, two separate collapsible blocks appear within the same work log card.

### 2. Tool Calls, Terminal Commands, File Operations

Non-reasoning entries get per-type visual treatment. The key improvement is stripping the "Reasoning update -" prefix and letting per-type icon + label formatting communicate the entry type.

**Terminal commands** (`itemType === "command_execution"` or `command` field present):

- Icon: `TerminalIcon`
- Primary line: command text in `font-mono`, slightly brighter text
- Secondary line (when `detail` is available): muted text showing the AI's rationale for the command
- Label: just the command itself, no prefix

**File reads** (`requestKind === "file-read"` or `itemType === "image_view"`):

- Icon: `EyeIcon`
- Label: "Read `filepath`" — file path in mono font
- Muted tone (passive operation)

**File writes/edits** (`requestKind === "file-change"` or `itemType === "file_change"`):

- Icon: `SquarePenIcon`
- Label: "Wrote `filepath`" — slightly brighter than reads
- Changed files badges remain as-is

**Web search** (`itemType === "web_search"`):

- Icon: `GlobeIcon`
- Label: "Searched for {query}" — query parsed from detail/command field when available
- Fallback: existing label if query not available

**MCP / dynamic tool calls** (`itemType === "mcp_tool_call"` | `"dynamic_tool_call"`):

- Icon: `WrenchIcon` / `HammerIcon`
- Existing styling, benefits from cleaner label parsing

### 3. Sub-agent Entries

Sub-agent entries (`itemType === "collab_agent_tool_call"` or label containing "Subagent task" / "Agent") get distinct treatment.

- Icon: `GitBranchIcon` or `WorkflowIcon` — conveys branched/parallel work
- Label: "Sub-agent: {description}" — description parsed from JSON payload in label/detail, not raw JSON dump
- Styling: subtle left border accent or slightly different background to stand out from regular tool rows
- Still a single compact row

### 4. Work Log Card Header

- **Summary strip:** Shows aggregated counts of what happened: "Read 10 files · Edited 3 files · 5 commands · 2 sub-agents". Only categories with entries appear. Counts computed by categorizing each entry's `itemType`/`requestKind`/`tone`.
- **Active indicator:** Pulsing dot on header when the work group is actively running (AI still working).
- **Show more/less toggle:** Unchanged.

### 5. What Doesn't Change

- Work log card structure (border, background, grouping logic in `deriveMessagesTimelineRows`)
- Virtualizer / timeline architecture
- Data model (`WorkLogEntry` interface, `TimelineEntry` type)
- Height estimation approach (just needs updated numbers for new row layouts)
- The `deriveWorkLogEntries` pipeline in `session-logic.ts`

## Key Files

| File                                                     | Changes                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/components/chat/MessagesTimeline.tsx`      | Main rendering changes: reasoning blocks, per-type entry rendering, header summary strip |
| `apps/web/src/components/chat/MessagesTimeline.logic.ts` | Height estimation updates for new reasoning block layout                                 |
| `apps/web/src/session-logic.ts`                          | Possibly minor: helper to detect reasoning entries, parse sub-agent descriptions         |

## Categorization Logic

To categorize entries at render time:

```
isReasoning(entry):   entry.tone === "thinking" OR entry.label starts with "Reasoning update"
isCommand(entry):     entry.itemType === "command_execution" OR entry.command is present
isFileRead(entry):    entry.requestKind === "file-read" OR entry.itemType === "image_view"
isFileWrite(entry):   entry.requestKind === "file-change" OR entry.itemType === "file_change"
isWebSearch(entry):   entry.itemType === "web_search"
isSubAgent(entry):    entry.itemType === "collab_agent_tool_call" OR entry.label contains "Subagent" OR "Agent:"
isToolCall(entry):    everything else (mcp_tool_call, dynamic_tool_call, etc.)
```
