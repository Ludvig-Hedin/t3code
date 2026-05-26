---
title: Multi-Agent Holistic Verification Pattern
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Multi-Agent Holistic Verification Pattern

When dispatching parallel agents to work on the same codebase, run holistic verification (lint, format, typecheck) between phases rather than trusting individual agent reports.

## Key Points

- Parallel agents may touch the same files, creating merge conflicts or syntax errors invisible to individual agents
- Turbo cache can report stale results if not properly invalidated between agent runs
- Run cumulative `lint` + `fmt` after each phase completes, before dispatching the next wave
- A single syntax error (e.g., OnboardingSheet.tsx:176) can block entire subsequent phases

## Details

In multi-agent workflows where 6+ agents execute in parallel during Phase 1, each agent operates in isolation and reports success based on its local view. However, when multiple agents modify the same file (e.g., ChatView.tsx, Sidebar.tsx), the merged result may contain:

1. **Syntax errors** from conflicting edits or incomplete merges
2. **Import conflicts** where both agents add the same import differently
3. **Style inconsistencies** that lint would catch but individual agents don't see

The holistic verification pattern addresses this by:

1. **Completing all Phase N agents** before any verification
2. **Running `turbo lint fmt` (or equivalent)** with cache invalidation
3. **Fixing any errors** discovered in the merged state
4. **Only then** dispatching Phase N+1 agents

This pattern proved essential in t3code UX overhaul where Phase 1 (6 parallel agents) completed with a syntax error in OnboardingSheet.tsx that was only discovered during holistic verification, not by any individual agent.

## Related Concepts

- [[concepts/turbo-cache-staleness-multi-agent]] — Cache invalidation issues compound the verification problem
- [[concepts/typecheck-validation-gates]] — TypeCheck between phases is one form of holistic verification
- [[concepts/systematic-feature-implementation-phases]] — Multi-phase implementation benefits from verification gates

## Sources

- daily/2026-05-10.md — Session (15:49): "Holistic verification needed between phases because multiple agents touched same files"
- daily/2026-05-10.md — Session (23:13): "Phase 1 agents (6 parallel) completed with stale turbo cache issue requiring holistic verify"
