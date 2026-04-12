---
title: "Zustand Selector Stability and Array Reference Anti-Patterns"
aliases: [selector-stability, array-references-in-selectors, zustand-anti-patterns]
tags: [state-management, react, zustand, performance]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Stability and Array Reference Anti-Patterns

Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking. When a selector returns a different reference (even if the data is identical), React treats it as a new value and forces a re-render. Creating new array references inside selectors (via `.filter()`, `.map()`, `.reduce()`) causes the selector to return a different reference on every call, triggering infinite re-render loops during React's passive effect phase.

## Key Points

- Zustand selectors use `Object.is` equality—new array reference = different value, even with identical data
- Never call `.filter()`, `.map()`, `.reduce()` or other array-creating methods inside the selector function
- Array operations inside selectors cause infinite loops: selector → new reference → force rerender → selector again
- The loop manifests during `commitHookPassiveMountEffects` (React's passive effect commit phase)
- Fix: move array operations into `useMemo` to stabilize the reference across renders

## Details

### The Anti-Pattern

```typescript
// ❌ WRONG: Creating new array on every selector call
const projects = useProjectStore((state) => state.projects.filter((p) => p.visible));
```

Each call to the selector runs `.filter()` again, creating a new array reference. Zustand compares:

- Previous render: `[project1, project2]` (array A)
- Current render: `[project1, project2]` (array B, same data but different reference)

Because `Object.is(arrayA, arrayB)` returns `false`, React triggers a re-render.

### Why It Creates Infinite Loops

1. Selector returns new array reference → React re-renders
2. During passive effect phase (`commitHookPassiveMountEffects`), Zustand's subscriber runs
3. Subscriber calls selector again → new array reference again
4. `Object.is` check fails → triggers another re-render
5. Back to step 2 (infinite loop)

### The Fix: Stabilize References with `useMemo`

```typescript
// ✅ CORRECT: Memoize the filtered array
const visibleProjects = useProjectStore((state) => state.projects);
const filtered = useMemo(() => visibleProjects.filter((p) => p.visible), [visibleProjects]);
```

Now the reference is stable between renders (assuming `visibleProjects` itself is stable). Zustand compares:

- Previous render: `array1` (memoized, stable reference)
- Current render: `array1` (same memoized reference)

`Object.is(array1, array1)` returns `true`, no unnecessary re-render.

### Understanding the Equality Check

Zustand's selector pattern:

```typescript
const state = useProjectStore((state) => state.projects.filter(...));
                              // └─ selector function
//                               └─ must return stable reference for React to skip re-render
```

The selector is called on every store update. If it returns a different reference, React assumes the derived data changed and re-renders. The `useMemo` approach ensures the reference only changes if the dependency actually changed.

### Multi-File Pattern Validation

The same anti-pattern can appear across multiple files. In the Bird Code codebase, both `Sidebar.tsx` and `_chat.index.tsx` had this bug. Fixing one requires fixing all—search the codebase for similar patterns:

```bash
grep -r "\.filter\|\.map\|\.reduce" src --include="*.tsx" | grep "useState\|useStore"
```

## Related Concepts

- [[concepts/react-commit-phase-debugging]] - Infinite loops manifest in specific React commit phases
- [[concepts/react-hydration-whitespace-text-nodes]] - Both cause hydration/render mismatches in different ways

## Sources

- [[daily/2026-04-12.md]] - "Fixed infinite re-render loop in Sidebar caused by unstable Zustand selectors"
- [[daily/2026-04-12.md]] - "Moved `.filter()` out of the selector into a `useMemo` hook to stabilize the reference"
- [[daily/2026-04-12.md]] - "Zustand uses `useSyncExternalStore` internally with `Object.is` equality checking"
- [[daily/2026-04-12.md]] - "When a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
- [[daily/2026-04-12.md]] - "Found the same anti-pattern in a second file (`_chat.index.tsx`)"
