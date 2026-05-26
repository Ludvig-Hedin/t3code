---
title: Turbo Cache Staleness in Multi-Agent Workflows
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Turbo Cache Staleness in Multi-Agent Workflows

Turborepo's build cache can report stale (passing) results when multiple agents modify files in parallel, because cache invalidation doesn't see intermediate file states.

## Key Points

- Turbo caches task outputs based on file hashes at task start
- Parallel agents writing to same files create race conditions in cache key computation
- Always run lint + fmt **cumulatively** after multi-agent phases complete
- "All agents report success" is insufficient; holistic verification is required

## Details

Turborepo (and similar build cache systems) compute cache keys from input file hashes. When multiple agents run in parallel:

1. **Agent A** reads file X, modifies it, turbo caches based on X's original hash
2. **Agent B** reads file X (same original), modifies it differently
3. **Turbo** may serve cached "success" results from Agent A even after Agent B's changes

### The Staleness Problem

In the t3code UX overhaul, Phase 1 dispatched 6 parallel agents. Each agent reported success after its lint pass. However:

- Multiple agents touched `ChatView.tsx` and `Sidebar.tsx`
- A syntax error existed in `OnboardingSheet.tsx:176` that no individual agent saw
- Only holistic verification after Phase 1 completion discovered the issue

### Mitigation Strategies

1. **Run cumulative verification** after each phase: `turbo lint fmt --force` (bypass cache)
2. **Sequence file-touching agents** if same files are known targets
3. **Use `--force` flag** for critical verification passes
4. **Treat individual agent "success" as provisional** until holistic pass confirms

### When It Matters

- Multi-agent code generation/modification
- Parallel test runs that modify shared fixtures
- CI pipelines with parallel lint/build jobs
- Monorepo operations across packages

## Related Concepts

- [[concepts/multi-agent-holistic-verification-pattern]] — The pattern that addresses turbo cache staleness
- [[concepts/typecheck-validation-gates]] — Another verification mechanism between phases
- [[concepts/bun-cache-corruption-repair]] — Different cache problem (corruption vs staleness)

## Sources

- daily/2026-05-10.md — Session (15:49): "Turbo cache can be stale - run lint + fmt cumulatively after multi-agent file touches"
- daily/2026-05-10.md — Session (23:13): "Turbo cache can go stale when multiple agents touch same files — always run holistic verify between phases"
