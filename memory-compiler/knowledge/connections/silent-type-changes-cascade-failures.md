---
title: "Connection: Silent Type/Reference Changes Cascade into Runtime Failures"
connects:
  - "concepts/null-undefined-type-coercion-bugs"
  - "concepts/zustand-selector-reference-stability"
  - "concepts/react-infinite-rerender-from-unstable-selectors"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-13
updated: 2026-04-13
---

# Connection: Silent Type/Reference Changes Cascade into Runtime Failures

## The Connection

Two distinct debugging sessions from 2026-04-12 revealed the same meta-pattern: invisible changes to values or references—ones that don't cause compile errors or obvious runtime exceptions—cascade into severe runtime failures. Null-to-undefined type coercion silently breaks filter conditions and selector equality. Array method calls in selectors silently create new references that trigger infinite re-render loops. Both are "silent" at the point of change but "loud" downstream.

## Key Insight

The dangerous property shared by both bugs is **invisibility at the source**:

- **Null→undefined coercion**: The conversion itself succeeds silently. No error, no warning. The bug only manifests when downstream code uses strict equality (`=== null`) or when state management detects a "change" between `null` and `undefined`.

- **Array method in selector**: The `.filter()` call returns correct data. No error. The bug only manifests when Zustand's `Object.is` check detects a new reference, triggering a re-render cascade.

In both cases, **the code at the point of change looks correct**. The failure is only visible at the point of consumption, often many layers away.

## Evidence

From the daily log:

1. **Null→undefined**: "null → undefined conversions silently break downstream type-sensitive code (filter conditions)" — the conversion was in `store.ts`/`types.ts`, but the crash was in `Sidebar.tsx`

2. **Selector instability**: "`.filter()` inside Zustand selector created new array reference on every call" — the selector looked correct, but the reference instability caused infinite loops detected only during React's passive effect phase

3. **Combined in one debugging session**: "Debugged React infinite re-render loop: `useSyncExternalStore` thrashing caused by `store.ts`/`types.ts`/`Sidebar.tsx` changes (null → undefined conversion broke project filters, `useShallow` + `.filter()` created reference instability)"

## Design Pattern: Defensive Equality

The common defense against both bugs:

```typescript
// For null/undefined: use loose equality
value != null; // catches both null and undefined

// For references: use useMemo to stabilize
const stable = useMemo(() => items.filter(predicate), [items, predicate]);

// For selectors: return primitives or stable references
useStore((state) => state.count); // primitive — always stable
```

The meta-rule: **at boundaries where equality matters (selectors, effect dependencies, memoization keys), ensure the value type and reference identity are stable**.

## Related Concepts

- [[concepts/null-undefined-type-coercion-bugs]] — Silent type conversion causing downstream failures
- [[concepts/zustand-selector-reference-stability]] — Silent reference changes causing re-render cascades
- [[concepts/react-infinite-rerender-from-unstable-selectors]] — The end result of unstable references
