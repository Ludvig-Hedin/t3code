---
title: "Feature Parity Verification via Side-by-Side Comparison"
aliases: [side-by-side-comparison, regression-verification, parity-testing]
tags: [testing, refactoring, quality-assurance, verification]
sources:
  - "daily/2026-04-18.md"
created: 2026-04-18
updated: 2026-04-18
---

# Feature Parity Verification via Side-by-Side Comparison

When refactoring a tool (rewriting, restructuring, or migrating), running the old and new implementations side-by-side and comparing their outputs catches gaps that unit tests and type checking miss. This verification pattern is particularly valuable when the tool produces complex outputs (compiled documents, transformed data, generated code) where subtle differences in content, ordering, or formatting can indicate missing functionality. Multiple rounds of comparison are typically needed.

## Key Points

- **Run both implementations on identical inputs** — Same source files, same configuration, same environment
- **Diff the outputs structurally** — Compare not just text equality but section presence, content completeness, and formatting
- **Multiple rounds required** — First comparison catches obvious gaps; subsequent rounds catch edge cases revealed by initial fixes
- **Catches what types can't** — TypeScript compilation verifies interface conformance but not behavioral equivalence
- **Iterate until stable** — Keep comparing until outputs are functionally equivalent (exact byte-matching may not be required)

## Details

### The Verification Workflow

During the memory compiler refactoring, the verification workflow was:

1. Run the old compiler: `npx ts-node src/index.ts` → produces `old-output.md`
2. Run the new compiler: `npm run compile` → produces `new-output.md`
3. Compare outputs: identify missing sections, different formatting, lost content
4. Fix gaps in the new implementation
5. Re-run both and compare again
6. Repeat until outputs are functionally equivalent

This process was repeated multiple times during the refactoring. Each round caught different issues:

- **Round 1:** Missing content sections (entire files not being processed)
- **Round 2:** Formatting differences (section headers, indentation)
- **Round 3:** Edge cases (empty files, files with unusual frontmatter)

### Why This Matters More Than Tests

Unit tests verify specific behaviors in isolation. Side-by-side comparison verifies the **overall behavior** of the system. The distinction matters because:

- **Integration gaps** — Individual functions may work correctly, but the composition may skip steps
- **Content completeness** — A test might verify "output contains section X" but miss that section Y is entirely absent
- **Ordering and structure** — Tests may not check that sections appear in the expected order
- **Subtle regressions** — A refactored function may return slightly different results that are technically valid but functionally incomplete

### When to Use This Pattern

Side-by-side comparison is most valuable when:

- Rewriting a tool from scratch (new architecture, same expected output)
- Migrating between runtimes (ts-node → tsx, Python 2 → 3)
- Changing data processing pipelines (new template engine, different parser)
- Restructuring without changing behavior (monolith → package)

It is less useful when:

- The output format is intentionally changing
- The old implementation has known bugs that the new one should fix
- The tool has comprehensive test coverage with output snapshots

### Practical Tips

- **Automate the comparison** — Create a script that runs both implementations and diffs the output
- **Normalize before comparing** — Strip timestamps, whitespace variations, and other non-semantic differences
- **Keep the old implementation runnable** — Don't delete it until parity is confirmed; keep it on a branch or in a backup directory
- **Document divergences** — If the new output intentionally differs (improvements), document why so reviewers don't flag it as a regression

## Related Concepts

- [[concepts/standalone-to-workspace-package-refactoring]] — The refactoring context where this pattern was applied
- [[concepts/typecheck-validation-gates]] — TypeScript compilation catches type-level issues; side-by-side comparison catches behavioral issues
- [[concepts/systematic-feature-implementation-phases]] — Verification at phase boundaries is a similar concept applied to new features rather than refactors

## Sources

- [[daily/2026-04-18.md]] — "Feature parity verification (running old vs new side-by-side) caught several gaps that would have been missed"
- [[daily/2026-04-18.md]] — "Multiple rounds of 'run both old and new compilers and compare' to ensure feature parity"
- [[daily/2026-04-18.md]] — "Finds and fixes several issues in the new compiler; achieves feature parity with improvements"
