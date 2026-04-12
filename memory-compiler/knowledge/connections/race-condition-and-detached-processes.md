---
title: "Connection: Race Condition Serialization Requires Detached Process Spawning"
connects:
  - "concepts/race-condition-serialization-piggyback"
  - "concepts/subprocess-detachment-macos"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Race Condition Serialization Requires Detached Process Spawning

## The Connection

The piggyback pattern for race condition serialization only works if spawned processes are **detached**—they must survive after the JavaScript process returns. Without detachment, the first concurrent caller spawns a process, returns, and the process dies. Subsequent piggybacking callers await a promise for a process that no longer exists, defeating the whole pattern.

## Key Insight

The two patterns are inseparable: the serialization lock only makes sense if the resource being spawned (an external process like `ollama serve`) can outlive the JavaScript call that spawned it. If the process must be kept alive by the calling context, the piggyback pattern falls apart—you can't return a promise for work that must be actively maintained.

In other words: **detached process spawning enables the piggyback pattern to work**.

## Evidence

From the daily log:

1. **Detachment is necessary**: The OllamaAdapter spawns `ollama serve` with `start_new_session=True` (on macOS), ensuring the process detaches

2. **Piggyback pattern assumes detachment**: "Lock owner clears the promise in a `finally` block so future calls can attempt fresh spawn if needed" — this only works if the spawned process continues running after the promise resolves

3. **Without detachment, the pattern breaks**: If `ollama serve` died when the spawn caller exited, piggybacking callers would probe an already-dead process and fail

4. **Self-healing depends on detachment**: "Allows self-healing if Ollama crashes between messages" — subsequent callers can spawn a fresh process because the original detached process can die independently

## Design Implications

When implementing the piggyback pattern:

- Always spawn with detachment on your target platform
- Don't assume the process stays alive because of your JavaScript context (it doesn't)
- Allow the process to be managed externally (e.g., systemd, supervisor, user manually)
- Test on multiple platforms—detachment is OS-specific (`start_new_session` on macOS/Linux; `CREATE_NEW_PROCESS_GROUP` on Windows)

## Related Concepts

- [[concepts/race-condition-serialization-piggyback]] - The serialization pattern
- [[concepts/subprocess-detachment-macos]] - The process spawning mechanism
- [[concepts/hook-execution-context]] - Similar detachment requirement for hook subprocess spawning
