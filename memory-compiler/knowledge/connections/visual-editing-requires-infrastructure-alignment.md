---
title: "Connection: Visual Editing Requires Preview Infrastructure Alignment"
connects:
  - "concepts/design-panel-integration-pattern"
  - "concepts/lazy-file-tree-rpc-expansion"
  - "concepts/rpc-layer-expansion-pattern"
sources:
  - "daily/2026-04-23.md"
created: 2026-04-23
updated: 2026-04-23
---

# Connection: Visual Editing Requires Preview Infrastructure Alignment

## The Connection

The Design panel's visual editing feature cannot work independently — it requires precise alignment with the existing Preview infrastructure for app detection, dev server management, and iframe routing. The most critical failure mode (blank iframe) occurred when Design implemented its own detection logic that caught library packages (`packages/ui`, `packages/email`) as "runnable apps" because they had React as a peer dependency. This produced app IDs that didn't match the Preview system's URLs (`/preview/:projectId/:appId/*`), resulting in blank iframes. The fix was not to improve Design's detection, but to eliminate it entirely and reuse Preview's `scanProjectEntries`.

## Key Insight

Visual editing tools operate **on top of** the preview layer, not alongside it. The architecture dependency is unidirectional:

```
Preview System (foundation)
  ├─ App detection (scanProjectEntries)
  ├─ Dev server management (preview.start)
  ├─ Iframe routing (/preview/:projectId/:appId/*)
  └─ URL rewriting (Vite proxy)

Design System (extension)
  ├─ OID stamper/resolver
  ├─ Runtime bridge (postMessage)
  ├─ Inspector UI
  └─ Edit applier

Design depends on Preview; Preview is independent of Design.
```

Attempting to make Design independent of Preview forces duplication of:

- App detection logic (which apps are runnable?)
- Dev server lifecycle (is it running? how do I start it?)
- Iframe URL generation (what path loads the app?)
- CORS/sandbox configuration (what headers are needed?)

Each duplication point is a potential ID mismatch.

## Evidence

From the daily log:

1. **Initial bug:** "Design detection caught library packages (`packages/email`, `packages/ui`) as 'React apps' because they had React as peer dep; generated app IDs (`apps/web`) didn't match preview system IDs (`web`); no auto-start call; no URL navigation"

2. **Root cause identified:** "Two separate detection systems (Design vs Preview) led to ID mismatch → blank iframe"

3. **The fix:** "Align Design detection with preview detection by exporting `scanProjectEntries` and reusing `buildDetectionCandidates` with filter: `type === 'browser'` + not `preview-file` standalone + `isReactApp(pkg)`. Guarantees ID alignment with `/preview/:projectId/:appId/` routes and runnable status."

4. **Auto-start dependency:** "Auto-start dev server via `preview.start` when app selected and not running; auto-prime only after `previewSession?.status === 'running'`"

The conversation explicitly rejects Design-only detection: "scrap weak Design-only detection; align with preview's `scanProjectEntries` so IDs/URLs always resolve."

## Design Pattern: Extension Layers Must Reuse Foundation APIs

When building extension features on top of existing infrastructure:

**✅ DO:**

- Export foundation detection APIs (`scanProjectEntries`)
- Reuse foundation RPC methods (`preview.start`, `preview.stop`)
- Reference foundation URL patterns (`/preview/:projectId/:appId/*`)
- Depend on foundation lifecycle (wait for `status === 'running'`)

**❌ DON'T:**

- Reimplement detection logic "close enough" to foundation
- Spawn dev servers independently without coordinating with preview manager
- Generate URLs from raw app paths without preview's routing logic
- Assume the dev server is ready without checking preview's session status

The meta-rule: **extensions should be dumb clients of the foundation layer**. All intelligence (detection, routing, lifecycle) stays in the foundation.

## Architectural Implication

This pattern generalizes beyond Design/Preview:

- **Files panel** depends on filesystem RPC layer
- **Terminal panel** depends on process management layer
- **Git integration** depends on repository detection layer

Each extension layer must:

1. Discover what primitives the foundation provides
2. Reuse those primitives instead of reimplementing
3. Accept that the foundation's data model (IDs, URLs, statuses) is authoritative

Diverging from this creates integration bugs that are invisible at development time (typechecks pass, unit tests pass) but catastrophic at runtime (blank screens, ID mismatches, race conditions).

## Related Concepts

- [[concepts/design-panel-integration-pattern]] — The visual editing implementation that required this alignment
- [[concepts/lazy-file-tree-rpc-expansion]] — Files panel similarly depends on filesystem RPC foundation
- [[concepts/rpc-layer-expansion-pattern]] — How foundation layers expose APIs to extension layers
- [[concepts/systematic-feature-implementation-phases]] — Extension features follow the same 8-phase pattern but Phase 1 must include foundation API discovery
- [[connections/nested-context-routing-and-security]] — Preview's iframe routing is the foundation Design depends on

## Sources

- [[daily/2026-04-23]] — "Root cause of blank screen: Design detection caught library packages... generated app IDs didn't match preview system IDs... no auto-start call"
- [[daily/2026-04-23]] — "Align Design detection with preview detection by exporting `scanProjectEntries` and reusing `buildDetectionCandidates`... Guarantees ID alignment with `/preview/:projectId/:appId/` routes"
- [[daily/2026-04-23]] — "Two separate detection systems (Design vs Preview) led to ID mismatch → blank iframe"
- [[daily/2026-04-23]] — "Detection must check runnable dev script + skip `packages/` to avoid false positives on UI libraries"
