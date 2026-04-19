---
title: "Null-to-Undefined Type Coercion Bugs in TypeScript"
aliases: [null-undefined, type-coercion, silent-type-conversion]
tags: [typescript, debugging, type-safety, state-management]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-13
updated: 2026-04-13
---

# Null-to-Undefined Type Coercion Bugs in TypeScript

When TypeScript code converts `null` values to `undefined` (or vice versa), downstream type-sensitive operations silently break. Filter conditions, equality checks, and optional chaining all behave differently for `null` vs `undefined`. This class of bug is particularly insidious because the code appears correct—values are "falsy" in both cases—but strict comparisons (`=== null`, `=== undefined`) and type guards diverge.

## Key Points

- **`null` and `undefined` are distinct types** — `null === undefined` is false; type guards and strict comparisons treat them differently
- **Conversion is silent** — assigning `undefined` where `null` was expected produces no TypeScript error in many configurations
- **Downstream filters break** — `filter(x => x !== null)` passes `undefined` values through, corrupting results
- **State management amplifies the bug** — Zustand/Redux selectors propagating `undefined` instead of `null` can trigger re-render cascades
- **`exactOptionalPropertyTypes` helps** — TypeScript strict flag that distinguishes between "property is missing" and "property is undefined"

## Details

### The Core Problem

```typescript
// Original code: uses null to indicate "no value"
interface Project {
  name: string;
  lastOpened: Date | null;
}

// Refactored code: accidentally converts to undefined
function mapProject(raw: RawProject): Project {
  return {
    name: raw.name,
    lastOpened: raw.lastOpened || undefined, // ❌ null → undefined
  };
}
```

Downstream code checking for `null` now misses these values:

```typescript
// This filter no longer catches undefined values
const openedProjects = projects.filter((p) => p.lastOpened !== null);
// undefined values slip through ↑
```

### Why This Causes Cascading Failures

In state management (Zustand, Redux), `null` → `undefined` conversion can trigger:

1. **Selector reference instability** — `null !== undefined`, so selectors detect a "change" even when the semantic value hasn't changed
2. **Re-render cascades** — detected "change" forces re-render, which re-runs the conversion, which "changes" again
3. **Filter corruption** — `!== null` checks let `undefined` through, leading to runtime errors when accessing properties on `undefined`

### Diagnosis

When debugging unexpected filter results or state management loops:

1. Check recent changes that touch data transformation or mapping functions
2. Search for `|| undefined`, `?? undefined`, or destructuring with default values
3. Verify that downstream code uses `!= null` (loose equality, catches both) or explicit checks for both
4. Enable `exactOptionalPropertyTypes` in `tsconfig.json` to surface conversion issues at compile time

### Prevention Strategies

**Use `!= null` (loose equality) for "no value" checks:**

```typescript
// ✅ Catches both null AND undefined
const hasValue = projects.filter((p) => p.lastOpened != null);
```

**Be explicit about null vs undefined semantics:**

```typescript
// ✅ Document which "empty" value is expected
interface Project {
  name: string;
  lastOpened: Date | null; // null means "never opened", not undefined
}
```

**Enable strictness flags:**

```json
{
  "compilerOptions": {
    "strictNullChecks": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Note: `strictNullChecks` is the flag that catches undefined-to-null issues in union types (`property: Type | null`). `exactOptionalPropertyTypes` specifically applies to optional properties (`property?: Type`), ensuring that you cannot assign `undefined` to a property if it wasn't explicitly defined as `| undefined`. Both are recommended for robust state.

## Related Concepts

- [[concepts/zustand-selector-reference-stability]] — Null→undefined conversion can trigger selector instability
- [[concepts/react-infinite-rerender-from-unstable-selectors]] — Cascading re-renders from silent type changes

## Sources

- [[daily/2026-04-12.md]] — "null → undefined conversion broke project filters, `useShallow` + `.filter()` created reference instability"
- [[daily/2026-04-12.md]] — "null → undefined conversions silently break downstream type-sensitive code (filter conditions)"
- [[daily/2026-04-12.md]] — "Reverted `store.ts`, `types.ts`, `Sidebar.tsx` to eliminate store loop"
