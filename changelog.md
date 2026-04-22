# Changelog

## [2026-04-22] [Fix] `dev:web` starts the API server so the browser can finish loading

- **Root cause (1):** `bun run dev:web` only launched Vite while `VITE_WS_URL` still pointed at the local Bird Code server. With no process on that port, the web client’s WebSocket never came up, so the app appeared to load forever.
- **Change (1):** `dev:web` now runs `t3` and `@t3tools/web` in parallel. Port selection uses a **shared** offset for server + web ports so `T3CODE_PORT` and the Vite port stay matched.
- **Root cause (2):** Even with the API running, `resolveServerUrl` preferred `window.location.origin` (the Vite dev server, e.g. `:5733`) over `VITE_WS_URL`, so the app opened a WebSocket to the wrong host and never received orchestration snapshot / `bootstrapComplete`.
- **Change (2):** Resolve order is now explicit bridge URL → `VITE_WS_URL` → `location.origin`, matching the split-ports dev layout.
- **Files:** `scripts/dev-runner.ts`, `scripts/dev-runner.test.ts`, `apps/web/src/lib/utils.ts`, `README.md`, `.docs/scripts.md`

## [2026-04-20] [Fix] Hide unsupported GPT-5.1 Codex mini on ChatGPT-auth Codex accounts

- **Codex provider:** `adjustCodexModelsForAccount` now filters `gpt-5.1-codex-mini` for ChatGPT-auth Codex accounts, so the unsupported model no longer appears in the provider model list.
- **Runtime fallback:** `resolveCodexModelForAccount` now falls back to `gpt-5.3-codex` if an existing ChatGPT-auth session still points at the unsupported mini model.
- **Tests:** Added regression coverage for the filtered provider list and the fallback behavior.
- **Files:** `apps/server/src/provider/codexAccount.ts`, `apps/server/src/codexAppServerManager.test.ts`

## [2026-04-19] [Fix] Early-reject unsupported Cursor model selections; restore image fallback; protect code spans in previews

- **Cursor model-selection guard:** Removed `cursor` from the orchestration/runtime model-selection decode path and the matching settings patch schema so unsupported Cursor turns fail at validation time instead of starting and crashing later with `ProviderUnsupportedError`. This deliberately does **not** change the separate in-progress Cursor provider implementation.
- **Image clipboard fallback:** Browser image copy in `ChatView.tsx` once again falls back to copying the image URL when canvas/clipboard image writes fail (common for cross-origin assets or missing `ClipboardItem` support), while keeping the native Electron clipboard path unchanged.
- **Markdown preview correctness:** `StandalonePreviewRenderer.ts` now tokenizes inline code spans before applying emphasis/link transforms, so literals like `` `*x*` `` and `` `[link](https://example.com)` `` stay literal in standalone markdown previews. Added focused regression coverage.
- **Files:** `packages/contracts/src/orchestration.ts`, `packages/contracts/src/settings.ts`, `packages/contracts/src/orchestration.test.ts`, `apps/web/src/components/ChatView.tsx`, `apps/server/src/preview/StandalonePreviewRenderer.ts`, `apps/server/src/preview/StandalonePreviewRenderer.test.ts`

## [2026-04-18] [Fix] Diff stats now show thread-specific checkpoint changes instead of all working-tree changes

- **Root cause 1:** `ChatView.tsx` passed `gitStatusQuery.data?.workingTree.insertions/deletions` (raw git working-tree stats — ALL uncommitted files in the repo) to the `ChatHeader` diff toggle button. This caused the `+X/-Y` label to reflect every uncommitted file in the project, not just what the active thread changed.
- **Fix 1:** Added a `threadDiffStat` memo that merges per-file additions/deletions across all `turnDiffSummaries` (keyed by file path to avoid double-counting files touched in multiple turns). The ChatHeader now receives these thread-checkpoint-based stats.
- **Root cause 2:** `resolveLatestTurnDiffStat` in `store.ts` only read the LATEST turn's checkpoint diff files, so the sidebar badge showed only the most-recent turn's impact.
- **Fix 2:** Rewrote `resolveLatestTurnDiffStat` to aggregate ALL turns' file changes (merged by path), giving the sidebar badge a true cumulative thread total.
- **Files:** `apps/web/src/components/ChatView.tsx`, `apps/web/src/store.ts`

