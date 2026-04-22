---
title: "Pending Action Store Coordination: Deferred Cross-Component Triggers"
aliases: [pending-selection, deferred-action, store-coordination, onReady-pattern]
tags: [ui-pattern, state-management, editor, react]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Pending Action Store Coordination: Deferred Cross-Component Triggers

When component A needs to trigger an imperative action in component B (e.g., jump to a specific line in an editor) but B is not yet mounted or is still loading async data, direct event dispatch or prop-passing is unreliable. The pending action pattern stores the desired action in shared state; B reads and consumes it once it's ready via an `onReady` callback. This decouples the trigger timing from the target's readiness, without prop drilling or complex event systems.

## Key Points

- **Store as rendezvous point** — component A writes `pendingSelection`; component B reads and clears it in its `onReady`/`onMount` callback
- **Consume-once semantics** — B calls `consumePendingSelection()` immediately after reading, resetting it to `null` to prevent double-triggering on remounts
- **Async-safe** — the pending action persists in the store until B is ready, regardless of how long loading takes
- **No direct component coupling** — A does not hold a ref to B; they communicate only through the shared store
- **Generalizes broadly** — works for jump-to-line, scroll-to-element, focus-an-input, or any deferred imperative action on an async component

## Details

### The Problem Without This Pattern

A content search returns results; the user clicks a match at line 42 of `foo.ts`. The editor needs to:

1. Open `foo.ts` (async: RPC for file contents)
2. Mount CodeMirror (async: dynamic language import)
3. Jump to line 42

By the time CodeMirror signals `onReady`, the click handler that had the line number has long since returned. Passing `line=42` as a prop would require threading it through multiple component layers, and must be re-passed if the editor remounts.

### The Pattern

```typescript
// Store slice
interface FilesPanelStore {
  pendingSelection: { line: number; col?: number } | null;

  openFile: (path: string, selection?: { line: number; col?: number }) => void;
  consumePendingSelection: () => { line: number; col?: number } | null;
}

// Store implementation
openFile: (path, selection) => set({
  selectedFile: path,
  pendingSelection: selection ?? null,
}),

consumePendingSelection: () => {
  const sel = get().pendingSelection;
  set({ pendingSelection: null }); // Reset immediately — always
  return sel;
},
```

```typescript
// Component A: content search results
function SearchHit({ path, line }: { path: string; line: number }) {
  const { openFile } = useFilesPanelStore();
  return (
    <button onClick={() => openFile(path, { line })}>
      {path}:{line}
    </button>
  );
}

// Component B: CodeMirror file editor
function FileEditorPane({ path }: { path: string }) {
  const { consumePendingSelection } = useFilesPanelStore();

  const handleEditorReady = useCallback((view: EditorView) => {
    const selection = consumePendingSelection();
    if (selection) {
      const pos = view.state.doc.line(selection.line).from;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    }
  }, [consumePendingSelection]);

  return <CodeMirrorEditor onReady={handleEditorReady} />;
}
```

### Consume-Once is Critical

`consumePendingSelection()` must reset store state immediately, even if the returned value ends up unused:

```typescript
consumePendingSelection: () => {
  const sel = get().pendingSelection;
  set({ pendingSelection: null }); // Reset ALWAYS, not only when sel !== null
  return sel;
},
```

Without the unconditional reset:

- The editor jumps to the same line on every remount (e.g., switching tabs and back)
- Every file switch triggers the last search selection again
- Every `onReady` call reapplies a stale action

### When to Use This Pattern

Use when:

- Target component loads asynchronously before it can receive the trigger
- The action is **imperative** (scroll, focus, cursor position) rather than declarative
- Multiple sources may trigger the same target component

Don't use when:

- Components render synchronously and props suffice
- The action is declarative (pass as a controlled prop)

## Related Concepts

- [[concepts/lazy-file-tree-rpc-expansion]] — The file tree that writes pending selections when the user clicks a search result
- [[concepts/react18-setstate-updater-timing-trap]] — Related problem: trying to read state synchronously after async state updates
- [[concepts/zustand-selector-reference-stability]] — Store state management context relevant to this coordination pattern

## Sources

- [[daily/2026-04-20.md]] — "Wired content-search 'jump to line' via `pendingSelection` in the store + `applyEditorSelection` in CodeMirror"
- [[daily/2026-04-20.md]] — "Content search hits need coordinated store state (`pendingSelection`) consumed after editor load to position cursor correctly"
- [[daily/2026-04-20.md]] — "Content search jump-to-line requires a two-step pattern: store a `pendingSelection`, then consume it in the editor's `onReady` callback"
