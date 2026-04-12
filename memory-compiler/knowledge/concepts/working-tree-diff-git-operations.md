---
title: "Working-Tree Diff Git Operations: Displaying Uncommitted Changes"
aliases: [git-diff-working-tree, uncommitted-changes, diff-display, git-operations-edge-cases]
tags: [git, diff, ui, operations]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Working-Tree Diff Git Operations: Displaying Uncommitted Changes

Displaying uncommitted changes (the working-tree diff) in an IDE or editor requires querying `git diff HEAD --patch` to retrieve the actual file modifications. This complements checkpoint/thread diffs (which compare between commits) and adds visibility into local modifications. Implementation involves an RPC method returning diff patches, lazy query loading with periodic polling, and fallback UI for clean working trees or repos with no commits.

## Key Points

- **Query method:** `git diff HEAD --patch` returns uncommitted changes in unified diff format
- **RPC integration:** Add `git.getWorkingDiff` endpoint returning diff patch data
- **Query lifecycle:** Lazy load on component mount; poll every 15 seconds for real-time updates
- **Edge case:** Brand-new repos with no commits fail on `HEAD` (ambiguous argument); gracefully fall back to empty state
- **UI consistency:** Reuse existing `FileDiff` + `Virtualizer` components for rendering (works with all diff types)

## Details

### Implementation Overview

The working-tree diff implementation spans the full architecture:

1. **Contracts** (`packages/contracts/src/git.ts`): Define `GetWorkingDiffRequest` and `GetWorkingDiffResponse`
2. **Server** (`GitCore.ts`): Implement `readWorkingDiff()` calling `git diff HEAD --patch`
3. **RPC Handler** (`GitManager.ts`): Add `git.getWorkingDiff` route
4. **Web Client** (`web/lib/gitReactQuery.ts`): React Query hook with polling
5. **UI** (`web/components/DiffPanel.tsx`): Integrate into diff panel

### Git Command

```bash
# Retrieve uncommitted changes
git diff HEAD --patch

# Output: unified diff format
--- a/src/file.ts
+++ b/src/file.ts
@@ -10,6 +10,8 @@
  function foo() {
    console.log("hello");
+   console.log("world");
+   return true;
  }
```

### RPC Contract

```typescript
// packages/contracts/src/git.ts
interface GetWorkingDiffRequest {
  projectId: string;
}

interface GetWorkingDiffResponse {
  patch: string; // Unified diff format
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}
```

### Server Implementation

```typescript
// apps/server/src/git/Services/GitCore.ts
async readWorkingDiff(): Promise<string> {
  try {
    const patch = await this.runGit(['diff', 'HEAD', '--patch']);
    return patch;
  } catch (error) {
    // Edge case: no commits (HEAD is ambiguous)
    if (error.message.includes('ambiguous argument')) {
      return ''; // Empty tree, no commits to diff against
    }
    throw error;
  }
}
```

### React Query Integration

```typescript
// apps/web/src/lib/gitReactQuery.ts
export function useWorkingDiff(projectId: string) {
  return useQuery({
    queryKey: ["git.workingDiff", projectId],
    queryFn: async () => {
      const response = await rpc.call("git.getWorkingDiff", { projectId });
      return response; // { patch, stats }
    },
    staleTime: 5_000, // 5 seconds before refetch
    refetchInterval: 15_000, // Poll every 15 seconds
  });
}
```

The query is lazy-loaded (doesn't fetch until component mounts) and polls every 15 seconds to reflect user edits in real-time.

### UI Integration

```typescript
// apps/web/src/components/DiffPanel.tsx
export function DiffPanel({ activeThread, projectId }) {
  const { data: workingDiff } = useWorkingDiff(projectId);

  // Show working-tree diff if no active thread
  if (!activeThread) {
    if (!workingDiff?.patch) {
      return <div>No uncommitted changes</div>;
    }

    return (
      <FileDiff
        patch={workingDiff.patch}
        stats={workingDiff.stats}
      />
    );
  }

  // Show thread diffs if there's an active thread
  return <ThreadDiffView thread={activeThread} />;
}
```

The component reuses the existing `FileDiff` component, which handles:

- Parsing unified diff format
- Rendering file headers, line numbers, and code
- Virtualizing large diffs for performance

### Edge Case: Brand-New Repositories

A repo with no commits has no `HEAD` reference:

```bash
$ git diff HEAD --patch
fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
```

**Solution:** Catch this error in `readWorkingDiff()` and return an empty string (no diff). The UI shows "No uncommitted changes" which is technically correct (no committed baseline to compare against).

**Future improvement:** Could run `git diff --cached` (staged changes) for new repos, or `git status` to at least show that files exist.

### Stats Extraction

The response includes stats about the diff:

```typescript
function extractDiffStats(patch: string) {
  let insertions = 0,
    deletions = 0;
  const files = new Set<string>();

  for (const line of patch.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      files.add(line.slice(6)); // Extract filename
    }
    if (line.startsWith("+") && !line.startsWith("+++")) insertions++;
    if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }

  return {
    filesChanged: files.size,
    insertions,
    deletions,
  };
}
```

These stats are shown in the diff panel header: "+415 -5" (415 lines added, 5 deleted).

### Complementary Diff Types

The working-tree diff is one of three diff types in the UI:

| Type                  | Command                    | Shows                               |
| --------------------- | -------------------------- | ----------------------------------- |
| **Working-tree**      | `git diff HEAD`            | Uncommitted changes (file edits)    |
| **Staged**            | `git diff --cached`        | Changes staged for commit           |
| **Thread checkpoint** | `git diff COMMIT1 COMMIT2` | Changes between commits in a thread |

The working-tree diff is most useful on the project landing page (no active thread) to answer: "What have I changed since the last commit?"

## Related Concepts

- [[concepts/branch-agnostic-git-operations]] - Other git operations with edge cases
- [[concepts/diff-rendering-and-virtualization]] - How large diffs are rendered efficiently
- [[concepts/react-query-patterns]] - Polling and lazy loading with React Query

## Sources

- [[daily/2026-04-12.md]] - "Implemented working-tree diff display in the DiffPanel component... diff button stats come from `git diff HEAD` (working-tree changes), but the panel displayed 'No completed thread diffs yet' — a contradiction"
- [[daily/2026-04-12.md]] - "Add a new `git.getWorkingDiff` RPC method that returns the actual uncommitted changes, integrated across contracts → server → web client"
- [[daily/2026-04-12.md]] - "Edge case: Brand-new repos with no commits will fail on `git diff HEAD` (ambiguous argument 'HEAD'). Current implementation falls back gracefully to empty state rather than error"
