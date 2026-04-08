# Changelog

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
