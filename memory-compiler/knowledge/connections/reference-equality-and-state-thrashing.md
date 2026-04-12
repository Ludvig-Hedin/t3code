---
title: "Connection: Reference Equality, State Stability, and Component Thrashing"
connects:
  - "concepts/react-hydration-semantic-html"
  - "concepts/zustand-selector-stability"
  - "concepts/process-serialization-piggyback"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Reference Equality, State Stability, and Component Thrashing

Three seemingly unrelated debugging problems from this session share a common theme: reference equality determines whether repeated evaluations trigger work (re-renders, lock contention, serialization). In React components, Zustand's `Object.is` equality checking means unstable selectors cause infinite re-renders. In process spawning, reference equality in lock promises serializes concurrent callers. In HTML rendering, text node presence changes the DOM tree shape. All three boil down to: **"does this repeated evaluation return the same reference, or a new one?"**

## The Connection

Reference equality is a surprisingly pervasive constraint across different layers:

1. **React selectors** - Zustand uses reference equality; new array reference → new render
2. **Promise locks** - Serialization relies on holding a reference; releasing it signals "try again"
3. **HTML semantic content** - Whitespace/comments create new text nodes; different tree shape → hydration error
4. **Component lifecycle** - React's `useSyncExternalStore` itself depends on reference equality to know when to commit

## Key Insight

Developers often think of these problems separately:

- "My component keeps re-rendering" → blame state mutation
- "Multiple Ollama processes spawned" → blame async timing
- "Hydration error on the colgroup" → blame JSX formatting

But they all reflect the same underlying principle: **reference stability determines whether repeated evaluation triggers side effects.**

The fix pattern is also consistent:

- **Zustand:** Stabilize references with `useMemo`
- **Processes:** Stabilize serialization with a promise lock
- **HTML:** Stabilize tree shape by removing implicit text nodes

## Evidence

From the daily log:

1. **Zustand:** "Selector → new array → force rerender → selector again" — unstable reference causes loop
2. **Ollama:** "Introduction module-level `ensureOllamaPromise` as serialization lock" — lock reference prevents concurrent spawning
3. **Colgroup:** "Inline comments... combined with newline formatting created implicit text nodes" — different reference (text node vs no text node) breaks hydration

## Design Implications

When debugging thrashing, looping, or duplicate work:

1. Ask: "Is a new reference being created each iteration?"
2. Look for: `.filter()`, `.map()`, new objects, implicit DOM nodes, unserialized async
3. Fix: Stabilize references via memoization, serialization, or structural cleanup

This is a meta-pattern that transcends React, process management, and HTML semantics—it's fundamental to how computers detect "has this changed?"

## Related Concepts

- [[concepts/zustand-selector-stability]] - Reference equality in state selectors
- [[concepts/react-hydration-semantic-html]] - Reference equality in DOM structure
- [[concepts/process-serialization-piggyback]] - Reference equality in lock semantics
