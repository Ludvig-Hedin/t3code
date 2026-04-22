---
title: "Lazy Directory Tree Expansion via RPC"
aliases: [lazy-tree, lazy-file-explorer, on-demand-directory-loading]
tags: [ui-pattern, file-explorer, rpc, performance]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Lazy Directory Tree Expansion via RPC

File explorer UIs that load the entire directory tree on mount become slow for large repos. The lazy expansion pattern loads only the immediate children of a directory when the user clicks to expand it, via an RPC call. The UI stores expanded state and loaded children per-directory, enabling incremental disclosure without upfront cost. Binary files are guarded at the editor layer to prevent loading non-text content into the editor.

## Key Points

- **Per-directory RPC on expand** — children are fetched only when a directory node is expanded, not at tree mount
- **Expanded state in store** — track which directories are expanded independently of which have loaded children (two separate data structures)
- **Loaded children cache** — once a directory's children are loaded, cache them in the store to avoid re-fetching on collapse/expand cycles
- **Binary file guard** — check file extension before opening in the editor; show a placeholder for binary files instead of corrupted text
- **Lazy language loading in editor** — CodeMirror language extensions load on demand to avoid bundling all grammars upfront

## Details

### The Loading Pattern

When the user clicks to expand a directory node:

1. Mark the directory as expanded in the store (UI shows open arrow immediately — optimistic)
2. Check if children are already in the `loadedChildren` cache (cache hit — render immediately)
3. If not cached, add `path` to `loadingChildren` (`loadingChildren.add(path)`), call `fs.listDirectory(path)` RPC (UI shows loading on that row)
4. On response, re-check cache/races, store children on success, then in `finally` call `loadingChildren.delete(path)` so the spinner clears (and on error paths too)

This defers all RPC calls until the user navigates to that directory. The first expand triggers a load; subsequent expand/collapse cycles reuse cached data without re-fetching.

### Store Shape

```typescript
interface FilesPanelStore {
  expandedDirs: Set<string>; // Which dirs show as open
  loadedChildren: Map<string, FileEntry[]>; // Cached RPC results per path
  /** Paths currently waiting on `listDirectory` — drives per-row spinners. */
  loadingChildren: Set<string>;
  loadErrorByPath: Map<string, string>; // Optional: surface RPC failures without poisoning cache
  selectedFile: string | null; // Currently open file path
  activeCwd: string | null; // Working directory context
  pendingSelection: { line: number; col?: number } | null; // Deferred jump-to-line

  expandDir: (path: string) => void;
  collapseDir: (path: string) => void;
  setChildren: (path: string, children: FileEntry[]) => void;
  setLoadError: (path: string, message: string | null) => void;
  openFile: (path: string, selection?: { line: number }) => void;
  consumePendingSelection: () => { line: number; col?: number } | null;
}
```

The `loadedChildren` map is the client-side cache. The expand handler:

```typescript
async function handleExpand(dirPath: string) {
  expandDir(dirPath); // Optimistic UI update
  if (loadedChildren.has(dirPath)) {
    return;
  }
  loadingChildren.add(dirPath);
  try {
    const children = await rpc.call("fs.listDirectory", { path: dirPath });
    // Another expand could have populated the cache while we were in flight
    if (!loadedChildren.has(dirPath)) {
      setChildren(dirPath, children);
    }
    setLoadError(dirPath, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setLoadError(dirPath, message);
    // Revert optimistic expand so the user can retry, or keep expanded and show inline error
    collapseDir(dirPath);
  } finally {
    loadingChildren.delete(dirPath);
  }
}
```

### Binary File Guard

Before opening a file in the editor, check whether it is a text file:

```typescript
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".css",
  ".html",
  ".yaml",
  ".yml",
  ".toml",
  ".sh",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".cpp",
]);

function isTextFile(path: string): boolean {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  return ext ? TEXT_EXTENSIONS.has(ext) : false;
}
```

Binary files (images, compiled artifacts, PDFs) render a placeholder: "Binary file — cannot display." This prevents CodeMirror from trying to render garbage bytes.

### CodeMirror Lazy Language Loading

Each file type needs a CodeMirror language extension. Loading all grammars upfront increases initial bundle size significantly. Dynamic imports defer the load until the file is opened:

```typescript
async function getLanguageExtension(path: string) {
  const ext = path.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  switch (ext) {
    case ".ts":
    case ".tsx": {
      const { javascript } = await import("@codemirror/lang-javascript");
      return javascript({ typescript: true, jsx: ext === ".tsx" });
    }
    case ".json": {
      const { json } = await import("@codemirror/lang-json");
      return json();
    }
    default:
      return []; // No language highlighting for unknown types
  }
}
```

## Related Concepts

- [[concepts/pending-selection-store-coordination]] — Store state used to jump to a line after editor loads; shares the same file store
- [[concepts/rpc-layer-expansion-pattern]] — File listing RPC methods follow the same contracts-first expansion pattern
- [[concepts/settings-ui-management-pattern]] — Similar pattern of managing complex UI state across multiple components

## Sources

- [[daily/2026-04-20.md]] — "Used lazy-per-directory RPC expansion (not full tree load) for the file tree"
- [[daily/2026-04-20.md]] — "CodeMirror 6 with lazy language loading + binary-file guard for the editor"
- [[daily/2026-04-20.md]] — "Split implementation into 6 discrete commits for clean rollback/review granularity"
