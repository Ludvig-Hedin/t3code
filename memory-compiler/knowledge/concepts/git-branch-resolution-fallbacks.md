---
title: "Git Branch Resolution and Fallback Chains for Default Branches"
aliases: [branch-resolution, default-branch-detection, git-branch-fallback]
tags: [git, ci-cd, tooling, cross-platform]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Resolution and Fallback Chains for Default Branches

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`). Code that assumes a single hardcoded branch name breaks across diverse repos. Safe branch resolution uses a fallback chain: try common defaults in order, validate each exists before using, and only error naturally if none work. This pattern is essential for tools like code review harnesses that must work across arbitrary repos.

## Key Points

- Cannot assume `main` exists as default branch; different repos use `master`, `develop`, `trunk`, or others
- Must validate branch existence (using `listLocalBranchNames()` or `git rev-parse --verify`) before using in git commands
- Implement fallback chain through common defaults: `["main", "master", "develop", "trunk"]` → use first existing branch
- If no defaults exist, fall back to any non-current local branch, then let git error naturally (meaningful error message)
- Hardcoded final fallback breaks for non-standard repos; dynamic detection is required

## Details

### The Anti-Pattern

```typescript
// ❌ WRONG: Hardcoded "main" as final fallback
function getBaseBranch() {
  if (hasUpstream) return getTrackedBranch();
  if (hasMainLocal) return "main";
  if (hasMasterLocal) return "master";
  return "main"; // <-- This breaks for repos with only "master"
}
```

When the code reaches the final `return "main"`, it doesn't verify that `main` actually exists. If the repo has `master` instead, `git log --oneline main..HEAD` fails with "unknown revision."

### The Correct Pattern

```typescript
// ✅ CORRECT: Validate and fall through
function getBaseBranch(currentBranch: string): string {
  const localBranches = listLocalBranchNames();

  // Try common defaults in order
  for (const candidate of ["main", "master", "develop", "trunk"]) {
    if (localBranches.includes(candidate) && candidate !== currentBranch) {
      return candidate;
    }
  }

  // Fall back to any non-current local branch
  const fallback = localBranches.find((b) => b !== currentBranch);
  if (fallback) return fallback;

  // Let git error naturally (meaningful error)
  return "main"; // git will complain if it doesn't exist
}
```

The key differences:

1. Call `listLocalBranchNames()` to get actual branches (no assumptions)
2. Iterate through candidates and **validate each exists**
3. Fall back to any non-current branch if defaults don't match
4. Only return unvalidated branch as last resort (git will error with full context)

### Validation Approaches

Two ways to validate branch existence:

**Method 1: List branches and check membership**

```typescript
const localBranches = exec("git branch --list").split("\n");
const branchExists = localBranches.includes(candidate);
```

**Method 2: Try to resolve the ref**

```typescript
try {
  exec(`git rev-parse --verify ${candidate}`);
  return true;
} catch {
  return false;
}
```

Method 1 is preferred for branch resolution (lower cost, simpler logic).

### Error Handling

When no valid default branch can be found:

```
Error: Cannot determine base branch. Tried: main, master, develop, trunk.
No other local branches exist. Current branch: feature/xyz
```

This tells the user exactly what went wrong and provides actionable context (which branches were tried, current branch).

### Real-World Scenario

Sandbox repo (`/Users/ludvighedin/Programming/personal/sandbox`) has `master` as default, not `main`:

1. Tool tries `main` → doesn't exist, skip
2. Tool tries `master` → exists, use it
3. `git log --oneline master..HEAD` succeeds ✅

Without fallback chain, step 1 would have returned `main` and step 3 would fail.

## Related Concepts

- [[concepts/multi-platform-desktop-build-automation]] - Build automation also encounters repo standardization issues
- [[concepts/react-commit-phase-debugging]] - Debugging tools like code review must work reliably across setups

## Sources

- [[daily/2026-04-12.md]] - "Console error revealed `git log --oneline main..HEAD` was failing with 'unknown revision' — indicated repo didn't have `main` branch (had `master` instead)"
- [[daily/2026-04-12.md]] - "Modified branch resolution logic to validate candidate branch exists using `listLocalBranchNames()` before using it"
- [[daily/2026-04-12.md]] - "Implemented walking through common defaults (`["main", "master", "develop", "trunk"]`) to find first existing branch"
- [[daily/2026-04-12.md]] - "Different repos use different default branch names — can't assume `main` exists"
