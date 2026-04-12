---
title: "Git Branch Agnostic Base Resolution"
aliases: [dynamic-branch-resolution, default-branch-detection, branch-fallback]
tags: [git, vcs, configuration, fallback-patterns]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Agnostic Base Resolution

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`, etc.). Tools that hardcode a default branch name fail on repositories using non-standard conventions. Branch agnostic resolution validates candidate branches before using them, falling back through a priority list of common defaults.

## Key Points

- Cannot assume any default branch name exists in a given repository
- Hardcoded fallbacks like `"main"` cause failures when repos use `master` or other names
- Solution: validate branch existence using `git branch --list` or equivalent before using branch refs
- Implement fallback chain through common defaults (`main` → `master` → `develop` → `trunk`)
- Ultimate fallback: allow git to error naturally with meaningful error message rather than silent wrong state

## Details

### The Problem

Code review feature needs to establish a base branch for diff generation. Initial implementation:

```typescript
function getBaseBranch(repo) {
  const candidate = computeBaseBranch(repo);
  return candidate || "main"; // WRONG: hardcoded fallback
}
```

When `computeBaseBranch` returns null (e.g., in a new repo or uncertain state), the code falls back to `"main"`. If the repo has no `main` branch (uses `master` instead), the subsequent `git log --oneline main..HEAD` fails with "unknown revision 'main'".

### The Solution

Validate candidate branches before using them:

```typescript
function getBaseBranch(repo) {
  const candidate = computeBaseBranch(repo);
  const localBranches = repo.listLocalBranchNames(); // array of branch names

  // Check candidate first
  if (candidate && localBranches.includes(candidate)) {
    return candidate;
  }

  // Fallback through common defaults
  const defaults = ["main", "master", "develop", "trunk"];
  for (const defaultBranch of defaults) {
    if (localBranches.includes(defaultBranch)) {
      return defaultBranch;
    }
  }

  // Ultimate fallback: any non-current branch, or original candidate
  const nonCurrentBranches = localBranches.filter((b) => b !== repo.getCurrentBranch());
  return nonCurrentBranches[0] || candidate;
}
```

This approach:

1. Tries the computed candidate first (preserves existing behavior)
2. Falls back through common defaults in priority order
3. Falls back to any available non-current branch
4. Returns the original candidate as last resort (lets git error naturally)

### Edge Cases

**Remote-only `main` branch:** Some repos have `origin/main` as a remote tracking ref but no local `main` branch. Current validation using `listLocalBranchNames()` won't find it. Future improvement: check both local and remote-tracking refs if needed.

**Bare repositories or unusual setups:** If `listLocalBranchNames()` returns empty, the ultimate fallback allows git to report the real error.

## Related Concepts

- [[concepts/rpc-layer-expansion-pattern]] - Branch resolution is often part of git service RPC methods
- [[concepts/provider-default-model-fallback-chain]] - Similar fallback chain pattern applied to model selection

## Sources

- [[daily/2026-04-12.md]] - "Code review button failure... hardcoded `main` branch assumption in git operations"
- [[daily/2026-04-12.md]] - "git log --oneline main..HEAD was failing with 'unknown revision'... repo didn't have `main` branch (had `master` instead)"
- [[daily/2026-04-12.md]] - "Must verify git references exist locally before using them in log/diff commands"
