---
title: "Zustand Selector Stability Anti-Pattern"
aliases: [selector-stability, array-reference-equality, zustand-optimization]
tags: [react, state-management, zustand, performance]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Stability Anti-Pattern

Zustand selectors must return stable references—if a selector returns a new array or object each time, Zustand's equality check (Object.is) detects a change and forces a re-render, even if the data is identical. Calling `.filter()`, `.map()`, or `.reduce()` inside a selector creates a new reference on every call, causing infinite re-render loops when combined with React's effect hooks. This is a critical footgun for Zustand users that manifests as "hydration error" or infinite loops during React's commit phase.

## Key Points

- Zustand uses `useSyncExternalStore` with `Object.is` equality—checks reference identity, not deep equality
- Array-creating methods (`.filter()`, `.map()`, `.reduce()`) always return new array instances
- New reference → Zustand detects change → forces re-render → selector runs again → infinite loop
- Infinite loop manifests during React's passive effect commit phase (`commitHookPassiveMountEffects`)
- Solution: Move array operations out of selector into `useMemo` hook to memoize the result

## Details

### The Anti-Pattern

```typescript
// ❌ WRONG: creates new array every call
const items = useStore((state) => state.items.filter((i) => i.active));
```

On every call, `.filter()` returns a new array reference. Zustand sees:

```
prev === current? → false (different array reference)
```

So it forces a re-render. If that re-render calls the selector again (which effect hooks often do), we get:

```
selector → new array → re-render → selector again → new array → ...
```

Infinite loop.

### The Solution

**Option 1: Memoize with useMemo**

```typescript
const allItems = useStore((state) => state.items);
const activeItems = useMemo(() => allItems.filter((i) => i.active), [allItems]);
```

**Option 2: Pre-filter in the store**

```typescript
// Better: keep filtered state in Zustand
const activeItems = useStore((state) => state.activeItems); // already filtered
```

**Option 3: Compose selectors properly**

```typescript
const allItems = useStore((state) => state.items);
const filterActive = useStore((state) => state.filterActive);

const activeItems = useMemo(
  () => (filterActive ? allItems.filter((i) => i.active) : allItems),
  [allItems, filterActive],
);
```

### Similar Anti-Patterns

The same issue occurs with any operation that creates a new reference:

- `.map()` - Always returns new array
- `.reduce()` - Always returns new result
- `.concat()` - Always returns new array
- Object spreading `{...state}` - Always returns new object
- Array spreading `[...state.items]` - Always returns new array
- `Object.assign({}, state)` - Creates new object

Any operation that creates a new reference is dangerous in selectors because Zustand will see it as a change every time.

### Why This Happens

Zustand's design assumes selectors are cheap and pure—they compute a value from state without side effects. If a selector isn't pure (creates new references), Zustand's optimization breaks down. This is intentional—forcing users to think about reference stability prevents accidental performance cliffs and infinite loops.

## Related Concepts

- [[concepts/react-hydration-mismatch-from-jsx-formatting]] - Another reference stability issue in React
- [[concepts/html-colgroup-text-node-constraints]] - Different but related reference stability problem

## Sources

- [[daily/2026-04-12.md]] - "Debugged and fixed an infinite re-render loop in the Sidebar component caused by unstable Zustand selectors"
- [[daily/2026-04-12.md]] - "Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking; when a selector returns a different reference, React forces a re-render"
- [[daily/2026-04-12.md]] - "The pattern creates infinite loops: selector → new array → force rerender → selector again"
