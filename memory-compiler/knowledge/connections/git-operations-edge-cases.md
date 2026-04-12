---
title: "Connection: Git Operations Edge Cases Share a Root Cause Pattern"
connects:
  - "concepts/branch-agnostic-git-operations"
  - "concepts/working-tree-diff-git-operations"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Git Operations Edge Cases Share a Root Cause Pattern

## The Connection

Two seemingly different git operations (`git log main..HEAD` for code review and `git diff HEAD` for working-tree display) fail with cryptic "unknown revision" errors when git references don't exist. Both failures stem from the same root cause: **assuming git references exist without validation**. Both operations rely on shared git functionality, and both solve their edge cases using the same pattern: validate the reference exists before using it, then fall back gracefully.

## Key Insight

The pattern is not specific to git. Any operation that accepts a dynamic reference (branch, tag, commit hash) must:

1. **Validate existence** - Check that the reference the user/system wants actually exists
2. **Fall back intelligently** - Provide sensible defaults if the primary choice doesn't exist
3. **Error meaningfully** - If everything fails, let the system error naturally (don't suppress it) so users see a real error message

Without these steps, users get "unknown revision" instead of "we tried these branches: main, master, develop. None exist. Pick a valid branch."

## Evidence

Both conversations reveal the same debugging and fix pattern:

**Branch-agnostic git operations (code review):**

- Problem: hardcoded `main` in fallback fails when repo uses `master`
- Error: `git log --oneline main..HEAD` → "unknown revision 'main'"
- Fix: validate existence via `listLocalBranchNames()`, fall back through `["main", "master", "develop", "trunk"]`

**Working-tree diff (display uncommitted changes):**

- Problem: brand-new repos with no commits have no `HEAD` reference
- Error: `git diff HEAD` → "unknown revision 'HEAD': ambiguous argument"
- Fix: catch this error in try/catch, return empty diff (graceful fallback)

Both are validation failures + graceful fallbacks in the same layer (git command execution).

## Design Implication

When adding any git operation:

1. Ask: "What references does this use?" (HEAD, main, branch names, tags)
2. Ask: "Could those references not exist?" (Yes, always)
3. Implement validation before the command runs
4. Provide a fallback or meaningful error

This pattern generalizes to any system boundary (git, database, HTTP API) where you're using external references.

## Related Concepts

- [[concepts/error-handling-for-git-operations]] - Graceful error handling as a pattern
- [[concepts/git-reference-validation]] - How to verify references exist
- [[concepts/branch-agnostic-git-operations]] - Specific instance
- [[concepts/working-tree-diff-git-operations]] - Specific instance
