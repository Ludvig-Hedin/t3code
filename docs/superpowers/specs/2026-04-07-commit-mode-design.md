# Commit Mode: Single / Multiple / Agent Decides

**Date:** 2026-04-07  
**Status:** Approved — ready for implementation planning

---

## Summary

Add a **commit mode** selector to the commit dialog and settings, letting users (or the AI) decide whether staged changes are collapsed into one commit or split into multiple logical commits.

---

## Options

| Mode                 | Behaviour                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `last_used`          | Default. Remembers whichever mode was last selected in the dialog.                                                                                        |
| `agent_decides`      | AI analyses the full staged diff and decides: one commit if the changes are cohesive, multiple commits if changes span distinct features/fixes/refactors. |
| `one_commit`         | Always produces a single commit. Current default behaviour.                                                                                               |
| `multiple_if_needed` | AI is instructed to always split into logical groups (may return 1 group if changes are cohesive).                                                        |

---

## Architecture

### 1. Contracts (`packages/contracts/src/settings.ts`)

- Add `GitCommitMode` literal union: `"last_used" | "agent_decides" | "one_commit" | "multiple_if_needed"`
- Add `gitCommitMode: GitCommitMode` to `ServerSettings` (default: `"last_used"`)
- Add `gitCommitMode` to `ServerSettingsPatch` (optional key)

### 2. Contracts (`packages/contracts/src/git.ts`)

- Add optional `commitMode: GitCommitMode` field to `GitRunStackedActionInput`
- Add `CommitPlan` type: `Array<{ files: string[]; subject: string; body: string }>`
  - Used internally by server; not surfaced to client as a separate contract type (implementation detail). The field name **`files`** matches the JSON shape returned by `buildMultiCommitPrompt` and must be the single property name used end-to-end (parsing, validation, `git add`).

### 3. Server — Prompts (`apps/server/src/git/Prompts.ts`)

- Add `buildMultiCommitPrompt(input)`: instructs the AI to return a JSON array of commit groups
  ```
  { commits: [{ subject, body, files: string[] }] }
  ```
  Rules: same subject/body conventions as single-commit prompt; each group must only reference files present in the staged set; no group may be empty.
- The single-commit `buildCommitMessagePrompt` is untouched.

### 4. Server — TextGeneration service (`apps/server/src/git/Services/TextGeneration.ts`)

- Extend `CommitMessageGenerationInput` with optional `commitMode?: GitCommitMode`
- Extend `CommitMessageGenerationResult` with optional `commits?: CommitPlan`
  - Present when `commitMode` is `"agent_decides"` or `"multiple_if_needed"` and AI returns >1 group
  - Absent (falls back to `subject`/`body`) for single-commit result

### 5. Server — TextGeneration implementations

Both `ClaudeTextGeneration` and `CodexTextGeneration` (and `RoutingTextGeneration`) need:

- When `commitMode` is `"one_commit"` or undefined → existing path, no change
- When `commitMode` is `"agent_decides"` → call new multi-commit prompt; if AI returns 1 group collapse to single-commit result; if >1 groups return as `commits` array
- When `commitMode` is `"multiple_if_needed"` → same as `agent_decides` but always returns the array (even if just 1)

### 6. Server — GitManager (`apps/server/src/git/Layers/GitManager.ts`)

- In `generateCommitSuggestion` (the internal helper): pass `commitMode` from input settings + request input
- Refactor `runCommitStep` to accept either:
  - A single `{ commitMessage, files }` → current behaviour
  - A `CommitPlan` array → iterate: for each group, stage only those files (`git add <files>`), then commit with that group's message
