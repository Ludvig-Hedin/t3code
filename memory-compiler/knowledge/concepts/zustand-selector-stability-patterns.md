---
title: "Zustand Selector Stability and Array Reference Memoization"
aliases: [zustand-selector, selector-stability, array-memoization]
tags: [react, zustand, performance, state-management]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Zustand Selector Stability and Array Reference Memoization

Zustand selectors must return stable references for objects and arrays to avoid triggering unnecessary re-renders. When a selector calls `.filter()`, `.map()`, or other array-creating methods inline, it returns a new array reference on every invocation, causing React to treat it as a different value and force re-renders. This pattern can create infinite re-render loops during React's passive effect commit phase.

## Key Points

- **Selector equality checking uses Object.is** - Zustand compares consecutive selector outputs with strict equality
- **New array reference = forced re-render** - `.filter()` and `.map()` inside selectors create new arrays on each call
- **Infinite re-render loop risk** - Selector → new array → force rerender → selector again → infinite cycle
- **Moves array operations to useMemo** - Memoize the filtered/mapped result outside the selector
- **Pattern applies to all array transformations** - `.filter()`, `.map()`, `.reduce()`, any array-creating method

## Details

Zustand uses `useSyncExternalStore` internally to check for selector output changes. The equality check is `Object.is`, meaning it compares references for objects and arrays:

```javascript
// ❌ WRONG: Creates new array reference on every call
const selected = useStore((state) => state.items.filter((item) => item.active));
// Each call returns a different array, even if contents are identical
// → React forces re-render → selector called again → infinite loop
```

This manifests during React's commit phase (`commitHookPassiveMountEffects`), when passive effects run. The new array reference triggers a re-render, which runs effects again, which selects again, creating a cycle.

The fix is to move array operations into a `useMemo` hook, stabilizing the reference:

```typescript
// ✅ CORRECT: Memoized array prevents reference churn
const selected = useMemo(() => items.filter((item) => item.active), [items]);
```

Now the array reference is stable (same array object) as long as dependencies haven't changed. Zustand's selector sees the stable reference and doesn't force unnecessary re-renders.

### Identifying the Anti-Pattern

The bug manifests as:

1. Component renders
2. Hook fire, selector called
3. Component re-renders due to new array reference
4. Passive effects run, selector called again
5. Cycle repeats, browser becomes unresponsive

Stack traces typically show: `commitHookPassiveMountEffects` → `updateEffectImpl` → hook execution → selector call.

To find these bugs in a codebase, search for:

- `useStore((state) => state.*.filter(`
- `useStore((state) => state.*.map(`
- Any array-transformation method inside a selector function

## Related Concepts

- [[concepts/react-hydration-errors-html-constraints]] - Another category of render-stability bugs
- [[concepts/react-performance-debugging]] - General debugging patterns for React performance

## Sources

- [[daily/2026-04-12.md]] - Debugged infinite re-render in Sidebar.tsx caused by unstable Zustand selectors
- [[daily/2026-04-12.md]] - Root cause: `.filter()` inside selector created new array reference on every call
- [[daily/2026-04-12.md]] - Same pattern found in `_chat.index.tsx`; established rule: never call array methods inside selectors
