---
title: "Git Branch-Agnostic Operations and Defensive Branch Resolution"
aliases: [branch-agnostic-git, branch-fallback, defensive-git, git-portability]
tags: [git, robustness, configuration, tooling]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch-Agnostic Operations and Defensive Branch Resolution

Tools that operate on git repositories often need to determine a "base branch" for operations like code review (e.g., `git log main..HEAD` compares against main). Hardcoding a default branch name like `main` breaks when repositories use `master`, `develop`, or other conventions. Defensive programming requires validating that a branch exists locally before using it, with a fallback chain through common default names.

## Key Points

- **No universal default branch** - Different repos use `main`, `master`, `develop`, `trunk`, or custom names
- **Validation is mandatory** - Must verify branch exists before passing to git commands that require the reference
- **Fallback chain pattern** - Try `["main", "master", "develop", "trunk"]` in order; use first existing branch
- **Consider local vs remote tracking refs** - May need to check for `origin/main` if local branch doesn't exist
- **Meaningful error messages** - Let git error naturally if no fallback succeeds; avoids silent wrong behavior

## Details

When code runs `git log --oneline main..HEAD`, git expects `main` to exist as a local branch (or ref). If it doesn't, the command fails with "unknown revision" error. Tools often hardcoded `main` as a safe fallback without verifying it existed, causing failures in repositories using different conventions.

The defensive pattern is:

1. **Compute candidate base branch** - From configuration, environment, or user input
2. **Validate candidate exists** - Use `git branch --list` or equivalent to verify the branch is local
3. **Fallback if not found** - Try common defaults in order: `main` → `master` → `develop` → `trunk`
4. **Use first existing branch** - Return as soon as one is found
5. **Allow git to error** - If nothing works, let git's error message guide the user (not a silent wrong state)

### Example Implementation

```typescript
async function resolveBranchName(candidate: string, localBranches: string[]): Promise<string> {
  // Fast path: candidate exists
  if (localBranches.includes(candidate)) {
    return candidate;
  }

  // Fallback chain through common defaults
  const defaults = ["main", "master", "develop", "trunk"];
  for (const branch of defaults) {
    if (localBranches.includes(branch)) {
      return branch;
    }
  }

  // No common default found; fall back to any other local branch
  // or return candidate (let git error naturally)
  return localBranches.length > 0 ? localBranches[0] : candidate;
}
```

This ensures:

- User's config is respected if the branch exists
- Tool gracefully adapts to common conventions
- Error handling is explicit (no silent wrong behavior)
- Meaningful git errors guide users when nothing works

### Discovering Local Branches

Most tools use `git branch --list` to list local branches:

```bash
git branch --list       # Returns lines like "  main" or "* master"
```

Some git libraries (e.g., `NodeGit`, `isomorphic-git`) provide `listLocalBranchNames()` methods that parse this output.

## Related Concepts

- [[concepts/ollama-concurrent-safety-patterns]] - Another defensive programming pattern in external tool integration
- [[concepts/http-endpoint-authentication-patterns]] - Defensive validation applies to external services too

## Sources

- [[daily/2026-04-12.md]] - Code review button failed in sandbox repo due to hardcoded `main` branch
- [[daily/2026-04-12.md]] - Sandbox repo uses `master` as default; git command failed with "unknown revision"
- [[daily/2026-04-12.md]] - Fixed by validating branch exists, falling back through common defaults
- [[daily/2026-04-12.md]] - Rule: always verify git references exist before using them in log/diff commands
