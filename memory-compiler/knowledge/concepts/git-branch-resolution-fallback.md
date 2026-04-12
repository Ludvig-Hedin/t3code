---
title: "Git Branch Resolution with Fallback Strategy"
aliases: [branch-resolution, default-branch, git-fallback]
tags: [git, version-control, refactoring]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Resolution with Fallback Strategy

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`). Tools that need to determine the "base branch" for operations like code review diffing cannot assume a hardcoded default. The solution is a fallback chain: try common defaults in priority order, verify each exists via `listLocalBranchNames()`, then fall back to any non-current local branch if defaults don't exist.

## Key Points

- **No standard default** - Git lets repos choose their default branch name; repos use `main`, `master`, `develop`, `trunk`, and others
- **Hardcoded defaults are fragile** - Code review, diff, and merge tools often hardcode `main` as the base branch, breaking on repos with other defaults
- **Fallback chain pattern** - Try likely defaults in order of popularity, verify existence, then expand search scope
- **Existence validation required** - Must check branches exist locally before using them in git commands; using non-existent refs causes "unknown revision" errors
- **Meaningful error messages** - If no fallback works, let git error naturally (confusing message is better than silent wrong behavior)

## Details

### The Problem

A tool (like the code review button in Bird Code) needs to determine the base branch for diffing:

```bash
git log --oneline main..HEAD   # Assume main exists
# But if repo uses master:
# error: unknown revision
```

The code review operation fails silently with a confusing error message, leaving users unable to use the feature.

### The Solution: Fallback Chain

```typescript
async function resolveBaseBranch(): Promise<string> {
  const localBranches = await listLocalBranchNames();
  const currentBranch = await getCurrentBranch();

  // Try common defaults in order
  const defaults = ["main", "master", "develop", "trunk"];
  for (const branch of defaults) {
    if (localBranches.includes(branch) && branch !== currentBranch) {
      return branch;
    }
  }

  // Fall back to any non-current local branch
  const otherBranches = localBranches.filter((b) => b !== currentBranch);
  if (otherBranches.length > 0) {
    return otherBranches[0];
  }

  // Last resort: return the common fallback and let git error naturally
  return "main";
}
```

### Implementation Considerations

**Verifying existence:** Use `listLocalBranchNames()` which returns an array of local branches. If the call fails, it returns an empty array (fails safely, doesn't throw). This is defensive but means you can't distinguish "repo has no branches" from "API call failed."

**Defensive final fallback:** Returning a hardcoded name at the end (like `main`) allows git to provide the actual error message if nothing works. This is better than crashing silently with the wrong branch.

**Order matters:** Prioritize `main` first (GitHub standard since 2020), then `master` (Git default before 2020, still common). Develop and trunk are less common but reasonable fallbacks.

### Related Problem Domains

The same fallback pattern appears in:

- **Route matching:** Express/Effect routers with wildcard patterns falling through to catch-alls
- **Configuration discovery:** Services checking environment variables with defaults
- **Feature detection:** Browser APIs checking for availability before using them

## Related Concepts

- [[concepts/route-wildcard-trailing-slash]] - Fallback pattern in routing context
- [[concepts/iframe-sandboxing-cors]] - Related to handling variable environments (repos vs iframe sandboxes)

## Sources

- [[daily/2026-04-12.md]] - "Debugged code review button failure caused by hardcoded `main` branch assumption in git operations. Console error revealed `git log --oneline main..HEAD` was failing with 'unknown revision' — indicated repo didn't have `main` branch (had `master` instead)."
- [[daily/2026-04-12.md]] - "Modified branch resolution logic to validate candidate branch exists using `listLocalBranchNames()` before using it. Implemented walking through common defaults ('main', 'master', 'develop', 'trunk') to find first existing branch."
