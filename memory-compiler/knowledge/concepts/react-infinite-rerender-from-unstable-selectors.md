---
title: "React Infinite Re-render Loops from Unstable Selectors"
aliases: [infinite-rerender, selector-loop, commit-phase-debugging]
tags: [react, debugging, state-management, performance]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Infinite Re-render Loops from Unstable Selectors

Unstable Zustand (or similar external store) selectors can create infinite re-render loops that are particularly difficult to debug because they occur during React's passive effect phase, outside normal render debugging tools. The pattern is: unstable selector → re-render → selector called again → new reference → re-render. The loop manifests as a crash with a cryptic stack trace mentioning `commitHookPassiveMountEffects`.

## Key Points

- **Invisible within render** - Infinite loops from external store selectors aren't visible in React DevTools because they occur during passive effects
- **Occurs at commit phase** - The loop happens during React's `commitHookPassiveMountEffects` phase, after render is complete
- **Store update triggers re-render** - `forceStoreRerender` or similar internal state mutations can trigger re-renders from within effects
- **Stack trace points to commit phase** - Errors mention `commitHookPassiveMountEffects`, `flushPassiveEffects`, or similar
- **Root cause: selector reference instability** - Selectors returning new references on every call cause store updates, triggering re-renders

## Details

### How the Loop Manifests

The sequence is:

1. Component renders and calls selector hook
2. Selector returns unstable reference (e.g., new array from `.filter()`)
3. External store detects change via `Object.is`
4. Store calls internal update mechanism (e.g., `forceStoreRerender`)
5. This update happens during passive effect phase (after render)
6. Re-render is scheduled
7. Component re-renders and calls selector again
8. Selector returns different reference (even if data is identical)
9. Store detects change and repeats step 4
10. Loop continues until browser runs out of memory

### Debugging Strategy

**Step 1: Identify the component**

- Check browser console for error message mentioning a component name or file
- Error typically shows `commitHookPassiveMountEffects` or similar
- File location in error often points to where the selector hook is called

**Step 2: Locate the selector**

- Find the component mentioned in the error
- Search for external store subscriptions (e.g., `useStore((state) => ...)`)
- Identify which selector is called

**Step 3: Check for unstable references**

- Look inside the selector for `.filter()`, `.map()`, `.reduce()`
- Check for object/array literal creation: `{}`, `[]`
- Any operation creating a new reference on every call is suspect

**Step 4: Verify the loop**

- Add a counter or console log in the selector
- Run and watch the counter increment infinitely
- Confirms the selector is called repeatedly

### Example: Sidebar Infinite Loop

The bug was in `Sidebar.tsx`:

```javascript
// ❌ BUGGY - .filter() creates new array on every call
const visibleProjects = useStore((state) => state.projects.filter((p) => !p.hidden));
```

Every render calls the selector, which calls `.filter()`, which creates a new array. Zustand detects the new reference, triggers a store update, which re-renders the component, which calls the selector again. Infinite loop.

**Fix:**

```javascript
// ✅ FIXED - useMemo stabilizes the reference
const visibleProjects = useMemo(() => store.projects.filter((p) => !p.hidden), [store.projects]);
```

Or move the filtering into the store as a computed property.

### Why This Pattern Is Dangerous

- **Occurs at a specific React phase** - Not during regular render, making it harder to spot
- **Only triggered under specific conditions** - May not appear in simple test cases, but triggers in complex UIs with many selectors
- **Cascading failures** - One unstable selector can crash an entire component tree
- **Root cause is subtle** - The problem is a single array method inside a selector, easy to miss in code review

## Related Concepts

- [[concepts/zustand-selector-reference-stability]] - Understanding selector equality
- [[concepts/react-commit-phase-debugging]] - Debugging tools for this class of errors

## Prevention Checklist

- [ ] Audit all external store selectors for array-creating methods
- [ ] Wrap array logic in `useMemo` hooks
- [ ] Run component in isolation to catch reference instability
- [ ] Use React DevTools Profiler to visualize render patterns (even if loop occurs at commit phase)
- [ ] Add console logs in selectors during development to catch repeated calls

## Sources

- [[daily/2026-04-12.md]] - "Traced the crash to `forceStoreRerender` → `updateStoreInstance` during React's passive effect phase"
- [[daily/2026-04-12.md]] - "When a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
- [[daily/2026-04-12.md]] - "This pattern creates infinite loops: selector → new array → force rerender → selector again"
- [[daily/2026-04-12.md]] - "The bug manifests during the specific React commit phase (`commitHookPassiveMountEffects`)"
