---
title: "Iframe Sandboxing Attributes and CORS Interaction"
aliases: [iframe-sandbox, cors-origin, sandbox-security]
tags: [security, html, cors, iframe]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Iframe Sandboxing Attributes and CORS Interaction

HTML iframe sandboxing restricts what an embedded page can do. The `allow-same-origin` attribute allows the iframe to access cookies and storage as if it were same-origin, while `allow-scripts` enables JavaScript execution. These attributes interact non-obviously with CORS headers: even with CORS headers allowing `*`, combining `allow-scripts + allow-same-origin` is documented as a sandbox escape and triggers browser security warnings. The safer pattern is `allow-scripts` alone (no `allow-same-origin`).

## Key Points

- **Sandbox modes are restrictive** - By default, iframes cannot run scripts, access cookies, or perform navigation
- **`allow-scripts` needed for JS** - Embedded apps requiring JavaScript must have this (enables the app to run)
- **`allow-same-origin` is dangerous** - Allows iframe to read/write cookies and storage; documented sandbox escape when paired with `allow-scripts`
- **Browser warnings matter** - Security warnings from the browser are informed, not false positives; they indicate real sandbox escape vectors
- **CORS headers don't override sandbox** - Even with CORS `*`, the sandbox restrictions still apply; CORS is a separate security policy
- **Origin inequality in sandboxed iframes** - Sandboxed iframes have an opaque origin (treated as `null`), even with `allow-same-origin`

## Details

### The Problem Case

When embedding user-facing apps (like a web preview in an IDE), developers often add `allow-same-origin` to support localStorage and cookies:

```html
<!-- DANGEROUS: Sandbox escape documented in browser specs -->
<iframe sandbox="allow-scripts allow-same-origin" src="https://preview.localhost:3000" />
```

Even with CORS headers `Access-Control-Allow-Origin: *` on the backend, this combination:

1. Enables JavaScript to run
2. Allows that JavaScript to access/modify cookies and storage
3. Creates a documented sandbox escape vector
4. Triggers browser security warnings

### The Safer Pattern

```html
<!-- SAFER: Allows scripts but preserves sandbox isolation -->
<iframe sandbox="allow-scripts" src="https://preview.localhost:3000" />
```

With `allow-scripts` alone:

- JavaScript runs in the preview app
- Cookies and storage are isolated
- CORS still works (separate policy)
- No browser security warnings
- Preview app can still use IndexedDB, sessionStorage (origin-scoped)

### How CORS and Sandbox Interact

CORS (Cross-Origin Resource Sharing) and iframe sandboxing are orthogonal security policies:

**CORS:** Controls which origins can access resources via HTTP (headers in response)
**Sandbox:** Limits what JavaScript running in the iframe can do (HTML attribute)

An iframe can have:

- CORS headers allowing `*` + sandbox restricting origin → **SAFE** (no scripts can escalate)
- CORS headers denying all + sandbox open → **UNSAFE** (scripts can read/write anything)
- CORS `*` + `allow-same-origin + allow-scripts` → **VERY UNSAFE** (script can access cookies)

### Network and URL Handling in Sandboxed Iframes

Sandboxed iframes also have specific network behavior:

**Absolute URLs in HTML are problematic:**

```html
<!-- In sandboxed preview iframe, this loads from localhost:3000 -->
<link rel="stylesheet" href="http://localhost:3000/styles.css" />
```

If the preview is served via proxy (e.g., Bird Code's preview service), absolute localhost URLs bypass the proxy and load from the actual localhost port, potentially causing CORS failures because the real port's CORS config may differ.

**Solution:** Rewrite absolute URLs to relative or proxy-compatible paths in the proxy middleware before serving the HTML to the iframe.

## Related Concepts

- [[concepts/react-hydration-semantic-html]] - Both involve client-server rendering differences causing security/correctness issues
- [[concepts/route-wildcard-trailing-slash]] - Iframe routing also encounters edge cases with URL patterns

## Sources

- [[daily/2026-04-12.md]] - "User reported white preview screen despite npm run dev working; CORS errors in console about iframe sandbox and absolute localhost URLs."
- [[daily/2026-04-12.md]] - "Remove `allow-same-origin` from sandbox: Previous fix added it; realized CORS `*` headers make it redundant and it triggers browser security warning."
- [[daily/2026-04-12.md]] - "Iframe sandboxing: `allow-scripts` + `allow-same-origin` is a documented sandbox escape (browser warnings are correct)."
