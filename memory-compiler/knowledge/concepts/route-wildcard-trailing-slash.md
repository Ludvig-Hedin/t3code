---
title: "Route Wildcard Pattern Matching and Trailing Slash Edge Cases"
aliases: [route-wildcards, trailing-slash, route-patterns]
tags: [routing, http, express, effect]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Route Wildcard Pattern Matching and Trailing Slash Edge Cases

Express and Effect-based HTTP routers support wildcard patterns like `/:id/*` to capture remaining path segments. However, the `/*` pattern has a subtle constraint: it requires at least one character after the final `/`. Requests with a trailing slash only (nothing after the `/`) don't match and fall through to catch-all routes like `static` or `index.html`. This causes incorrect routing when serving complex nested apps through URL rewrites.

## Key Points

- **Wildcard requires content** - `/:id/*` matches `/:id/foo` but not `/:id/` (empty segment doesn't match)
- **Fallthrough behavior** - Non-matching requests cascade to lower-priority routes, potentially serving the wrong content
- **Catch-all layers problematic** - When a static/SPA handler is a catch-all, it silently serves wrong content for mismatched routes
- **Common in nested routing** - Microservices, previews, and multi-app deployments often have `/app/*` routes that should catch everything
- **Silent failures** - Mismatch doesn't error; wrong content is served, causing confusing bugs
- **Explicit route ordering needed** - May require ordering routes before catch-alls or broadening patterns

## Details

### The Problem

Consider a preview routing layer:

```typescript
router.post("/preview/:projectId/:appId/*", previewHandler);
// Catch-all for static files
router.use(staticAndDevRouteLayer);
```

A request for `/preview/abc/def/` (trailing slash, no additional segments):

1. Does `/preview/:projectId/:appId/*` match? No—the `/*` requires at least one char after `/`
2. Route doesn't match, continues to next
3. `staticAndDevRouteLayer` matches and serves Bird Code's own `index.html`
4. Iframe loads Bird Code SPA instead of the preview

### The Solution: Broaden the Pattern

```typescript
router.post("/preview/*", previewHandler); // Matches /preview/ and /preview/*
```

This simpler pattern catches all `/preview/` requests, including trailing-slash-only. The handler can then parse `projectId` and `appId` from the remainder.

Alternatively, make the trailing segment optional:

```typescript
router.post("/preview/:projectId/:appId/*?", previewHandler); // :appId/anything, including nothing
```

However, Express doesn't support optional wildcard syntax well, so broadening is often safer.

### Debugging Telltale Signs

When wrong content is served through routing mismatch:

- Preview shows Bird Code SPA (spinner/logo) instead of target app
- Console shows Bird Code's own routes being processed
- Web sockets fail with Bird Code's connection attempts
- Occurs specifically on trailing-slash requests; non-trailing-slash requests work

The key sign: **the parent app's own content appears inside the nested app's context**.

### Route Ordering Matters

If you have multiple preview patterns, order matters:

```typescript
// GOOD: Specific first, general last
router.post("/preview/workspace/:id/*", workspacePreviewHandler);
router.post("/preview/markdown/*", markdownPreviewHandler);
router.post("/preview/*", genericPreviewHandler);
router.use(staticAndDevRouteLayer);

// BAD: Catch-all before specific routes
router.use(staticAndDevRouteLayer);
router.post("/preview/*", previewHandler); // Never reached
```

## Related Concepts

- [[concepts/git-branch-resolution-fallback]] - Fallback strategy pattern in different domain
- [[concepts/iframe-sandboxing-cors]] - Both involve serving content in nested contexts

## Sources

- [[daily/2026-04-12.md]] - "Preview showed Bird Code logo/spinner instead of target app — traced to route pattern `/preview/:projectId/:appId/*` requiring ≥1 char after final `/`, so trailing-slash requests fell through to `staticAndDevRouteLayer` and Bird Code's own `index.html` loaded inside iframe."
- [[daily/2026-04-12.md]] - "Broadened route pattern to `/preview/*` to catch trailing-slash-only navigation and all preview requests."
- [[daily/2026-04-12.md]] - "WebSocket error confirmed Bird Code was running inside the iframe, indicating wrong routing."
