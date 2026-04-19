---
title: "Zustand Selector Reference Stability and Object.is Equality"
aliases: [zustand-selectors, selector-stability, store-selector-optimization]
tags: [zustand, react, performance, state-management]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-13
---

# Zustand Selector Reference Stability and Object.is Equality

Zustand selectors use `Object.is` equality checking to determine whether a component should re-render. When a selector returns a new reference (even with identical data), Zustand detects the change and forces a re-render. This pattern is particularly dangerous inside selectors themselves: calling array-creating methods like `.filter()`, `.map()`, or `.reduce()` creates a new reference on every call, potentially triggering infinite re-render loops.

## Key Points

- **Zustand uses `Object.is` equality** - Selectors are checked for identity, not value equality
- **New array references trigger re-renders** - Even if the data is identical, a new array reference is detected as a change
- **Array methods create new references** - `.filter()`, `.map()`, `.reduce()` always return new arrays, violating selector stability
- **Infinite loops via unstable selectors** - Unstable selector → re-render → selector called again → new reference → re-render (infinite)
- **Solution: use `useMemo`** - Wrap array-creating logic in a hook instead of the selector

## Details

### How Zustand Uses Object.is

Zustand uses `useSyncExternalStore` internally, which compares selector outputs using `Object.is`. This means:

```javascript
Object.is([1, 2, 3], [1, 2, 3]); // false (different references)
Object.is([1, 2, 3], [1, 2, 3]); // false (new array created)
```

Unlike value-based equality (`deep-equal` or `JSON.stringify` comparisons), `Object.is` only returns true if the references are identical.

### The Anti-Pattern: Array Methods in Selectors

```javascript
// ❌ WRONG - creates new array on every call
const activeProjects = useStore((state) => state.projects.filter((p) => p.active));
```

Every time this selector runs, `.filter()` creates a new array, even if the results are identical. This triggers:

1. Selector returns new reference
2. Zustand detects change via `Object.is`
3. Component re-renders
4. During re-render, selector is called again (via hooks)
5. `.filter()` creates another new array
6. Infinite loop during React's passive effect phase

### The Solution: Stabilize with useMemo

```javascript
// ✅ CORRECT - memoize the array reference
const activeProjects = useMemo(() => store.projects.filter((p) => p.active), [store.projects]);
```

Or move the filtering into the store as a computed selector:

```javascript
// ✅ ALSO CORRECT - computed property in Zustand
const useStore = create((set, get) => ({
  projects: [],
  getActiveProjects: () => get().projects.filter((p) => p.active),
}));

const activeProjects = useStore((state) => state.getActiveProjects());
```

## Common Array Methods to Avoid in Selectors

- `.filter()` - Creates new array
- `.map()` - Creates new array
- `.reduce()` - Returns new value
- `.sort()` - Modifies array in-place; memoize the copy if needed
- `.concat()` - Creates new array
- `.slice()` - Creates new array

Safe selector operations:

- Accessing properties: `state.foo.bar`
- Primitive returns: `state.count > 0`
- Object literals created fresh: `{...state}` (considered safe because the reference instability happens before the store selector layer)

### The `useShallow` Trap

Zustand's `useShallow` wrapper performs shallow comparison instead of `Object.is`. However, combining `useShallow` with `.filter()` is a documented anti-pattern that still causes reference instability:

```javascript
// ❌ STILL WRONG - useShallow doesn't help with .filter()
const activeProjects = useStore(useShallow((state) => state.projects.filter((p) => p.active)));
```

`useShallow` compares the _output_ of the selector shallowly, but `.filter()` creates a new array every time. Even shallow comparison of two different array references returns "not equal" because the outer reference is new. The `useShallow` wrapper is designed for selecting multiple properties as an object (`{a: state.a, b: state.b}`), not for stabilizing derived arrays.

Additionally, combining `useShallow` + `.filter()` with `null → undefined` type coercion (from upstream data transformations) compounds the problem: the type change makes shallow comparison detect differences even when data is semantically identical.

## Debugging Infinite Re-render Loops

When encountering an infinite re-render loop with Zustand:

1. Check React DevTools Profiler - look for repeated render cycles from the same component
2. Search for `.filter()`, `.map()`, `.reduce()` inside Zustand selectors
3. Check if the selector is called with different parameters each time (dependencies issue)
4. Verify the selector is not triggering `forceStoreRerender` or similar forced updates
5. If found, wrap the array logic in `useMemo` with appropriate dependencies

## Related Concepts

- [[concepts/react-infinite-rerender-from-unstable-selectors]] - How this pattern manifests at runtime
- [[concepts/jsx-semantic-html-formatting-interaction]] - Unrelated but another category of React surprises

## Sources

- [[daily/2026-04-12.md]] - "Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking; when a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
- [[daily/2026-04-12.md]] - "Identified the root cause: `.filter()` inside Zustand selector created new array reference on every call"
- [[daily/2026-04-12.md]] - "Established a new rule: never call `.filter()`, `.map()`, `.reduce()` or other array-creating methods inside Zustand selectors"
