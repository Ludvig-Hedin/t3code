---
title: "Late-Event Ingestion Guard: Preventing Zombie Events from Re-activating UI"
aliases: [zombie-events, late-event-guard, terminal-state-guard]
tags: [state-management, streaming, ui-correctness, concurrency]
sources:
  - "daily/2026-04-19.md"
created: 2026-04-19
updated: 2026-04-19
---

# Late-Event Ingestion Guard: Preventing Zombie Events from Re-activating UI

When a streaming session is forcibly stopped, in-flight events buffered in the subprocess pipe or SDK queue may arrive after the session has been marked `"stopped"` or `"completed"`. Without a guard, these "zombie" terminal events (e.g., a final `done` or `error` payload) can re-activate spinner UI, transition the session to an unexpected state, or briefly flip UI controls back to the "stop" state before returning to "default." The fix is to reject any terminal events that arrive for sessions already in a terminal state.

## Key Points

- **In-flight events outlive the stop signal** — subprocess pipes buffer data; SDK queues may hold events; these drain after the session is terminated
- **Terminal events re-activate UI** — a `done` event arriving after `stopped` can trigger `derivePhase` to show `"running"` for one render cycle, causing spinner/button flicker
- **Guard location: event ingestion pipeline** — check session status before processing any event in `handleStreamExit` (or the shared stream-event entry point that delegates to it)
- **Terminal states to guard against** — `"stopped"` and `"completed"` for normal termination; include `"failed"` when your product rule is that no further stream events may apply after any failure (or when replaying late events after `"failed"` could corrupt session state). Omit `"failed"` in the guard when failures are retried or reconciled elsewhere and late events should still be drained safely.

```typescript
// Include "failed" when post-failure events must not run (strict consistency).
if (session.status === "stopped" || session.status === "completed" || session.status === "failed") {
  return;
}

// Omit "failed" when failures are retriable / handled elsewhere (late drain OK).
if (session.status === "stopped" || session.status === "completed") {
  return;
}
```

- **Idempotent rejection** — silently drop the event; no error logging needed (late events are expected during force-stop)

## Details

### The Zombie Event Problem

Force-stopping a streaming session involves:

1. Sending an interrupt signal to the subprocess
2. Marking the session as `"stopped"` in the server state
3. The subprocess eventually terminates

Between steps 2 and 3, the subprocess may flush its output buffer. Any buffered events (last AI token, a final `[DONE]` SSE event, a completion payload) arrive at the Node.js stream layer after step 2 has already marked the session stopped. The stream-reading fiber picks them up and passes them to the event processing pipeline, which then:

- Updates the session's turn state (briefly showing `activeTurnId`)
- Triggers client-side `derivePhase` to return `"running"`
- Causes the spinner and stop button to re-appear for one or more render cycles
- Then the client reconciles and the UI snaps back

From the user's perspective: they pressed Stop, the spinner disappears, then briefly reappears and disappears again. The stop button flickers stop→default→stop.

### The Guard

In `handleStreamExit` or the event ingestion entry point, add a terminal-state check before processing:

```typescript
function handleStreamExit(sessionId: string, event: StreamEvent) {
  const session = getSession(sessionId);
  if (!session) return; // session already removed

  // Guard: ignore late events for terminated sessions (add "failed" if needed; see key points above)
  if (session.status === "stopped" || session.status === "completed") {
    return; // silently drop zombie event
  }

  // Normal processing
  processEvent(session, event);
}
```

This guard is idempotent and has no observable side effects when the session is in a terminal state — the event would have been the last one anyway.

### Why Silent Drop is Correct

Logging these events as warnings would create noise in production: every force-stop generates at least one zombie event. The events are not errors; they are expected artifacts of asynchronous process termination. The guard should be silent (no log, no metric, no error) to keep the logs clean. If debugging is needed, a debug-level log gated on a flag is acceptable.

### Placement in the Event Pipeline

The guard should be as early in the pipeline as possible — ideally at the first point where session state is consulted. Placing it deep in the pipeline (after event parsing, turn ID resolution, etc.) still prevents state mutation, but wastes CPU on events that will be discarded. Placing it at ingestion is the most efficient approach.

## Related Concepts

- [[concepts/phase-derivation-turn-id-guard]] — The client-side complement: phase derivation also needs a guard to prevent stale spinners
- [[concepts/inactivity-watchdog-fiber-pattern]] — The mechanism that triggers force-stops which produce zombie events
- [[concepts/null-undefined-type-coercion-bugs]] — Related category: silent state mutations that manifest as UI flicker

## Sources

- [[daily/2026-04-19]] — "Add late-event ingestion guard in `handleStreamExit`/event pipeline: ignore terminal events for sessions with status `'stopped'` or `'completed'` to prevent zombie events re-activating the UI"
- [[daily/2026-04-19]] — "Stopping a thread still shows the spinner in sidebar and briefly flips stop→default→stop button again"