- Progress events for multi-commit: emit `phase: "commit"` with a description like `"Committing 1 of 3…"` so the toast reflects the iteration
- `runStackedAction` resolves effective `commitMode` (using `input.commitMode` and `serverSettings.gitCommitMode`):
  1. **Normal path:** The web client resolves `"last_used"` using `bird_code.lastUsedCommitMode` (see below) and sends a concrete mode (`agent_decides`, `one_commit`, or `multiple_if_needed`). The server should **not** rely on receiving `"last_used"` from current clients.
  2. Use `input.commitMode` when it is one of the concrete modes above.
  3. Otherwise fall back to `serverSettings.gitCommitMode`.
  4. **Compatibility / API:** If `input.commitMode` is still `"last_used"` (older client, scripted API, or bug), map it to **`agent_decides`** so behavior stays deterministic. Do not interpret `"last_used"` as “read last-used from server settings”; that state is client-owned.

### 7. Server settings (`apps/server/src/serverSettings.ts`)

- Add `gitCommitMode: "last_used"` as the default (matches the schema default)

### 8. Web — GitActionsControl dialog (`apps/web/src/components/GitActionsControl.tsx`)

- Add local state: `dialogCommitMode: GitCommitMode`
- On dialog open: initialise from `settings.gitCommitMode` (or `"last_used"` if that's the persisted value, resolved to the last-used mode stored in a separate `lastUsedCommitMode` local state, defaulting to `"agent_decides"`)
- Add a compact segmented control / radio group below the "Commit message" textarea:
  - Label: **Commit strategy**
  - Options: "Agent decides" | "One commit" | "Multiple if needed"
  - Visually small (same xs text style as the file stats line)
- On confirm (`runDialogAction` / `runDialogActionOnNewBranch`): pass `commitMode` in the mutation input; if `settings.gitCommitMode === "last_used"` persist the chosen mode back via `updateSettings({ lastUsedCommitMode: ... })` — or store in `localStorage` for simplicity (avoids a round-trip settings write on every commit). **Decision: use `localStorage` for last-used tracking so it's instant and free.**
- On quick-action path (the primary button, no dialog): resolve effective mode the same way and pass in the mutation without showing the dialog

### 9. Web — Progress stages (`apps/web/src/components/GitActionsControl.logic.ts`)

- `buildGitActionProgressStages` currently hard-codes `"Generating commit message..."` / `"Committing..."`. When `commitMode` is `agent_decides` or `multiple_if_needed`, replace the single commit stage with `"Generating commit plan..."` / `"Committing…"` (the server emits per-commit progress detail in the toast description)

### 10. Web — Settings panel (`apps/web/src/components/settings/SettingsPanels.tsx`)

- Add a new section inside the existing **Git & Code Review** panel, above or below "Commit instructions":
  - **Heading:** "Default commit strategy"
  - **Description:** "How Bird Code handles commits with many or mixed changes."
  - **Control:** A `<select>` or radio group with the 4 options (labels below)

  | Value                | Label                      |
  | -------------------- | -------------------------- |
  | `last_used`          | Last used (default)        |
  | `agent_decides`      | Agent decides              |
  | `one_commit`         | One commit                 |
  | `multiple_if_needed` | Multiple commits if needed |

---

## Data Flow

```
User picks mode in dialog
        │
        ▼
GitRunStackedActionInput.commitMode (resolved from last_used → actual mode)
        │
        ▼
GitManager.runStackedAction
  ├─ generateCommitSuggestion(commitMode)
  │     └─ TextGeneration.generateCommitMessage({ commitMode })
  │           ├─ one_commit → single prompt → { subject, body }
  │           ├─ agent_decides → multi prompt → if 1 group: { subject, body }
  │           │                                if N groups: { commits: [...] }
  │           └─ multiple_if_needed → multi prompt → { commits: [...] }
  │
  └─ runCommitStep(suggestion)
        ├─ single: git add <files> && git commit -m <msg>   (current)
        └─ multi:  for each group:
                     git add <group.files>
                     git commit -m <group.subject + body>
                   (progress: "Committing 1 of N…")
```

---

## Settings persistence for "last used"

- `settings.gitCommitMode` can be `"last_used"`. This is the **default** and means "remember whatever I picked last".
- The actual last-picked value is stored in `localStorage` under key `bird_code.lastUsedCommitMode` (default: `"agent_decides"`).
- When the client resolves the effective mode to send to the server, it reads localStorage if `settings.gitCommitMode === "last_used"`.
- After every commit where mode was explicitly chosen in the dialog, `localStorage` is updated.

---

## Edge Cases

### Manual message + multi-commit mode

If the user types a commit message in the dialog textarea AND the selected mode is `agent_decides` or `multiple_if_needed`:

- The **commit mode selector** shows **`one_commit`** as the visible, **disabled** selection while the textarea is non-empty (user cannot pick multi-commit strategies until the manual message is cleared).
- The **client sends** `commitMode: "one_commit"` in the `GitRunStackedAction` payload whenever the textarea is non-empty, regardless of the persisted default or prior selector value.
- **Restore prior choice:** Keep `previousCommitMode` (or equivalent) when the textarea becomes non-empty; when the textarea is cleared, restore the commit mode selector and payload to that stored value so users do not lose their preferred default.
- A helper text appears: _"A manual message overrides commit strategy — clear it to let the agent decide."_
- This prevents ambiguity about which message to use for which commit group.

### Partial file selection + multi-commit

When the user excludes some files from the dialog (partial selection), only the selected files are staged before the AI prompt is built. The AI therefore only sees selected files in the diff summary — grouping naturally applies only within that selection.

### Error handling scenarios

1. **Invalid AI responses:** Reject plans with empty groups, files not in the staged set, non-JSON, or wrong shape. Validate before any `git commit`; surface a clear error and do not mutate the repo. Same validation applies when **Partial file selection + multi-commit** narrows the staged set — groups must reference only files that are actually staged for this run.
2. **Multi-commit atomicity:** Default strategy should be **stop-on-first-failure** (do not continue after a failed commit) and leave the working tree where Git left it; document whether partial commits remain (user may need to inspect `git status`). Alternative strategies (full rollback) are out of scope unless product explicitly adds them.
3. **Server-side validation:** Enforce **no empty groups** and **membership in staged files** (and in partial-selection flows, membership in the user’s selected subset) before executing commits.
4. **User feedback:** Show actionable errors (validation vs Git error), offer **retry** where safe, and in **Manual message + multi-commit mode** remind the user that clearing the manual message restores multi-commit behaviour if validation failed due to message/strategy mismatch.

---

## What is NOT in scope (v1)

- Preview of planned commit groups before execution (no pre-flight diff-grouping UI)
- Manual drag-and-drop file grouping
- Per-file commit assignment

---

## Files to touch

| File                                                  | Change                                         |
| ----------------------------------------------------- | ---------------------------------------------- |
| `packages/contracts/src/settings.ts`                  | Add `GitCommitMode`, extend schemas            |
| `packages/contracts/src/git.ts`                       | Add `commitMode` to `GitRunStackedActionInput` |
| `apps/server/src/git/Prompts.ts`                      | Add `buildMultiCommitPrompt`                   |
| `apps/server/src/git/Services/TextGeneration.ts`      | Extend input/result types                      |
| `apps/server/src/git/Layers/ClaudeTextGeneration.ts`  | Multi-commit generation path                   |
| `apps/server/src/git/Layers/CodexTextGeneration.ts`   | Multi-commit generation path                   |
| `apps/server/src/git/Layers/RoutingTextGeneration.ts` | Route to correct impl                          |
| `apps/server/src/git/Layers/GitManager.ts`            | Multi-commit execution logic                   |
| `apps/server/src/serverSettings.ts`                   | Default for `gitCommitMode`                    |
| `apps/web/src/components/GitActionsControl.tsx`       | Commit mode selector + quick-path              |
| `apps/web/src/components/GitActionsControl.logic.ts`  | Progress stages                                |
| `apps/web/src/components/settings/SettingsPanels.tsx` | Git settings section                           |