## [2026-04-18] [UX] Sidebar: single gray spinner replaces blue spinner + "Working" text + blue dot

- **Reported problem:** When a thread was running, the sidebar row showed three redundant indicators at once — a blue `LoaderCircleIcon`, a blue `bg-sky-500` dot, and the text label "Working". User wants a single, muted gray spinner.
- **Fix:** `ThreadWorkingSpinner` now uses `text-muted-foreground/80`, and the row JSX suppresses `ThreadStatusLabel` when the status is `"Working"` (the spinner alone communicates the state). `resolveThreadStatusPill` also returns neutral gray `colorClass` / `dotClass` so the collapsed-project dot stays consistent.
- **Also added:** `reports/provider-freeze-investigation.md` documenting why Claude/Codex turns appear to "freeze after ~2 minutes" and a proposed three-layer backend fix (idle-event watchdog + stream timeout + Stalled pill). Not yet implemented — awaiting sign-off on thresholds because changes affect provider-lifecycle semantics.
- **Files:** `apps/web/src/components/Sidebar.tsx`, `apps/web/src/components/Sidebar.logic.ts`, `reports/provider-freeze-investigation.md`

## [2026-04-18] [UX] Work log file edits now show real file paths instead of generic “File change”

- **Root cause:** File-write rows in `WorkEntryRow.tsx` always rendered their primary label from `entry.label`, and the Claude/Codex runtime normalizers often use the generic title `File change` there. Even when the payload already contained structured tool detail or extracted changed-file paths, the UI ignored it and showed `Wrote File change`.
- **Fix:** File-write rows now prefer structured file-change detail (`Edit`, `Write`, `MultiEdit`, etc.) and fall back to the first extracted changed file when the provider label is generic. The existing extra-file badges continue to show additional touched files.
- **Files:** `apps/web/src/components/chat/WorkEntryRow.tsx`, `apps/web/src/components/chat/WorkEntryRow.test.tsx`

## [2026-04-18] [Fix] Preview panel: clear error logs, improved markdown rendering, smarter standalone UX

- **Root cause (process stderr/stdout not shown):** The error state in `PreviewPanel.tsx` only displayed the generic `errorMessage` string and ignored the `activeLogs` store slice, so users did not see the process output (`activeLogs` holds captured stdout/stderr lines from the failed process).
- **Fix (frontend):** Error state is now a two-section layout — a compact pinned header (red dot + "Failed to start X · exit code 1" + Retry) + a full-height scrollable terminal showing all captured logs. When no logs were captured (process failed to spawn), a diagnostic message names the missing command.
- **Fix (server):** `PreviewServerManager.ts` now buffers the last 50 stdout+stderr lines per session. On non-zero exit, the last 20 non-empty lines are embedded in `errorMessage` so clients that reload the page (and miss the live event stream) still get actionable context.
- **Fix (standalone UX):** Standalone file previews (markdown, HTML, TSX, DOCX) auto-start immediately on selection. The brief window before the HTTP server is ready now shows "Loading preview…" with a spinner instead of the confusing "Press ▶ to start" message. After a manual stop, the label changes to "Click ▶ to preview {label}".
- **Fix (markdown renderer):** `StandalonePreviewRenderer.ts` `renderMarkdownToHtml` upgraded from a minimal stub to a proper renderer — now supports: inline code/bold/italic/links, fenced code blocks with language class, numbered lists, blockquotes, h4 headings, horizontal rules. CSS improved to GitHub-style with dark mode support.
- **Files:** `apps/web/src/components/PreviewPanel.tsx`, `apps/server/src/preview/Layers/PreviewServerManager.ts`, `apps/server/src/preview/StandalonePreviewRenderer.ts`

## [2026-04-17] [Fix] Chat Stop no longer leaves the composer stuck on “working”

- **Root cause:** After `thread.turn-interrupt-requested`, the client could mark the turn interrupted while `thread.session-set` still reported `running`, so `derivePhase` kept the send/stop UI in the running state. Separately, the store ignored interrupt events when `latestTurn` lagged behind `session.activeTurnId`, so the local turn state never flipped to interrupted.
- **Fix:** `derivePhase` treats an interrupted `latestTurn` that matches `activeTurnId` as ready; the interrupt reducer applies when the session’s active turn matches even if `latestTurn` is stale; Stop prefers the running `latestTurn` id when dispatching interrupt.
- **Files:** `apps/web/src/session-logic.ts`, `apps/web/src/store.ts`, `apps/web/src/components/ChatView.tsx`, tests in `session-logic.test.ts` and `store.test.ts`

