---
title: "Inactivity Watchdog Fiber for Frozen Stream Detection"
aliases: [watchdog-fiber, stream-freeze-detection, inactivity-timeout]
tags: [effect, concurrency, streaming, resilience]
sources:
  - "daily/2026-04-19.md"
created: 2026-04-19
updated: 2026-04-19
---

# Inactivity Watchdog Fiber for Frozen Stream Detection

When a provider stream (e.g., Claude CLI subprocess or Codex) freezes and stops emitting messages, a simple `takeWhile`-based stop guard never evaluates because no messages ever arrive. The correct pattern is a companion watchdog fiber that runs concurrently with the stream fiber, resets a shared `lastActivityAtMs` timestamp on every SDK message, and terminates the session with a failure status if no activity is detected within a configurable timeout window while a turn is in flight.

## Key Points

- **`takeWhile` is ineffective for frozen streams** — the predicate never evaluates if no messages arrive; the stream simply blocks forever
- **Watchdog fiber runs concurrently** — spawned alongside the stream-reading fiber, sharing an Effect **Ref** (not FiberRef) for `lastActivityAtMs` so both fibers see the same timestamp
- **Reset on every message** — stream fiber updates `lastActivityAtMs` each time an SDK event is received
- **Conditional trigger** — watchdog only acts if a turn is in flight; idle sessions are not timed out
- **Termination path** — on timeout, watchdog calls `stopSessionInternal("failed", "Provider stream timed out")` to cleanly mark the session failed

## Details

### Why `takeWhile` Fails

`Stream.takeWhile(() => !context.stopped)` is intended as a guard that stops pulling from the stream when a stop signal is set. However, streams only evaluate the predicate when pulling the next element. If the underlying source (subprocess stdout) never emits another byte — because the subprocess has frozen — the `takeWhile` predicate never runs. The fiber blocks indefinitely at the `await next element` step inside the stream interpreter.

This means any stop signal sent while the stream is frozen has no effect: the guard is logically correct but physically unreachable.

### Watchdog Implementation Pattern

```typescript
import { Duration, Effect, Fiber, Option, Ref, Schedule, Stream } from "effect";

const lastActivityAtMs = yield * Ref.make(Date.now());

/** Wall-clock inactivity budget while a turn is active (must be ≫ poll interval). */
const INACTIVITY_TIMEOUT_MS = 30_000;
/** How often the watchdog polls `lastActivityAtMs` (must be ≪ INACTIVITY_TIMEOUT_MS). */
const WATCHDOG_CHECK_INTERVAL_MS = 5_000;

// Stream fiber: fork so we can race `Fiber.join` against the watchdog.
const streamFiber =
  yield *
  Stream.runForEach(sdkMessages, (msg) =>
    Ref.set(lastActivityAtMs, Date.now()).pipe(Effect.andThen(processMessage(msg))),
  ).pipe(Effect.forkChild);

// Watchdog fiber: runs concurrently
const watchdog = Effect.repeat(
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(WATCHDOG_CHECK_INTERVAL_MS));
    const last = yield* Ref.get(lastActivityAtMs);
    const hasActiveTurn = yield* getActiveTurnId.pipe(Effect.map(Option.isSome));
    if (hasActiveTurn && Date.now() - last > INACTIVITY_TIMEOUT_MS) {
      yield* stopSessionInternal("failed", "Provider stream timed out");
    }
  }),
  Schedule.forever,
);

yield * Effect.race(Fiber.join(streamFiber), watchdog);
```

The watchdog polls on a short interval, reads the shared **Ref** cell, and acts only when both conditions are true: an active turn exists and no activity has been seen within the timeout window.

### Ref (not FiberRef) for cross-fiber activity timestamps

**FiberRef** gives each forked fiber an inherited _initial_ snapshot at fork time; **updates are fiber-local** afterward. A stream fiber that calls `FiberRef.set` and a watchdog fiber that calls `FiberRef.get` therefore do **not** reliably observe each other’s writes—they see separate fiber-local bindings. For a “last activity” timestamp that both the stream loop and the watchdog must agree on, use Effect **Ref**: a single shared mutable cell that `Ref.get` / `Ref.set` read and write across all fibers that hold the same `Ref` handle. If you intentionally need fiber-local state, keep FiberRef; for watchdog vs. stream coordination, prefer **Ref** (or another explicitly shared concurrent structure).

### Timeout Configuration

The inactivity timeout should be configurable — not hardcoded — so that different providers or environments can tune it. A reasonable starting value is 30–60 seconds for production; shorter (5–10 seconds) for tests. Configuration should be read from an environment variable or settings record at session start.

## Related Concepts

- [[concepts/stream-takewhile-freeze-limitation]] — Why the simpler guard fails and necessitates this pattern
- [[concepts/effect-timeoutoption-clean-error-types]] — Related use of Effect timeout primitives in the same feature
- [[concepts/process-serialization-piggyback-pattern]] — Another concurrent-fiber coordination pattern in the codebase
- [[concepts/flush-pipeline-failure-modes]] — Similar "silent hang" failure mode in a different subsystem

## Sources

- [[daily/2026-04-19]] — "Add an inactivity watchdog fiber inside `runSdkStream`: reset `lastActivityAtMs` on every SDK message; if no activity for configurable N seconds while a turn is in flight, call `stopSessionInternal('failed', 'Provider stream timed out')`"
- [[daily/2026-04-19]] — "Track `lastActivityAtMs` via a shared Effect Ref so watchdog and stream fiber observe the same activity clock (FiberRef is fiber-local after fork and is unsuitable here)"
- [[daily/2026-04-19]] — "`Stream.takeWhile(() => !context.stopped)` is useless as a stop guard if no messages ever arrive — the predicate never evaluates. A watchdog fiber is the correct pattern for freeze detection."
