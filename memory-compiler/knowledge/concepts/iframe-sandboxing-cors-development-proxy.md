---
title: "Iframe Sandboxing, CORS, and Development Proxy Architecture"
aliases: [iframe-cors, sandbox-config, origin-null, development-preview-proxy]
tags: [security, proxy, development-tools, cross-origin]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Iframe Sandboxing, CORS, and Development Proxy Architecture

Development preview tools that render user code inside sandboxed iframes face a complex interplay of CORS headers, sandbox restrictions, and URL rewriting. The iframe's `allow-scripts` sandbox attribute enables code execution, but `allow-same-origin` creates a documented security risk when combined with `allow-scripts`. CORS headers from the development server must be intercepted by a proxy that rewrites absolute URLs in HTML responses, prevents gzip compression during URL rewriting, and carefully manages which headers pass through to the iframe context.

## Key Points

- **Sandbox `allow-scripts + allow-same-origin` is a known escape** - Browsers warn about this combination; it's documented as unsafe
- **Iframe origin starts as `null`** - Cross-origin iframe initially has `null` origin; CORS `*` doesn't apply to null
- **Vite embeds absolute URLs** - Development servers embed `http://localhost:5173` in HTML, bypassing proxy rewrites
- **URL rewriting in proxy layer** - Intercept and rewrite absolute localhost URLs to relative proxied paths
- **Header forwarding pitfalls** - Forwarding CORS headers verbatim can create conflicts; override strategically
- **Gzip interference** - Compression prevents regex-based URL rewriting; must disable `Accept-Encoding` on proxy requests

## Details

### The iframe Origin Problem

When an iframe is created with `<iframe src="...">`, the iframe's origin depends on the src URL. If src is truly cross-origin (different domain/port), the iframe runs with that origin. But in development, the src points to a proxied path on the same domain as the parent, so the iframe should technically have `same-origin` permission.

However, setting `sandbox="allow-scripts allow-same-origin"` together is flagged by browsers as a security risk because:

1. `allow-scripts` lets code run
2. `allow-same-origin` gives that code access to parent's cookies, storage, auth tokens
3. Combined, an attacker can exfiltrate sensitive data

The safer approach: `sandbox="allow-scripts"` (no same-origin) with CORS `*` headers on the development server.

### URL Rewriting Complications

Vite and other development servers embed absolute URLs in generated HTML:

```html
<!-- Vite generates this -->
<script src="http://localhost:5173/@vite/client"></script>
<link rel="stylesheet" href="http://localhost:5173/src/index.css" />
```

If the iframe navigates to `/preview/...` (a proxied path), and that response contains `http://localhost:5173`, the browser interprets it as a cross-origin request to the actual Vite port—bypassing the proxy entirely.

**Proxy solution**: Intercept responses and rewrite:

```
http://localhost:5173 → /preview-backend
```

### Header Forwarding and CORS

The proxy must:

1. **Override CORS headers** - Development server may send `Access-Control-Allow-Origin: *`; proxy may need to override to `*` for iframe context
2. **Disable compression** - `Accept-Encoding: gzip` breaks URL rewriting regex; remove from proxy requests
3. **Preserve critical headers** - Content-Type, Cache-Control should pass through; others may conflict

Example:

```typescript
// Forward Vite response with header override
const headers = new Headers(viteResponse.headers);
headers.set("Access-Control-Allow-Origin", "*");
headers.delete("Content-Encoding"); // Prevent gzip interference
return new Response(rewriteUrls(body), { headers });
```

### Wildcard Route Fallthrough

A related issue: if the preview route pattern is too specific (`/preview/:projectId/:appId/*`), requests ending with `/` (no characters after final `/`) fall through to catch-all routes. This can cause the parent app's `index.html` to load inside the iframe.

**Solution**: Use `*` pattern without preceding params: `/preview/*`. This catches all preview requests, even trailing-slash-only paths.

## Related Concepts

- [[concepts/effect-router-wildcard-patterns]] - Route matching edge cases that interact with CORS issues
- [[concepts/dev-server-status-visualization]] - Related to development workflow and server communication

## Sources

- [[daily/2026-04-12.md]] - "CORS errors due to iframe `null` origin, absolute URLs bypassing proxy, and forwarded CORS headers"
- [[daily/2026-04-12.md]] - "Vite embeds absolute URLs in HTML, not relative ones — rewriting them in the proxy is critical"
- [[daily/2026-04-12.md]] - "Remove `allow-same-origin` from sandbox: Previous fix added it; realized CORS `*` headers make it redundant and it triggers browser security warning"
- [[daily/2026-04-12.md]] - "Removed `allow-same-origin` (causing security warning + unnecessary with CORS `*`)"
- [[daily/2026-04-12.md]] - "gzip compression + URL rewriting is problematic, so stripping `Accept-Encoding` from proxy requests is necessary"
