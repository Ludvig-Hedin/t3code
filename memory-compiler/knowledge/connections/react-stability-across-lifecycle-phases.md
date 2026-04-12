---
title: "Connection: React Stability Across Lifecycle Phases"
connects:
  - "concepts/react-hydration-whitespace-text-nodes"
  - "concepts/zustand-selector-stability"
  - "concepts/react-commit-phase-debugging"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: React Stability Across Lifecycle Phases

## The Connection

React's component lifecycle has distinct phases (render, layout, passive effect), and different classes of bugs manifest in different phases. **Hydration errors** occur when server and client produce different trees (pre-commit phase). **Zustand selector instability** manifests as infinite loops during the passive effect phase. **Commit phase debugging** is the diagnostic practice of understanding where errors occur and why. Together, these concepts reveal a pattern: React stability requires understanding the entire lifecycle, not just the render phase.

## Key Insight

Developers often think of React as "render → display." But the full lifecycle is:

1. **Render phase** - Component functions run, JSX → fibers (pure, repeatable)
2. **Commit phase** - DOM is mutated, layout effects run
3. **Passive phase** - Effects run, state subscriptions fire (where bugs cascade)

A component can:

- Render correctly but **hydration-mismatch** between server and client (phase 1 issue)
- Render correctly but create **unstable references** in selectors (phase 3 issue discovered in phase 3)
- Render correctly but **infinite-loop** due to subscriptions firing (phase 3 issue)

The same component's code passes render-phase analysis but fails in a later phase. Understanding which phase an error occurs in is the **first step** in debugging it.

## Evidence

From the daily log:

1. **Hydration phase (pre-commit):** `<colgroup>` whitespace text nodes cause server ≠ client mismatch — caught before React even interacts
2. **Passive phase (after DOM commit):** Zustand selector → new reference → subscription → re-render → loop
3. **Debugging approach:** Stack traces show `commitHookPassiveMountEffects` indicating phase 3; fixes target references and memoization

The conversation reveals three distinct React problems solved with different techniques:

- **Hydration**: Remove text nodes from strict containers
- **Selector stability**: Wrap array operations in `useMemo`
- **Commit phase understanding**: Recognize call stacks and trace cascading updates

## Design Implications

For sustainable React code:

1. **Think in phases** - Ask "at which phase does this error occur?" not just "is my logic right?"
2. **Stabilize references** - Selectors, effects, dependencies should return the same reference when data is unchanged
3. **Test after re-render** - Infinite loops are often invisible until the app runs; they show up in "why is DevTools so slow?"
4. **Use React DevTools Profiler** - Identify which components are re-rendering excessively (symptom of phase 3 bugs)

## Related Concepts

- [[concepts/react-hydration-whitespace-text-nodes]] - Phase 1-2 issue: server/client tree mismatch
- [[concepts/zustand-selector-stability]] - Phase 3 issue: subscription instability
- [[concepts/react-commit-phase-debugging]] - Diagnostic framework for understanding lifecycle errors
