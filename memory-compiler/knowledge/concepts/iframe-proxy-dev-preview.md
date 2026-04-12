---
title: "Iframe Proxy Configuration for Dev Server Preview"
aliases: [dev-preview, sandbox-cors, url-rewriting, route-patterns]
tags: [preview, proxy, iframe, development, configuration]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Iframe Proxy Configuration for Dev Server Preview

Displaying a dev server inside an iframe (for live preview in an IDE or editor) requires careful proxy configuration to handle CORS, absolute URL rewriting, and route pattern matching. Common issues include iframe `null` origin, Vite embedding absolute localhost URLs that bypass the proxy, verbatim header forwarding creating CORS conflicts, and wildcard route patterns not matching trailing-slash-only requests. Each requires specific fixes.

## Key Points

- **CORS and origin:** Iframe origin is `null` by default; need `allow-scripts` sandbox without `allow-same-origin`
- **URL rewriting:** Vite embeds absolute URLs (not relative); proxy must rewrite `localhost:5173` to preview proxy endpoint
- **Header forwarding:** Don't forward `Accept-Encoding: gzip` when rewriting response bodies; strip it from proxy requests
- **Route pattern wildcard:** `/preview/*` doesn't match requests with nothing after the final `/`; use broad patterns or explicit fallback
- **Sandbox escapes:** `allow-same-origin + allow-scripts` combination is a documented sandbox escape; browser warnings are correct

## Details

### Issue 1: CORS and Iframe Origin

**Problem:**

```
Access to XMLHttpRequest at 'http://localhost:5173/' from origin 'null' has been blocked by CORS policy
```

The preview iframe has `null` origin (browsers assign this to frames loaded from blob URLs or without explicit origin). CORS requests fail because the server expects specific origins.

**Solution:**

```html
<iframe
  src={previewUrl}
  sandbox="allow-scripts allow-forms allow-popups"
  // NOT: allow-same-origin (causes security warning and is unnecessary with CORS *)
/>
```

Proxy server should respond with:

```typescript
res.set("Access-Control-Allow-Origin", "*");
res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
```

The `*` header allows any origin including `null`. The `allow-scripts` sandbox permission lets the iframe run JavaScript; `allow-forms` and `allow-popups` handle user interactions.

**Why not `allow-same-origin`?** Even with `CORS: *`, combining it with `allow-scripts` is a documented sandbox escape. Browsers warn about this combination. Since `*` already allows `null` origin, `allow-same-origin` is redundant and dangerous.

### Issue 2: Vite's Absolute URLs

**Problem:**

```html
<!-- Vite embeds absolute URLs, not relative paths -->
<script src="http://localhost:5173/@vite/client"></script>
```

The iframe src is `http://preview.local/preview/project-1`, but the script tag points to `localhost:5173` directly, bypassing the proxy. This causes:

- CORS failures (cross-origin request to raw dev server)
- WebSocket connection failures (separate connection, not proxied)
- No auth or middleware applied

**Solution:** Rewrite absolute URLs in the proxy response:

```typescript
app.get("/preview/*", async (req, res) => {
  const devResponse = await fetch("http://localhost:5173/");
  let body = await devResponse.text();

  // Rewrite absolute URLs to proxy endpoint
  body = body.replace(/http:\/\/localhost:5173/g, `http://${req.hostname}/preview`);

  res.send(body);
});
```

Now script tags become: `<script src="http://preview.local/preview/@vite/client"></script>`, routed through the proxy.

### Issue 3: Gzip Compression Conflict

**Problem:**

When the proxy:

1. Requests `http://localhost:5173` with `Accept-Encoding: gzip`
2. Receives gzipped response
3. Decompresses it to modify URLs
4. Forwards the decompressed body with original `Content-Encoding: gzip` header

The iframe receives decompressed HTML labeled as gzipped → browser tries to decompress already-plain text → garbled content.

**Solution:** Strip `Accept-Encoding` from proxy requests:

```typescript
const devResponse = await fetch("http://localhost:5173/", {
  headers: {
    ...req.headers,
    "Accept-Encoding": "identity", // Force uncompressed response
  },
});
```

The proxy receives plain text, can rewrite it, and forwards with correct headers.

### Issue 4: Wildcard Route Pattern Matching

**Problem:**

Route pattern `/preview/:projectId/:appId/*` doesn't match requests like `/preview/my-project/my-app/` (nothing after the final `/`). The `/*` wildcard requires at least 1 character to match.

Result: Request falls through to the next handler (static layer) which serves Bird Code's own `index.html` inside the iframe → Bird Code UI appears in the preview instead of the dev app.

**Solution:** Use broad wildcard pattern:

```typescript
// ❌ TOO SPECIFIC: Doesn't match trailing-slash-only requests
router.get("/preview/:projectId/:appId/*", handler);

// ✅ BROAD: Matches all preview requests
router.get("/preview/*", handler);
```

The broad pattern catches all preview requests. The handler can parse `req.params[0]` to extract the path after `/preview/` and route accordingly.

### Issue 5: Handler Fallthrough to Static Layer

Even with correct route patterns, ensure the preview handler is registered _before_ static file serving:

```typescript
app.use("/preview", previewRouteHandler); // Must come first
app.use(express.static("public")); // Catch-all is last
```

If static comes first, `/preview/*` requests may match broad patterns and serve static files instead of proxying to dev server.

## Related Concepts

- [[concepts/http-proxy-configuration]] - General proxy patterns
- [[concepts/cors-same-origin-policy]] - CORS and sandbox interactions
- [[concepts/development-workflow-optimization]] - Live preview patterns

## Sources

- [[daily/2026-04-12.md]] - "Fixing Bird Code's preview pane for React (Vite) and Markdown projects — was showing blank white screen, then spinner"
- [[daily/2026-04-12.md]] - "Investigation revealed three compounding bugs: (1) iframe origin set to `null`, (2) Vite embedding absolute localhost URLs in HTML (bypasses proxy), (3) proxy forwarding Vite's CORS headers verbatim"
- [[daily/2026-04-12.md]] - "Add `StartupLogView` component: Instead of bare spinner, show human-readable startup milestones... mapped from dev-server output"
- [[daily/2026-04-12.md]] - "Route wildcards in Effect's `HttpRouter` require at least one character after the final `/` — empty path segments fall through to catch-alls... Broadened route to `/preview/*` to catch all preview requests"
