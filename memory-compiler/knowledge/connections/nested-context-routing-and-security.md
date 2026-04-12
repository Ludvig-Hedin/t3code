---
title: "Connection: Nested Contexts, Routing, and Security in Iframe Preview"
connects:
  - "concepts/iframe-sandboxing-cors"
  - "concepts/route-wildcard-trailing-slash"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Nested Contexts, Routing, and Security in Iframe Preview

Embedding a web application inside an iframe (for preview in an IDE, code sandbox, etc.) requires both routing correctness and security correctness. When routing fails (wildcard doesn't match trailing slash), the parent app's HTML loads in the iframe instead of the target app—a silent failure that's hard to debug. When security is misconfigured (wrong sandbox attributes), the embedded app can escape restrictions. Both require careful attention to how nested contexts interact with URL rewriting, routing, and sandboxing.

## The Connection

The preview feature bug involved **three interconnected layers:**

1. **Routing layer** - Did the route pattern match the request?
2. **Security layer** - What sandbox restrictions apply to the response?
3. **Network layer** - Did the rewritten URL reach the correct backend?

Each layer depends on the others:

- **Wrong route** → wrong app loads → security settings apply to wrong app
- **Wrong sandbox** → embedded app can escape → network requests leak
- **Wrong network** → correct app loads but can't reach resources → CORS errors

## Evidence

The debugging session revealed the full stack:

**Session 1:** CORS errors, absolute URLs bypassing proxy → network layer issue
**Session 2:** White screen, then spinner → realized Bird Code itself was loading inside iframe (routing failed)
**Session 3:** Removed `allow-same-origin` from sandbox → realized security was wrong even after routing fixed

The real problem wasn't any single layer; it was **all three failing simultaneously in a nested context**, making it hard to isolate.

## The Nested Context Problem

In a simple architecture, routes are flat: `GET /api/x` → handler. In nested contexts (preview), routes are hierarchical: `GET /preview/projectId/appId/* → capture all, then rewrite to target app, then apply sandbox security`.

The failure modes are non-obvious:

- Route matches but wrong security → one class of bug
- Route doesn't match but silent fallthrough → different class of bug
- Security fails but routing succeeds → third class
- All three work but network URL rewriting is wrong → fourth class

## Design Implications

When building nested preview/sandbox features:

1. **Explicit routing** - Don't rely on catch-alls; make preview routes explicit and specific
2. **Separate concerns** - Route matching, URL rewriting, and sandbox attributes are distinct and should be configured independently
3. **Testing in context** - Test with the actual browser sandbox; don't assume behavior based on spec
4. **Layered debugging** - When nested features fail, check each layer (routing, sandbox, network) independently before assuming interaction bugs

## Related Concepts

- [[concepts/iframe-sandboxing-cors]] - Security layer of nested contexts
- [[concepts/route-wildcard-trailing-slash]] - Routing layer of nested contexts
