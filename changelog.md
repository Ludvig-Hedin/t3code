# Changelog

## [2026-04-10] [Fix] Infinite re-render loop in Sidebar — "Maximum update depth exceeded"
- **Root cause:** Zustand selector `useStore((store) => store.projects.filter(...))` called `.filter()` inside the selector, creating a new array reference on every invocation. React's `useSyncExternalStore` (used internally by Zustand) re-checks snapshots during the passive effect commit phase — since `.filter()` always returns a new reference, `Object.is` always fails, forcing a re-render → infinite loop.
- **Fix:** Moved `.filter()` out of the Zustand selector and into `useMemo`, reading the raw `store.projects` (stable reference) from the store instead.
- **Files:** `apps/web/src/components/Sidebar.tsx`, `apps/web/src/routes/_chat.index.tsx`
- **Introduced by:** commit `2aa3fc53` which changed from `store.projects` to `store.projects.filter(...)`.

## [2026-04-09] [Fix] Reliability and consistency (setup CORS, A2A, memory-compiler, web types)
- **Server:** `setupRoutes` 503 import response now includes `SETUP_CORS_HEADERS`; A2A JSON-RPC body uses `Effect.exit(request.json)` (no JS try/catch); safer JSON parsing in `A2aTaskServiceLive.taskFromRow`; `A2aClientServiceLive.sendMessage` defaults missing task status to `submitted`; `A2aAgentCardServiceLive` uses `Effect.catchCause` / `Effect.catch` (Effect v4); `A2aAdapter` maps send failures to `ProviderAdapterRequestError`, uses `Effect.catch` for cancel, cancels remote task in `stopSession`.
- **Contracts:** Replaced invalid `Schema.Literals` with `Schema.Union([Schema.Literal(...)])` patterns used elsewhere in the package.
- **Web:** `Project.deletedAt` aligned with other optional timestamps; `store.mapProject` normalizes null to undefined; DiffPanel project overview turn label; MessagesTimeline `group` on user-message column for hover actions.
- **Mobile:** Stub `CheckpointDiffQuery` matches real method signatures and `CheckpointServiceError`.
- **memory-compiler:** AGENTS.md hook examples match `uv run --directory memory-compiler`; session-end flush spawn sets `CLAUDE_INVOKED_BY` and `start_new_session` on Unix; stricter flush OK/error detection; `compile.py` requires KB output before state update; `config.py` honors `TIMEZONE`; utilities and query/flush robustness; knowledge index/log YAML frontmatter; Obsidian wikilinks without `.md` in sources.

## [2026-04-08] [Feature] A2A Agents Web UI — store, settings panel, and route
- Added `a2aStore.ts` Zustand store for managing A2A agent cards and tasks via WS RPC.
- Added `A2aAgentsPanel.tsx` settings panel with agent list, discover/register form, expandable skill details, and remove action.
- Added `settings.a2a.tsx` TanStack Router route for `/settings/a2a`.
- Updated `SettingsSidebarNav.tsx` to include "A2A Agents" nav item with NetworkIcon.
- Extended `wsRpcClient.ts` with `a2a` namespace exposing all 8 A2A RPC methods.
- Files: `apps/web/src/a2aStore.ts`, `apps/web/src/components/settings/A2aAgentsPanel.tsx`, `apps/web/src/routes/settings.a2a.tsx`, `apps/web/src/components/settings/SettingsSidebarNav.tsx`, `apps/web/src/wsRpcClient.ts`

## [2026-04-08] [Fix] Resolve type errors from A2aModelSelection requiring agentCardId
- Added `NonA2aModelSelection` and `NonA2aProviderKind` types to contracts for future use.
- Fixed type errors in web app where generic `{provider, model}` construction doesn't include `agentCardId`.
- Used type assertions in composerDraftStore, ChatView, AutomationsManager, modelSelection where A2A is unreachable.
- Narrowed `InstallProviderSettings.provider` to `Exclude<ProviderKind, "a2a">` in SettingsPanels since A2A has no binary/install settings.
- Files: `packages/contracts/src/orchestration.ts`, `apps/web/src/composerDraftStore.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/AutomationsManager.tsx`, `apps/web/src/components/settings/SettingsPanels.tsx`, `apps/web/src/hooks/useSettings.ts`, `apps/web/src/modelSelection.ts`

## [2026-04-08] [Feature] Claude Memory Compiler - Automatic knowledge base from conversations

