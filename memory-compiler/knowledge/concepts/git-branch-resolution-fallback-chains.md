---
title: "Git Branch Resolution with Fallback Chains"
aliases: [branch-defaults, fallback-resolution, git-ref-validation]
tags: [git, tooling, error-handling, cross-repo-compatibility]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Resolution with Fallback Chains

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`). Tools that hardcode a single default branch fail when used across repositories with different conventions. Robust branch resolution uses a fallback chain: try candidate branches in priority order, verify each exists locally, and fall back gracefully to any available non-current branch if nothing matches. This pattern ensures cross-repo compatibility without requiring manual configuration.

## Key Points

- **Hardcoded defaults fail** - Assuming `main` exists breaks tools on repos using `master` or other names
- **Fallback chain pattern** - Try `["main", "master", "develop", "trunk"]` in priority order; use first existing branch
- **Verify before using** - Call `git show-ref --verify` or equivalent before passing refs to git commands
- **All-or-nothing verification** - Don't assume one branch exists; fail gracefully if none do
- **Error clarity** - Let git error naturally (with meaningful error) rather than silently using wrong branch

## Details

The code review button in Git-integrated tools needs a base branch to compute diffs (`git log --oneline main..HEAD`). When the repository uses a non-standard default, the hardcoded `main` reference fails with "unknown revision" errors.

### Problem: Hardcoded Fallback

```typescript
// WRONG: assumes 'main' exists
let baseBranch = computeBaseBranch(options);
if (!baseBranch) {
  baseBranch = "main"; // Crash if main doesn't exist
}
```

### Correct Pattern: Verified Fallback Chain

```typescript
const DEFAULT_BRANCHES = ["main", "master", "develop", "trunk"];

async function resolveBaseBranch(candidate: string | null): Promise<string> {
  // Try candidate first
  if (candidate && (await branchExists(candidate))) {
    return candidate;
  }

  // Try default chain
  for (const branch of DEFAULT_BRANCHES) {
    if (await branchExists(branch)) {
      return branch;
    }
  }

  // Fall back to any non-current local branch
  const branches = await listLocalBranchNames();
  const current = await getCurrentBranch();
  const alternatives = branches.filter((b) => b !== current);

  if (alternatives.length > 0) {
    return alternatives[0]; // Let error handling take over
  }

  // Let git error naturally with meaningful message
  return candidate || "HEAD";
}

async function branchExists(name: string): Promise<boolean> {
  try {
    return (await listLocalBranchNames()).includes(name);
  } catch {
    return false;
  }
}
```

### Implementation Notes

- **Branch existence check** - Use `git show-ref --verify refs/heads/<branch>` or parse `git branch --list` output
- **Current branch detection** - `git rev-parse --abbrev-ref HEAD` returns the current branch
- **Remote tracking branches** - Be aware repos may have `origin/main` (remote tracking) but not `main` (local); handle separately if needed
- **Edge case: Brand-new repos** - Repos with no commits have no branches; check for empty repository condition

## Related Concepts

- [[concepts/effect-router-wildcard-patterns]] - Both involve defensive fallback chains for edge cases
- [[concepts/bun-cache-corruption-repair]] - Both require understanding when tools fail silently vs. loudly

## Sources

- [[daily/2026-04-12.md]] - "Modified branch resolution logic to validate candidate branch exists using `listLocalBranchNames()` before using it"
- [[daily/2026-04-12.md]] - "Implemented walking through common defaults (`['main', 'master', 'develop', 'trunk']`) to find first existing branch"
- [[daily/2026-04-12.md]] - "Fall back to any non-current local branch, then allow git to error naturally as last resort — ensures meaningful error messages if nothing works"
