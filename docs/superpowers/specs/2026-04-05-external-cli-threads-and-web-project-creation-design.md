# Design: External CLI Threads + Web Project Creation

**Date:** 2026-04-05  
**Status:** Approved  
**Scope:** Two coupled features + bundled bug fixes

---

## 1. Problem Statement

### 1.1 External CLI Threads

Users run Claude Code, Codex CLI, and Gemini CLI in their projects. These sessions are invisible inside Bird Code — there is no unified view of "everything that has happened in this project." Users want to see all sessions from all tools in one place, and be able to continue any of them inside Bird Code.

### 1.2 Web Project Creation (Bugs)

The web app at `localhost:5733` has three broken behaviors:

- **Empty state "Create project" button** silently does nothing (calls `api.dialogs.pickFolder()` which requires Electron's `desktopBridge` — returns `null` in a browser and exits with no feedback).
- **Sidebar "Add project"** shows a raw text input for path entry in web mode, with no browsing capability.
- **"Adding…" hangs forever** because the WS client connects to `localhost:5733` (Vite dev server) instead of `localhost:3773` (Bird Code server) when `VITE_WS_URL` is unset in dev mode.

---

## 2. Architecture

Both features run entirely through the existing Bird Code server. No new infrastructure, no cloud service.

```
~/.claude/projects/    ~/.codex/sessions/    ~/.gemini/tmp/
        │                     │                    │
        └──────────────────────────────────────────┘
                              │
                    CliHistoryScanner (apps/server)
                    · Watches dirs via chokidar on server startup
                    · Parses per-CLI format (JSONL / JSON)
                    · Matches sessions → projects via workspaceRoot
                    · Idempotent: keyed by (source, externalSessionId)
                              │
                    SQLite: external_threads table (new)
                              │
                    Pushed to clients via existing WS domain event bus
                    (new field on orchestration snapshot)
                              │
               Web / Desktop / Mobile clients
```

**Directory browser** (for web project creation):

```
Web UI → shell.listDirectory RPC → server filesystem → returns subdirs → UI navigates
```

The server is already the source of truth shared by all clients. A project created from the web app, desktop app, or (future) mobile app all write to the same SQLite database — sync is architecturally free.

---

## 3. External CLI Thread Import

### 3.1 CliHistoryScanner (new server service)

Location: `apps/server/src/cliHistory/`

Responsibilities:

- On startup: full scan of all three CLI directories
- Ongoing: FSEvents/chokidar watch on each directory root; re-parse on file change
- For each session found: match to a Bird Code project by `workspaceRoot`; if no match, skip
- Upsert into `external_threads` table — idempotent on `(source, externalSessionId)`

**Per-CLI parsing:**

| CLI         | Location                                      | Project match                                                                                                                                                                                         | Title                                                             |
| ----------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Claude Code | `~/.claude/projects/<path-slug>/*.jsonl`      | Decode folder name: leading `-` stripped, remaining `-` replaced with `/` → `workspaceRoot`. Edge case: paths with real dashes are ambiguous; resolve by checking if the decoded path exists on disk. | `slug` field in first user message (e.g. `"snug-brewing-liskov"`) |
| Codex       | `~/.codex/sessions/YYYY/MM/DD/*.jsonl`        | `session_meta.payload.cwd` → `workspaceRoot`                                                                                                                                                          | First user message text, truncated to 60 chars                    |
| Gemini      | `~/.gemini/tmp/<folder>/chats/session-*.json` | Folder name = last path segment of `workspaceRoot` (best-effort; flag as ambiguous if multiple projects share the same folder name)                                                                   | Timestamp-based (`Session YYYY-MM-DD HH:mm`)                      |

**Message normalisation:** All three formats are normalised into a flat `ExternalMessage[]`:

```ts
interface ExternalMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string; // ISO
}
```

Tool use, images, and other non-text content are represented as `[tool_use: <name>]` or `[image]` inline text placeholders — sufficient for read-only display.

### 3.2 Database

New migration: `external_threads` table.

```sql
CREATE TABLE external_threads (
  id            TEXT PRIMARY KEY,        -- Bird Code generated UUID
  project_id    TEXT NOT NULL,
  source        TEXT NOT NULL,           -- 'claude-code' | 'codex' | 'gemini'
  external_id   TEXT NOT NULL,           -- original session UUID from the CLI
  title         TEXT NOT NULL,
  messages_json TEXT NOT NULL,           -- JSON array of ExternalMessage
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (source, external_id)
);
```

### 3.3 Contracts

New type in `packages/contracts/src/orchestration.ts`:

```ts
export const ExternalThreadSource = Schema.Literals(["claude-code", "codex", "gemini"]);
export type ExternalThreadSource = typeof ExternalThreadSource.Type;

export const ExternalMessage = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  timestamp: IsoDateTime,
});

export const ExternalThread = Schema.Struct({
  id: ThreadId, // Bird Code UUID (stable)
  projectId: ProjectId,
  source: ExternalThreadSource,
  externalSessionId: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  messages: Schema.Array(ExternalMessage),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ExternalThread = typeof ExternalThread.Type;
```

The orchestration snapshot gains a new field:

```ts
externalThreads: ReadonlyArray<ExternalThread>;
```

### 3.4 "Continue in Bird Code"

When the user clicks **Continue in Bird Code**:

1. Bird Code dispatches a normal `thread.create` + `thread.turn.start` command.
2. The first user message is pre-populated using the existing `buildBootstrapInput` helper (already used for history truncation) — this prepends the full conversation transcript as context.
3. **Codex only — true session resume (verified possible):** The Codex app-server protocol has a `thread/resume` JSON-RPC method accepting a `threadId`. Bird Code's `codexAppServerManager.ts` already implements this exact flow (lines 562–590): it calls `thread/resume`, and if the server rejects it, automatically falls back to a new thread. We wire the external Codex thread ID (from `session_meta` in the JSONL) into the `resumeCursor` when creating the new Bird Code session. **No new infrastructure needed.**
4. **Claude Code / Gemini — bootstrap only:** Bird Code uses its own internal `claudeAgent`/`gemini` providers, not the CLI binaries. True session resume via the CLI's session ID is not available through Bird Code's provider layer. The conversation history is loaded as transcript context via the existing `buildBootstrapInput` helper. Note: Claude Code does support `claude --resume <session-id>` and `claude --session-id <UUID>` flags in the CLI itself, but that is outside Bird Code's provider boundary.
5. After the new Bird Code thread is created, the external thread entry remains in the sidebar (it is not consumed or deleted).

**Continuity banner** — shown at the top of the external thread read-only view:

> _"Started in [Claude Code / Codex / Gemini CLI] · Continuing here creates a new Bird Code session. New messages won't sync back to the CLI."_
> `[ Continue in Bird Code ]`

For Codex where true resume succeeded, the banner updates to:

> _"Resumed from Codex CLI session · Messages sent here also update the original CLI session."_

### 3.5 Sidebar display

External threads appear in the project's thread list, sorted by `createdAt` alongside regular threads.

**Badge:** Each external thread shows two small muted icons to the right of the title:

- Provider logo icon (Claude anthropic logo / OpenAI logo / Google Gemini logo) — 12×12px, `opacity-40`
- Terminal icon — 12×12px, `opacity-40`

These icons are already available or can be added to `Icons.tsx`. No text label needed.

---

## 4. Server-side Directory Browser

### 4.1 New RPC method

Add to `packages/contracts/src/rpc.ts`:

```ts
WS_METHODS.shellListDirectory = "shell.listDirectory";

export const ShellListDirectoryInput = Schema.Struct({
  path: TrimmedNonEmptyString,
});

export const ShellDirectoryEntry = Schema.Struct({
  name: TrimmedNonEmptyString,
  path: TrimmedNonEmptyString, // absolute path
  isGitRepo: Schema.Boolean, // true if .git exists — useful hint in picker UI
});

export const ShellListDirectoryResult = Schema.Struct({
  path: TrimmedNonEmptyString, // canonical path returned (may differ from input after symlink resolve)
  parent: Schema.NullOr(TrimmedNonEmptyString), // parent path, null if at filesystem root
  entries: Schema.Array(ShellDirectoryEntry),
  homePath: TrimmedNonEmptyString, // always returned so UI can show a "Home" shortcut
});
```

Server handler: reads the directory, filters to subdirectories only (no files), checks for `.git` in each, returns sorted entries. Restricted to paths readable by the server process. Does not follow symlinks outside the path.

### 4.2 Directory Picker UI component

New component: `apps/web/src/components/DirectoryPicker.tsx`

- A modal/popover triggered by the "Create project" or "Browse…" buttons
- Header: breadcrumb of current path + "Home" shortcut button
- Body: scrollable list of subdirectories; git repos shown with a faint git branch icon
- Footer: current path display + "Select this folder" button
- Keyboard: arrow keys to navigate list, Enter to descend, Backspace to go up
- On "Select": closes modal, returns the path to the caller

### 4.3 Bug fixes

**Empty state "Create project" button** (`routes/_chat.index.tsx`):

- Remove the `if (!cwd) return` silent exit
- Instead: if `window.desktopBridge` exists → use Electron's `pickFolder` as today
- Otherwise → open the new `DirectoryPicker` component

**Sidebar "Browse…" button** (`components/Sidebar.tsx`):

- The `{isElectron && <Browse button>}` guard is changed to always render the Browse button
- In Electron: clicking it calls `desktopBridge.pickFolder()` (unchanged)
- In web mode: clicking it opens `DirectoryPicker`

**"Adding… forever" fix:**

- Add a 15-second timeout wrapper around `dispatchCommand` in `addProjectFromPath`
- On timeout: show error toast _"Could not reach server. Make sure the Bird Code server is running."_
- Dev mode: add a `VITE_WS_URL` default of `http://localhost:3773` in `vite.config.ts` so the web app connects to the correct port without manual env setup. (Currently defaults to empty string → falls back to Vite's own port 5733.)

---

## 5. Data Flow Summary

```
User opens web app
  → WS connects to server (port 3773, fixed by VITE_WS_URL default)
  → orchestration.getSnapshot returns projects + threads + externalThreads
  → Sidebar renders all three kinds of threads

User clicks "Create project" in web
  → DirectoryPicker opens → calls shell.listDirectory (RPC to server)
  → User navigates to /Users/foo/my-project → clicks "Select"
  → dispatchCommand({ type: "project.create", workspaceRoot: "/Users/foo/my-project" })
  → Server writes to SQLite → domain event pushed to all connected clients
  → Desktop app sidebar updates instantly (same server, same push)

User clicks an external thread (e.g. a Claude Code session)
  → Read-only message view renders ExternalMessage[]
  → Banner: "Started in Claude Code · Continue here to start a new Bird Code session"
  → User clicks "Continue in Bird Code"
  → New thread created with bootstrapped history → user is in live composer
```

---

## 6. File Changelist

| File                                                            | Change                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/orchestration.ts`                       | Add `ExternalThread`, `ExternalThreadSource`, `ExternalMessage` types; add `externalThreads` to snapshot |
| `packages/contracts/src/rpc.ts`                                 | Add `shell.listDirectory` RPC method and schemas                                                         |
| `apps/server/src/cliHistory/Scanner.ts`                         | New: CliHistoryScanner service                                                                           |
| `apps/server/src/cliHistory/Parsers.ts`                         | New: per-CLI format parsers (Claude Code, Codex, Gemini)                                                 |
| `apps/server/src/persistence/Migrations/NNN_ExternalThreads.ts` | New: `external_threads` table migration                                                                  |
| `apps/server/src/persistence/Layers/ExternalThreads.ts`         | New: SQL repository for external threads                                                                 |
| `apps/server/src/ws.ts`                                         | Add `shell.listDirectory` RPC handler (alongside existing `shellOpenInEditor`)                           |
| `apps/web/src/components/DirectoryPicker.tsx`                   | New: directory browser modal component                                                                   |
| `apps/web/src/components/Sidebar.tsx`                           | Use DirectoryPicker in web mode; fix isElectron guards                                                   |
| `apps/web/src/routes/_chat.index.tsx`                           | Fix "Create project" button for web mode                                                                 |
| `apps/web/src/components/Icons.tsx`                             | Add Claude / OpenAI / Gemini logo icons                                                                  |
| `apps/web/src/store.ts`                                         | Add `externalThreads` to store state                                                                     |
| `apps/web/src/wsNativeApi.ts` or `wsRpcClient.ts`               | Wire `shell.listDirectory` client call                                                                   |
| `apps/web/vite.config.ts`                                       | Default `VITE_WS_URL` to `http://localhost:3773` in dev                                                  |

---

## 7. Out of Scope

- Writing Bird Code messages back to CLI session files (bidirectional sync to CLI format files)
- Gemini CLI live sync (Gemini sessions are `tmp/` — may be deleted by the CLI; treated as best-effort)
- Mobile app: architecture already supports it (same server, same WS) but the iOS companion app UI changes are not scoped here
- Auth / multi-user: single-user local server only
