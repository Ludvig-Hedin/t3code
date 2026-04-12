---
title: "Connection: Hydration and Re-render Issues Share Common Root Causes"
connects:
  - "concepts/colgroup-strictness-and-hydration"
  - "concepts/zustand-selector-stability-pattern"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Hydration and Re-render Issues Share Common Root Causes

## The Connection

Both hydration mismatches (from `<colgroup>` text nodes) and infinite re-render loops (from Zustand selector instability) stem from the same underlying violation: React expects consistent references or tree structures across render boundaries. Violate that consistency, and React forces a re-render as a self-defense mechanism.

## Key Insight

React's hydration algorithm is strict by design: "If the server rendered X but the client got Y, something is wrong—re-render to fix it." Similarly, Zustand's `useSyncExternalStore` uses `Object.is` to detect state changes: "If the selector returns a new reference, I treat it as a change—trigger a re-render."

Both are safety mechanisms that **prevent silent divergence** between server and client (or store and component). But when you violate their assumptions (text nodes in `<colgroup>` or array methods in selectors), these safety mechanisms kick in and cause expensive re-renders.

The pattern generalizes: **whenever React sees an inconsistency at a boundary, it re-renders**. The specific inconsistency varies (tree structure, reference identity), but the symptom is identical.

## Evidence

From the daily log:

1. **Both are formatting/reference issues masquerading as logical errors**: "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes" + "Root cause: `.filter()` inside Zustand selector created new array reference on every call"

2. **Both trigger expensive re-renders**: `<colgroup>` mismatch causes React to throw away SSR benefits; Zustand mismatch causes infinite re-render loop during passive effects commit phase.

3. **Both have the same fix philosophy**: Remove the violating formatting/reference creation. Don't change how React works—change your code to match React's expectations.

## Design Implications

When debugging mysterious re-renders or hydration errors, ask:

- "What changed between server and client?" (hydration)
- "What reference changed between selector calls?" (Zustand)
- "What structural assumption did I violate?" (common theme)

The fix is rarely "tweak React's behavior." It's always "stop violating the assumption."

## Related Concepts

- [[concepts/colgroup-strictness-and-hydration]] - The HTML structure side
- [[concepts/zustand-selector-stability-pattern]] - The state reference side