- **Setup:** Integrated [claude-memory-compiler](https://github.com/coleam00/claude-memory-compiler) into `memory-compiler/` directory.
- **Hooks:** Configured SessionStart, SessionEnd, and PreCompact hooks in `.claude/settings.json` to automatically capture conversations into daily logs and inject knowledge context into every session.
- **How it works:** Conversations are captured → flushed to `daily/YYYY-MM-DD.md` → compiled into `knowledge/` articles → injected back at session start. End-of-day auto-compilation runs after 6 PM.
- **Files:**
  - `memory-compiler/` — full memory compiler system (hooks, scripts, knowledge dirs)
  - `.claude/settings.json` — added SessionStart, PreCompact, SessionEnd hooks
  - `.gitignore` — added memory compiler runtime artifacts

## [2026-04-08] [UX] Add immediate visual feedback when sending messages

- **Web:** Added instant toast notification when message send begins (shows "Sending message..." or "Preparing worktree..." based on context).
- **Web:** Enhanced send button to display "Sending..." or "Connecting..." text next to the spinner when actively sending, providing clear visual feedback immediately.
- **Impact:** Users now get clear, immediate feedback when they click send — no more confusion about whether the message was submitted. Toast appears instantly and button shows spinning indicator with status text.
- **Files:** 
  - `apps/web/src/components/ChatView.tsx` — added `toastManager.add()` call immediately after `beginLocalDispatch()`
  - `apps/web/src/components/chat/ComposerPrimaryActions.tsx` — wrapped button with status text that appears when sending/connecting, increased spinner size for better visibility

## [2026-04-08] [Fix] User message bubble bottom spacing from hidden action buttons

- **Web:** Moved action buttons (copy, revert) below the user message bubble instead of inside it.
- **Impact:** Eliminates unwanted bottom padding in message bubbles; buttons now appear in dedicated space below the bubble on hover/focus.
- **Files:** `apps/web/src/components/chat/MessagesTimeline.tsx` — repositioned buttons outside the `.rounded-2xl` bubble container but kept them in the flex column layout.

## [2026-04-08] [Feature] Show thread token usage (input/output) setting

- **Contracts:** Added `showThreadTokenUsage` boolean to `ClientSettingsSchema` (default: false).
- **Web:** New `ThreadTokenUsage` component displays cumulative input/output tokens and last-turn breakdown next to the context window meter.
- **Web:** Added toggle in General Settings → "Thread token usage" to enable/disable the display.

## [2026-04-08] [Fix] Desktop Finder path trim, API URL scheme, preview hardening

- **Desktop:** `OPEN_IN_FINDER` passes trimmed paths to `shell.showItemInFolder`.
- **Web:** `resolveApiUrl` preserves the correct HTTP scheme by reading the base URL via `resolveServerUrl` and mapping `ws`/`http` → `http` and `wss`/`https` → `https` (instead of always forcing `http`). See `resolveApiUrl` and `resolveServerUrl` in `apps/web/src/lib/utils.ts`.
- **Server:** Standalone preview static file serving compares `fs.realpath` for app root and candidate paths to block symlink escape; DOCX extraction uses async `execFile` with timeout; `createStandaloneRenderer` reads files only per kind with an explicit `docx` branch.

## [2026-04-08] [Fix] Project sidebar context menu actions

- Added `Rename project` to the project right-click menu in the sidebar and wired it to `project.meta.update` so only the Bird Code display name changes.
- Added `Open in Finder` to the same project menu and bridged it through Electron `shell.showItemInFolder` for desktop users.
- Hid the Finder action outside native desktop contexts so the menu stays accurate when the desktop bridge is unavailable.

## [2026-04-08] [Release] v0.0.15 — first public release + marketing site deployed

- **GitHub Release v0.0.15** published at https://github.com/Ludvig-Hedin/t3code/releases/tag/v0.0.15 with macOS arm64 DMG, macOS x64 DMG, Windows x64 EXE, and Linux x86_64 AppImage. Auto-updater manifests (latest-mac.yml, latest.yml, latest-linux.yml) included.
- **Marketing site** deployed to Vercel at https://marketing-nu-six.vercel.app/download — the download page auto-fetches from the GitHub Releases API and shows direct links to all platform binaries.
- **Fix (CI):** Updated `server.test.ts` — the devUrl test now spins up a mock HTTP server to verify proxy behavior instead of asserting an old 302 redirect that no longer matches the proxy-based implementation in `http.ts`.
- **Fix (CI):** `release.yml` — `Publish GitHub Release` no longer depends on `publish_cli`; CLI npm publish and the desktop release are now independent, preventing stranded artifacts when the npm step fails.
- **Vercel setup:** Marketing Astro site linked at monorepo root via Vercel API (rootDirectory=null, installCommand=`bun install --frozen-lockfile`, buildCommand=`cd apps/marketing && node_modules/.bin/astro build`, outputDirectory=`apps/marketing/dist`).

## [2026-04-08] [Docs/Fix] Specs, GEMINI edit example, composer fences, diff card, parsing

- **User-facing (web):** `FileDiffCard` uses theme-aware diff line colors, disclosure `aria-expanded` / `aria-controls`, preserves `@@` hunk lines without stripping, and `ComposerPendingApprovalPanel` restores `title` on truncated detail. Chat composer file attachments use dynamic Markdown fence length when file text contains backticks. `parseCssColor` rejects non-finite hex alpha.
- **Docs:** `GEMINI.md` edit-transparency example is a single-line pattern; superpower plans/specs updated (prompt-improvement snippet, commit-mode `files` + `last_used` + error handling + manual message, voice transcription privacy/proxy/constraints).
- **Server:** `setupRoutes` import route documents Effect v4 `Result` (`success`/`failure`) and `Effect.catch` (v3 `catchAll` rename) — no behavioral change.

## [2026-04-08] [Fix] Release pipeline unblock + build verification

- Fixed the `apps/web` typecheck blockers that were preventing a clean repo-wide release build.
- Restored the required `showProjectTooltip` prop on the organized sidebar wrapper and removed a stray wrapper prop that the component did not accept.
- Narrowed the default-provider settings handler so the select value matches the existing settings type.
- Fixed the `uiStateStore` import so `ThreadId.makeUnsafe()` is available at runtime.
- Updated the project-order snapshot test to match the current "prepend new projects" behavior.
- Verified `bun run fmt:check`, `bun run lint`, `bun run typecheck`, and `bun run build` all pass after the fixes.

## [2026-04-07] [Feature] Drag-to-reorder auto-switch, Pin to sidebar/project, Filter & Organize sidebar

### Feature 1 — Drag-to-reorder auto-switch

- `handleProjectDragEnd` now auto-captures rendered order and switches `sidebarProjectSortOrder` to `"manual"` on first drag, regardless of current setting.
- `handleProjectDragStart` early-return guard removed — drag now always starts.
- Project list always rendered via `DndContext` + `SortableProjectItem` (no more conditional split).
- Project header drag handle props always applied (not gated on `isManualProjectSorting`).
- `setProjectOrder(ids)` action added to `uiStateStore`.
- New projects in `syncProjects` now **prepend** (unshift) instead of append — most recently added project appears at top.
- Files: `apps/web/src/uiStateStore.ts`, `apps/web/src/components/Sidebar.tsx`

### Feature 2 — Pin to sidebar / Pin to project

- New `pinnedToSidebarThreadIds` and `pinnedToProjectThreadIds` arrays added to `UiState` — persisted in localStorage.
- New actions: `pinToSidebar`, `unpinFromSidebar`, `pinToProject`, `unpinFromProject`.
- Thread context menu has two new conditional items: pin/unpin from sidebar, pin/unpin from project.
- "Pinned" section rendered above the project list in `by_project` mode — each entry shows a `PinIcon` and the project name as a tooltip on hover.
- Pinned-to-project threads float to the top of their project's thread list.
- Files: `apps/web/src/uiStateStore.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/uiStateStore.test.ts`

### Feature 3 — Filter & Organize button

- New `SlidersHorizontalIcon` button added **left** of the sort button in the sidebar header.
- Opens a `Popover` with two sections:
  - **Organize by**: By Project (default), Chronological, By Provider, By Date — radio-style selection.
  - **Filter**: Projects checklist, Providers checklist, Date buckets checklist (Today/This week/This month/Older), Activity buckets (Has activity / No activity).
- An active-filter dot badge appears on the button when any filter is enabled.
- Non-"by_project" modes render flat or grouped thread lists (`SidebarOrganizedView`).
- Groups show max 10 threads with "View more" / "Show less" expand controls.
- `SidebarOrganizeMode` and `SidebarFilterState` types defined at module level.
- Files: `apps/web/src/components/Sidebar.tsx`
