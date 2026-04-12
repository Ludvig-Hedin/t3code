---
title: "React Commit Phase Debugging and Passive Effect Errors"
aliases: [commit-phase-debugging, passive-effect-phase, react-lifecycle-errors]
tags: [react, debugging, performance, diagnostics]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Commit Phase Debugging and Passive Effect Errors

Some React errors occur specifically during the passive effect commit phase (`commitHookPassiveMountEffects`), not during render or layout phase. These errors are triggered by the interaction between subscriptions, state updates, and re-renders that happen after React has already committed the DOM. Understanding which phase an error occurs in and how to trace the call stack is critical for debugging subtle state management issues.

## Key Points

- **Passive effect phase** runs after DOM commit, executing all `useEffect` callbacks and state subscription updates
- Errors in this phase often involve state store subscribers (Zustand, Redux, Context) triggering unexpected re-renders
- Call stack will show `commitHookPassiveMountEffects` when tracing through browser DevTools
- The error is often **not** in the effect itself, but in how the effect's side effects (store updates) cascade into re-renders
- Infinite loops in passive phase appear to hang the app because effects keep firing effects

## Details

### The Passive Effect Phase

React's commit lifecycle has three main phases:

1. **Render Phase** - Component functions run, JSX is converted to fiber tree (pure, may run multiple times)
2. **Layout Phase** (`commitBeforeMutationEffects`) - DOM is actually updated; synchronous effects like `useLayoutEffect` run
3. **Passive Phase** (`commitHookPassiveMountEffects`) - After DOM is stable, async effects run; state subscriptions fire

Most errors happen in render or layout. **Passive phase errors are usually cascading issues**: the effect does something that triggers a subscription, which forces a re-render, which re-runs the effect.

### Identifying Passive Phase Errors

When the browser console or debugger shows a stack trace like:

```
at commitHookPassiveMountEffects
at commitMutationEffects
at commitRootImpl
```

The error is happening **after** React has already painted the screen. Common causes:

- **Zustand selector instability** - Selector returns new reference → subscription fires → forces re-render → selector again (infinite loop)
- **State update in effect** - Effect updates state, which causes component to re-render, which re-runs effect
- **External store sync** - Effect syncs to external store, store updates trigger component re-render

### Debugging Strategy

1. **Identify the phase** - Look at the call stack; does it contain `commitHookPassiveMountEffects`?
2. **Find the subscription** - Search the error context for state subscriptions or store callbacks
3. **Trace the cascade** - What does the effect do? Does it cause a state update or store notification?
4. **Break the cycle** - Use `useMemo`, memoization, or dependency arrays to stabilize references and prevent re-triggering

### Example: Infinite Zustand Loop

```javascript
// ❌ Problem code
function Sidebar() {
  // Selector creates new array every render
  const projects = useProjectStore((state) => state.projects.filter((p) => p.visible));

  // Effect depends on projects
  useEffect(() => {
    console.log("projects changed:", projects);
  }, [projects]);
}
```

Call stack during infinite loop would show:

```
useEffect → (effect runs, projects changed)
→ Component re-renders
→ Selector runs again (new array)
→ useEffect dependency changes
→ (effect runs again)
→ commitHookPassiveMountEffects (error happens here or loop detected here)
```

### Debugging with React DevTools Profiler

The React Profiler (in Chrome DevTools) shows which components are re-rendering:

1. Open DevTools → Components tab → Profiler
2. Record a few seconds of interaction
3. Look for components re-rendering rapidly (yellow/orange flame)
4. Expand the flame to see why it re-rendered ("use selector changed" → look at the selector)

### Related Patterns

**useCallback with stable dependencies:**

```typescript
// ✅ Correct: Memoize to stabilize reference
const visibleProjects = useMemo(() => projects.filter((p) => p.visible), [projects]);

useEffect(() => {
  console.log("visible projects:", visibleProjects);
}, [visibleProjects]);
```

**useSyncExternalStore with proper equality:**

```typescript
// ✅ Zustand selector with memoization
const projects = useProjectStore(
  (state) => state.projects,
  (a, b) => a.length === b.length, // Custom equality
);
```

## Related Concepts

- [[concepts/zustand-selector-stability]] - Specific instance of passive phase problems
- [[concepts/react-hydration-whitespace-text-nodes]] - Different type of React error (hydration mismatch)

## Sources

- [[daily/2026-04-12.md]] - "Traced the crash to `forceStoreRerender` → `updateStoreInstance` during React's passive effect phase"
- [[daily/2026-04-12.md]] - "When a selector returns a different reference (even with identical data), React forces a re-render during the passive effect commit phase"
- [[daily/2026-04-12.md]] - "The bug manifests during the specific React commit phase (`commitHookPassiveMountEffects`)"
