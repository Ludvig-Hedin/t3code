---
title: "Effect Router Wildcard Route Matching and Catch-All Layer Fallthrough"
aliases: [wildcard-routes, route-fallthrough, pattern-matching, httpRouter]
tags: [routing, http, effect-framework, architecture]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Effect Router Wildcard Route Matching and Catch-All Layer Fallthrough

Effect's `HttpRouter` uses wildcard patterns with `/*` to match remaining path segments. A critical constraint: `/*` matches one or more characters—it does NOT match zero characters. Routes like `/preview/:id/*` require at least one character after the final `/`, so requests ending with `/` (no characters after) fall through to catch-all routes. When a catch-all static layer exists below the preview route, Bird Code's own `index.html` loads inside the preview iframe, creating confusing user-facing bugs.

## Key Points

- **Wildcard `/*` requires ≥1 character** - Empty path segments fall through to next layer
- **Trailing-slash requests unmatched** - `/preview/project1/app1/` matches, but `/preview/` does NOT match
- **Catch-all layer is a trap** - If no earlier route matches, static layer serves parent app's files
- **Symptoms: Parent app inside iframe** - The main app bootstraps and runs inside the preview iframe
- **Solution: Broad wildcard pattern** - Use `/preview/*` instead of `/preview/:id/:app/*` to catch all paths

## Details

### The Route Matching Problem

Route patterns in Effect work left-to-right with explicit parameters:

```typescript
// NARROW: matches /preview/:projectId/:appId/something
// But NOT: /preview/projectId/appId/ (nothing after final /)
router.get("/preview/:projectId/:appId/*", handler);

// BROAD: matches /preview/anything/at/all/including/trailing/slash
router.get("/preview/*", handler);
```

The `/*` syntax means "zero or more characters following the preceding pattern." But because parameters are greedy, `/:projectId/:appId/*` only matches if there's at least one character for the wildcard portion.

### When Fallthrough Happens

Bird Code's routing stack looks like (simplified):

```typescript
// Earlier layers (checked first)
router.get("/preview/:projectId/:appId/*", previewHandler);

// Later catch-all layer (fallback)
app.use(serveStaticFiles("public")); // Serves index.html
```

When a request comes in for `/preview/proj/app/`:

1. Effect tries to match `/preview/:projectId/:appId/*`
2. Variables get `:projectId = "proj"`, `:appId = "app"`, `/* = ""` (empty match)
3. Pattern doesn't match (wildcard requires at least 1 char in some routing implementations)
4. Falls through to static layer
5. Static layer returns `index.html` (the parent app)
6. Parent app code runs inside the iframe

### Consequences

Once the parent app's `index.html` loads inside the iframe:

1. React hydrates the parent SPA inside the iframe
2. WebSocket client (`wsTransport.ts`) attempts to connect
3. Error: "WebSocket trying to connect from inside iframe"
4. User sees Bird Code's logo/spinner instead of the preview

### Solution: Broad Pattern

Use `/preview/*` without explicit projectId/appId parameters:

```typescript
// CORRECT: catches all /preview/... paths
router.get("/preview/*", previewHandler);

// Handler extracts projectId/appId from the captured path
async function previewHandler(request: Request, path: string) {
  const segments = path.replace(/^\//, "").split("/");
  // segments[0] = projectId, segments[1] = appId, rest = path
}
```

### Trade-offs

- **Pro**: Catches all preview URLs including trailing slashes
- **Con**: Less strict parameter validation; must validate projectId/appId inside handler
- **Mitigated by**: Earlier route handlers catch valid routes; malformed requests error naturally

If other specific routes like `/preview/health` or `/preview/config` exist, they should be defined BEFORE the catch-all:

```typescript
router.get("/preview/health", healthHandler); // Specific routes first
router.get("/preview/config", configHandler);
router.get("/preview/*", previewHandler); // Catch-all last
```

## Related Concepts

- [[concepts/iframe-sandboxing-cors-development-proxy]] - Related to preview routing architecture
- [[concepts/git-branch-resolution-fallback-chains]] - Both involve defensive fallback patterns

## Sources

- [[daily/2026-04-12.md]] - "Express/Effect wildcard routes with `/*` don't match requests with nothing after the final `/`; those fall through to catch-all layers"
- [[daily/2026-04-12.md]] - "Broadened route to `/preview/*` to catch all preview requests; removed `allow-same-origin` from iframe sandbox"
- [[daily/2026-04-12.md]] - "Multi-layer routing with a catch-all static layer will silently serve Bird Code's own `index.html` if earlier routes don't match"
