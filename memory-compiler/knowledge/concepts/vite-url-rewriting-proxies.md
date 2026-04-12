---
title: "Vite Absolute URL Rewriting in HTTP Proxies"
aliases: [vite-proxy-rewriting, url-rewriting, dev-server-proxy, absolute-urls]
tags: [vite, dev-tools, proxy, integration]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Vite Absolute URL Rewriting in HTTP Proxies

Vite embeds absolute URLs (like `http://localhost:5173/foo.js`) directly into HTML during development, rather than relative URLs. When a proxy forwards Vite's responses to an iframe with a different origin, these absolute URLs bypass the proxy and try to connect directly to Vite's dev server port, failing due to CORS or connection errors. The solution is to intercept and rewrite URLs before proxying the response to the iframe.

## Key Points

- **Vite embeds absolute URLs** - Not relative paths; URLs like `http://localhost:5173/main.js` are hardcoded in HTML
- **Absolute URLs bypass proxy** - Browser fetches directly from Vite server, not through proxy
- **Different origins cause CORS failures** - Iframe origin ≠ Vite server origin → CORS headers don't apply
- **Rewriting is mandatory** - Intercept HTML responses and replace absolute localhost URLs with proxy-relative paths
- **Header forwarding edge case** - Vite may forward `Accept-Encoding: gzip`; rewriting gzipped content is problematic
- **Solution: rewrite before compression** - Strip `Accept-Encoding` from proxy request, rewrite URLs in response, compress at proxy boundary

## Details

### The Problem

**Vite dev server serves:**

```html
<script src="http://localhost:5173/src/main.ts"></script>
<link rel="stylesheet" href="http://localhost:5173/src/style.css" />
```

**Proxy forwards to iframe** (different origin):

```
Browser (iframe at http://localhost:3000/preview)
  → Loads HTML from proxy
  → Sees absolute URL http://localhost:5173/main.ts
  → Tries to fetch directly from Vite server (port 5173)
  → CORS failure: fetch from different origin without CORS headers
  → Blank iframe or error console
```

### Root Causes

1. **Vite embeds absolute URLs** - Not a bug; by design for dev server compatibility
2. **Proxy doesn't rewrite** - Forwards response headers and body verbatim
3. **Different origin** - Iframe at localhost:3000 can't fetch from localhost:5173 without CORS
4. **Missing CORS headers** - Vite dev server doesn't send CORS headers by default

### The Solution: URL Rewriting

Intercept the HTML response and rewrite URLs before forwarding to iframe:

```typescript
// Proxy middleware for /preview routes
async function previewProxyMiddleware(req, res) {
  // Forward request to Vite dev server
  const viteResponse = await fetch("http://localhost:5173" + req.path);

  let body = await viteResponse.text();

  // Rewrite absolute URLs to proxy-relative
  body = body.replace(
    /http:\/\/localhost:5173(\S+?)/g,
    // Replace with relative path that goes through proxy
    (match, path) => {
      return `/preview${path}`;
    },
  );

  // Copy headers but override key ones
  for (const [key, value] of viteResponse.headers) {
    if (!["content-encoding", "content-length"].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  }

  // Send rewritten content
  res.send(body);
}
```

### URL Rewriting Patterns

**Pattern 1: Simple replacement**

```
Original: http://localhost:5173/src/main.ts
Rewritten: /preview/src/main.ts
```

The proxy route `/preview/*` forwards to this path, which strips `/preview` and forwards to Vite again.

**Pattern 2: Handling query parameters**

```
Original: http://localhost:5173/src/main.ts?import=true&direct=false
Rewritten: /preview/src/main.ts?import=true&direct=false
```

Regex must be non-greedy to avoid consuming the query string.

### Compression Complexity

**The problem:**

```typescript
// Vite may send Accept-Encoding: gzip
viteResponse.headers['content-encoding']; // 'gzip'

// If we rewrite the gzipped body directly, we corrupt it:
const body = await viteResponse.buffer();
body.replace(...) // Corrupting binary gzip data!
```

**The solution:**
Strip `Accept-Encoding` from the proxy request so Vite sends uncompressed:

```typescript
const headers = { ...req.headers };
delete headers['accept-encoding'];
// Or:
headers['accept-encoding'] = 'identity';

const viteResponse = await fetch('http://localhost:5173' + req.path, {
  headers: headers
});

// Now body is uncompressed; safe to rewrite
let body = await viteResponse.text();
body = body.replace(...);
```

### CORS Configuration

If rewriting alone isn't sufficient:

**Option 1: Configure Vite for CORS**

```javascript
// vite.config.js
export default {
  server: {
    cors: true, // Enable CORS
  },
};
```

**Option 2: Proxy sets CORS headers**

```typescript
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
res.setHeader("Access-Control-Allow-Headers", "*");
```

### Caching Implications

Rewritten URLs are now proxy-relative; this affects caching:

```typescript
// Original URL: http://localhost:5173/src/main.ts (cache key)
// Rewritten URL: /preview/src/main.ts (different cache key)

// If proxy caches responses:
// Cached response for http://... won't match request for /preview/...
// Re-fetch from Vite → double bandwidth

// Solution: Cache by the rewritten URL, not the original
```

## Related Concepts

- [[concepts/iframe-route-pattern-matching]] - Route patterns must accommodate rewritten URLs
- [[concepts/http-endpoint-authentication-patterns]] - Proxy may need to validate requests before forwarding
- [[concepts/systematic-feature-implementation-phases]] - Dev server integration is phase 7 (UI layer)

## Sources

- [[daily/2026-04-12.md]] - "Preview pane showed white screen; investigation revealed CORS errors from iframe sandbox and absolute localhost URLs in HTML bypassing proxy"
- [[daily/2026-04-12.md]] - "Vite embeds absolute localhost URLs in HTML, not relative ones — rewriting them in the proxy is critical"
- [[daily/2026-04-12.md]] - "Stripping `Accept-Encoding` from proxy requests was necessary because gzip compression + URL rewriting is problematic"
