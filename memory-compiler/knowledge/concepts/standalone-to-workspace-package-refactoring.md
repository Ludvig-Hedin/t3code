---
title: "Standalone Tool to Workspace Package Refactoring"
aliases: [package-refactoring, monorepo-integration, cli-to-library]
tags: [architecture, refactoring, monorepo, packaging]
sources:
  - "daily/2026-04-18.md"
created: 2026-04-18
updated: 2026-04-18
---

# Standalone Tool to Workspace Package Refactoring

Standalone CLI tools that grow into components of a larger system need structured refactoring to become proper workspace packages. The memory compiler was originally run via `npx ts-node src/index.ts` and restructured into a workspace package under `packages/memory-compiler` with a programmatic API, proper exports, and npm scripts (`npm run compile`). The refactoring followed an 8-step plan: directory restructuring, types/interfaces, core compiler, error handling, logging, CLI wrapper, tests, and documentation.

## Key Points

- **Programmatic API first** — Create a `MemoryCompiler` class with methods callable from other packages, not just a CLI entry point
- **Runtime switch from ts-node to tsx** — `tsx` is faster and requires less configuration than `ts-node` for TypeScript execution
- **Barrel exports** — Package exposes clean API via `index.ts` barrel file; consumers import types and the compiler class
- **Feature parity verification** — Run both old and new implementations side-by-side to catch regression gaps before switching
- **Phased implementation** — Break the refactoring into 8 discrete steps with verification at each boundary to avoid integration drift

## Details

### The Refactoring Pattern

A standalone tool typically has:

- A single entry point (`src/index.ts`)
- Hardcoded paths and configuration
- No programmatic API (CLI-only)
- Its own dependency management outside the monorepo

Refactoring into a workspace package requires:

1. **Directory restructuring** — Move from standalone directory to `packages/` or keep in place but add proper `package.json` with exports
2. **Programmatic API** — Extract the core logic into a class or function that can be imported by other packages
3. **Configuration schema** — Replace hardcoded values with a typed configuration object with sensible defaults
4. **Barrel exports** — Create `index.ts` that exports types, the compiler class, and utility functions
5. **Workspace integration** — Add to monorepo workspace in root `package.json`
6. **CLI wrapper** — Keep CLI functionality as a thin wrapper around the programmatic API (using `commander.js` or similar)

### Implementation Order

The memory compiler refactoring followed this specific order, with TypeScript compilation verification between steps:

```
Step 1: Directory structure + package.json → verify tsc
Step 2: Types & interfaces → verify tsc
Step 3: Core compiler class → verify tsc
Step 4: Error handling → verify tsc
Step 5: Output formatters (markdown, JSON, plain) → verify tsc
Step 6: CLI wrapper with commander.js → verify tsc
Step 7: Tests → verify tests pass
Step 8: Documentation → verify docs accurate
```

Each step builds on the previous one. Running TypeScript compilation between steps catches integration mismatches early (see [[concepts/typecheck-validation-gates]]).

### Feature Parity Verification

A critical step in the refactoring was running the old and new compilers side-by-side:

```bash
# Run old compiler
npx ts-node src/index.ts

# Run new compiler
npm run compile

# Compare outputs
diff old-output.md new-output.md
```

This comparison caught several gaps: missing content sections, formatting differences, and edge cases the new implementation didn't handle. Multiple rounds of comparison were needed before achieving full parity.

### Key Technical Decisions

- **tsx over ts-node** — `tsx` (TypeScript Execute) uses esbuild under the hood, providing faster startup and execution without requiring separate `tsconfig` configuration for execution
- **Kept template system simple** — Rejected plugin/template flexibility in favor of a single Handlebars template that is manually updated when needed
- **Configuration with defaults** — New configuration schema provides sensible defaults so the compiler works out of the box for the common case

## Related Concepts

- [[concepts/systematic-feature-implementation-phases]] — The phased approach mirrors the 8-phase pattern used for feature implementation
- [[concepts/typecheck-validation-gates]] — TypeScript compilation between refactoring steps catches integration issues early
- [[concepts/venv-isolation-with-uv]] — The original standalone tool used uv isolation; the package approach replaces this with workspace integration
- [[concepts/memory-compiler-three-stage-pipeline]] — The compiler being refactored is Stage 3 of this pipeline

## Sources

- [[daily/2026-04-18.md]] — "Memory compiler restructured as a proper workspace package under `packages/memory-compiler`"
- [[daily/2026-04-18.md]] — "Switched from `ts-node` to `tsx` for faster TypeScript execution"
- [[daily/2026-04-18.md]] — "Feature parity verification (running old vs new side-by-side) caught several gaps that would have been missed"
- [[daily/2026-04-18.md]] — "Multiple rounds of TypeScript compilation fixes were needed after restructuring — always verify after major refactors"
