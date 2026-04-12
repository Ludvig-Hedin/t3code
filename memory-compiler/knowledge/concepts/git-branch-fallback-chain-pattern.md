---
title: "Git Branch Fallback Chain Pattern"
aliases: [branch-resolution, default-branch, cross-repo-compatibility, branch-agnostic-tooling]
tags: [git, tooling, environment-agnostic, automation]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Git Branch Fallback Chain Pattern

Different repositories use different default branch names: `main`, `master`, `develop`, `trunk`, etc. Tools and scripts that assume a specific branch name (e.g., hardcoding `"main"`) fail on repos using other conventions. The solution is a **fallback chain**: try common names in order, verify each exists locally, and use the first found. This pattern ensures tools work across repos with different branch naming conventions without special configuration.

## Key Points

- Different repos use different default branch names—no universal standard
- Hardcoding `"main"` breaks for `master`, `develop`, `trunk` repos
- Must verify branch exists locally before using it in git commands like `git log` or `git diff`
- Fallback chain tries common defaults in priority order: `["main", "master", "develop", "trunk"]`
- If no common default found, fall back to any non-current local branch, then error naturally
- Uses `git branch --list` or equivalent to check existence

## Details

### The Problem

```typescript
// ❌ WRONG: assumes all repos use "main"
const baseBranch = "main";
const result = exec(`git log --oneline ${baseBranch}..HEAD`);
// Error: "fatal: unknown revision 'main'" if repo uses "master"
```

When the repo doesn't have a `main` branch, git errors with "unknown revision" and the tool fails silently or with a cryptic message. Users with `master` or `develop` repos can't use the tool.

### The Solution

```typescript
// ✅ RIGHT: try common defaults in order
async function resolveBaseBranch(currentBranch: string): Promise<string> {
  const candidates = ["main", "master", "develop", "trunk"];
  const localBranches = await listLocalBranchNames();

  // Try common defaults first
  for (const candidate of candidates) {
    if (localBranches.includes(candidate) && candidate !== currentBranch) {
      return candidate;
    }
  }

  // Fallback: any non-current local branch
  const nonCurrent = localBranches.find((b) => b !== currentBranch);
  if (nonCurrent) return nonCurrent;

  // Last resort: return original candidate (git will error naturally with meaningful message)
  return "main";
}
```

### Implementation Considerations

- **Verify existence first** - Use `git branch --list <name>` or cache branch list before checking
- **Ignore remote-only branches** - `origin/main` exists on remote but can't be used for local diff commands
- **Handle shallow clones** - Some repos in CI may only have one branch; gracefully fall back
- **Current branch awareness** - Don't return the current branch as base branch (creates nonsensical diffs)
- **Meaningful errors** - If fallback chain fails completely, let git produce the error so users understand what happened

### Where This Pattern Applies

Any tool that needs to compare against a "base" or "main" branch:

- Code review tooling (comparing against main for diff/context)
- Git automation (running tests against main)
- CI/CD pipelines (determining if changes are to main or branch)
- Merge tools (base for merging)
- Linting tools (changes relative to main)
- Diff/change analysis tools

### Real-World Example: Code Review Tool

Bird Code's code review button was failing because it hardcoded `main`:

```typescript
// Before: hardcoded fallback
const baseBranch = resolveBranch() || "main";

// After: fallback chain with verification
const baseBranch =
  resolveBranch() ||
  (await verifyAndFallback(["main", "master", "develop"])) ||
  (await getAnyNonCurrentBranch());
```

This fixed the issue for all repos using `master` or other defaults.

## Related Concepts

- [[concepts/zustand-selector-stability-anti-pattern]] - Another pattern about handling variable environments
- [[concepts/html-colgroup-text-node-constraints]] - Different domain, similar "don't hardcode assumptions" principle

## Sources

- [[daily/2026-04-12.md]] - "Debugged and fixed code review button failure in Claude Code harness caused by hardcoded `main` branch assumption in git operations"
- [[daily/2026-04-12.md]] - "Different repos use different default branch names—can't assume `main` exists"
- [[daily/2026-04-12.md]] - "Must verify git references exist locally before using them in log/diff commands"
