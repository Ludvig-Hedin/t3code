---
title: "Zustand Selector Anti-Patterns: Array Methods in Selectors"
aliases: [selector-instability, filter-in-selector, unstable-references]
tags: [state-management, react, performance, zustand]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Anti-Patterns: Array Methods in Selectors

Zustand selectors that create new array references (via `.filter()`, `.map()`, `.reduce()`, or other array methods) cause infinite re-render loops. Zustand uses `useSyncExternalStore` with `Object.is` equality checking; when a selector returns a different reference on each call (even with identical data), React forces a re-render during the passive effect commit phase, triggering the selector again infinitely.

## Key Points

- **Root cause:** Array-creating methods inside selectors return new references on every call
- **Equality check:** Zustand uses `Object.is`, which checks reference equality for objects/arrays
- **Trigger:** Reference change → re-render → selector called again → new reference → re-render (infinite loop)
- **Solution:** Move `.filter()`, `.map()` outside selectors into `useMemo` hooks
- **Pattern abuse:** Affects both direct Zustand selectors and higher-order hooks like `useShallow`

## Details

### The Anti-Pattern

```typescript
// ❌ BAD: Creates new array reference every call
const projects = useShallow((state) => state.projects.filter((p) => p.active));
```

Every call to the selector runs `.filter()`, creating a new array object. Even though the contents are identical, `Object.is(newArray, oldArray)` returns false, triggering a re-render. The re-render calls the selector again, which creates another new array, causing an infinite loop.

The error manifests during React's `commitHookPassiveMountEffects` phase, where passive effects (the re-render) thrash the DOM.

### The Correct Pattern

```typescript
// ✅ GOOD: Selector is stable; filtering happens in useMemo
const allProjects = useShallow((state) => state.projects);
const projects = useMemo(() => allProjects.filter((p) => p.active), [allProjects]);
```

The selector returns `state.projects` directly (a stable reference stored in Zustand). The `.filter()` happens inside `useMemo`, which only re-runs when `allProjects` changes. This breaks the re-render loop because the selector itself is now stable.

### Why This Happens

Zustand stores are external to React's component tree. When a component calls a selector, Zustand:

1. Runs the selector function
2. Compares the result to the previous result using `Object.is`
3. If they're different (by reference), triggers a re-render

For arrays and objects, `Object.is` checks reference equality, not deep equality. So:

```typescript
Object.is([1, 2, 3], [1, 2, 3]); // false - different objects
Object.is(arr, arr); // true - same reference
```

A selector that calls `.filter()` always creates a new array, so React always sees a "change" and re-renders.

### Related Anti-Pattern: `useShallow` with Filters

The anti-pattern extends to helper hooks:

```typescript
// ❌ BAD: useShallow + filter creates the same problem
const filtered = useShallow((state) => state.projects.filter((p) => p.active));
```

`useShallow` is a helper that does shallow equality checking on the returned object. It doesn't help here because it still returns a new array reference from `.filter()`, and the shallow equality check fails.

## Related Concepts

- [[concepts/react-performance-patterns]] - How to write performant React with external stores
- [[concepts/usememo-dependency-arrays]] - Proper use of `useMemo` to stabilize references
- [[concepts/effect-services-layers-pattern]] - Zustand stores as the data layer

## Sources

- [[daily/2026-04-12.md]] - "Debugged and fixed an infinite re-render loop in the Sidebar component caused by unstable Zustand selectors... root cause: `.filter()` inside Zustand selector created new array reference on every call"
- [[daily/2026-04-12.md]] - "Found the same anti-pattern in a second file (`_chat.index.tsx`)... Moved `.filter()` out of the selector into a `useMemo` hook to stabilize the reference"
- [[daily/2026-04-12.md]] - "Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking... When a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
