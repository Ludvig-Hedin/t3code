---
title: "Process Serialization with Module-Level Promise Locks"
aliases: [race-condition-mitigation, promise-lock, piggyback-pattern, concurrent-spawning]
tags: [concurrency, subprocess, process-management, ollama]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Process Serialization with Module-Level Promise Locks

Concurrent calls to spawn external processes (e.g., `ollama serve`) can result in multiple processes running simultaneously, wasting resources and causing unexpected behavior. A module-level promise lock with a "piggyback" pattern prevents this: the first caller spawns the process and holds the lock; subsequent concurrent callers await the shared promise, then validate the result themselves before returning. The lock owner clears the promise in a `finally` block to allow fresh spawn attempts if the process later crashes or is restarted.

## Key Points

- **Race condition:** Without serialization, concurrent callers all spawn new processes independently
- **Lock mechanism:** Module-level `ensureOllamaPromise: Promise | null` variable holds the lock
- **Fast path:** All callers first probe candidate URLs directly (before consulting lock) for quick success
- **Piggyback path:** If lock is held, concurrent caller awaits, then re-validates their own result
- **Self-healing:** Lock is cleared in `finally` block, allowing fresh spawn on future calls (e.g., if Ollama crashes)

## Details

### The Race Condition

```typescript
// ❌ PROBLEMATIC: No serialization
async function ensureOllamaRunning() {
  const working = await pingOllama();
  if (working) return working;

  // Two concurrent callers both reach here!
  spawn("ollama", ["serve"]); // Process 1 spawned
  spawn("ollama", ["serve"]); // Process 2 spawned (duplicate!)

  return await waitForOllama();
}
```

When two requests arrive before `waitForOllama()` completes, both callers spawn the `ollama` process. This is the "thundering herd" problem: multiple processes competing for the same resource (port 11434) causing failures or unpredictable behavior.

### The Correct Pattern: Promise Lock with Piggyback

```typescript
// Module-level lock variable
let ensureOllamaPromise: Promise<string | null> | null = null;

async function ensureOllamaRunning(): Promise<string | null> {
  // Fast path: All callers probe directly first (quick success if already running)
  const working = await pingOllama();
  if (working) return working;

  // Lock path: If someone else is spawning, piggyback their result
  if (ensureOllamaPromise) {
    await ensureOllamaPromise;
    // Don't trust the promise's return value — validate our own
    return await pingOllama();
  }

  // Lock owner: This caller spawns the process
  ensureOllamaPromise = (async () => {
    try {
      spawn("ollama", ["serve"]);
      return await waitForOllama();
    } finally {
      // Clear the lock so future calls get a fresh spawn attempt
      ensureOllamaPromise = null;
    }
  })();

  return await ensureOllamaPromise;
}
```

### How It Works

1. **First caller arrives:**
   - Fast path probe fails (Ollama not running)
   - No lock held yet (`ensureOllamaPromise === null`)
   - Caller becomes lock owner, spawns process, holds promise
2. **Second caller arrives while first is still spawning:**
   - Fast path probe fails
   - Lock is held (`ensureOllamaPromise !== null`)
   - Caller awaits the shared promise (piggyback)
   - After promise resolves, caller re-validates with `pingOllama()` to get their own URL
3. **Third caller arrives after process starts:**
   - Fast path probe succeeds
   - Returns immediately (never consults lock)
4. **Process crashes later:**
   - Next caller arrives
   - Fast path fails (process is gone)
   - Lock is clear (was `finally`-cleared by first caller)
   - Caller becomes new lock owner, spawns fresh process

### Why Piggyback Re-validates

The second caller doesn't trust the promise's return value directly. Instead:

```typescript
// ❌ DON'T DO THIS: Trusts promise's return value
const url = await ensureOllamaPromise;
return url; // Might be wrong for this caller

// ✅ DO THIS: Re-validates
await ensureOllamaPromise;
return await pingOllama(); // Returns correct URL for this caller
```

Why? The promise might return one URL (e.g., `http://localhost:11434`), but the caller could have different candidate URLs or network configuration. Re-validating ensures each caller gets the correct URL for their context.

### Application in Bird Code

The `OllamaAdapter.ts` uses this pattern to prevent multiple `ollama serve` spawns:

```typescript
class OllamaAdapter {
  private static ensureOllamaPromise: Promise<string | null> | null = null;

  static async ensureOllamaRunning() {
    // ... fast path and lock logic ...
  }
}
```

This is critical for production use: users may trigger multiple concurrent requests before Ollama starts. Without serialization, the server would spawn 10+ processes, consuming resources and creating port conflicts.

## Related Concepts

- [[concepts/subprocess-detachment-macos]] - How to spawn background processes correctly
- [[concepts/race-condition-detection-patterns]] - How to identify concurrency issues in code
- [[concepts/error-handling-for-external-processes]] - Graceful failure modes for subprocess spawning

## Sources

- [[daily/2026-04-12.md]] - "Fixed a critical race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes simultaneously"
- [[daily/2026-04-12.md]] - "Introduced module-level `ensureOllamaPromise: Promise<string | null> | null = null` as the serialization lock... Piggyback path: if lock is held, concurrent caller awaits that promise, then calls `pingOllama` themselves to confirm and return the correct working URL"
- [[daily/2026-04-12.md]] - "Lock owner clears the promise in a `finally` block so future calls (e.g. user restarts Ollama) get a fresh spawn attempt"
