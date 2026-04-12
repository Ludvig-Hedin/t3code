---
title: "Zustand Selector Stability and Memory Reference Equality"
aliases: [selector-stability, memory-references, useSyncExternalStore-equality, infinite-rerenders]
tags: [react-hooks, state-management, performance-optimization]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Stability and Memory Reference Equality

Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking for selector results. When a selector creates new array or object references on every call—even with identical data—React treats it as a new value and forces a re-render. Patterns like `.filter()`, `.map()`, or `.reduce()` inside selectors are particularly problematic, as they create new arrays on each invocation, causing infinite re-render loops during React's passive effect phase.

## Key Points

- **Zustand equality is reference-based** - Uses `Object.is`, not deep equality; `[1,2,3] !== [1,2,3]` (different references)
- **Array methods create new references** - `.filter()`, `.map()`, `.reduce()` return new arrays every time, breaking memoization
- **Infinite loop mechanism** - New selector result → force re-render → selector called again → new result → loop
- **Anti-pattern: filtering in selector** - Selectors should be stable functions; filtering logic belongs in `useMemo` hooks
- **React commit phase detection** - Infinite loops manifest during `commitHookPassiveMountEffects` phase, often noticed as app crash

## Details

Zustand internally uses `useSyncExternalStore` to subscribe to store changes. This hook uses `Object.is` to compare the selector's return value before and after each store update. If the comparison returns `false` (different objects), React schedules a re-render.

The problem emerges when selectors perform array operations:

```typescript
// ANTI-PATTERN: selector creates new array every call
const selectedProjects = useShallow(store) =>
  store.projects.filter(p => p.active)
);

// Every time the selector runs, .filter() returns a NEW array
// Object.is([...], [...]) === false, even with identical data
// This forces a re-render, which triggers the selector again → loop
```

### Correct Pattern: Memoize Outside Selector

```typescript
// CORRECT: selector returns store data, filtering is memoized
const projects = useShallow((store) => ({
  all: store.projects,
  active: store.projects,
}));

const active = useMemo(() => projects.all.filter((p) => p.active), [projects.all]);
```

Alternatively, if you use `useShallow` (which compares each property shallowly):

```typescript
// CORRECT: stable selector, no array operations
const activeProjects = useShallow(
  (store) => store.projects.filter((p) => p.active),
  // But this creates infinite loop - so don't do this!
);

// Instead, use separate stable selectors
const allProjects = useShallow((store) => store.projects);
const active = useMemo(() => allProjects.filter((p) => p.active), [allProjects]);
```

### Performance Note on `useShallow`

`useShallow` is a Zustand helper that uses shallow equality (`==`) instead of strict (`===`) on object properties. It's useful for objects but should not be combined with array-creating methods inside the selector.

## Related Concepts

- [[concepts/react-hydration-mismatches-html-containers]] - Both cause re-render issues during different React phases
- [[concepts/concurrent-process-serialization]] - Both involve understanding React's internal commit phases

## Sources

- [[daily/2026-04-12.md]] - "Identified root cause: `.filter()` inside Zustand selector created new array reference on every call"
- [[daily/2026-04-12.md]] - "When a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
- [[daily/2026-04-12.md]] - "Moved `.filter()` out of the selector into a `useMemo` hook to stabilize the reference"
