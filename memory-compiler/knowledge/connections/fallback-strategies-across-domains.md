---
title: "Connection: Fallback Strategies Across Git, Routing, and Service Discovery"
connects:
  - "concepts/git-branch-resolution-fallback"
  - "concepts/route-wildcard-trailing-slash"
  - "concepts/external-service-initialization-fallback"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Fallback Strategies Across Git, Routing, and Service Discovery

Three distinct debugging scenarios from this session all use the same fallback strategy pattern: when a tool needs to determine a value (branch name, route match, service URL) that varies by environment or configuration, try a prioritized list of candidates, fall back gracefully when none work, and provide meaningful feedback if all fail. This pattern appears in git branch detection, route matching, and external service initialization—suggesting it's a fundamental approach to handling variable environments.

## The Connection

Each scenario involves:

1. **Candidate list** - Multiple possible values (branches: main, master, develop; URLs: localhost:11434, :8080, :3000)
2. **Priority ordering** - Try most likely first (main before master; local before remote)
3. **Validation** - Verify each candidate works before using it
4. **Graceful fallback** - If top choices fail, expand search or use defaults
5. **Error propagation** - If all fail, let downstream code handle it naturally rather than forcing wrong state

### Git Branch Resolution

```
Try: [main, master, develop, trunk]
Fall back to: any non-current local branch
Last resort: hardcoded main (let git error naturally)
```

### Route Matching

```
Try: /preview/:projectId/:appId/* (specific pattern)
Fall back to: /preview/* (broader pattern)
Last resort: static/catch-all layer
```

### Ollama Service Discovery

```
Try: [localhost:11434, localhost:8080, env.OLLAMA_BASE_URL]
Fall back to: [llama3.2 model, default]
Last resort: skip service (non-fatal)
```

## Key Insight

These patterns are **NOT** specific to git/routing/services. They're a general approach to handling **optional dependencies with graceful degradation**:

- Git: branch choice is optional (could use any branch for review)
- Routing: specific service location is optional (could use catch-all)
- Ollama: specific model is optional (could use default)

The pattern becomes: "Try the user's preference (or config), then try common defaults, then try anything that works, then fail cleanly."

## Evidence

All three scenarios explicitly include fallback chains and validation:

1. **Git:** "Implemented walking through common defaults to find first existing branch. Fall back to any non-current local branch, then allow git to error naturally."

2. **Routing:** "Broadened route pattern to `/preview/*` to catch trailing-slash-only navigation" — expanding scope when specific pattern fails

3. **Ollama:** "Ollama client uses 60s model cache + fallback to `llama3.2` if discovery fails" — try specific, fall back to default

## Design Pattern Generalization

The meta-pattern for any "find optional dependency" problem:

```
1. Get user preference (env var, config, argument)
2. If not provided, try common defaults in priority order
3. Validate each candidate
4. If validation fails, try next candidate
5. If all candidates fail:
   a. If optional, use safe default
   b. If required, error with meaningful message (not silent failure)
```

This pattern works because it's **explicit about priorities** while **non-prescriptive about exact values**—the candidates can be anything.

## Related Concepts

- [[concepts/git-branch-resolution-fallback]] - Fallback in git domain
- [[concepts/route-wildcard-trailing-slash]] - Fallback in routing domain
- [[concepts/external-service-initialization-fallback]] - Fallback in service discovery domain
