---
title: "Process Serialization with Promise Piggyback Pattern"
aliases: [process-serialization, piggyback-locking, concurrent-spawning]
tags: [concurrency, process-management, async-patterns]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Process Serialization with Promise Piggyback Pattern

When multiple callers need to ensure an external process (like `ollama serve`) is running, a naive approach allows concurrent callers to spawn multiple processes simultaneously—creating a "thundering herd." The solution is a module-level promise lock: the first caller spawns the process and holds a promise; concurrent callers piggyback on that promise, then validate their own working state before returning. This pattern prevents concurrent spawning while allowing fast-path callers to skip the lock entirely.

## Key Points

- **Race condition risk** - Multiple concurrent calls to `ensureOllamaRunning()` can spawn multiple `ollama serve` processes if not serialized
- **Fast-path optimization** - All callers first probe for running processes directly; only consult the lock if all probes fail
- **Piggyback contract** - Waiting callers must not blindly trust the lock promise's resolved value; they must re-validate their own working URL after awaiting
- **Self-healing design** - Lock is cleared in a `finally` block, allowing future calls to attempt a fresh spawn if Ollama crashes between requests
- **Platform agnostic** - Pattern works with any external process (database, cache, service)

## Details

### The Problem

```typescript
// WRONG: No serialization
async function ensureOllamaRunning() {
  if (!(await pingOllama())) {
    spawn("ollama", ["serve"]); // Multiple callers can all reach here
    // Each caller spawns a process!
  }
}
```

With concurrent traffic, multiple calls can all check `pingOllama()`, all fail, and all reach the `spawn()` line simultaneously. Result: 3+ `ollama serve` processes running.

### The Solution: Piggyback Locking

```typescript
let ensureOllamaPromise: Promise<string | null> | null = null;

async function ensureOllamaRunning(): Promise<string | null> {
  // Fast path: probe all candidates directly
  const fastPath = await probeAllUrls();
  if (fastPath) return fastPath;

  // Slow path: use lock to serialize spawn
  if (ensureOllamaPromise) {
    // Another caller is already handling spawn; piggyback
    await ensureOllamaPromise;
    // Don't trust the resolved value; validate our own state
    return await pingOllama();
  }

  // We own the spawn
  ensureOllamaPromise = (async () => {
    try {
      spawn("ollama", ["serve"]);
      // Wait for startup, with backoff
      for (let i = 0; i < 30; i++) {
        const working = await pingOllama();
        if (working) return working;
        await sleep(100);
      }
      return null;
    } finally {
      // Clear lock so future calls can try again if Ollama crashes
      ensureOllamaPromise = null;
    }
  })();

  return await ensureOllamaPromise;
}
```

### Why Piggyback Requires Re-validation

After awaiting the shared promise, the waiting caller cannot assume the spawn succeeded or that their preferred URL is available:

1. **Spawn may fail** - Process started but didn't become responsive
2. **Wrong URL** - Lock promise returned URL A, but caller's configuration needs URL B
3. **Crash after spawn** - Process started but crashed before caller wakes up
4. **Network conditions changed** - The URL that worked for the lock holder doesn't work now

The safe pattern: always re-check your own working state after piggyacking.

### Design Trade-offs

**Advantages:**

- Prevents thundering herd of spawns
- Fast path avoids lock entirely (most calls go through fast path)
- Self-healing if process crashes
- Simple, single-pointer state

**Disadvantages:**

- All waiting callers block until first spawn completes (15-30s)
- Waiting callers must re-validate (adds latency if spawn succeeded)
- If spawn fails, all waiting callers fail together (no retries)

### Related Pattern: Fallback Model Cache

The Ollama integration also uses a fallback model strategy: the process might start but with a cached model, or fall back to `llama3.2` if the cached model isn't available. This is orthogonal to process serialization but often paired.

## Related Concepts

- [[concepts/git-branch-resolution-fallback]] - Fallback strategy pattern applied to different domain (git)
- [[concepts/route-wildcard-trailing-slash]] - Both involve handling variable states and fallbacks

## Sources

- [[daily/2026-04-12.md]] - "Fixed race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes. Introduced module-level `ensureOllamaPromise` as serialization lock."
- [[daily/2026-04-12.md]] - "Clarified the serialization pattern: lock must use a piggyback mechanism where waiting callers re-check `pingOllama` themselves after awaiting the shared promise, rather than trusting the promise's resolved value directly."
- [[daily/2026-04-12.md]] - "Pattern prevents multiple detached processes, ensures only first caller owns the spawn, subsequent callers share the result safely, and allows self-healing if Ollama crashes between messages."
