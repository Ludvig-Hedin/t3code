---
title: "Concurrent Process Spawning and Lock-Based Serialization"
aliases: [process-serialization, race-conditions, piggyback-pattern, shared-promise-locking]
tags: [concurrency, process-management, synchronization-patterns]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Concurrent Process Spawning and Lock-Based Serialization

When multiple concurrent callers attempt to spawn an expensive or singleton process (like `ollama serve`), unprotected concurrent spawning creates multiple instances—a "thundering herd" problem. The solution uses a module-level promise as a lock: first caller acquires the lock by setting the promise, performs the spawn, and clears the lock in a `finally` block. Concurrent callers piggyback by awaiting the shared promise, then validate their own result independently. This pattern prevents duplicate spawning while allowing self-healing when processes crash.

## Key Points

- **Thundering herd problem** - Multiple concurrent `spawn()` calls create multiple processes without serialization
- **Promise-based lock pattern** - Use module-level `promise: Promise<T> | null` as a lock; `null` means unlocked
- **Piggyback mechanism** - Concurrent callers await the lock holder's promise, then re-validate independently
- **Lock holder responsibility** - First caller owns the spawn; must clear promise in `finally` for future calls
- **Fast-path checks** - Before consulting the lock, probe directly (allows retries if process crashed between calls)

## Details

The classic thundering herd scenario occurs in server-side helpers where multiple requests arrive simultaneously:

```typescript
// WRONG: no serialization
async function ensureServiceRunning() {
  const status = await checkService();
  if (!status.running) {
    spawn("service", ["start"]); // Multiple spawns if concurrent callers
  }
  return status;
}

// Two concurrent requests both pass checkService, both call spawn()
```

### Correct Pattern: Shared Promise Lock

```typescript
let ensurePromise: Promise<ServiceStatus | null> = null;

async function ensureServiceRunning(): Promise<ServiceStatus | null> {
  // Fast-path: all callers check directly first
  const direct = await probeService();
  if (direct) return direct;

  // Slow-path: acquire or await lock
  if (!ensurePromise) {
    ensurePromise = (async () => {
      try {
        // Only lock holder calls spawn
        await spawn("service", ["start"]);
        // Return what the lock holder found
        return await probeService();
      } finally {
        // CRITICAL: clear lock so future calls can retry
        ensurePromise = null;
      }
    })();
  }

  // Piggyback callers await the lock
  await ensurePromise;

  // But re-validate independently (don't trust the result)
  return await probeService();
}

async function probeService(): Promise<ServiceStatus | null> {
  try {
    return await fetch("http://localhost:8000/status");
  } catch {
    return null;
  }
}
```

### Why Piggyback Instead of Sharing the Result?

The lock holder returns its own probed status, but piggyback callers shouldn't trust it:

1. **Timing difference** - By the time piggyback caller resumes, service state may have changed
2. **Self-healing** - If service crashed after lock holder started it, piggyback caller detects the crash via independent probe
3. **URL locality** - Different callers may probe different URLs (e.g., intranet vs. public); lock holder's result may not apply

```typescript
// Example: distributed Ollama instances
// Lock holder probes http://localhost:11434
// Piggyback caller might probe http://intranet-ollama:11434
// Can't share results; must re-check independently
```

### Implementation in Memory Compiler Context

The Ollama adapter uses this pattern because:

- Startup is expensive (spawning the process, loading models)
- Multiple concurrent requests may arrive during cold start
- Lock holder owns the spawn; piggybacking callers validate independently
- If Ollama crashes, the next request detects and retries spawn

```typescript
let ensureOllamaPromise: Promise<string | null> | null = null;

async function ensureOllamaRunning(): Promise<string | null> {
  // Try all candidates directly (fast-path)
  for (const url of OLLAMA_URLS) {
    if (await pingOllama(url)) {
      return url;
    }
  }

  // If needed, spawn it (slow-path with lock)
  if (!ensureOllamaPromise) {
    ensureOllamaPromise = (async () => {
      try {
        spawn("ollama", ["serve"], { stdio: "ignore" });
        // Brief wait for startup
        await new Promise((r) => setTimeout(r, 1000));
        return null; // Don't return a result; let caller re-probe
      } finally {
        ensureOllamaPromise = null;
      }
    })();
  }

  await ensureOllamaPromise;

  // Piggyback: re-validate independently
  for (const url of OLLAMA_URLS) {
    if (await pingOllama(url)) {
      return url;
    }
  }

  return null;
}
```

## Related Concepts

- [[concepts/subprocess-detachment-macos]] - Spawned processes must detach correctly to survive after parent exits
- [[concepts/bun-cache-corruption-repair]] - Both deal with state that can diverge between callers

## Sources

- [[daily/2026-04-12.md]] - "Fixed race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes simultaneously"
- [[daily/2026-04-12.md]] - "Introduced module-level `ensureOllamaPromise: Promise<string | null> | null = null` as the serialization lock"
- [[daily/2026-04-12.md]] - "Piggyback path: if lock is held, concurrent caller awaits that promise, then calls `pingOllama` themselves to confirm and return the correct working URL"
- [[daily/2026-04-12.md]] - "Lock owner clears the promise in a `finally` block so future calls (e.g. user restarts Ollama) get a fresh spawn attempt"
