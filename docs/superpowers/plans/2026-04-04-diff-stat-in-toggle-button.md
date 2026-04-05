# Diff Stat in Toggle Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show `+X / -Y` diff stats (green additions, red deletions) inside the diff panel toggle button in the app header, to the right of the diff icon.

**Architecture:** Compute a total diff stat from `turnDiffSummaries` inside `ChatView.tsx` using the already-available `summarizeTurnDiffStats` utility, pass it as a new optional prop to `ChatHeader`, and render `DiffStatLabel` inside the existing `Toggle` button next to the `DiffIcon`.

**Tech Stack:** React, TypeScript, Tailwind CSS, existing `DiffStatLabel` component, existing `summarizeTurnDiffStats` utility.

---

### Task 1: Pass diffStat from ChatView to ChatHeader

**Files:**

- Modify: `apps/web/src/components/chat/ChatHeader.tsx`
- Modify: `apps/web/src/components/ChatView.tsx`

#### Step 1: Add `diffStat` prop to `ChatHeader`

- [ ] Open `apps/web/src/components/chat/ChatHeader.tsx`

Add the import for `DiffStatLabel` and update the props interface and component to accept and render `diffStat`:

```tsx
import {
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { DiffIcon, TerminalSquareIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { DiffStatLabel } from "./DiffStatLabel";

interface ChatHeaderProps {
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  activeProjectCwd: string | null;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  diffOpen: boolean;
  // Optional aggregate diff stat to show inside the toggle button
  diffStat: { additions: number; deletions: number } | null;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
}
```

- [ ] Update the destructured parameters in the component to include `diffStat`:

```tsx
export const ChatHeader = memo(function ChatHeader({
  activeThreadId,
  activeThreadTitle,
  activeProjectName,
  activeProjectCwd,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  diffToggleShortcutLabel,
  gitCwd,
  diffOpen,
  diffStat,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
}: ChatHeaderProps) {
```

- [ ] Replace the diff `Toggle` inner content to include the stat label when available.

Replace the existing diff Toggle (lines ~133-155) with:

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Toggle
        className="shrink-0"
        pressed={diffOpen}
        onPressedChange={onToggleDiff}
        aria-label="Toggle diff panel"
        variant="outline"
        size="xs"
        disabled={!isGitRepo}
      >
        <DiffIcon className="size-3" />
        {/* Show aggregate diff stat (+X / -Y) when available */}
        {diffStat && (diffStat.additions > 0 || diffStat.deletions > 0) && (
          <span className="font-mono text-[10px] leading-none">
            <DiffStatLabel additions={diffStat.additions} deletions={diffStat.deletions} />
          </span>
        )}
      </Toggle>
    }
  />
  <TooltipPopup side="bottom">
    {!isGitRepo
      ? "Diff panel is unavailable because this project is not a git repository."
      : diffToggleShortcutLabel
        ? `Toggle diff panel (${diffToggleShortcutLabel})`
        : "Toggle diff panel"}
  </TooltipPopup>
</Tooltip>
```

#### Step 2: Compute `diffStat` in ChatView and pass it down

- [ ] In `apps/web/src/components/ChatView.tsx`, find where `turnDiffSummaries` is used (around line 1357). The `summarizeTurnDiffStats` utility is already imported in the store, but needs to be imported in `ChatView.tsx`.

Search for existing imports near the top of `ChatView.tsx`:

```
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
```

Add `summarizeTurnDiffStats` import below it (or with other lib imports):

```tsx
import { summarizeTurnDiffStats } from "../lib/turnDiffTree";
```

- [ ] After the `turnDiffSummaries` hook call (around line 1357), add a `useMemo` to compute the aggregate stat from all turns:

```tsx
// Aggregate additions/deletions across all turns for display in the diff toggle button
const diffStat = useMemo(() => {
  const allFiles = turnDiffSummaries.flatMap((summary) => summary.files);
  if (allFiles.length === 0) return null;
  const stat = summarizeTurnDiffStats(allFiles);
  return stat.additions === 0 && stat.deletions === 0 ? null : stat;
}, [turnDiffSummaries]);
```

- [ ] Find the `<ChatHeader ... />` JSX (around line 3980) and add the `diffStat` prop:

```tsx
diffStat = { diffStat };
```

The full prop block should look like:

```tsx
<ChatHeader
  activeThreadId={activeThread.id}
  activeThreadTitle={activeThread.title}
  activeProjectName={activeProject?.name}
  activeProjectCwd={activeProject?.cwd ?? null}
  isGitRepo={isGitRepo}
  openInCwd={gitCwd}
  activeProjectScripts={activeProject?.scripts}
  preferredScriptId={
    activeProject ? (lastInvokedScriptByProjectId[activeProject.id] ?? null) : null
  }
  keybindings={keybindings}
  availableEditors={availableEditors}
  terminalAvailable={activeProject !== undefined}
  terminalOpen={terminalState.terminalOpen}
  terminalToggleShortcutLabel={terminalToggleShortcutLabel}
  diffToggleShortcutLabel={diffPanelShortcutLabel}
  gitCwd={gitCwd}
  diffOpen={diffOpen}
  diffStat={diffStat}
  onRunProjectScript={(script) => {
    void runProjectScript(script);
  }}
  onAddProjectScript={saveProjectScript}
  onUpdateProjectScript={updateProjectScript}
  onDeleteProjectScript={deleteProjectScript}
  onToggleTerminal={toggleTerminalVisibility}
  onToggleDiff={onToggleDiff}
/>
```

#### Step 3: Verify types and linting pass

- [ ] Run typecheck and linting:

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck && bun lint
```

Expected: No errors.

#### Step 4: Commit

- [ ] Commit the changes:

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/chat/ChatHeader.tsx apps/web/src/components/ChatView.tsx
git commit -m "feat: show diff +/- stat in diff panel toggle button"
```

---

## Self-Review

**Spec coverage:**

- ✅ Diff toggle button shows `+X / -Y` with red/green coloring → handled by `DiffStatLabel` inside the `Toggle`
- ✅ Shown to the right of the icon → icon rendered first, stat span after
- ✅ Only shown when there is a non-zero stat → guarded by `diffStat && (additions > 0 || deletions > 0)`
- ✅ Uses existing `DiffStatLabel` component (already uses `text-success` / `text-destructive` colors)

**Placeholder scan:** None found.

**Type consistency:** `diffStat: { additions: number; deletions: number } | null` used consistently in the interface, prop, and computation.