## [2026-04-17] [Fix] Auto (manifest) model selection updates the composer again

- **Root cause:** Choosing **Auto** stored `manifest` / `auto` on the composer draft, but when the manifest provider row was **disabled** in the server snapshot, `resolveComposerSelectedProvider` kept the locked thread provider. `deriveEffectiveComposerModelState` then read the draft using that provider key, so the picker never showed Auto. Separately, `resolveAppModelSelection` could fold manifest into another provider and resolve `"auto"` against the wrong model list.
- **Fix:** Treat `draftActiveProvider === "manifest"` as authoritative for the composer, and resolve manifest models without mapping through `resolveSelectableProvider`.
- **Files:** `apps/web/src/components/ChatView.logic.ts`, `apps/web/src/modelSelection.ts`, tests in `ChatView.logic.test.ts` and `modelSelection.test.ts`

## [2026-04-17] [Fix] ChatView restores missing active-agent status import

- **Root cause:** `apps/web/src/components/ChatView.tsx` called `deriveActiveAgentStatus(...)` in a `useMemo`, but the helper was not imported from `apps/web/src/session-logic.ts`. That caused a runtime `ReferenceError` as soon as the chat view mounted.
- **Fix:** Restored the import so the active agent status banner can compute normally again.
- **Files:** `apps/web/src/components/ChatView.tsx`

## [2026-04-17] [UX] Humanize chat tool-call entries with clean/raw toggle

