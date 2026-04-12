---
title: "Process Serialization with Piggyback Pattern"
aliases: [piggyback-lock, concurrent-spawn-serialization, thundering-herd-prevention]
tags: [concurrency, subprocess, race-conditions, system-design]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Process Serialization with Piggyback Pattern

When multiple concurrent calls need to spawn the same external process (e.g., `ollama serve`), naive implementations spawn multiple processes simultaneously (thundering herd). The piggyback pattern prevents this: the first caller spawns the process; subsequent callers awaiting a shared promise, then validate their own state. This pattern avoids duplicating processes while allowing self-healing if the process crashes.

## Key Points

- **Fast-path:** All callers first check directly (e.g., `pingOllama`) before consulting the lock
- **Lock holder:** Only the first caller owns process spawning; others await a shared promise
- **Piggyback behavior:** Waiting callers re-validate after lock is released, rather than trusting lock's return value
- **Self-healing:** Allows subsequent calls (e.g., after process crashes) to spawn fresh
- **Clear semantics:** Lock is held only during spawn; cleared in `finally` block

## Details

### The Problem: Thundering Herd

```typescript
// WRONG: Multiple callers can spawn simultaneously
let ollama: string | null = null;

async function ensureOllamaRunning() {
  if (!ollama) {
    const url = await pingOllama();
    if (!url) {
      // Multiple concurrent calls here all spawn simultaneously
      spawn("ollama", ["serve"], { detached: true });
      ollama = "http://localhost:11434";
    }
  }
  return ollama;
}
```

If 10 concurrent calls enter the `if (!ollama)` block simultaneously, 10 `ollama serve` processes spawn. This wastes resources and causes port conflicts.

### The Solution: Piggyback Pattern

```typescript
let ensureOllamaPromise: Promise<string | null> | null = null;

async function ensureOllamaRunning() {
  // Fast-path: Try all candidate URLs directly
  const url = await pingOllama();
  if (url) return url;

  // Check if another caller is already spawning
  if (ensureOllamaPromise) {
    // Piggyback: Wait for their spawn to complete
    await ensureOllamaPromise;
    // Then re-validate ourselves (don't trust their promise result)
    return await pingOllama();
  }

  // Lock holder: We own the spawn
  ensureOllamaPromise = spawnAndValidate();
  try {
    await ensureOllamaPromise;
    return await pingOllama();
  } finally {
    // Always clear the lock so future calls (after crash) can retry
    ensureOllamaPromise = null;
  }
}

async function spawnAndValidate() {
  spawn("ollama", ["serve"], { detached: true });
  // Wait for process to be ready...
}
```

### How It Works

1. **First call** enters with no lock held → fast-path fails → becomes lock holder → spawns process
2. **Concurrent calls** see lock is held → piggyback: await the promise → re-validate directly
3. **Lock holder clears lock** in finally block (success or failure)
4. **Future calls** see no lock → can spawn again (useful if original process crashed)

### Key Design Decisions

**Piggyback re-validation:** Don't return the promise result; instead, re-validate directly. This handles the case where the lock holder's spawn failed but they still returned a promise. Piggybacking callers get accurate state.

**Clear lock in finally:** The lock must be cleared even on failure so that later calls can retry. If you keep the lock on failure, the system becomes unrecoverable.

**Fast-path check:** All callers probe directly before even looking at the lock. This minimizes lock contention and handles the common case (Ollama already running) without synchronization overhead.

## Related Concepts

- [[concepts/zustand-selector-stability-pattern]] - Stability patterns prevent similar concurrent mutation issues
- [[concepts/git-branch-agnostic-base-resolution]] - Similar defensive validation pattern for uncertain state

## Sources

- [[daily/2026-04-12.md]] - "Fixed a critical race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes simultaneously"
- [[daily/2026-04-12.md]] - "Introduced module-level `ensureOllamaPromise` as the serialization lock with piggyback mechanism where waiting callers re-check `pingOllama` themselves"
- [[daily/2026-04-12.md]] - "Piggyback path: concurrent caller awaits promise, then calls `pingOllama` themselves to confirm and return correct working URL"
