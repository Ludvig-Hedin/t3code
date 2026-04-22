---
title: "Phase Derivation Turn-ID Guard: Preventing Stale Running State"
aliases: [derivePhase-guard, turn-id-required, phase-derivation]
tags: [ui-pattern, state-management, chat-ui, react]
sources:
  - "daily/2026-04-19.md"
created: 2026-04-19
updated: 2026-04-19
---

# Phase Derivation Turn-ID Guard: Preventing Stale Running State

Client-side AI chat UIs typically derive their visual phase (idle, running, stalled, etc.) from server-sent session state. A common bug: `derivePhase` returns `"running"` based solely on `session.status === "running"` without checking whether an `activeTurnId` is set. After a session is stopped or a turn completes, the status may briefly remain `"running"` before the client receives the update, causing the spinner to linger. Requiring `activeTurnId` to be non-null as a second condition prevents this.

## Key Points

- **Session status alone is insufficient** — `session.status === "running"` can be true even when no turn is actively executing (status hasn't propagated yet)
- **`activeTurnId` is the authoritative signal** — a turn is in flight if and only if the session has an active turn ID; the spinner should only show when this is set
- **Conjunction prevents premature "running" phase** — `status === "running" && activeTurnId !== null` is more precise than status alone
- **Eliminates spinner flicker on stop** — the ID is cleared before the status propagates, so the phase drops to idle as soon as the turn ends
- **Pattern generalizes** — any "is work happening?" derivation should use the most specific available signal, not a general status field

## Details

### The Status-Only Anti-Pattern

```typescript
// ❌ Status-only: spinner lingers after turn ends
function derivePhase(session: SessionState): Phase {
  if (session.status === "running") return "running";
  if (
    session.status === "stopped" ||
    session.status === "completed" ||
    session.status === "failed"
  ) {
    return "idle";
  }
  return "idle";
}
```

The `status` field is server-authoritative and updated asynchronously. After the user stops a session, there is a window (one or more render cycles) where `status` is still `"running"` because the update hasn't arrived. During this window, `derivePhase` returns `"running"`, the spinner is shown, and the stop button appears. When the status update arrives, the UI snaps back to idle. This is the flicker.

### The Turn-ID Guard

```typescript
// ✅ Requires activeTurnId: spinner only shows when a turn is actually in flight
function derivePhase(session: SessionState): Phase {
  const isRunning = session.status === "running" && session.activeTurnId !== null;
  if (isRunning) return "running";
  if (
    session.status === "stopped" ||
    session.status === "completed" ||
    session.status === "failed"
  ) {
    return "idle";
  }
  return "idle";
}
```

`activeTurnId` is set when a turn starts and cleared (set to `null`) immediately when the turn ends — before the status field propagates. Because the ID is cleared first, the phase drops to idle within the same update cycle as the turn completion, without waiting for a separate status propagation round-trip.

### Why `activeTurnId` Clears First

The server-side turn lifecycle:

1. Turn starts → `activeTurnId` set, `status` set to `"running"`
2. Turn ends → `activeTurnId` cleared to `null`
3. Status updated → `status` set to `"completed"` or `"stopped"`

Steps 2 and 3 may be separate state updates (separate IPC messages or database writes). The client may receive them in separate render cycles. By requiring `activeTurnId !== null` in the `"running"` check, the phase correctly transitions to idle at step 2 rather than waiting for step 3.

### Generalizing the Pattern

Whenever deriving a "something is happening" phase from composite server state, prefer the most specific available signal:

- **Don't use**: general status strings alone (`"running"`, `"active"`, `"loading"`)
- **Do use**: specific in-progress identifiers (`activeTurnId`, `activeRequestId`, `currentOperationToken`)

General status fields are updated as aggregate summaries and may lag behind the specific signals. Specific identifiers are updated at the precise moment the work starts and stops.

### Related: Client vs Server Responsibility

This guard is a client-side mitigation. The server-side complement is the [[concepts/late-event-ingestion-guard]], which prevents zombie events from ever updating the `activeTurnId` after a session is stopped. Together, they provide defense in depth: the server rejects late events, and the client also checks for the presence of an active turn before showing the spinner.

## Related Concepts

- [[concepts/late-event-ingestion-guard]] — Server-side complement that stops zombie events from setting `activeTurnId`
- [[concepts/zustand-selector-reference-stability]] — Both involve deriving UI state from composite server state; instability in either causes flicker
- [[concepts/react-infinite-rerender-from-unstable-selectors]] — State derivation bugs that manifest as visible UI artifacts

## Sources

- [[daily/2026-04-19]] — "Client `derivePhase`: require `activeTurnId` to be set in addition to `session.status === 'running'` before returning `'running'` phase — prevents spinner from lingering after turn is gone"
- [[daily/2026-04-19]] — "Client `derivePhase` shows `running` purely from session status without requiring an active turn ID"
- [[daily/2026-04-19]] — "Stopping a thread still shows the spinner in sidebar"
