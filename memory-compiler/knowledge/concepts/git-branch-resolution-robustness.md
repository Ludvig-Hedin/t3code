---
title: "Git Branch Resolution with Existence Validation"
aliases: [branch-resolution, git-defaults, base-branch-detection]
tags: [git, version-control, cross-platform]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Resolution with Existence Validation

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`), but git operations often assume a specific base branch exists. Hardcoding a fallback branch name (e.g., always falling back to `"main"`) breaks on repositories using different conventions. Robust branch resolution validates that candidate branches exist before passing them to git commands, with a fallback chain through common defaults.

## Key Points

- Different repositories use different default branch names; can't assume `main` exists
- Git operations like `git log main..HEAD` fail silently with "unknown revision" if the branch doesn't exist
- Hardcoded fallback branch names (e.g., `"main"`) break tools on repos using `master` or `develop`
- Solution: validate branch existence using `listLocalBranchNames()` before using in git commands
- Implement fallback chain through common defaults (`["main", "master", "develop", "trunk"]`)
- Let git error naturally as last resort if no defaults exist, for meaningful error messages

## Details

### The Problem

The code review button in the harness calls `GitManager.prepareReviewContext()` to compute a base branch for comparison. The logic computed a candidate branch but hardcoded `"main"` as final fallback without checking if it existed:

```typescript
// WRONG: hardcoded fallback
const baseBranch = computeBaseBranch() || "main";
await git.log(`${baseBranch}..HEAD`); // fails if main doesn't exist
```

On repositories with no `main` branch (e.g., only `master`), the git command fails:

```
fatal: ambiguous argument 'main..HEAD': unknown revision or path not in the working tree
```

### The Solution

Implement branch existence validation with a priority chain:

```typescript
async function findBaseBranch(computed: string): string {
  const localBranches = await git.listLocalBranchNames();

  // Try computed branch
  if (computed && localBranches.includes(computed)) {
    return computed;
  }

  // Try common defaults in order
  for (const defaultName of ["main", "master", "develop", "trunk"]) {
    if (localBranches.includes(defaultName)) {
      return defaultName;
    }
  }

  // Fall back to any non-current branch
  const currentBranch = await git.getCurrentBranch();
  const otherBranch = localBranches.find((b) => b !== currentBranch);
  if (otherBranch) return otherBranch;

  // Let git error with meaningful message
  return computed || "main";
}
```

This approach:

1. Validates the computed branch exists
2. Falls back through common defaults in priority order
3. Falls back to any non-current local branch
4. Returns the computed/original guess, allowing git to error naturally if nothing works

### Edge Cases

**Remote-only branches:** Some repositories have `main` as a remote tracking ref (`origin/main`) but not a local branch. The current validation only checks local branches. This edge case may warrant a second check against remote branches if needed.

**Fresh clone:** A newly cloned repository may only have the current branch checked out; other default branches might exist but aren't checked out. This is fine—`listLocalBranchNames()` returns all local branches.

### Integration with Code Review

The code review button uses this pattern to prepare diff context. By validating the base branch exists, the feature works across repositories with different conventions without user configuration.

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] - Another cross-repo concern: authenticating git operations
- [[concepts/error-handling-defensive-coding]] - Validating preconditions before operations

## Sources

- [[daily/2026-04-12.md]] - "Code review button fails when repos don't have `main` branch; need to check branch existence before using in git commands"
- [[daily/2026-04-12.md]] - "Implemented branch existence validation: after computing candidate base branch, verify it actually exists in the local repo"
- [[daily/2026-04-12.md]] - "Added fallback chain through common default names ('main' → 'master' → 'develop' → 'trunk')"
- [[daily/2026-04-12.md]] - "Different repos use different default branch names — can't assume `main` exists"
