---
title: "Connection: Fallback Chain Pattern Across Domains"
connects:
  - "concepts/git-branch-agnostic-base-resolution"
  - "concepts/provider-default-model-fallback-chain"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Fallback Chain Pattern Across Domains

## The Connection

Both git branch resolution and provider model defaults use the same fallback chain pattern: validate a candidate, fall back through a priority-ordered list of defaults, validate each default, and ultimately fall back to "something available" or error handling. This pattern is domain-agnostic—it works for branch names, model names, or any configuration where reasonable defaults exist but no single default is universally correct.

## Key Insight

Many systems hardcode a single default assumption (e.g., "main" branch, "latest" model) and break when reality diverges. The fallback chain acknowledges that different contexts have different correct defaults and provides a deterministic priority order to find one.

The pattern consists of:

1. **Candidate check** - Is the caller's candidate valid?
2. **Priority defaults** - Try common defaults in order (main → master → develop)
3. **Ultimate fallback** - Use any available option, or error naturally

This pattern is **defensive by design**. It doesn't assume the environment is configured correctly; it validates assumptions at each step.

## Evidence

From the daily log:

1. **Git branches**: "Implement walking through common defaults (`["main", "master", "develop", "trunk"]`) to find first existing branch... fall back to any non-current local branch, then allow git to error naturally"

2. **Provider models**: "Fallback levels: per-provider override → global default → server default → available model → error handling... Empty string from reset operations need proper fallback chaining"

Both explicitly document their priority order and ultimate fallback behavior. Both validate at each step rather than assuming success.

## Design Pattern Generalization

```typescript
function resolveWithFallback<T>(
  candidate: T | null,
  defaults: T[],
  validator: (v: T) => boolean,
  ultimate?: () => T | null,
): T | null {
  // Try candidate
  if (candidate && validator(candidate)) {
    return candidate;
  }

  // Try defaults in order
  for (const def of defaults) {
    if (validator(def)) {
      return def;
    }
  }

  // Ultimate fallback
  return ultimate?.() ?? null;
}
```

This generic pattern works for branches, models, hosts, ports, or any configuration with multiple valid options.

## Why It Matters

Systems that hardcode defaults are brittle:

- Repo with `master` instead of `main` → crash
- Model provider that changes default → UI breaks
- Port number changes → connections fail

Systems with fallback chains are resilient:

- Try the expected default first (preserve user preferences)
- Fall back through common alternatives (handle config differences)
- Last resort: error naturally with a meaningful message

The pattern is particularly valuable in tools that work across many different user environments (different repo setups, different provider configurations, etc.).

## Related Concepts

- [[concepts/git-branch-agnostic-base-resolution]] - One application of the pattern
- [[concepts/provider-default-model-fallback-chain]] - Another application of the pattern
- [[concepts/process-serialization-piggyback-pattern]] - Related: validation patterns for uncertain state
