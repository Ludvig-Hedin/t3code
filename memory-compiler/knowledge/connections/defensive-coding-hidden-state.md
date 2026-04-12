---
title: "Connection: Defensive Coding Patterns for Hidden State and Silent Failures"
connects:
  - "concepts/concurrent-process-serialization"
  - "concepts/git-branch-resolution-fallback-chains"
  - "concepts/bun-cache-corruption-repair"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Defensive Coding Patterns for Hidden State and Silent Failures

## The Connection

Three seemingly unrelated bugs in the daily log share a common root: hidden state that diverges silently between callers or operations. The Ollama adapter can spawn multiple processes; git tools can use wrong branches; package managers cache metadata invisibly. Without defensive verification and explicit serialization, failures manifest as cryptic runtime errors far removed from their causes. The fix pattern is consistent: verify assumptions, use locks/chains, and fail loudly instead of silently.

## The Pattern

All three issues follow this arc:

1. **Hidden state** - Something is tracked outside the caller's control (running process, default branch, cache metadata)
2. **Silent divergence** - State changes without caller knowledge (race condition, branch doesn't exist, cache corrupts)
3. **Cryptic symptom** - By the time the caller notices, the error message points elsewhere (Ollama service down, "unknown revision", "cannot find module")
4. **Root cause hidden** - Debugging requires understanding the hidden state mechanism (process spawning, branch resolution, cache structure)

## Evidence

**Process Spawning Race Condition** - Multiple callers attempt to spawn Ollama simultaneously. Without a lock, multiple processes start. Hidden state: "is the process already starting?" Divergence: each caller sees different state. Symptom: "Ollama port already in use" or "connection refused" errors far downstream. Fix: explicit promise-based lock.

**Git Branch Hardcoding** - Tool assumes `main` exists globally. Hidden state: repo's default branch name. Divergence: different repos have different defaults. Symptom: "git log main..HEAD fails with unknown revision" (error is about git, not about branch selection). Fix: fallback chain with verification.

**Package Cache Corruption** - Bun caches metadata invisibly. Hidden state: `.bun/` directory state. Divergence: corruption isn't visible in lockfile or code. Symptom: "cannot find module 'X'" despite package being installed. Fix: full reinstall to regenerate cache.

## The Defensive Pattern

All three have the same structural fix:

| Issue                 | Hidden State           | Verification                                  | Serialization                                   |
| --------------------- | ---------------------- | --------------------------------------------- | ----------------------------------------------- |
| **Process spawning**  | "Is process starting?" | Fast-path probe before lock                   | Promise-based lock on spawn                     |
| **Branch resolution** | "Does branch exist?"   | Check branch against actual git refs          | Fallback chain through defaults                 |
| **Cache corruption**  | "Is cache valid?"      | Check against authoritative source (lockfile) | Full reinstall regenerates from source of truth |

The general principle: **fast-path check, serialized slow-path, explicit error**. Don't assume; verify.

## Implications for Tooling

1. **Avoid ambient hidden state** - Processes, caches, and default configs are ambient. Make their state explicit or provide a way to query it.

2. **Provide diagnostic tools** - Tools should report what hidden state they see:

   ```
   ollama: probed localhost:11434 - not running
   ollama: spawning new instance...
   ```

3. **Fail explicitly** - Don't silently use a wrong default. If you can't find the right state, error loudly:

   ```
   fatal: couldn't resolve default branch
   tried: ["main", "master", "develop", "trunk"]
   please check your git configuration
   ```

4. **Rebuild from authoritative source** - When in doubt, regenerate hidden state from source of truth:
   ```
   cache corrupted; regenerating from lockfile...
   ```

## Related Concepts

- [[concepts/concurrent-process-serialization]] - The process spawning side
- [[concepts/git-branch-resolution-fallback-chains]] - The branch resolution side
- [[concepts/bun-cache-corruption-repair]] - The cache/package management side
