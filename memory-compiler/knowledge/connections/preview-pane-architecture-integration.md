---
title: "Connection: Preview Pane Architecture - Integration of Routing, Proxying, and UX"
connects:
  - "concepts/iframe-sandboxing-cors-development-proxy"
  - "concepts/effect-router-wildcard-patterns"
  - "concepts/dev-server-status-visualization"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Preview Pane Architecture - Integration of Routing, Proxying, and UX

## The Connection

The Bird Code preview pane is a coordinated system of three layers: routing (Effect HttpRouter), proxying (URL rewriting and header management), and UX feedback (startup logs). Each layer solves a distinct problem, but failures in one layer propagate as confusing user-facing bugs. Understanding how these layers interact is essential for debugging and extending the preview feature.

## The Layered Architecture

**Layer 1: HTTP Routing** - Effect router pattern `/preview/*` must catch ALL preview requests, including trailing-slash-only paths. If this fails (too-narrow pattern like `/preview/:id/*`), fallthrough happens.

**Layer 2: Proxy Request Processing** - Once routed to preview handler, the handler:

- Forwards requests to the actual dev server (Vite, Next.js, etc.)
- Rewrites absolute URLs (`http://localhost:5173`) to relative proxied paths
- Overrides CORS headers to `*` (safe with `allow-scripts` sandbox, no `allow-same-origin`)
- Strips `Accept-Encoding` to prevent gzip from breaking URL rewriting

**Layer 3: UX Feedback** - While the dev server starts:

- Capture stdout in real-time
- Parse startup milestones (Install → Compile → Ready)
- Display human-readable status instead of spinner
- User sees progress, not confusion

## Evidence of Integration

1. **Fallthrough bug manifests as parent app in iframe** - If routing layer uses narrow pattern `/:projectId/:appId/*`, trailing-slash requests fall through to static layer, which serves `index.html`. The parent app (Bird Code) bootstraps inside the iframe.

2. **CORS failures require proxy layer fix** - Even correct routing fails if proxy doesn't override CORS or rewrite URLs. Browser blocks cross-origin requests; proxy must intercept and fix.

3. **User confusion without startup logs** - Correct routing + working proxy results in blank white screen (loading) or spinner. Without feedback, users think it's stuck. Adding startup log visualization transforms the experience.

## Edge Case: The Waterfall

Failures cascade:

- **Bad routing** → wrong handler → static fallback → parent app loads
- **Bad proxy** → CORS errors → blank screen + console warnings
- **No startup logs** → blank white screen → user thinks stuck (no error, no feedback)

The three failures feel unrelated until you understand the architecture:

- Routing failure looks like "white screen"
- Proxy failure looks like "CORS error"
- Missing feedback looks like "app is stuck"

All three are symptoms of the same feature being partially broken.

## Design Implications

- **Route patterns must be broad** - `/preview/*` is safer than `/preview/:projectId/:appId/*` because it catches edge cases
- **Proxy must be transparent** - User expects `http://localhost:5173` in the browser to work; proxy hides the rewriting
- **UX feedback is not optional** - Without status visualization, users distrust the tool

## Related Concepts

- [[concepts/iframe-sandboxing-cors-development-proxy]] - The proxy/sandbox layer
- [[concepts/effect-router-wildcard-patterns]] - The routing layer
- [[concepts/dev-server-status-visualization]] - The UX layer
