---
title: "Connection: Defensive Programming Patterns for External Tool Integration"
connects:
  - "concepts/git-branch-agnostic-operations"
  - "concepts/ollama-concurrent-safety-patterns"
  - "concepts/terminal-command-generation-with-llms"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Defensive Programming Patterns for External Tool Integration

## The Connection

When integrating external tools (git, Ollama, other system processes), three defensive patterns emerge repeatedly: validating assumptions before use, serializing concurrent operations, and gracefully handling failures. These patterns are not specific to any single tool—they reflect a universal principle of robust integration: **trust nothing about the external system's state; validate everything and handle failures gracefully.**

## Key Insight

Naive tool integration assumes ideal conditions:

- Git repo has `main` branch (wrong for many repos)
- Ollama isn't already running (race condition if concurrent)
- LLM requests succeed instantly (fails when model not cached)

Real-world integration requires defensive layering:

1. **Validate assumptions** (branch exists, process state, model available)
2. **Handle concurrency** (serialize operations, piggyback waiting callers)
3. **Degrade gracefully** (fallback defaults, error messages, timeouts)

In other words: **treat every external tool like it's in an unknown state, and write code that handles any state safely.**

## Evidence

From the daily log, three independent tool integrations all required defensive patterns:

1. **Git branch resolution** - "Hardcoded `main` branch assumption causing git failures" → solved by validating branch exists and falling back through common defaults

2. **Ollama concurrent initialization** - "Concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes" → solved by piggyback serialization pattern

3. **Ollama model availability** - "Ollama integration with fallback: 60s model cache; falls back to `llama3.2` if tags endpoint fails" → solved by validation + graceful degradation

Each case follows the same meta-pattern:

- Assume the worst (process not running, branch doesn't exist, model not cached)
- Validate before using
- Provide fallback if validation fails
- Error gracefully if all fallbacks exhausted

## Design Implications

This connection suggests a checklist for any external tool integration:

- [ ] **Validate critical assumptions** - What must be true for this to work? (branch exists, process running, resource available)
- [ ] **Implement fallbacks** - What's the next-best option if assumption #1 fails?
- [ ] **Serialize if concurrent** - Can multiple callers race? If yes, implement lock/piggyback pattern
- [ ] **Test error paths** - What happens if the tool is unavailable? Is error message meaningful?
- [ ] **Timeout gracefully** - Requests shouldn't hang forever; use timeouts with meaningful fallbacks

## Related Concepts

- [[concepts/git-branch-agnostic-operations]] - Validation + fallback pattern applied to git
- [[concepts/ollama-concurrent-safety-patterns]] - Serialization + validation pattern applied to process spawning
- [[concepts/terminal-command-generation-with-llms]] - Graceful degradation pattern applied to LLM availability
