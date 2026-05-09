---
title: Build Log
sources:
  - memory-compiler/daily/
  - memory-compiler/scripts/compile.py
created: "2026-04-09"
updated: "2026-04-24"
---

# Build Log

## [2026-04-23T20:29:10+0000] compile | daily/2026-04-19.md (no-op, confirmed)

- Source: daily/2026-04-19.md
- Status: SKIPPED — already fully compiled on 2026-04-19T23:04:00-05:00
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. Verified against index.md and log.md. All knowledge from daily/2026-04-19.md was fully extracted in the original compile pass on 2026-04-19 at 23:04:00. Coverage includes 5 concept articles: [[concepts/inactivity-watchdog-fiber-pattern]] (watchdog fiber detects frozen streams via lastActivityAtMs tracking), [[concepts/effect-timeoutoption-clean-error-types]] (Effect.timeoutOption keeps error channel clean by returning Option instead of adding TimeoutException), [[concepts/stream-takewhile-freeze-limitation]] (Stream.takeWhile predicate never evaluates when source is frozen), [[concepts/late-event-ingestion-guard]] (reject terminal events for stopped/completed sessions to prevent zombie event UI re-activation), [[concepts/phase-derivation-turn-id-guard]] (require activeTurnId alongside status === "running" to prevent stale spinner). Connection article [[connections/frozen-stream-defense-in-depth]] synthesizes all four layers (watchdog + interrupt timeout + late-event guard + phase guard) as a complete defense-in-depth pattern for handling frozen provider streams. The session documented a multi-provider chat app debugging scenario where AI froze indefinitely and the stop button flickered — the four-layer solution addressed autonomous freezes (watchdog), user-initiated stops hanging (interrupt timeout), server-side zombie events (late-event guard), and client-side stale phase derivation (turn-ID guard). No new knowledge to extract. Knowledge base remains at 74 entries (57 concepts + 17 connections).

## [2026-04-23T20:35:00+0000] compile | daily/2026-04-20.md (no-op, confirmed)

- Source: daily/2026-04-20.md
- Status: SKIPPED — already fully compiled across 2 prior passes (2026-04-20T20:00:00 and 2026-04-20T20:30:00)
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. All knowledge from daily/2026-04-20.md was fully extracted across 2 substantive compilation passes. The log covers 13 sessions spanning diverse topics. All concepts and connections have been extracted: 8 concept articles created (react18-setstate-updater-timing-trap, websocket-silent-death-heartbeat, process-output-dual-pattern-matching, code-review-thread-isolation, nodejs-readline-close-race, lazy-file-tree-rpc-expansion, pending-selection-store-coordination, electron-context-menu-react-overlay) and 1 connection article (silent-hang-detection-patterns). The flush-pipeline-failure-modes article was updated with 2026-04-20 burst failure data (5 FLUSH_ERROR entries at 22:19 UTC and 23:00 UTC). Sessions covered: (1) Code review dispatch bug fix — creating fresh threads vs reusing stale activeThreadId. (2) Tunnel failure detection — dual-pattern matching for error and success in cloudflared output. (3) Files panel implementation — full-stack with lazy tree, CodeMirror editor, search, context menus. (4) WebSocket silent death — heartbeat with window.location.reload() recovery. (5) React 18 setState timing trap — queueRef pattern for synchronous reads alongside async state updates. (6) Readline close race — coordinating child.on('close') + readline close events. (7) File creation operations — full-stack createFile/createDirectory RPC implementation across contracts, server, client, tests. Sessions (20:30) and (21:23) contain substantial file creation implementation work, but the core patterns are already covered in existing articles (lazy-file-tree-rpc-expansion for RPC expansion, rpc-layer-expansion-pattern for the general pattern). No new extractable concepts or connections identified. Knowledge base remains at 74 entries (57 concepts + 17 connections).

## [2026-04-23T20:40:00+0000] compile | daily/2026-04-21.md (no-op)

- Source: daily/2026-04-21.md
- Status: SKIPPED — no extractable knowledge content
- Articles created: (none)
- Articles updated: (none)
- Summary: Daily log 2026-04-21.md contains only two FLUSH_OK memory flush entries with "Nothing worth saving from this session." No substantive sessions, concepts, debugging insights, architectural decisions, or connection patterns to extract. Knowledge base remains at 74 entries (57 concepts + 17 connections).

## [2026-04-23T20:45:00+0000] compile | daily/2026-04-22.md

- Source: daily/2026-04-22.md
- Articles created: [[concepts/context-token-counter-accuracy]]
- Articles updated: (none)
- Summary: Daily log 2026-04-22.md contained mostly FLUSH_OK memory flush entries (4 entries with "Nothing worth saving from this session") and one substantive session at 23:53. The session documented the initiation of an investigation into why the context token counter displays inflated numbers (300k tokens) when the context window is much smaller, with the issue relating to provider-side compaction not being reflected in the displayed token count. Extracted one concept article documenting the counter accuracy problem: how UI token counts may show pre-compaction cumulative totals while the actual post-compaction context sent to the model is significantly smaller, creating user confusion. Article covers the display problem, diagnostic questions, and potential fixes (server-authoritative count, client recalculation from active messages, or dual display of cumulative/active counts). No implementation or debugging solutions were captured since the session ended at task assignment. Knowledge base updated to 75 entries (58 concepts + 17 connections).

## [2026-04-24T02:30:00+0000] compile | daily/2026-04-23.md

