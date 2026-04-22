---
title: "Connection: Frozen Stream Defense-in-Depth Pattern"
connects:
  - "concepts/inactivity-watchdog-fiber-pattern"
  - "concepts/effect-timeoutoption-clean-error-types"
  - "concepts/stream-takewhile-freeze-limitation"
  - "concepts/late-event-ingestion-guard"
  - "concepts/phase-derivation-turn-id-guard"
sources:
  - "daily/2026-04-19.md"
created: 2026-04-19
updated: 2026-04-19
---

# Connection: Frozen Stream Defense-in-Depth Pattern

## The Connection

Handling a frozen AI provider stream correctly requires not one fix but four coordinated layers, each addressing a different failure mode:

1. **Inactivity watchdog** — detects autonomous freezes and terminates the session
2. **Interrupt timeout** — ensures user-initiated stops don't hang when the subprocess ignores the interrupt signal
3. **Late-event ingestion guard** — prevents buffered zombie events from re-activating terminated sessions on the server
4. **Phase derivation turn-ID guard** — prevents stale `"running"` phase from showing the spinner on the client after a turn ends

No single layer is sufficient alone. Together they form a defense-in-depth strategy that handles the complete lifecycle of a frozen-then-stopped stream.

## Key Insight

The root problem is a fundamental asymmetry: **data flows asynchronously through multiple buffers** (subprocess stdout, SDK message queue, IPC, client state), but **user expectations are synchronous** ("I pressed Stop; it should stop now"). Each buffer introduces a failure mode where stale data leaks into a later stage and re-activates UI or state that should have been idle.

The four layers map to the four stages of the pipeline where this leakage can occur:

| Stage                   | Failure mode                               | Fix                                 |
| ----------------------- | ------------------------------------------ | ----------------------------------- |
| Stream reading          | Frozen source blocks fiber forever         | Watchdog fiber                      |
| Stop signaling          | Interrupt request blocks forever           | Interrupt timeout + `timeoutOption` |
| Server event processing | Zombie events arrive after session stopped | Late-event ingestion guard          |
| Client state derivation | Status propagates before turn ID clears    | Phase derivation turn-ID guard      |

## Evidence

All four layers were implemented in the same session to fix two related bugs ("AI freezes and shows working indefinitely" and "stopping a thread still shows spinner briefly"):

1. **Watchdog** — "Add an inactivity watchdog fiber inside `runSdkStream`: reset `lastActivityAtMs` on every SDK message; if no activity for configurable N seconds while a turn is in flight, call `stopSessionInternal`"

2. **Interrupt timeout** — "Add a 5s timeout to `query.interrupt()` in ClaudeAdapter and CodexAdapter; on timeout, fall through to `stopSessionInternal`. Used `Effect.timeoutOption` to avoid adding error types."

3. **Late-event guard** — "Add late-event ingestion guard in `handleStreamExit`/event pipeline: ignore terminal events for sessions with status `'stopped'` or `'completed'`"

4. **Phase guard** — "Client `derivePhase`: require `activeTurnId` to be set in addition to `session.status === 'running'` before returning `'running'` phase"

The four were needed simultaneously because fixing the watchdog (which terminates sessions faster) actually made the zombie-event and stale-phase problems more visible — sessions now terminated before the subprocess finished draining, producing more late events.

## Design Principle: Pipeline Leakage Requires Pipeline Fixes

When asynchronous data flows through N stages, a disruption at stage K doesn't cleanly stop at stage K — it propagates forward as stale or unexpected data. The correct architectural response is guards at each downstream stage:

- Don't assume the upstream disruption cleanly propagates
- Don't rely on a single "cancel" signal that all stages observe atomically
- Do add a guard at each stage that checks whether the data is still expected

This generalizes beyond frozen streams to any distributed system where state changes don't propagate atomically: cache invalidation, websocket reconnects, optimistic UI updates.

## Related Concepts

- [[concepts/inactivity-watchdog-fiber-pattern]] — Layer 1: autonomous freeze detection
- [[concepts/effect-timeoutoption-clean-error-types]] — Layer 2: clean interrupt-timeout implementation
- [[concepts/stream-takewhile-freeze-limitation]] — Why the naive stop guard fails (motivating Layer 1)
- [[concepts/late-event-ingestion-guard]] — Layer 3: server-side zombie event rejection
- [[concepts/phase-derivation-turn-id-guard]] — Layer 4: client-side stale-phase prevention
