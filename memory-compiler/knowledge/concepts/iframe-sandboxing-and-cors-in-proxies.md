---
title: "Iframe Sandboxing and CORS in Development Proxies"
aliases: [iframe-sandbox, proxy-cors, preview-iframe, origin-handling]
tags: [web-security, cors, iframe, proxy, development]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Iframe Sandboxing and CORS in Development Proxies

Development proxies that preview user code in iframes must carefully balance sandboxing (security), CORS (resource sharing), and header forwarding. Pitfalls include: setting iframe `srcdoc` to `null` origin (breaks CORS), bundlers embedding absolute URLs that bypass proxy rewrites, forwarding CORS headers verbatim without rewriting, and route patterns that don't match trailing-slash-only requests.

## Key Points

- Iframe sandbox attribute `allow-same-origin + allow-scripts` triggers browser security warnings; `allow-same-origin` is often unnecessary
- Bundlers (Vite) embed absolute URLs (`http://localhost:5173`) in HTML; proxy must rewrite these to use the proxy's origin
- Forwarding `Access-Control-Allow-Origin: *` from bundler through proxy bypasses CORS; may need to override
- Route patterns with `/*` wildcard don't match requests with nothing after the final `/` (e.g., `/preview/` matches but `/preview` may not)
- Iframe origin `null` causes all cross-origin requests to be blocked, even with CORS headers

## Details

### The Sandboxing Dilemma

```jsx
<iframe srcDoc={userCode} sandbox="allow-scripts allow-same-origin" />
```

This configuration:

- `allow-scripts` - Required to run JavaScript in the preview
- `allow-same-origin` - Allows the iframe to access cookies/resources as same-origin

However, `allow-same-origin + allow-scripts` is a documented sandbox escape. Browsers warn about this combination even when CORS policies technically allow it. Many proxies use this anyway (accepting the risk in development) but better alternatives exist.

### The Absolute URL Problem

Vite and other bundlers embed absolute URLs in generated HTML:

```html
<script src="http://localhost:5173/@vite/client"></script>
<link href="http://localhost:5173/style.css" rel="stylesheet" />
```

These bypass the proxy entirely. The proxy must rewrite them:

```typescript
// Rewrite absolute URLs to use proxy origin
html = html.replace(/http:\/\/localhost:\d+/g, `https://${req.host}`);
```

### The CORS Header Forwarding Issue

Bundlers often serve with `Access-Control-Allow-Origin: *` during development (permissive). If the proxy forwards this verbatim:

```typescript
// WRONG: Forward headers from bundler without inspection
res.setHeader(
  "Access-Control-Allow-Origin",
  bundlerResponse.headers["access-control-allow-origin"],
);
```

And the iframe has `allow-same-origin`, the combined effect may bypass intended restrictions. Better to be explicit:

```typescript
// CORRECT: Set explicit CORS policy or transform headers
res.setHeader("Access-Control-Allow-Origin", "*"); // Explicit choice
res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
```

### Route Pattern Matching

Express/Effect route patterns with wildcards require at least one character after the final `/`:

```typescript
// WRONG: Won't match /preview or /preview/ (routes with nothing after final /)
app.get("/preview/:projectId/:appId/*", handler);

// CORRECT: Broader wildcard that matches trailing-slash
app.get("/preview/*", handler);
```

When a route doesn't match, the request falls through to other handlers (e.g., static file serving). If a catch-all static layer exists, it may serve the proxy app's own `index.html` inside the iframe, causing the proxy app to bootstrap inside the preview (unintended).

### Solution Checklist

1. **Don't use `allow-same-origin`** unless necessary; `allow-scripts` alone is often sufficient
2. **Rewrite bundler URLs** to use the proxy's origin instead of absolute localhost URLs
3. **Disable compression** when rewriting URLs (gzip makes string replacement impossible)
4. **Strip `Accept-Encoding: gzip`** from proxy requests to bundler to avoid this issue
5. **Set explicit CORS headers** rather than forwarding verbatim
6. **Ensure route patterns match trailing slashes** (use broad wildcards for catch-all preview routes)

## Related Concepts

- [[concepts/rpc-layer-expansion-pattern]] - Preview endpoints are often part of larger RPC service layers
- [[concepts/git-branch-agnostic-base-resolution]] - Defensive validation pattern (similar principle: don't assume state)

## Sources

- [[daily/2026-04-12.md]] - "Fixing Bird Code's preview pane... CORS errors about iframe sandbox and absolute localhost URLs"
- [[daily/2026-04-12.md]] - "Vite embedding absolute localhost URLs in HTML (bypasses proxy)... proxy forwarding CORS headers verbatim"
- [[daily/2026-04-12.md]] - "Broadened route pattern to `/preview/*`: changed from `/:projectId/:appId/*` to catch trailing-slash-only navigation"
- [[daily/2026-04-12.md]] - "Remove `allow-same-origin` from sandbox: previous fix added it; realized CORS `*` headers make it redundant and triggers browser security warning"
