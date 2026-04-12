---
title: "Connection: Preview Pane Success Required Multiple Coordinated Fixes"
connects:
  - "concepts/iframe-proxy-dev-preview"
  - "concepts/startup-milestone-logging"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Preview Pane Success Required Multiple Coordinated Fixes

## The Connection

The Bird Code preview feature (displaying a React dev server or Markdown file inside an iframe) exhibited three distinct failures: CORS errors, absolute URL bypass, and route pattern mismatches. Each had a different root cause and required a different fix. But the three fixes are interdependent: fixing CORS alone still left broken URLs; fixing URLs alone didn't help if the route pattern didn't match. The feature only worked when all three were fixed together.

This reveals a broader pattern: **complex features require coordinated fixes across multiple system boundaries**. The preview pane isn't a single problem; it's three problems that masquerade as one.

## Key Insight

When a feature displays broken behavior, the natural instinct is to identify "the bug." But complex features often fail due to multiple coordinated failures:

1. **Symptom:** White screen instead of preview
2. **First diagnosis:** CORS error in console
3. **First fix:** Add CORS headers
4. **Result:** Still white screen (URL rewriting wasn't done)
5. **Second diagnosis:** Network tab shows requests to `localhost:5173` (absolute URL)
6. **Second fix:** Proxy rewriting
7. **Result:** Still nothing (route pattern doesn't match trailing-slash requests)
8. **Third diagnosis:** Bird Code's own `index.html` loads inside iframe
9. **Third fix:** Broaden route pattern to `/preview/*`
10. **Result:** Finally works

Each fix was necessary but insufficient. The system required a "three-part fix":

- Network layer (CORS)
- Proxy layer (URL rewriting)
- Routing layer (pattern matching)

## Evidence

From the daily log: "Investigation revealed **three compounding bugs**: (1) iframe origin set to `null`, (2) Vite embedding absolute localhost URLs in HTML (bypasses proxy), (3) proxy forwarding Vite's CORS headers verbatim"

Then: "Second session: preview showed Bird Code logo/spinner instead of target app — traced to route pattern... Broadened route to `/preview/*` to catch all preview requests"

The conversation reveals iterative discovery and fix of three independent issues.

## UX Layer Addition

Beyond the three technical fixes, the feature also needed UX improvement: a bare spinner provided no feedback, so a `StartupLogView` component was added to show human-readable progress ("Installing dependencies", "Starting Web", "Compiling", "Dev server ready").

This is not a fix to the underlying feature; it's a fix to the user's experience of waiting for the feature to work. But it's equally important: without startup feedback, users assume the feature is broken even when it's working correctly (just slowly).

## Design Implication

When debugging complex features:

1. **Identify all failure modes** - Don't stop at the first diagnosis; keep digging
2. **Fix each layer independently** - Network, proxy, routing are separate systems requiring separate fixes
3. **Verify fixes are coordinated** - Each fix may be necessary but insufficient; test the full path
4. **Add UX feedback** - Even if the feature works, make it visible to users that it's working
5. **Document the complexity** - Future maintainers should understand why all three fixes are needed

A one-layer fix (CORS only) looks "complete" until you test it and discover it doesn't work.

## Related Concepts

- [[concepts/debugging-multi-layer-systems]] - Systematic debugging across layers
- [[concepts/user-feedback-and-loading-states]] - Why UX feedback is as important as functionality
