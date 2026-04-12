---
title: Build Log
sources:
  - memory-compiler/daily/
  - memory-compiler/scripts/compile.py
created: "2026-04-09"
updated: "2026-04-12"
---

# Build Log

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

## [2026-04-12T20:49:00+02:00] compile | daily/2026-04-12.md (no-op)

- Source: daily/2026-04-12.md
- Status: SKIPPED — no new extractable knowledge
- Articles created: (none)
- Articles updated: (none)
- Summary: Re-compilation triggered. All 12 substantive sessions from 2026-04-12 were already fully compiled across 8 prior passes. Two new entries found: (1) Session 20:37 — trivial, no knowledge. (2) Session 20:49 — incomplete voice transcription brainstorming for chat input; established project uses Lexical-based `ComposerPromptEditor` + Effect framework, but user has not yet answered first clarifying question (STT backend: local Whisper vs Apple Speech vs pluggable abstraction). No decisions, lessons, or patterns to extract until brainstorming progresses. Will compile when daily log gains substantive new sessions.
