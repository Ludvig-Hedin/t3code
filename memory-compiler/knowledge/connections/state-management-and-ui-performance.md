---
title: "Connection: State Management Anti-Patterns Cause Cascading UI Performance Issues"
connects:
  - "concepts/zustand-selector-anti-patterns"
  - "concepts/react-hydration-constraints"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: State Management Anti-Patterns Cause Cascading UI Performance Issues

## The Connection

Two distinct bugs in the codebase — infinite re-render loop from Zustand selector instability and hydration error from whitespace in semantic HTML — both stem from the same root: **neglecting constraints in the rendering pipeline**. The Zustand bug ignored the fact that Zustand uses reference equality; the hydration bug ignored the fact that `<colgroup>` has strict children. Both were caught by attempting to do something "natural" that violated an invisible constraint.

## Key Insight

React (and its surrounding ecosystem) has many invisible constraints:

- Zustand selectors must return stable references
- HTML semantic elements enforce child restrictions
- Hydration requires exact server/client structure matching
- useEffect dependencies must be exhaustive

Developers often learn these constraints through bugs, not documentation. The pattern: try something intuitive, hit an invisible wall, discover the constraint.

The connection: **both bugs could have been prevented by asking "what constraints apply here?"** before implementing.

## Evidence

**Zustand selector bug:**

- Intuitive attempt: Filter array inside selector `state.projects.filter(p => p.active)`
- Invisible constraint: Zustand uses `Object.is` equality; arrays always differ by reference
- Result: Infinite re-render loop during commit phase
- Fix: Move filter to `useMemo` outside selector

**Hydration bug:**

- Intuitive attempt: Add inline comment in `<colgroup>` for clarity `{/* checkbox */}`
- Invisible constraint: `<colgroup>` only allows `<col>` and `<colgroup>` children; comments create text nodes
- Result: Server renders clean HTML; client hydration creates text nodes; mismatch error
- Fix: Move comments outside the semantic container

Both involve:

1. An intuitive, seemingly harmless action
2. Violation of an invisible constraint (reference equality, HTML semantics)
3. Cascading failure (re-render loop, hydration error)
4. Root cause not obvious until diving into internals (Zustand's `useSyncExternalStore`, React's hydration algorithm)

## Design Implication

When writing code that touches:

- External state systems (Zustand, Redux, MobX) — verify the selector/subscription pattern used
- HTML semantics (`<table>`, `<form>`, `<select>`) — verify allowed children
- SSR (server-side rendering) — verify server and client produce identical HTML
- React hooks (useEffect, useMemo) — verify dependency arrays are exhaustive

The cost of discovery-via-bug is high. A one-minute review of constraints saves hours of debugging.

## Related Concepts

- [[concepts/invisible-constraints-in-frameworks]] - The broader pattern
- [[concepts/debugging-render-loops]] - Systematic approach to infinite re-renders
- [[concepts/html-semantics-and-accessibility]] - Why HTML constraints matter
