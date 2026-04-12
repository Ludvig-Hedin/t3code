---
title: "Iframe Wildcard Route Matching and Static Fallthrough"
aliases: [route-matching, wildcard-routes, static-fallthrough, route-ordering]
tags: [routing, http, proxy, edge-cases]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Iframe Wildcard Route Matching and Static Fallthrough

When serving an iframe preview of a web app, the routing layer's wildcard patterns must carefully match preview requests while avoiding fallthrough to static file serving. Express/Effect routes with `/*` patterns require at least one character after the final `/`; requests with nothing after the `/` (trailing-slash-only) fall through to catch-all static layers, causing unintended serving of Bird Code's own `index.html` instead of the preview application.

## Key Points

- **Wildcard `/*` doesn't match empty path segments** - `/*` requires at least 1 character after `/`; trailing-slash-only falls through
- **Static fallthrough serves wrong app** - If preview route doesn't match, static layer serves Bird Code's own index.html inside the iframe
- **User sees Bird Code SPA bootstrapping** - The mismatched app loads its own bundle, runs its own entrypoint, tries to initialize its own state
- **Multi-layer routing silently masks the issue** - Preview route misses → static layer catches → no error raised; debugging requires console inspection
- **Solution: broaden wildcard or add explicit handler** - Change `/preview/:projectId/:appId/*` to `/preview/*`, or add explicit trailing-slash route
- **Route order matters** - Specific routes must be evaluated before general catch-alls

## Details

### The Problem

Original route pattern:

```typescript
// Matches /preview/proj-1/app-1/
// Matches /preview/proj-1/app-1/file.js
// Does NOT match /preview/proj-1/app-1 (no character after final /)
router.post("/preview/:projectId/:appId/*", handler);
```

When a request comes in for `/preview/proj-1/app-1`:

1. Route pattern requires ≥1 char after `/app-1/`
2. Request has nothing after the final `/`
3. Route doesn't match → falls through to next layer
4. Static layer catches it and serves `index.html`
5. Browser loads Bird Code's SPA inside the iframe

**Result:**

- User sees Bird Code UI (logo, spinner) inside the iframe
- Console shows errors like `WebSocket connection to ws://localhost:5173/ws failed`
- Actually Bird Code trying to initialize inside the iframe

### Why This Happens

The HTTP request flow:

```
GET /preview/proj-1/app-1

Router layer 1: POST /preview/:projectId/:appId/*
  → Pattern requires ≥1 char after /app-1/
  → "" (empty string) doesn't match /*
  → NOT MATCHED

Router layer 2 (static): *
  → Matches anything
  → Serves index.html
  → MATCHED ✓
```

The static layer is the fallback for all unmatched requests; it catches trailing-slash-only requests that the preview route missed.

### The Solution

**Option 1: Broaden the Wildcard**

```typescript
// ✅ CORRECT: Matches /preview/proj-1/app-1 AND /preview/proj-1/app-1/
router.post("/preview/*", handler);
// Handler extracts :projectId and :appId from params
```

This pattern matches the preview base path and anything below it.

**Option 2: Add Explicit Trailing-Slash Handler**

```typescript
// ✅ Also valid: explicitly handle both patterns
router.post("/preview/:projectId/:appId", handler);
router.post("/preview/:projectId/:appId/*", handler);
// Handler reuses same logic for both patterns
```

### Implementation in Bird Code

The actual fix applied:

```typescript
// Before: preview route pattern
app.post("/preview/:projectId/:appId/*", previewHandler);
// Could miss trailing-slash-only requests

// After: broader pattern
app.post("/preview/*", previewHandler);
// Catches all preview requests; handler extracts what it needs
```

### Guards Against Fallthrough

To prevent unrelated requests from hitting the preview handler, add guards:

```typescript
app.post("/preview/*", (req, res, next) => {
  // Validate request is actually for preview functionality
  if (!req.path.startsWith("/preview/")) {
    return next(); // Pass to next handler (shouldn't happen, but defensive)
  }

  // Extract projectId, appId from path
  const parts = req.path.slice("/preview/".length).split("/");
  const [projectId, appId, ...rest] = parts;

  if (!projectId || !appId) {
    return res.status(400).json({ error: "Invalid preview path" });
  }

  return previewHandler(req, res);
});
```

### Related Routing Pitfalls

**Route order matters:**

```typescript
app.get("*", staticFileHandler); // Catch-all
app.get("/special/:id", specialHandler); // Never reached!

// ✅ CORRECT: Specific first
app.get("/special/:id", specialHandler);
app.get("*", staticFileHandler);
```

**Query parameters don't affect matching:**

```typescript
router.post("/api/*");
// Matches: /api/users
// Matches: /api/users?limit=10
// Matches: /api/users/
// Does NOT match: /api
```

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] - Route patterns often pair with auth middleware
- [[concepts/settings-ui-management-pattern]] - Settings endpoints also need careful route ordering
- [[concepts/systematic-feature-implementation-phases]] - Route design during phase 6 (RPC handlers) needs consideration of fallthrough patterns

## Sources

- [[daily/2026-04-12.md]] - "Bird Code logo/spinner appeared instead of preview app; identified route pattern `/preview/:projectId/:appId/*` wasn't matching trailing-slash requests"
- [[daily/2026-04-12.md]] - "Route pattern requires ≥1 char after final `/`, so trailing-slash-only requests fell through to static layer and served Bird Code's own `index.html` inside iframe"
- [[daily/2026-04-12.md]] - "Fixed by broadening route to `/preview/*` to catch all preview requests; removed `allow-same-origin` from iframe sandbox (security concern)"
