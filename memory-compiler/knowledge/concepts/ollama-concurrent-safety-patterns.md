---
title: "Ollama Concurrent Safety and Piggyback Serialization Pattern"
aliases: [ollama-race-condition, process-serialization, piggyback-pattern, spawn-safety]
tags: [concurrency, subprocess, safety, external-services]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Ollama Concurrent Safety and Piggyback Serialization Pattern

External services that spawn system processes (like `ollama serve`) are vulnerable to race conditions when multiple concurrent callers attempt to initialize them simultaneously. Without serialization, all concurrent callers can spawn separate processes, creating redundant resource consumption and unpredictable state. The piggyback serialization pattern allows waiting callers to share a single initialization operation while safely validating their own working URL afterward.

## Key Points

- **Concurrent spawn problem** - Multiple callers of `ensureOllamaRunning()` can each spawn `ollama serve` processes without coordination
- **Piggyback pattern** - Waiting callers skip their own spawn and await the first caller's shared promise, then validate independently
- **Fast-path + lock path** - All callers first probe candidate URLs directly (fast); if lock held, await shared promise then re-check
- **Lock-holding caller owns spawn** - Only the first caller (without held lock) executes the expensive spawn operation
- **Lock cleared in finally** - Lock is always released; future initialization attempts get fresh spawn attempts if Ollama crashes
- **Waiting callers validate independently** - Don't trust the promise's return value; each caller re-validates their own URL

## Details

The race condition manifests when multiple requests arrive before Ollama is running:

```
Request 1 → ensureOllamaRunning()
Request 2 → ensureOllamaRunning()  (concurrent)
Request 3 → ensureOllamaRunning()  (concurrent)

Without serialization:
- Request 1 spawns `ollama serve` process
- Request 2 spawns another `ollama serve` process (doesn't know about #1)
- Request 3 spawns another `ollama serve` process
→ Three processes running, resource waste, unpredictable behavior
```

The piggyback pattern uses a module-level promise as a lock:

```typescript
let ensureOllamaPromise: Promise<string | null> | null = null;

async function ensureOllamaRunning(): Promise<string | null> {
  // Fast path: probe all candidates immediately
  const probed = await probeAllCandidates();
  if (probed) return probed;

  // Lock check: if someone is already spawning, wait for them
  if (ensureOllamaPromise) {
    await ensureOllamaPromise;
    // After they finish, re-validate our own URL (don't trust their return value)
    return pingOllama();
  }

  // We own the lock; spawn Ollama
  ensureOllamaPromise = (async () => {
    try {
      spawn("ollama", ["serve"], { detached: true });
      // Wait for it to become available
      await waitForOllama();
      return pingOllama();
    } finally {
      ensureOllamaPromise = null; // Release lock for future callers
    }
  })();

  return ensureOllamaPromise;
}
```

**How this works:**

1. **Request 1** enters: fast-path probe fails, no lock held, spawns Ollama, sets `ensureOllamaPromise`
2. **Request 2** (concurrent) enters: fast-path probe fails, lock IS held (promise exists), awaits Request 1's promise
3. **Request 3** (concurrent) enters: same as Request 2, awaits the same promise
4. **Ollama starts** - Request 1 detects it, returns working URL
5. **Request 2** wakes up from await, but doesn't trust Request 1's return value; calls `pingOllama()` independently to find their own working URL (or confirms it works)
6. **Request 3** same as Request 2
7. **Lock is cleared** in finally; if Ollama crashes, next initialization attempt will spawn it again

### Why "Piggyback"?

Requests 2 and 3 don't do their own spawn—they piggyback on Request 1's spawn. But they don't blindly trust Request 1's result; they independently validate that Ollama is running. This is safer than a naive promise-return pattern where callers trust the promise's value without checking.

### Key Implementation Details

- **Finally block is critical** - Ensures lock is always released, even if spawn fails
- **Each caller re-validates** - Don't assume the promise's return value is your working URL
- **Fast-path is always first** - Minimize time locked; probe all candidates before checking lock
- **Detached process spawn** - Ollama process survives after function returns: `{detached: true}` on spawn

## Related Concepts

- [[concepts/git-branch-agnostic-operations]] - Another defensive programming pattern with external tools
- [[concepts/subprocess-detachment-macos]] - Platform-specific process management (used in Ollama spawn)

## Sources

- [[daily/2026-04-12.md]] - Fixed race condition in OllamaAdapter.ts where concurrent `ensureOllamaRunning` calls spawned multiple processes
- [[daily/2026-04-12.md]] - Implemented piggyback serialization: fast-path probing + lock-guarded spawn + waiting callers re-validate independently
- [[daily/2026-04-12.md]] - Root cause was no serialization between concurrent callers; multiple detached `ollama serve` processes spawned simultaneously
- [[daily/2026-04-12.md]] - Pattern prevents thundering herd; ensures only first caller owns the spawn operation
