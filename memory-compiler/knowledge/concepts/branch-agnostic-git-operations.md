---
title: "Branch-Agnostic Git Operations: Avoiding Hardcoded Defaults"
aliases: [branch-resolution, git-branch-defaults, base-branch-detection]
tags: [git, operations, error-handling, cross-repo]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Branch-Agnostic Git Operations: Avoiding Hardcoded Defaults

Git operations that depend on a specific branch (e.g., `main`) fail silently when the repository uses a different default (e.g., `master`, `develop`, `trunk`). The correct pattern is to verify branch existence before using it in commands, then fall back through a list of common defaults, finally allowing git to error naturally if nothing exists. This prevents cryptic "unknown revision" errors and enables cross-repository compatibility.

## Key Points

- **Problem:** Hardcoding `main` as fallback breaks on repos with different defaults
- **Solution:** Verify branch existence before using in git commands (e.g., via `listLocalBranchNames()`)
- **Fallback chain:** Walk through `["main", "master", "develop", "trunk"]` to find first existing branch
- **Last resort:** If no defaults exist, fall back to any non-current local branch, then allow git to error naturally
- **Error messages:** Letting git error at the end provides meaningful feedback instead of silent failures

## Details

### The Anti-Pattern

```bash
# ❌ BAD: Assumes "main" exists
git log --oneline main..HEAD
# Error: unknown revision 'main'
```

Many tools (and developers) assume `main` is universal. But different repositories use different conventions:

- GitHub recommends `main` (default for new repos since 2020)
- Older repos often use `master`
- Some use `develop`, `trunk`, or custom names
- Organizations may enforce specific naming standards

When a tool hardcodes `main` and the repo uses `master`, the command fails with an unclear error.

### The Correct Pattern

```typescript
// Step 1: Get all local branches
const allBranches = gitCore.listLocalBranchNames(); // Returns: ["master", "develop", "feature/x"]

// Step 2: Find the first candidate that exists
const candidates = ["main", "master", "develop", "trunk"];
let baseBranch = candidates.find((name) => allBranches.includes(name));

// Step 3: Fall back to any non-current branch
if (!baseBranch) {
  const currentBranch = getCurrentBranch();
  baseBranch = allBranches.find((name) => name !== currentBranch);
}

// Step 4: Use it, and let git error if still nothing works
const diff = await git.logOneline(`${baseBranch}..HEAD`);
```

This pattern:

1. Respects the repo's actual branch naming
2. Falls back gracefully through common defaults
3. Provides meaningful error messages if nothing works
4. Works across all repositories without hardcoding

### Implementation in Bird Code

In `GitManager.ts`, the code review feature uses this pattern to determine the base branch for comparing changes:

```typescript
async prepareReviewContext() {
  // Compute candidate base branch
  let baseBranch = this.computeCandidateBase();

  // Validate it exists
  const localBranches = this.listLocalBranchNames();
  if (!localBranches.includes(baseBranch)) {
    // Fall back to common defaults
    const defaults = ["main", "master", "develop", "trunk"];
    baseBranch = defaults.find(name => localBranches.includes(name));

    // Fall back to any non-current branch
    if (!baseBranch) {
      const current = this.getCurrentBranch();
      baseBranch = localBranches.find(name => name !== current);
    }
  }

  // Now baseBranch is either valid or we let git error
  return git.logOneline(`${baseBranch}..HEAD`);
}
```

### Edge Case: Remote-Only Branches

Branches may exist as remote tracking refs (e.g., `origin/main`) but not as local branches. The current pattern doesn't handle this (calling `.listLocalBranchNames()` returns empty array on error). If needed, a follow-up check could look at `listRemoteBranchNames()` and fetch the remote branch locally.

## Related Concepts

- [[concepts/working-tree-diff-git-operations]] - Another git operation with edge cases
- [[concepts/error-handling-for-git-operations]] - Graceful error handling patterns
- [[concepts/cross-repository-tooling]] - Why tools must be repository-agnostic

## Sources

- [[daily/2026-04-12.md]] - "Debugged and fixed code review button failure... console error revealed `git log --oneline main..HEAD` was failing with 'unknown revision' — indicated repo didn't have `main` branch (had `master` instead)"
- [[daily/2026-04-12.md]] - "Traced error to `prepareReviewContext()` in `GitManager.ts` which resolved base branch through priority chain but hardcoded `"main"` as final fallback without verifying it existed"
- [[daily/2026-04-12.md]] - "Modified branch resolution logic to validate candidate branch exists using `listLocalBranchNames()` before using it... Implemented walking through common defaults (`["main", "master", "develop", "trunk"]`)"
