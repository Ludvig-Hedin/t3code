---
title: "Zustand Selector Stability Pattern - Avoiding Array Methods"
aliases: [selector-stability, useSyncExternalStore-stability, array-reference-stability]
tags: [state-management, react, zustand, performance]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Stability Pattern - Avoiding Array Methods

Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking for selector results. When a selector returns a new reference (even with identical data), React interprets this as state change and forces a re-render during the passive effect commit phase. Calling array-creating methods like `.filter()`, `.map()`, or `.reduce()` inside selectors violates this pattern and causes infinite re-render loops.

## Key Points

- Zustand selectors must return stable references (same object/array across calls with same input)
- Array methods (`.filter()`, `.map()`, `.reduce()`, `.slice()`) create new arrays on every invocation
- Each new array reference triggers `useSyncExternalStore` to force a re-render, causing infinite loop
- Error manifests during React's `commitHookPassiveMountEffects` phase (passive effects commit)
- Solution: use `useMemo` to wrap array operations and stabilize the reference

## Details

### The Anti-Pattern

```typescript
// WRONG: .filter() creates new array every time selector runs
const projects = useShallow(store, (state) => state.projects.filter((p) => p.active));
```

Each selector call creates a new array instance, even if the same projects pass the filter. React sees this as a state change:

1. Selector runs → creates new array → `Object.is` comparison fails
2. React schedules re-render → component updates → selector runs again
3. Loop: new render → new array → re-render → new array...

The loop breaks only when React detects the cycle and raises an error.

### The Solution

Use `useMemo` to stabilize the array reference:

```typescript
// CORRECT: useMemo stabilizes the array reference
const activeProjects = useMemo(() => store.projects.filter((p) => p.active), [store.projects]);

const projects = useShallow(store, () => activeProjects);
```

Or better, use a memoized selector that Zustand evaluates only when dependencies change:

```typescript
// BEST: Zustand's built-in selector memoization
const projects = useShallow(
  store,
  (state) =>
    // Use the selector directly without transformations
    state.activeProjects, // assuming store pre-computes this
);
```

### Why This Matters

The pattern is a documented anti-pattern in Zustand + React:

- `useSyncExternalStore` expects selectors to return stable references for unchanged data
- Any array-creating method violates this expectation
- The pattern cascades: if you create a new array → re-render → new array → infinite loop

This is different from regular React hooks where `.filter()` might be fine (React's diffing algorithm handles it). With Zustand's external store, the contract is stricter.

## Related Concepts

- [[concepts/colgroup-strictness-and-hydration]] - Another source of hydration/re-render issues from structural constraints
- [[concepts/process-serialization-piggyback-pattern]] - Serialization patterns that prevent concurrent mutations (related to stability)

## Sources

- [[daily/2026-04-12.md]] - "Debugged and fixed an infinite re-render loop in the Sidebar component caused by unstable Zustand selectors"
- [[daily/2026-04-12.md]] - "Root cause: `.filter()` inside Zustand selector created new array reference on every call"
- [[daily/2026-04-12.md]] - "Never call `.filter()`, `.map()`, `.reduce()` or other array-creating methods inside Zustand selectors"
