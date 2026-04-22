---
title: "React 18 setState Updater Timing Trap"
aliases: [setState-timing, updater-function-async, react-state-ref-trap]
tags: [react, state-management, debugging, concurrency]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# React 18 setState Updater Timing Trap

In React 18, the updater function passed to `setState(fn)` runs during reconciliation, NOT synchronously in the same call frame. Code that sets a ref inside an updater and reads it immediately after `setState` returns will always see the stale pre-call value. This is a subtle but critical distinction from class component `setState` callbacks and causes silent failures in patterns that try to extract values from state transitions.

## Key Points

- **Updater runs during reconciliation, not synchronously** — `setState(fn => { ref.current = x; return newState; })` does NOT set `ref.current` before `setState` returns
- **Reading refs after setState always stale** — `lastDequeuedRef.current` is always `null` when checked immediately after `setQueue(updaterFn)`
- **Common anti-pattern** — Write inside updater + read outside: `setX(fn => { ref.current = value; return newState; }); return ref.current;` ← always stale
- **Correct pattern: mirror state with a ref** — maintain `queueRef.current = queue` on every render, read from the ref for synchronous access
- **Identity guard prevents double-dequeue** — functional updaters can run multiple times; guard with `if (queue.length === 0) return queue` to prevent double-processing

## Details

### The Anti-Pattern

The "Send Now" button for queued messages in a chat application was broken across all providers. The dequeue function attempted to extract the dequeued message text from inside a state updater:

```typescript
// ❌ BROKEN: ref set inside updater is not visible after setState returns
function dequeue(): string | null {
  let dequeuedText: string | null = null;
  setQueue((prev) => {
    if (prev.length === 0) return prev;
    dequeuedText = prev[0].text; // Set during reconciliation...
    return prev.slice(1);
  });
  return dequeuedText; // ← Always null! Updater hasn't run yet.
}
```

In React 18's concurrent features, `setState` batches and defers updater execution. The updater function is called later during the reconciliation phase, not in the same synchronous execution context as the `setState` call. By the time the calling code reads `dequeuedText`, the updater hasn't executed yet.

### The Correct Pattern

Use a ref that mirrors committed state for synchronous reads:

```typescript
// ✅ CORRECT: mirror state in a ref for synchronous access
const [queue, setQueue] = useState<QueuedMessage[]>([]);
const queueRef = useRef<QueuedMessage[]>([]);

// Keep ref in sync with committed state
useEffect(() => {
  queueRef.current = queue;
}, [queue]);

function dequeue(): string | null {
  // Read synchronously from the ref (always has last committed state)
  const current = queueRef.current;
  if (current.length === 0) return null;
  const text = current[0].text;

  // Schedule state update (runs during reconciliation)
  setQueue((prev) => {
    if (prev.length === 0) return prev; // Identity guard
    return prev.slice(1);
  });

  return text; // ← Correct! Read from ref, not from updater
}
```

### Why This Differs from Class Components

In class components, `setState` had a callback form (`this.setState(updater, callback)`) where the callback ran after state was committed. React 18 functional components have no equivalent synchronous guarantee. The updater function is part of the transition system and may be:

- Deferred to a later microtask
- Batched with other state updates
- Replayed during concurrent rendering

This means any side effects inside the updater (like setting refs or calling external functions) have unpredictable timing relative to the code that follows the `setState` call.

### Identity Guard for Double-Dequeue Prevention

React may call the updater function multiple times during concurrent rendering (StrictMode doubles calls in development). Without a guard, the same message could be dequeued twice:

```typescript
setQueue((prev) => {
  if (prev.length === 0) return prev; // ← Identity guard: already empty
  return prev.slice(1);
});
```

Returning the same reference (`return prev`) tells React no state change occurred, preventing unnecessary re-renders and duplicate operations.

### Impact on Both Manual and Auto-Send Paths

The bug affected both user-triggered "Send Now" and the auto-send effect (which fires after AI finishes a turn). Both paths called `dequeue()` and expected a text value back. Because `dequeue()` always returned `null`, neither path ever sent the queued message — the button appeared non-functional.

## Related Concepts

- [[concepts/zustand-selector-reference-stability]] — Another React state timing subtlety where reference equality causes unexpected behavior
- [[concepts/react-infinite-rerender-from-unstable-selectors]] — Related category: state management timing bugs that silently fail
- [[concepts/react-commit-phase-debugging]] — Understanding React's lifecycle phases is prerequisite for diagnosing this class of bug

## Sources

- [[daily/2026-04-20.md]] — "Root cause identified as React 18 state updater timing trap: `dequeue()` used `setQueue(updaterFn)` and tried to read a ref set inside the updater, but React 18 runs updater functions asynchronously during reconciliation"
- [[daily/2026-04-20.md]] — "Pattern to avoid: `setX(fn => { ref.current = value; return newState; }); return ref.current; // ← always stale`"
- [[daily/2026-04-20.md]] — "Fix approach: Use a `queueRef` that mirrors committed queue state for synchronous reads, plus a functional updater with an identity guard to prevent double-dequeue race conditions"