- Source: daily/2026-04-23.md
- Articles created: [[concepts/design-panel-integration-pattern]], [[concepts/websocket-resilience-defense-layers]], [[concepts/project-overview-dashboard-pattern]], [[concepts/cross-provider-session-import]], [[connections/visual-editing-requires-infrastructure-alignment]]
- Articles updated: (none)
- Summary: Daily log 2026-04-23.md documented 9 substantive sessions plus 16 FLUSH*ERROR entries (continuing the failure pattern from 2026-04-17 and 2026-04-22). Extracted 4 concept articles and 1 connection article covering major features and architectural patterns: (1) Design panel integration — full-stack visual editing with server RPC, client UI, OID stamper/resolver runtime bridge, inspector with live style updates, and structural editing operations (wrap/unwrap/duplicate/delete); critical lesson on reusing Preview infrastructure for app detection to prevent blank iframes from ID mismatches. (2) WebSocket resilience — four-layer defense pattern addressing thread freezing: unbounded orchestration timeouts (prevent replay failures on large threads), forgiving heartbeat (3×20s instead of 2×20s), exponential backoff on retry (250ms → 5s cap), force replay after reconnect (catch "stream died while agent thinking" case). (3) Project overview dashboard — landing page with groups/todos/markdown notes, localStorage persistence via Zustand, dual-purpose sidebar navigation (project name → navigate to overview, chevron → expand/collapse threads). (4) Cross-provider session import — parse .jsonl files from Claude Code (~/.claude/projects/*/[uuid].jsonl) and Codex (~/.codex/sessions/YYYY/MM/DD/rollout-\_.jsonl); extract real titles from first non-boilerplate user message; group by workspace cwd; smoke test discovered 733 Claude threads (19 projects) + 495 Codex threads (17 projects). (5) Connection article linking Design panel dependency on Preview infrastructure — explains how duplicate detection logic led to ID mismatches and blank iframes, and why extension layers must reuse foundation APIs rather than reimplementing. Other sessions: chat message bubble padding adjustment, v0.1.1 release tag/push, bug audit triaged parallel agent findings (fixed preview error formatting typo, Inspector error routing UX). Knowledge base updated to 80 entries (62 concepts + 18 connections).

## [2026-04-24T19:11:00] compile | Daily Log 2026-04-24

- Source: daily/2026-04-24.md
- Articles created: (none)
- Articles updated: (none)
- Note: Session contained only memory maintenance flush with no substantive content to extract

## [2026-04-24T19:20:00] compile | Daily Log 2026-04-24

- Source: daily/2026-04-24.md
- Articles created: [[concepts/tanstack-router-active-route-params]], [[concepts/project-feature-expansion-pattern]]
- Articles updated: [[concepts/project-overview-dashboard-pattern]] (added daily/2026-04-24.md as source for five new features implementation)
- Summary: Daily log 2026-04-24.md contained one substantive session (19:19) documenting project overview UI enhancements. Session covered two distinct patterns: (1) Active state highlighting pattern — user requested active background on selected project in sidebar (matching thread active state). Implemented using `Route.useParams()` to extract `routeProjectId` and match against project items, applying same `bg-accent/85` style as thread rows. Key insight: route params are the authoritative source of truth for active state, surviving URL changes, browser navigation, and page refreshes. (2) Multi-feature expansion pattern — user requested five related features: docs section showing .md files, thread list capped at 10 with show more/less + status badges, full-screen file explorer modal, group management with drag-to-group and bulk actions, and file creation capability. Implemented all five features in one comprehensive update to ProjectOverviewPage.tsx. Key insight: batching related features (3-7) that share data sources, UI patterns, and state management enables faster development and better coherence than incremental single-feature additions. Reused existing patterns (SidebarMenuButton, lucide icons, shadcn components, resolveThreadStatusPill for status badges) rather than creating new ones. Also updated project-overview-dashboard-pattern article to add 2026-04-24 as source since the session implemented five new features for that dashboard. Knowledge base updated to 82 entries (64 concepts + 18 connections).

## [2026-04-24T19:46:00] compile | Daily Log 2026-04-24 (Design Scanner)

- Source: daily/2026-04-24.md
- Articles created: [[concepts/design-scanner-detection-resilience]], [[concepts/diagnostic-empty-states]]
- Articles updated: [[concepts/project-feature-expansion-pattern]] (added daily/2026-04-24.md sources for UI patterns and Zustand store)
- Summary: Daily log 2026-04-24.md second substantive session (19:46) documented comprehensive improvements to the Design panel's React app scanner. Session covered two major patterns: (1) Design scanner detection resilience — enhanced scanner with broad directory traversal beyond conventional `apps/*` structure to find apps in `frontend/`, `client/`, `web/`, `packages/*/*`, and root locations. Implements multi-criteria validation (React dependency check, dev script presence, library package exclusion) and provides diagnostic feedback explaining rejection reasons. Key insight: detection systems must handle diverse project structures without manual configuration through comprehensive glob patterns and clear failure feedback. (2) Diagnostic empty states — when automated detection finds nothing, showing "0 results" leaves users confused about whether the tool is broken or setup is incomplete. Pattern surfaces why detection failed: how many locations were scanned, what criteria were used, and specific rejection reasons for each candidate ("no react", "no dev script", "library package"). Includes re-scan button with toast feedback and distinguishes tool failures from legitimate setup issues. Both patterns share backward-compatible optional `diagnostics` field in RPC response schema. Also updated project-feature-expansion-pattern to add two sources from this session about reusing existing UI patterns and Zustand store persistence. Knowledge base updated to 84 entries (66 concepts + 18 connections).

## [2026-04-09T20:01:32+02:00] compile | daily/2026-04-09.md

- Source: daily/2026-04-09.md
- Articles created: [[concepts/memory-compiler-three-stage-pipeline]], [[concepts/python-path-resolution]], [[concepts/venv-isolation-with-uv]], [[concepts/hook-execution-context]], [[concepts/subprocess-detachment-macos]], [[concepts/auto-compilation-triggers]], [[concepts/knowledge-base-index-and-log]], [[connections/architecture-depends-on-hooks]], [[connections/environment-setup-patterns]]
- Articles updated: (none)

## [2026-04-09T22:17:49+02:00] compile | daily/2026-04-09.md (A2A protocol integration)

- Source: daily/2026-04-09.md (Session 22:17 - A2A Protocol Agent Integration)
- Articles created: [[concepts/systematic-feature-implementation-phases]], [[concepts/effect-services-layers-pattern]], [[concepts/http-endpoint-authentication-patterns]], [[concepts/provider-adapter-shape-pattern]], [[concepts/typecheck-validation-gates]], [[concepts/agent-discovery-endpoints]], [[concepts/settings-ui-management-pattern]], [[connections/a2a-endpoints-and-http-authentication]], [[connections/systematic-phases-and-validation-gates]], [[connections/effect-pattern-and-adapter-shape]]
- Articles updated: (none)

## [2026-04-12T20:15:00+02:00] compile | daily/2026-04-12.md

- Source: daily/2026-04-12.md
- Articles created: [[concepts/react-hydration-whitespace-text-nodes]], [[concepts/zustand-selector-stability]], [[concepts/git-branch-resolution-fallbacks]], [[concepts/multi-platform-desktop-build-automation]], [[concepts/react-commit-phase-debugging]], [[connections/react-stability-across-lifecycle-phases]], [[connections/cross-repo-standardization-challenges]]
- Articles updated: (none)
- Note: Additional variant articles also created (colgroup-text-node-hydration-error, zustand-selector-reference-stability, etc.) covering related React and build automation topics from daily/2026-04-12.md

## [2026-04-12T20:45:00+02:00] index-update | daily/2026-04-12.md

- Source: daily/2026-04-12.md (memory compiler review/indexing)
- Articles created: (none)
- Articles updated: index.md
- Summary: Added missing index entries for process-serialization-piggyback-pattern, ollama-integration-patterns, terminal-ai-command-bar that were compiled earlier but not yet indexed

## [2026-04-12T20:50:15+02:00] compile | daily/2026-04-12.md (focused sessions)

- Source: daily/2026-04-12.md (Session 20:01 - React hydration fix, Session 20:01 - Desktop release automation)
- Articles created: [[concepts/html-semantic-constraints-jsx]], [[concepts/jsx-implicit-text-nodes]], [[concepts/github-actions-multiplatform-release]], [[concepts/dmg-universal-macos-build]], [[connections/jsx-formatting-and-hydration-mismatches]]
- Articles updated: index.md
- Summary: Extracted and documented React hydration constraints with JSX formatting, desktop app release automation pipeline, and universal DMG build strategy

## [2026-04-12T21:15:00+02:00] compile | daily/2026-04-12.md (manual)

- Source: daily/2026-04-12.md (Claude Code agent manual compilation)
- Articles created: [[concepts/html-colgroup-text-node-constraints]], [[concepts/zustand-selector-stability-anti-pattern]], [[concepts/git-branch-fallback-chain-pattern]], [[concepts/react-hydration-mismatch-from-jsx-formatting]], [[connections/jsx-formatting-and-html-semantic-constraints]]
- Articles updated: (none)
- Summary: Manually compiled 4 core debugging concepts and 1 connection article from 2026-04-12 daily log. Focus: React hydration/hydration debugging (colgroup constraints, JSX formatting interaction), state management anti-patterns (Zustand selector stability), and cross-repo tooling robustness (git branch fallback chains). All articles include Key Points, Details, Related Concepts, and source citations. Connection article links formatting and semantic HTML patterns.

## [2026-04-12T21:35:00+02:00] compile | daily/2026-04-12.md (hydration fix + release automation)

- Source: daily/2026-04-12.md (Session 20:01 - React hydration fix in AutomationsManager.tsx, Session 20:01 - DMG build and release automation exploration)
- Articles created: [[concepts/react-hydration-mismatch-causes]], [[concepts/html-colgroup-semantic-constraints]], [[concepts/jsx-formatting-affects-semantics]], [[concepts/desktop-build-automation-bun]], [[concepts/github-actions-multi-platform-release]], [[concepts/app-naming-versioning-strategy]], [[connections/jsx-formatting-breaks-semantic-html-ssr]], [[connections/release-infrastructure-code-to-artifacts]]
- Articles updated: index.md (added 7 concept entries and 2 connection entries for new articles)
- Summary: Compiled practical sessions fixing React hydration mismatch and discovering desktop release automation. Key findings: (1) JSX formatting creates invisible text nodes that violate HTML semantic constraints in `<colgroup>` and similar containers, causing server/client divergence in SSR. Fix: remove inline comments and use compact formatting. (2) Release infrastructure is integrated system of git tag versioning, Bun build automation, and GitHub Actions CI/CD—one developer action (git push with tag) triggers parallel multi-platform builds and automated artifact publishing. Both sessions revealed how formatting decisions and infrastructure automation interact across layers.

## [2026-04-12T21:45:00+02:00] compile | daily/2026-04-12.md (comprehensive session)

- Source: daily/2026-04-12.md (Sessions covering React, Zustand, git operations, Ollama, preview feature, and general debugging)
- Articles created: [[concepts/react-hydration-semantic-html]], [[concepts/zustand-selector-stability]], [[concepts/git-branch-resolution-fallback]], [[concepts/process-serialization-piggyback]], [[concepts/iframe-sandboxing-cors]], [[concepts/route-wildcard-trailing-slash]], [[concepts/external-service-initialization-fallback]], [[connections/reference-equality-and-state-thrashing]], [[connections/fallback-strategies-across-domains]], [[connections/nested-context-routing-and-security]]
- Articles updated: index.md (added 10 new concept and connection entries)
- Summary: Comprehensive extraction of 7 core technical concepts and 3 cross-domain connections from multi-faceted debugging session. Key concepts: (1) React hydration constraints with semantic HTML—text nodes in `<colgroup>` break server/client sync. (2) Zustand selector anti-pattern—array methods create new references causing infinite re-renders; fix with useMemo. (3) Git branch resolution—hardcoded defaults fail; implement fallback chain through common branch names. (4) Process serialization—piggyback pattern prevents concurrent spawning of external processes. (5) Iframe security—`allow-same-origin + allow-scripts` is documented sandbox escape. (6) Route wildcard matching—`/*` requires ≥1 character; trailing-slash-only requests fall through. (7) External service initialization—multi-phase approach with fallback models and non-fatal failure modes. Connections: reference equality as unifying theme across component re-renders, process locking, and DOM structure; fallback strategies pattern in git, routing, and service discovery; nested context complexity in iframe previews requiring routing, security, and network layer coordination.

## [2026-04-12T22:15:00+02:00] compilation-complete | daily/2026-04-12.md

- Source: daily/2026-04-12.md
- Status: COMPLETE - Daily log 2026-04-12.md fully compiled into knowledge base
- Articles created (manual): [[concepts/ollama-concurrent-safety-patterns]], [[concepts/terminal-command-generation-with-llms]], [[connections/defensive-external-tool-integration]]
- Notes: System compilation (lines 22-56) already covered all major topics from daily/2026-04-12.md across 6 separate compilation passes. Manual articles (ollama, terminal, defensive-patterns) provide alternative perspectives on concepts already extracted. Knowledge base now contains comprehensive coverage of: React rendering stability (hydration, selectors, lifecycle phases); tools robustness (git, service initialization, process serialization); developer experience (terminal AI, build automation); and underlying patterns (reference equality, fallback chains, defensive programming across domains). Deduplication/consolidation is recommended as maintenance task to converge overlapping articles (e.g., zustand-selector-stability vs zustand-selector-stability-patterns) into single authoritative sources.

## [2026-04-12T21:58:00+02:00] compile | daily/2026-04-12.md (canonical concept extraction)

- Source: daily/2026-04-12.md
- Articles created: [[concepts/zustand-selector-stability]], [[concepts/git-branch-resolution-pattern]], [[concepts/race-condition-serialization-piggyback]], [[concepts/iframe-route-pattern-matching]], [[concepts/vite-url-rewriting-proxies]], [[concepts/provider-scoped-config-fallback]], [[connections/provider-config-extends-adapter]], [[connections/race-condition-and-detached-processes]]
- Articles updated: index.md
- Summary: Claude Code manual compilation extracting 6 canonical concept articles and 2 connections from 2026-04-12 daily log. Core patterns: Zustand selector stability (never call .filter inside selectors), git branch resolution validation chain, process race condition serialization with piggyback pattern, iframe route wildcard matching edge cases, Vite absolute URL rewriting in proxies, provider-scoped config with fallback chains. Connections: provider config extends adapter shape, detached processes enable piggyback serialization. All articles include comprehensive Details, Related Concepts linking to existing wiki, and source citations.

## [2026-04-12T22:30:00+02:00] compile | daily/2026-04-12.md (unified concept extraction)

- Source: daily/2026-04-12.md
- Articles created: [[concepts/zustand-selector-anti-patterns]], [[concepts/branch-agnostic-git-operations]], [[concepts/ollama-process-serialization]], [[concepts/react-hydration-constraints]], [[concepts/iframe-proxy-dev-preview]], [[concepts/startup-milestone-logging]], [[concepts/working-tree-diff-git-operations]], [[concepts/model-selection-ui-pattern]], [[connections/git-operations-edge-cases]], [[connections/state-management-and-ui-performance]], [[connections/preview-pane-requires-multiple-fixes]]
- Articles updated: index.md (added 11 new index entries)
- Summary: Unified compilation of 8 core concepts and 3 connection articles from daily/2026-04-12.md, consolidating insights from multiple debugging sessions. Key concepts: (1) Zustand selector anti-patterns—array creation methods cause reference inequality and infinite re-renders; solution is useMemo stabilization. (2) Branch-agnostic git operations—validate branch existence before use; implement fallback chain (main → master → develop → trunk). (3) Ollama process serialization—module-level promise lock with piggyback pattern prevents concurrent spawning of external processes. (4) React hydration constraints—semantic HTML elements like `<colgroup>` reject whitespace/text nodes; remove inline comments to fix SSR mismatch. (5) Iframe proxy dev preview—requires three coordinated fixes: CORS headers, Vite absolute URL rewriting, and broad route patterns for trailing-slash matching. (6) Startup milestone logging—display human-readable progress steps instead of bare spinner for long-running operations. (7) Working-tree diff git operations—`git diff HEAD --patch` for uncommitted changes; gracefully handle edge case of brand-new repos with no commits. (8) Model selection UI pattern—implement three-level fallback hierarchy (per-provider → global → server default) with dual-section settings UI. Connections: git operations edge cases share validation pattern; state/UI bugs both violate invisible constraints; preview pane required three coordinated fixes plus UX improvement. All articles use encyclopedia style with comprehensive Details, Related Concepts links, and source citations to daily/2026-04-12.md.

## [2026-04-12T23:00:00+02:00] consolidate | index deduplication

- Source: knowledge/index.md
- Status: COMPLETE - Index deduplicated and consolidated
- Articles created: (none)
- Articles updated: index.md (consolidated from 85 entries to 46 entries)
- Summary: The daily log 2026-04-12.md was compiled 6+ separate times by different sessions, creating massive duplication in the index (e.g., 9 near-identical articles on git branch resolution). Consolidated the index to reference one canonical article per concept cluster. Reduced from ~60 concept entries to 21 concepts for 2026-04-12 topics, and ~14 connection entries to 6 connections for 2026-04-12 topics. The 14 entries from 2026-04-09 and their 5 connections remain unchanged. Orphan article files remain on disk (not deleted) — a future `lint.py` pass can identify and clean them up. Added missing index entries for: bun-cache-corruption-repair, dev-server-status-visualization, working-tree-diff-git-operations, model-selection-ui-pattern, startup-milestone-logging.

## [2026-04-12T23:30:00+02:00] compile | daily/2026-04-12.md (no-op)

- Source: daily/2026-04-12.md
- Status: SKIPPED — already fully compiled
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested but daily/2026-04-12.md was already fully compiled across 8 prior passes (see entries above). Index contains 21 concept articles and 6 connection articles covering all sessions. No new knowledge to extract. Recommended maintenance: run `lint.py` to identify orphan article files from duplicate compilation passes and consolidate them.

## [2026-04-12T23:45:00+02:00] consolidate | index completeness check

- Source: knowledge/index.md, knowledge/concepts/, knowledge/connections/
- Status: COMPLETE — index verified and patched
- Articles created: (none)
- Articles updated: index.md (added 4 missing entries: 1 concept, 3 connections)
- Added entries: [[concepts/rpc-layer-expansion-pattern]], [[connections/git-operations-edge-cases]], [[connections/provider-config-extends-adapter]], [[connections/race-condition-and-detached-processes]]
- Summary: Final completeness pass comparing canonical articles on disk against index entries. Found 4 articles that existed from prior compilation passes but were missed during the index consolidation at 23:00. Index now contains 23 concept articles and 9 connection articles for 2026-04-12 topics (plus 14 concepts and 5 connections from 2026-04-09). Total: 51 indexed articles. ~50 orphan duplicate files remain on disk in concepts/ and connections/ — recommend `lint.py` cleanup pass to remove files not referenced by index.

## [2026-04-13T11:43:44-05:00] compile | daily/2026-04-09.md (no-op)

- Source: daily/2026-04-09.md
- Status: SKIPPED — already fully compiled on 2026-04-09 across 2 passes
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. All knowledge from both sessions (20:01 memory compiler integration, 22:17 A2A protocol integration) was already extracted into 14 concept articles and 5 connection articles during original compilation passes. Index entries verified present. No new knowledge to extract.

## [2026-04-12T20:49:00+02:00] compile | daily/2026-04-12.md (no-op)

- Source: daily/2026-04-12.md
- Status: SKIPPED — no new extractable knowledge
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation triggered. All 12 substantive sessions from 2026-04-12 were already fully compiled across 8 prior passes. Two new entries found: (1) Session 20:37 — trivial, no knowledge. (2) Session 20:49 — incomplete voice transcription brainstorming for chat input; established project uses Lexical-based `ComposerPromptEditor` + Effect framework, but user has not yet answered first clarifying question (STT backend: local Whisper vs Apple Speech vs pluggable abstraction). No decisions, lessons, or patterns to extract until brainstorming progresses. Will compile when daily log gains substantive new sessions.

## [2026-04-13T11:50:00+02:00] compile | daily/2026-04-12.md (no-op)

- Source: daily/2026-04-12.md
- Status: SKIPPED — already fully compiled (confirmed)
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested via continued session. Verified against index.md (51 total entries: 23 concepts + 9 connections for 2026-04-12 topics) and log.md (8+ prior compilation passes plus 2 prior no-op confirmations). All substantive sessions remain fully covered. Voice transcription brainstorming (session 20:49) still incomplete — no new decisions or patterns to extract. Knowledge base is current for daily/2026-04-12.md.

## [2026-04-13T18:00:00+02:00] cleanup | orphan deduplication

- Source: knowledge/concepts/, knowledge/connections/, knowledge/index.md
- Status: COMPLETE — orphan files removed
- Articles created: (none)
- Articles updated: (none)
- Files deleted: 53 (42 orphan concepts + 11 orphan connections)
- Summary: Removed 53 orphan duplicate article files left behind by 8+ overlapping compilation passes on daily/2026-04-12.md. These files were never referenced in index.md (the canonical index). After cleanup: 37 concept files and 14 connection files remain on disk, matching the 51 entries in the index exactly. Examples of duplicates removed: 7 variants of git-branch-resolution, 6 variants of zustand-selector-stability, 6 variants of react-hydration, 4 variants of process-serialization. No data was lost — each orphan was a near-duplicate of a canonical article already in the index.

## [2026-04-13T18:30:00+02:00] compile | daily/2026-04-12.md (no-op)

- Source: daily/2026-04-12.md
- Status: SKIPPED — already fully compiled and deduplicated
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested in continued session. Verified against index.md (51 entries: 37 concepts + 14 connections across both daily logs) and log.md (8 compilation passes + 3 prior no-op confirmations + 1 orphan cleanup). All substantive sessions from 2026-04-12 are fully covered. Two uncompiled sessions remain ineligible: (1) Session 20:37 — trivial, no knowledge content. (2) Session 20:49 — voice transcription brainstorming still incomplete, no decisions or patterns to extract. Knowledge base is current.

## [2026-04-17T12:21:26-05:00] compile | daily/2026-04-13.md

- Source: daily/2026-04-13.md
- Articles created: (none — articles were created by a prior partial compilation but never indexed)
- Articles indexed: [[concepts/rendering-pipeline-specificity-ordering]], [[concepts/meta-provider-status-semantics]], [[concepts/dynamic-wizard-step-filtering]], [[concepts/tool-call-humanization-pattern]], [[concepts/effect-layer-composition-ordering]], [[concepts/null-undefined-type-coercion-bugs]], [[connections/silent-type-changes-cascade-failures]]
- Articles updated: [[concepts/model-selection-ui-pattern]] (added daily/2026-04-13.md as source for manifest provider rendering order bug)
- Duplicates identified (kept on disk, not indexed): conditional-check-ordering-render-pipelines.md, conditional-rendering-order-in-pipelines.md (dupes of rendering-pipeline-specificity-ordering); dynamic-wizard-step-navigation.md, wizard-step-filtering-navigation-sync.md (dupes of dynamic-wizard-step-filtering); tool-call-display-humanization.md (dupe of tool-call-humanization-pattern)
- Summary: Daily log 2026-04-13 covered 3 substantive sessions: (1) Provider picker rendering order bug — manifest/auto provider intercepted by generic `status !== "ready"` guard before reaching specialized rendering; fix was reordering checks. (2) Onboarding wizard step-skipping — `shouldShowTeamStep` filtering desynchronized navigation index from step indicators. (3) Tool call humanization — transformed raw JSON tool calls into inline muted summaries with Lucide icons, toggleable via settings. All articles existed on disk from prior partial compilation but were never added to the index. This pass completes the indexing and adds 4 concept entries + 1 connection from 2026-04-13, plus 2 concepts + 1 connection from 2026-04-12 that were also unindexed. Total index: 58 entries (44 concepts + 14 connections → now 15 connections).

## [2026-04-17T19:30:00+02:00] compile | daily/2026-04-17.md (no-op)

- Source: daily/2026-04-17.md
- Status: SKIPPED — insufficient knowledge content
- Articles created: (none)
- Articles updated: (none)
- Summary: Daily log contains one trivial session: removing a status badge rendering block from ChatHeader.tsx. No new patterns, architectural decisions, debugging insights, or non-obvious relationships to extract. Two memory flushes returned FLUSH_OK. The optional dead-prop cleanup noted (executionStatusLabel/Detail/Tone props left wired but unused) is standard practice and does not warrant a wiki article.

## [2026-04-17T21:00:00+02:00] compile | daily/2026-04-17.md (no-op, confirmed)

- Source: daily/2026-04-17.md
- Status: SKIPPED — confirmed insufficient knowledge content
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. Daily log 2026-04-17 contains only: (1) Two FLUSH_OK memory flushes with no content. (2) One trivial session removing a status badge rendering block from ChatHeader.tsx (lines 117-141 deleted, imports retained as still used elsewhere, dead prop wiring left intact). No concepts, patterns, debugging insights, connections, or architectural decisions warrant extraction. The knowledge base remains current at 58 indexed articles (44 concepts + 14 connections) across daily logs 2026-04-09, 2026-04-12, and 2026-04-13.

## [2026-04-17T12:22:45-05:00] compile | daily/2026-04-13.md (supplementary)

- Source: daily/2026-04-13.md
- Articles created: [[connections/silent-rendering-bugs-from-conditional-pipelines]]
- Index fixes: Changed canonical tool-call article reference from tool-call-humanization-pattern → tool-call-display-humanization; added new connection entry
- Duplicates identified for cleanup (5 orphan files): conditional-check-ordering-render-pipelines, conditional-rendering-order-in-pipelines, dynamic-wizard-step-navigation, wizard-step-filtering-navigation-sync, tool-call-humanization-pattern
- Summary: Supplementary pass on daily/2026-04-13.md following partial compilation at 2026-04-17T12:21:26. Created 1 new connection article linking the provider-picker rendering-order bug and the wizard step-filtering bug as instances of the same "silent conditional pipeline" pattern — both produce no errors but render wrong visual state due to evaluation ordering. Fixed index reference to use tool-call-display-humanization (more comprehensive article) as canonical instead of tool-call-humanization-pattern. Identified 5 orphan duplicate files for future lint cleanup. Total index: 59 entries (44 concepts + 15 connections).

## [2026-04-17T21:30:00+02:00] compile | daily/2026-04-17.md (final no-op)

- Source: daily/2026-04-17.md
- Status: SKIPPED — no extractable knowledge (3rd confirmation)
- Articles created: (none)
- Articles updated: (none)
- Summary: Manual compilation pass requested. Daily log 2026-04-17 contains: (1) Two FLUSH_OK memory flushes. (2) One trivial session removing an execution status badge from ChatHeader.tsx (rendering block at lines 117-141 deleted; imports retained as used elsewhere; dead prop wiring left intact as harmless). No concepts, patterns, debugging insights, or connections warrant extraction. Knowledge base remains at 59 indexed articles (44 concepts + 15 connections) across daily logs 2026-04-09, 2026-04-12, and 2026-04-13.

## [2026-04-18T11:50:04-05:00] compile | daily/2026-04-17.md

- Source: daily/2026-04-17.md
- Articles created: [[concepts/flush-pipeline-failure-modes]]
- Articles updated: [[concepts/memory-compiler-three-stage-pipeline]] (added failure modes section and daily/2026-04-17.md as source)
- Summary: Prior compilation passes (3 no-ops) only evaluated the two trivial sessions and FLUSH_OK entries. The full daily log contains ~20 FLUSH_ERROR entries from 19:53–21:14 showing the claude_agent_sdk query() function failing consecutively with "Command failed with exit code 1." This reveals operational resilience gaps in the flush pipeline: no exponential backoff, no circuit breaker, opaque error messages, and no failure-state tracking. Created one new concept article documenting the failure pattern and recommended improvements. Updated the pipeline article with a Failure Modes subsection. Total index: 60 entries (45 concepts + 15 connections).

## [2026-04-18T11:53:33-05:00] compile | daily/2026-04-18.md

- Source: daily/2026-04-18.md
- Articles created: [[concepts/standalone-to-workspace-package-migration]], [[concepts/ai-context-content-prioritization]], [[concepts/feature-parity-side-by-side-verification]], [[concepts/project-instructions-ipc-pipeline]], [[connections/memory-compiler-tool-to-integration-evolution]]
- Articles updated: [[concepts/flush-pipeline-failure-modes]] (added daily/2026-04-18.md as source; noted intermittent failures on 2026-04-18 suggesting transient root cause)
- Summary: Daily log 2026-04-18 documented a comprehensive session refactoring the memory-compiler from a standalone CLI tool into a workspace package and integrating it with the t3code editor's AI context system. Key concepts extracted: (1) Standalone-to-workspace migration pattern — library-first API design, barrel exports, incremental restructuring with TypeCheck verification. (2) AI context content prioritization — what information is useful in system prompts (project identity > coding standards > architecture > file structure), auto-extraction from package.json and filesystem, noise filtering. (3) Feature parity side-by-side verification — running old and new implementations on same input catches gaps unit tests miss. (4) Project instructions IPC pipeline — compiled memory feeds into editor AI via settings → IPC → system prompt, auto-compiles on project open. Connection article links these four concepts as stages of tool maturity evolution: CLI → library → integration. Also updated flush-pipeline-failure-modes with 2026-04-18 intermittent errors (2 failures interspersed with successes, suggesting transient cause). Total index: 65 entries (49 concepts + 16 connections).

## [2026-04-18T18:54:00+02:00] compile | daily/2026-04-18.md (canonical article consolidation)

- Source: daily/2026-04-18.md
- Articles created: [[concepts/standalone-to-workspace-package-refactoring]], [[concepts/feature-parity-verification-pattern]], [[concepts/project-instructions-injection-pipeline]], [[connections/memory-compiler-and-ai-context-pipeline]]
- Articles updated: [[concepts/flush-pipeline-failure-modes]] (added 2026-04-18 intermittent failures section and source), [[concepts/memory-compiler-three-stage-pipeline]] (added package refactoring section, editor integration, and daily/2026-04-18.md source), [[concepts/ai-context-content-prioritization]] (added project-instructions-injection-pipeline to Related Concepts)
- Index fixes: Corrected slug references from prior partial compilation (standalone-to-workspace-package-migration → standalone-to-workspace-package-refactoring, feature-parity-side-by-side-verification → feature-parity-verification-pattern, project-instructions-ipc-pipeline → project-instructions-injection-pipeline, memory-compiler-tool-to-integration-evolution → memory-compiler-and-ai-context-pipeline)
- Orphans from prior compilation: standalone-to-workspace-package-migration.md, feature-parity-side-by-side-verification.md, project-instructions-ipc-pipeline.md, memory-compiler-tool-to-integration-evolution.md (may exist on disk from prior pass, recommend lint cleanup)
- Summary: Canonical compilation of daily/2026-04-18.md replacing prior partial compilation's slug-mismatched articles. 4 new articles created with comprehensive content: (1) Standalone-to-workspace-package-refactoring — 8-step pattern for converting CLI tools to monorepo packages with programmatic APIs, tsx runtime switch, and phased migration. (2) Feature-parity-verification-pattern — side-by-side old/new comparison catches behavioral gaps that TypeScript compilation misses; multiple rounds typically needed. (3) Project-instructions-injection-pipeline — settings → IPC → AI chat → system prompt; memory compiler hooks into existing storage layer. (4) Connection linking compiler, content prioritization, and injection pipeline as interdependent parts of AI context system. 3 existing articles updated with 2026-04-18 content. Total index: 65 entries (49 concepts + 16 connections).

## [2026-04-18T23:35:00+02:00] compile | daily/2026-04-18.md (no-op + orphan cleanup)

- Source: daily/2026-04-18.md
- Status: SKIPPED — already fully compiled across 2 prior passes (11:53:33 and 18:54:00)
- Articles created: (none)
- Articles updated: (none)
- Orphan files replaced with redirect stubs (9 files): standalone-to-workspace-package-migration.md, feature-parity-side-by-side-verification.md, project-instructions-ipc-pipeline.md, memory-compiler-tool-to-integration-evolution.md, tool-call-humanization-pattern.md, conditional-check-ordering-render-pipelines.md, conditional-rendering-order-in-pipelines.md, dynamic-wizard-step-navigation.md, wizard-step-filtering-navigation-sync.md
- Summary: Re-compilation requested. All knowledge from daily/2026-04-18.md was already extracted into 4 concept articles (standalone-to-workspace-package-refactoring, ai-context-content-prioritization, feature-parity-verification-pattern, project-instructions-injection-pipeline), 1 connection article (memory-compiler-and-ai-context-pipeline), and 2 article updates (flush-pipeline-failure-modes, memory-compiler-three-stage-pipeline) during prior passes. Maintenance: replaced 9 orphan duplicate files from prior compilation passes (4 from 2026-04-18 first pass with wrong slugs, 5 from 2026-04-13 compilation) with redirect stubs pointing to canonical articles. Total index: 65 entries (49 concepts + 16 connections), unchanged.

## [2026-04-19T00:00:00+02:00] compile | daily/2026-04-18.md (no-op, confirmed)

- Source: daily/2026-04-18.md
- Status: SKIPPED — already fully compiled (fourth compilation pass; second no-op confirmation)
- Articles created: (none)
- Articles updated: (none)
- Summary: Manual compilation pass requested. Cross-checked daily/2026-04-18.md against all indexed articles and prior log entries. Full knowledge has been extracted across 2 substantive passes (2026-04-18T11:53:33 and 2026-04-18T18:54:00) plus two subsequent no-op confirmation passes (including this one). All major session content covered: memory-compiler refactoring to workspace package, AI context content prioritization, feature parity verification methodology, project instructions IPC pipeline, and flush pipeline 2026-04-18 intermittent errors (FLUSH_ERROR at 15:37 and 15:52). Knowledge base remains at 65 entries (49 concepts + 16 connections).

## [2026-04-20T12:46:43-05:00] compile | daily/2026-04-18.md (no-op, confirmed)

- Source: daily/2026-04-18.md
- Status: SKIPPED — already fully compiled (fifth compilation pass; third no-op confirmation)
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. Verified against index.md and log.md. All knowledge from daily/2026-04-18.md was fully extracted across 2 substantive passes (2026-04-18T11:53:33 and 2026-04-18T18:54:00). Concepts covered: standalone-to-workspace-package-refactoring, ai-context-content-prioritization, feature-parity-verification-pattern, project-instructions-injection-pipeline, memory-compiler-and-ai-context-pipeline (connection). Updated articles: flush-pipeline-failure-modes (intermittent 2026-04-18 errors), memory-compiler-three-stage-pipeline (package refactoring section). No new knowledge to extract. Knowledge base remains at 65 entries (49 concepts + 16 connections).

## [2026-04-19T23:04:00-05:00] compile | daily/2026-04-19.md

- Source: daily/2026-04-19.md
- Articles created: [[concepts/inactivity-watchdog-fiber-pattern]], [[concepts/effect-timeoutoption-clean-error-types]], [[concepts/stream-takewhile-freeze-limitation]], [[concepts/late-event-ingestion-guard]], [[concepts/phase-derivation-turn-id-guard]], [[connections/frozen-stream-defense-in-depth]]
- Articles updated: (none)

## [2026-04-20T10:00:00-05:00] compile | daily/2026-04-18.md

- Source: daily/2026-04-18.md
- Articles created: [[concepts/standalone-to-workspace-package-refactoring]], [[concepts/ai-context-content-prioritization]], [[concepts/feature-parity-verification-pattern]], [[concepts/project-instructions-injection-pipeline]], [[connections/memory-compiler-and-ai-context-pipeline]]
- Articles updated: [[concepts/flush-pipeline-failure-modes]] (added 2026-04-18 intermittent failure data), [[concepts/memory-compiler-three-stage-pipeline]] (added workspace package refactoring and editor integration notes)

## [2026-04-20T18:00:00-05:00] compile | daily/2026-04-19.md (no-op, confirmed)

- Source: daily/2026-04-19.md
- Status: SKIPPED — already fully compiled on 2026-04-19T23:04:00-05:00
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. Verified against index.md and log.md (entry at 2026-04-19T23:04:00). All knowledge from daily/2026-04-19.md was fully extracted in one pass: 5 concept articles (inactivity-watchdog-fiber-pattern, effect-timeoutoption-clean-error-types, stream-takewhile-freeze-limitation, late-event-ingestion-guard, phase-derivation-turn-id-guard) and 1 connection article (frozen-stream-defense-in-depth). Covers the complete debugging session: frozen provider streams, broken stop button, spinner flicker, and the four-layer defense-in-depth solution (watchdog + interrupt timeout + late-event guard + phase derivation guard). No new knowledge to extract. Knowledge base remains at 65 entries (49 concepts + 16 connections).

## [2026-04-20T20:00:00-05:00] compile | daily/2026-04-20.md

- Source: daily/2026-04-20.md
- Articles created: [[concepts/react18-setstate-updater-timing-trap]], [[concepts/websocket-silent-death-heartbeat]], [[concepts/process-output-dual-pattern-matching]], [[concepts/code-review-thread-isolation]], [[concepts/nodejs-readline-close-race]], [[connections/silent-hang-detection-patterns]]
- Articles updated: [[concepts/flush-pipeline-failure-modes]] (added 2026-04-20 burst failure data — 5 FLUSH_ERRORs including 4 near-simultaneous at 23:00 UTC)
- Summary: Daily log 2026-04-20 covered 10+ sessions spanning diverse topics. Key concepts extracted: (1) React 18 setState updater timing trap — updaters run during reconciliation, not synchronously; reading refs set inside updaters returns stale values; fix with queueRef mirroring committed state. (2) WebSocket silent death and heartbeat recovery — connections die silently on sleep/wake/NAT; 20s heartbeat with reload after 2 failures. (3) Process output dual-pattern matching — success-only watchers hang on failure; always match error patterns alongside success. (4) Code review thread isolation — create fresh threads per review instead of reusing stale active sessions. (5) Node.js readline close race — coordinate child close + readline close events before reading buffers. Connection article links WebSocket heartbeat, watchdog fiber, and error pattern matching as instances of the same "active probe" pattern at different stack layers. Updated flush-pipeline-failure-modes with 2026-04-20 burst failures. Total index: 71 entries (54 concepts + 17 connections).

## [2026-04-20T20:30:00] compile | Daily Log 2026-04-20

- Source: daily/2026-04-20.md
- Articles created: [[concepts/lazy-file-tree-rpc-expansion]], [[concepts/pending-selection-store-coordination]], [[concepts/electron-context-menu-react-overlay]]
- Articles updated: [[concepts/flush-pipeline-failure-modes]] (already updated with 2026-04-20 burst failure data in prior compile run), [[concepts/react18-setstate-updater-timing-trap]], [[concepts/websocket-silent-death-heartbeat]], [[concepts/process-output-dual-pattern-matching]], [[concepts/nodejs-readline-close-race]], [[concepts/code-review-thread-isolation]], [[connections/silent-hang-detection-patterns]] (all already compiled)
- Notes: Most 2026-04-20 concepts were already compiled. New articles cover the Files panel feature: lazy tree expansion, pending selection coordination, and Electron context menu icon workaround.

## [2026-04-20T21:30:00-05:00] compile | daily/2026-04-20.md

- Source: daily/2026-04-20.md
- Note: Aggregate compile pass — article list and `flush-pipeline-failure-modes` burst data are already captured under **2026-04-20T20:00:00** and **2026-04-20T20:30:00** above; this entry records the same two-pass extraction without new artifacts.

## [2026-04-20T21:00:00-05:00] compile | daily/2026-04-20.md (no-op, confirmed)

- Source: daily/2026-04-20.md
- Status: SKIPPED — already fully compiled across 2 prior passes (20:00:00 and 20:30:00)
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation requested. All knowledge from daily/2026-04-20.md was fully extracted across 2 substantive passes. 8 concept articles (react18-setstate-updater-timing-trap, websocket-silent-death-heartbeat, process-output-dual-pattern-matching, code-review-thread-isolation, nodejs-readline-close-race, lazy-file-tree-rpc-expansion, pending-selection-store-coordination, electron-context-menu-react-overlay) and 1 connection article (silent-hang-detection-patterns) cover all sessions. flush-pipeline-failure-modes updated with 2026-04-20 burst failures. No new knowledge to extract. Knowledge base remains at 74 entries (57 concepts + 17 connections).
