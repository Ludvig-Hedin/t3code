---
title: "Race Condition Serialization with Piggyback Pattern"
aliases: [serialization-lock, piggyback-pattern, concurrent-resource-spawning]
tags: [concurrency, server, process-management, synchronization]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Race Condition Serialization with Piggyback Pattern

When multiple concurrent callers need to spawn expensive resources (like external processes), a naive lock approach forces all-or-nothing serialization. The piggyback pattern improves on this by allowing subsequent callers to "piggyback" on an in-flight operation, then re-validate independently after the operation completes. This prevents resource leaks (multiple detached processes) while allowing parallelism in non-blocking code paths.

## Key Points

- **Naive locking forces sequential access** - First caller holds lock; others wait; all callers block
- **Piggyback pattern splits logic into fast and slow paths** - Fast path probes directly; slow path uses shared lock
- **Subsequent callers re-validate after lock** - Don't trust the shared promise's return value; re-check conditions yourself
- **Lock owner spawns the resource; lock is cleared in finally** - Ensures cleanup and allows future calls to spawn fresh if needed
- **Prevents thundering herd** - Concurrent spawn calls don't create multiple detached processes; only first caller spawns
- **Enables self-healing** - If process crashes between messages, next caller can detect and re-spawn

## Details

### The Problem

Without serialization:

```typescript
// ❌ WRONG: concurrent calls spawn multiple processes
async ensureOllamaRunning() {
  const proc = spawn("ollama", ["serve"]);
  // If called 10 times simultaneously:
  // → 10 detached processes spawned
  // → resource leak, port conflicts, zombie processes
}

// Called from multiple message handlers simultaneously:
// User sends two fast messages → two concurrent calls → chaos
```

### Naive Lock (Too Strict)

```typescript
// ⚠️ Works but blocks everyone
let lock = null;

async ensureOllamaRunning() {
  while (lock) {
    await lock; // blocking wait
  }

  lock = spawn("ollama", ["serve"]);
  lock = null;
}
```

This serializes all access; concurrent calls queue up waiting for the lock.

### Piggyback Pattern (Optimal)

```typescript
// ✅ CORRECT: Fast path + piggyback + re-validation
let ensureOllamaPromise = null;

async ensureOllamaRunning() {
  // Fast path: all callers probe the working URL directly
  const working = await pingOllama(); // tries all candidate URLs
  if (working) return working;

  // No working instance found; enter slow path
  // Check if another caller is already spawning one
  if (ensureOllamaPromise) {
    // Piggyback: wait for that operation to complete
    await ensureOllamaPromise;
    // Then re-check ourselves (don't trust the promise's return value)
    const working = await pingOllama();
    if (working) return working;
    // If still not working, we'll spawn below
  }

  // Lock owner path: we're first to enter slow path
  // Spawn the process and hold the promise
  ensureOllamaPromise = (async () => {
    const proc = spawn("ollama", ["serve"]);
    // Process runs detached; we can return immediately
    // Give it time to start up
    await new Promise(resolve => setTimeout(resolve, 2000));
    // Then probe to confirm it's running
    return await pingOllama();
  })();

  try {
    return await ensureOllamaPromise;
  } finally {
    // Clear the lock so future callers can attempt fresh spawn
    ensureOllamaPromise = null;
  }
}
```

### Call Timeline

```
Time  Caller1                  Caller2                   Caller3
----  -------                  -------                   -------
T0    Fast path: probe()       Fast path: probe()        Fast path: probe()
      → None working           → None working            → None working

T1    Piggyback check: null    Piggyback check: promise  Piggyback check: promise
      → I'm first              → Piggyback wait          → Piggyback wait
      → Set ensurePromise
      → Spawn ollama

T2    Process detaching       Waiting...                Waiting...

T3                            Lock clears (finally)
                              Re-validate: probe()
                              → Working! Return

T4                                                     Lock cleared (finally)
                                                       Re-validate: probe()
                                                       → Working! Return
```

**Result:** One process spawned; three callers got the result safely.

### Key Implementation Details

**1. Fast path is non-blocking** - Probing candidate URLs directly (e.g., GET requests to localhost:11434) is fast and doesn't block other code

**2. Piggyback callers re-validate** - After awaiting the shared promise, they probe themselves. They don't return the promise's value directly because:

- The promise might have resolved with a stale URL
- Another caller might have detected the process crashed and should spawn fresh
- Each caller validates independently

**3. Lock is cleared in finally** - If the spawn succeeds, the finally clears it. If spawn fails or times out, finally still clears it, allowing the next message to attempt a fresh spawn.

**4. Process is detached** - The spawned process (e.g., `ollama serve`) runs independently; the Node.js process doesn't wait for it or track it.

### When to Use This Pattern

- Resource acquisition (databases, cache servers, external processes)
- Expensive one-time initialization (connecting to remote service)
- Self-healing systems (process restarts between requests)

### When NOT to Use This Pattern

- Simple critical sections (use Mutex)
- Resources that should be truly shared and locked (use Semaphore)
- One-time startup (use initialization guards instead)

## Related Concepts

- [[concepts/subprocess-detachment-macos]] - Spawned processes must be detached; piggyback pattern works because of this
- [[concepts/systematic-feature-implementation-phases]] - This pattern ensures phase transitions (resource setup) don't become bottlenecks
- [[concepts/hook-execution-context]] - Similar pattern used for hook subprocess spawning

## Sources

- [[daily/2026-04-12.md]] - "Fixed critical race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes simultaneously"
- [[daily/2026-04-12.md]] - "Introduced module-level `ensureOllamaPromise: Promise<string | null> | null = null` as serialization lock with piggyback mechanism: fast-path probes all URLs first, then if locked, piggyback callers await shared promise and re-validate themselves"
- [[daily/2026-04-12.md]] - "Rationale: prevents multiple detached processes, ensures only first caller owns the spawn, subsequent callers share the result safely, and allows self-healing if Ollama crashes between messages"