- **Chat timeline:** Added `humanizeToolDetail` so work-log tool calls render readable summaries like file reads, greps, web lookups, and delegated agent work instead of raw JSON by default.
- **Work log controls:** Added a per-header `Raw` / `Clean` toggle that switches the shared `toolCallDisplayStyle` setting in place.
- **Settings:** Added an Appearance toggle for clean tool-call display so users can choose readable summaries or verbose raw payloads as their default.
- **Path display:** File-related work-log rows now relativize workspace paths instead of showing absolute paths when possible.
- **Tests:** Added dedicated coverage for tool-detail humanization, malformed payload fallback, truncation, and path relativization.
- **Files:** `apps/web/src/components/chat/humanizeToolDetail.ts`, `apps/web/src/components/chat/humanizeToolDetail.test.ts`, `apps/web/src/components/chat/WorkEntryRow.tsx`, `apps/web/src/components/chat/MessagesTimeline.tsx`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/settings/SettingsPanels.tsx`

## [2026-04-17] [Chore] Tests, contracts, desktop build script, and Codex env action

- **Session tests:** `deriveActiveAgentStatus` quiet/stalled examples now use `it(...)` titles that match the real elapsed times (20s and 50s).
- **Contracts:** Removed the runtime `message` getter from `PromptImprovementError`; the web prompt improver reads `detail` via `Schema.is(PromptImprovementError)`.
- **Desktop artifact script:** Bun store traversal wraps filesystem calls in `try/catch` (warn and continue); scoped package paths under the store use `@scope/name` from the first two path segments.
- **Codex environment:** The action that runs `bun run dist:desktop:dmg` is labeled **Build DMG** with a **package** icon.
- **Note:** `ChatHeader` / `PopoutChatHeader` no longer contain `executionStatusTone` UI (badge removed earlier); `WsPromptImproveRpc` is already listed in `WsRpcGroup.make()` after `WsServerTranscribeAudioRpc`.
- **Files:** `apps/web/src/session-logic.test.ts`, `apps/web/src/hooks/usePromptImprover.ts`, `packages/contracts/src/promptImprovement.ts`, `scripts/build-desktop-artifact.ts`, `.codex/environments/environment.toml`

## [2026-04-17] [Chore] Onboarding: remove Features step; confirm provider-level import already in place

- **Step numbering:** `FeatureTourStep` was planned as step 4 in a 5-step flow but was never integrated into `OnboardingSheet.tsx`. The flow remains 4 steps: Providers → Mobile → Git → Import.
- **Dead code:** `FeatureTourStep.tsx` is no longer wired to any route — delete manually or it will be cleaned on the next pass.
- **Comments fixed:** `useOnboarding.ts` and `ImportChatsFlow.tsx` header comments updated from "5-step / step 5 / select projects" to "4-step / step 4 / select providers".
- **Import step:** Already implements provider-level selection (`groupByProvider`, per-provider checkboxes, total thread count badge, "All"/"None" bulk controls). Removed unused `FolderIcon` import left over from an older per-project design.
- **Files:** `apps/web/src/hooks/useOnboarding.ts`, `apps/web/src/components/onboarding/ImportChatsFlow.tsx`

## [2026-04-17] [Fix] Prompt improvement no longer fails on Codex JSON schema validation

- **Root cause:** The server asked Codex to return structured prompt-improvement JSON with optional top-level fields (`improvedPrompt`, `error`, `message`). Current Codex CLI structured-output validation rejects that schema before generation starts because every declared property must appear in the top-level `required` array.
- **Fix:** Switched the raw prompt-improvement model output to a fully required shape: `kind`, `improvedPrompt`, and `message`. Updated both Codex and Claude text-generation adapters to branch on `kind`, and added a regression test that locks the emitted JSON schema to the required-key form.
- **Files:** `apps/server/src/git/Prompts.ts`, `apps/server/src/git/Layers/CodexTextGeneration.ts`, `apps/server/src/git/Layers/ClaudeTextGeneration.ts`, `apps/server/src/git/Prompts.test.ts`

## [2026-04-13] [Fix] Chat turns now surface quiet/stalled execution and always expose stop

- **Root cause:** The chat UI only knew whether a session was generically `running`; it did not distinguish between active visible progress, expected waiting, or silence after the provider/CLI stopped emitting events. That made long tool runs and broken streams look identical to users. The stop action also lived primarily in the composer footer, so it was not reliably visible in every layout.
- **Fix:** Added client-side liveness classification from orchestration activity timestamps so running turns now surface as `working`, `waiting`, `quiet`, or `stalled`. Kept the execution badge in the main header and popout header, but left the red composer stop button as the single visible interrupt control.
- **Files:** `apps/web/src/session-logic.ts`, `apps/web/src/session-logic.test.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/chat/ChatHeader.tsx`, `apps/web/src/components/chat/PopoutChatHeader.tsx`

## [2026-04-13] [Chore] Rebuilt prod/dev brand rasters from `assets/new` logos

- **Prod** (`assets/prod`): macOS/Linux1024, web favicons, Windows ICO, and `logo.svg` now derive from `assets/new/logo-dark.png` / `logo-dark.svg`.
- **Dev** (`assets/dev`): blueprint-named rasters and `logo.svg` now derive from `assets/new/logo-light.png` / `logo-light.svg`.
- **Desktop dev bundle:** `apps/desktop/resources/icon.icns`, `icon.png`, and `icon.iconset/` regenerated from `logo-light.png` so local Electron matches the dev asset set; release DMG still uses prod mac icon via `black-macos-1024.png`.
- **Files:** `assets/prod/*`, `assets/dev/*`, `apps/desktop/resources/icon.icns`, `apps/desktop/resources/icon.png`, `apps/desktop/resources/icon.iconset/*`, `scripts/lib/brand-assets.ts`

## [2026-04-12] [Fix] Marketing download page: Linux AppImage links + safer macOS hero CTA

- **Linux:** GitHub assets use `Bird-Code-<version>-x64.AppImage` (electron-builder `x64` arch). The `/download` page only matched `-x86_64.AppImage`, so Linux cards pointed at the generic releases URL. Matching now accepts both suffixes.
- **macOS (hero):** Primary download button uses Client Hints `architecture` when available (Chromium reports "Intel" in `userAgent` on Apple Silicon). If hints are unavailable, the button links to `/download` instead of guessing the wrong DMG.
- **Docs:** README GitHub Releases + optional marketing `/download` URL aligned with `Ludvig-Hedin/t3code`; npm `repository.url` in `apps/server/package.json` matches the same remote; README clarifies winget id `T3Tools.T3Code` vs installed **Bird Code** app name.
- **Files:** `apps/marketing/src/components/marketing/download-page.tsx`, `apps/marketing/src/components/marketing/hero-download-button.tsx`, `README.md`, `apps/server/package.json`

## [2026-04-12] [Fix] Chat stop button now targets the active turn reliably

- **Root cause:** The chat stop action often dispatched `thread.turn.interrupt` without a concrete `turnId`. The web store ignored interrupt-requested events without `turnId`, leaving the UI stuck in a running state, and the server-side command reactor dropped the turn identity before calling the provider interrupt path. That made Codex interrupts race-prone and sometimes a no-op.
- **Fix:** ChatView now includes the active turn id when available, the provider command reactor forwards that turn id into `ProviderService.interruptTurn`, and the web store now falls back to the active/latest turn when an interrupt request arrives without an explicit turn id. Added regression coverage for both the server forwarding path and the web optimistic-state update.
- **Files:** `apps/web/src/components/ChatView.tsx`, `apps/web/src/store.ts`, `apps/web/src/store.test.ts`, `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`, `apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts`

## [2026-04-12] [Fix] Chat composer `Auto` model selection now sticks on started threads

- **Root cause:** The picker allowed selecting `manifest/auto` while a thread was already started, but ChatView still derived the active provider from the locked session provider. That immediately overwrote the draft selection, so the visible model never changed and the next turn would keep using the old provider.
- **Fix:** Added a shared `resolveComposerSelectedProvider` helper and switched ChatView to use it so an explicit draft switch to `manifest` wins over the locked provider. Added a regression test that covers the locked-thread `Auto` selection path.
- **Files:** `apps/web/src/components/ChatView.logic.ts`, `apps/web/src/components/ChatView.tsx`, `apps/web/src/components/ChatView.logic.test.ts`

## [2026-04-12] [Fix] Settings Ollama default model + safe Ollama base URL read

- Removed duplicate `{/* Chat behavior */}` in settings. Default-model `ProviderModelPicker` now passes `onOllamaPullModel` / `onOllamaQuitServer` when the default provider is Ollama (matches Provider defaults block). `getOllamaBaseUrl` uses full optional chaining on server config so missing `settings` / `providers` / `ollama` does not throw.
- **Files:** `apps/web/src/components/settings/SettingsPanels.tsx`, `apps/web/src/lib/ollamaClient.ts`

## [2026-04-10] [Fix] DiffPanel: show working-tree diff on no-thread-selected page instead of empty state

- **Root cause:** DiffPanel showed "No completed thread diffs yet in this project." when on the draft/empty-thread page because thread-based checkpoint diffs require an actual submitted thread. The diff button already showed accurate +X/-Y stats from git working-tree status, making the empty panel message contradictory.
- **Fix:** Added `git.getWorkingDiff` API (`git diff HEAD --patch`) that returns the raw unified-diff patch for all uncommitted changes (staged + unstaged). DiffPanel now fetches this when no active thread is selected and renders it using the same `FileDiff`/`Virtualizer` renderer as thread diffs. Header changes from "Project diffs" to "Working tree" in this mode. Falls back to "No uncommitted changes" when working tree is clean.
- **Files:** `packages/contracts/src/git.ts`, `packages/contracts/src/rpc.ts`, `packages/contracts/src/ipc.ts`, `apps/server/src/git/Services/GitCore.ts`, `apps/server/src/git/Layers/GitCore.ts`, `apps/server/src/git/Services/GitManager.ts`, `apps/server/src/git/Layers/GitManager.ts`, `apps/server/src/ws.ts`, `apps/web/src/wsRpcClient.ts`, `apps/web/src/wsNativeApi.ts`, `apps/web/src/lib/gitReactQuery.ts`, `apps/web/src/components/DiffPanel.tsx`

## [2026-04-10] [Fix] Preview panel: route mismatch → Bird Code loads in iframe, sandbox warning, startup UX

- **Root cause of "Bird Code loads inside iframe":** Route `/preview/:projectId/:appId/*` wildcard requires ≥1 char after the final slash. The iframe's first navigation is `/preview/pid/aid/` (trailing slash only) → doesn't match → falls through to SPA catch-all `GET *` → Bird Code's `index.html` served in iframe → Bird Code boots, shows its spinner, its own WebSocket (`wsTransport.ts`) tries connecting. Explains both reported symptoms.
- **Root cause of sandbox warning:** Previous session added `allow-same-origin` to suppress CORS errors, but `allow-scripts + allow-same-origin` is a sandbox escape that browsers correctly warn about. Since the proxy already emits `Access-Control-Allow-Origin: *`, `allow-same-origin` is unnecessary.
- **Fixes:**
  - `previewProxyRoute.ts`: Changed route from `/preview/:projectId/:appId/*` → `/preview/*`. The broader wildcard matches the trailing-slash-only first navigation.
  - `PreviewPanel.tsx`: Reverted `allow-same-origin` (CORS `*` from the proxy is sufficient for null-origin iframes). Added `StartupLogView` component: shown during `status === "starting"`, displays live dev-server output mapped to human-readable steps (Installing dependencies…, Compiling…, Dev server ready…) with raw lines at reduced opacity.
- **Files:** `apps/server/src/preview/previewProxyRoute.ts`, `apps/web/src/components/PreviewPanel.tsx`

## [2026-04-10] [Fix] Preview panel white-screen CORS failure for Vite / React dev servers

- **Root cause (3 compounding issues):**
  1. `<iframe sandbox>` lacked `allow-same-origin`, so the iframe's origin was opaque `null`. Every resource request from the iframe carried `Origin: null`, which Vite rejects.
  2. Vite embeds URLs in its served HTML: `http://localhost:{PORT}/@vite/client` is absolute; `/src/main.tsx` and `/@react-refresh` are root-relative. These bypassed the Bird Code proxy and hit Vite directly, where the `null`-origin CORS rejection fired.
  3. The proxy forwarded the client's `Accept-Encoding: gzip` header, meaning Vite could return gzip-compressed HTML that couldn't be inspected or rewritten.
- **Fix:**
  - `previewProxyRoute.ts`: Strip `Accept-Encoding` before forwarding; override `Access-Control-Allow-Origin: *` on all proxy responses (removing Vite's restrictive header); rewrite `http://localhost:{port}/…` / `http://127.0.0.1:{port}/…` occurrences in HTML and JS response bodies to the Bird Code proxy base path so all resource fetches route through the proxy; add OPTIONS preflight handler; add PATCH verb.
  - `PreviewPanel.tsx`: Add `allow-same-origin` to the iframe sandbox (acceptable for a local dev tool where the user's own code is previewed).
- **Files:** `apps/server/src/preview/previewProxyRoute.ts`, `apps/web/src/components/PreviewPanel.tsx`

## [2026-04-10] [Fix] Hydration error due to whitespace text nodes in `<colgroup>`

- **Root cause:** Inline comments on `<col>` elements inside `<colgroup>` were creating text nodes in the DOM. HTML spec disallows text nodes as children of `<colgroup>` (only `<col>` and `<colgroup>` allowed), causing hydration mismatch between server and client.
- **Fix:** Removed inline comments from the `<col>` elements to eliminate whitespace text nodes. Column purposes are documented in the block comment above the `<colgroup>`.
- **Files:** `apps/web/src/components/AutomationsManager.tsx`

## [2026-04-10] [Fix] Code review button fails for repos without a `main` branch

- **Root cause:** `prepareReviewContext` in `GitManager.ts` hardcoded `"main"` as the final fallback base branch. Repos using `"master"` (or any other name) have no `main` ref, so `git log --oneline main..HEAD` threw `fatal: ambiguous argument 'main..HEAD': unknown revision or path not in the working tree`.
- **Fix:** After resolving the candidate base branch, call `listLocalBranchNames` to verify it exists. If not, walk through `["main", "master", "develop", "trunk"]` to find the first available branch that isn't the current one. Falls back to any other local branch, then last-resort keeps the original candidate so git still produces a useful error message.
- **Files:** `apps/server/src/git/Layers/GitManager.ts`

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

## [2026-04-13] [Feature] Voice input & transcription

- **Web:** Added a voice-input control to the chat composer with mic recording, live waveform feedback, discard confirmation for longer clips, transcription loading state, and transcript injection back into the prompt.
- **Server/Web:** Added a typed local transcription RPC path for Whisper-compatible endpoints plus browser speech-recognition fallback when local STT is unavailable.

## [2026-04-13] [Improvement] Memory compiler flush diagnostics

- **memory-compiler:** `flush.py` now logs rich `FLUSH_ERROR` lines (UTC timestamp, subprocess meta when present, traceback tail) and retries the Agent SDK call up to 3 times with backoff (0s / 30s / 120s) before giving up.
