---
title: "Git Branch Name Resolution with Validation Chain"
aliases: [branch-resolution, default-branch, branch-detection]
tags: [git, cli-tools, portability, error-handling]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Name Resolution with Validation Chain

Different repositories use different default branch names (`main`, `master`, `develop`, `trunk`). Tools that hardcode a single default branch name will fail on repositories using different conventions. The solution is to resolve the base branch through a priority chain, validating that each candidate exists before using it in git operations that require the branch reference to be valid.

## Key Points

- **No universal default branch** - Different repos use `main`, `master`, `develop`, `trunk`, or other names
- **Must validate before use** - Passing a non-existent branch reference to `git log`, `git diff`, etc. produces "unknown revision" errors
- **Priority chain with fallbacks** - Try common defaults in order: `main` → `master` → `develop` → `trunk`
- **Validation method** - Use `listLocalBranchNames()` to get all available branches, check if candidate exists
- **Final fallback** - If no common default exists, fall back to any non-current local branch, then let git error naturally
- **Defensive error messages** - If all resolution fails, allow git to produce a meaningful error rather than silently using wrong branch

## Details

### The Problem

The original code assumed `main` as the default:

```typescript
// ❌ WRONG: hardcodes "main"
const baseBranch = resolveBaseBranch(candidate) || "main";
const log = await git.execute(`log --oneline ${baseBranch}..HEAD`);
// If repo has no "main" branch: "unknown revision" error
// User sees cryptic error; tool appears broken on that repo
```

Repositories using `master` or other names would fail silently or with unclear errors.

### The Solution

Implement a validation chain:

```typescript
// ✅ CORRECT: try multiple defaults in priority order
const commonDefaults = ["main", "master", "develop", "trunk"];
const localBranches = await git.listLocalBranchNames();

let baseBranch = candidate; // start with computed candidate

// If candidate doesn't exist, try common defaults
if (!localBranches.includes(baseBranch)) {
  const found = commonDefaults.find((branch) => localBranches.includes(branch));
  if (found) {
    baseBranch = found;
  } else {
    // Fallback to any non-current branch
    baseBranch = localBranches.find((b) => b !== currentBranch) || candidate;
  }
}

const log = await git.execute(`log --oneline ${baseBranch}..HEAD`);
```

### Implementation Details

**Branch listing function** (already exists in most git wrappers):

```typescript
async listLocalBranchNames(): Promise<string[]> {
  const output = await this.execute("branch --format=%(refname:short)");
  return output.split('\n').filter(Boolean);
}
```

**Resolution logic** (placed in git manager):

```typescript
async prepareReviewContext(currentBranch: string, computedCandidate: string) {
  const localBranches = await this.listLocalBranchNames();

  // Start with computed candidate
  let baseBranch = computedCandidate;

  // Validate against actual branches
  if (!localBranches.includes(baseBranch)) {
    // Try common defaults
    const commonDefaults = ["main", "master", "develop", "trunk"];
    const found = commonDefaults.find(b => localBranches.includes(b));

    if (found) {
      baseBranch = found;
    } else {
      // Fallback: any non-current branch
      const other = localBranches.find(b => b !== currentBranch);
      baseBranch = other || computedCandidate; // let git error if nothing works
    }
  }

  // Now safe to use baseBranch in git commands
  return baseBranch;
}
```

### Edge Cases

**New repositories with no commits:**

- `git log --oneline main..HEAD` fails because `HEAD` doesn't exist
- Current solution falls back gracefully; future improvement could check `git rev-parse HEAD` validity first

**Remote-only branches (e.g., `origin/main` exists but not local `main`):**

- Current chain checks local branches only
- Future enhancement could check remote-tracking branches if no local branch matches
- For now, users must check out the branch locally first

### Benefits

1. **Portability** - Same code works across repos with different defaults
2. **Clear errors** - If nothing works, git's native error is more informative than "unknown revision main"
3. **User-friendly** - Tool adapts to repo conventions rather than forcing conventions on users
4. **Defensive** - Validates before passing to git commands rather than letting git fail cryptically

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] - Similar pattern of fallback chains for configuration
- [[concepts/provider-scoped-config-fallback]] - Validation chains used for config defaults
- [[concepts/systematic-feature-implementation-phases]] - This pattern prevents phase 6 (RPC handlers) from breaking on edge cases

## Sources

- [[daily/2026-04-12.md]] - "Code review button failure in git operations caused by hardcoded 'main' branch assumption; resolved by validating branch exists before using in git commands"
- [[daily/2026-04-12.md]] - "Modified branch resolution logic to validate candidate branch exists using `listLocalBranchNames()` before using in log/diff commands"
- [[daily/2026-04-12.md]] - "Implemented walking through common defaults ['main', 'master', 'develop', 'trunk'] to find first existing branch; fallback to any non-current local branch"
