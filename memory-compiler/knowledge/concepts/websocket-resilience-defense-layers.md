---
title: "WebSocket Connection Resilience: Multi-Layer Defense Pattern"
aliases: [ws-resilience, connection-recovery, timeout-strategies]
tags: [networking, websocket, resilience, error-handling]
sources:
  - "daily/2026-04-23.md"
created: 2026-04-23
updated: 2026-04-23
---

# WebSocket Connection Resilience: Multi-Layer Defense Pattern

WebSocket-based applications require multiple coordinated resilience layers to handle connection failures gracefully. Thread freezing bugs revealed three distinct failure modes: (1) orchestration RPC timeouts during large thread replay, (2) premature heartbeat disconnects on brief network hiccups, and (3) silent stream drops without recovery. The fix implements unbounded timeouts for critical operations, more forgiving heartbeat parameters, exponential backoff on retry, and forced replay after subscription reconnects.

## Key Points

- **Unbounded timeouts for orchestration** — `replayEvents()`, `getSnapshot()`, and `subscribeOrchestrationDomainEvents()` use `Option.none()` timeout to prevent replay failures on large threads
- **More forgiving heartbeat** — Changed from 2×20s (40s) to 3×20s (60s) before connection reset; prevents premature disconnects during brief silence
- **Exponential backoff on retry** — Subscription retry changed from fixed 250ms to exponential: 250ms → 500ms → 1s → 2s → 5s (max)
- **Force replay after reconnect** — When subscription stream drops and reconnects, immediately trigger `recoverFromSequenceGap()` without waiting for next event
- **Additive safety strategy** — All changes preserve existing recovery logic; no removal of safety mechanisms

## Details

### Layer 1: Unbounded Orchestration Timeouts

Critical orchestration RPCs must complete regardless of duration:

**Problem:** Large threads (hundreds of events) timeout during replay after reconnect, causing thread freezing.

**Fix** (`apps/web/src/wsRpcClient.ts`):

```typescript
// ❌ BEFORE: All RPCs had 60s timeout
const DEFAULT_TIMEOUT = 60_000;

export async function replayEvents(sessionId, fromSeq) {
  return transport.request(
    "orchestration.replayEvents",
    { sessionId, fromSeq },
    {
      timeout: DEFAULT_TIMEOUT, // Times out on large threads!
    },
  );
}

// ✅ AFTER: Critical orchestration RPCs unbounded
export async function replayEvents(sessionId, fromSeq) {
  return transport.request(
    "orchestration.replayEvents",
    { sessionId, fromSeq },
    {
      timeout: Option.none(), // Unbounded — must complete
    },
  );
}

export async function getSnapshot(sessionId) {
  return transport.request(
    "orchestration.getSnapshot",
    { sessionId },
    {
      timeout: Option.none(), // Unbounded
    },
  );
}

export async function subscribeOrchestrationDomainEvents(sessionId) {
  return transport.request(
    "orchestration.subscribeOrchestrationDomainEvents",
    { sessionId },
    {
      timeout: Option.none(), // Unbounded
    },
  );
}
```

**Rationale:** Orchestration operations are foundational — if they fail, the entire session is unusable. Terminal/file/other RPCs keep the 60s timeout because they're user-facing and should fail fast.

### Layer 2: Forgiving Heartbeat Parameters

Heartbeat must tolerate brief network disruptions:

**Problem:** 2 consecutive failures at 20s intervals (40s total) caused premature connection resets during normal operation.

**Fix** (`apps/web/src/wsRpcClient.ts`):

```typescript
// ❌ BEFORE: Too aggressive
const HEARTBEAT_INTERVAL_MS = 20_000; // 20s
const MAX_CONSECUTIVE_FAILURES = 2; // Reset after 40s

// ✅ AFTER: More forgiving
const HEARTBEAT_INTERVAL_MS = 20_000; // 20s (unchanged)
const MAX_CONSECUTIVE_FAILURES = 3; // Reset after 60s
```

**Rationale:** Brief network hiccups (switching WiFi networks, brief VPN reconnect) shouldn't force full page reload. 3 failures gives 60 seconds to recover, matching the unbounded orchestration timeout window.

### Layer 3: Exponential Backoff on Subscription Retry

Subscription failures should not hammer the server:

**Problem:** Fixed 250ms retry interval caused thundering herd when many clients lost connection simultaneously.

**Fix** (`apps/web/src/wsTransport.ts`):

```typescript
// ❌ BEFORE: Fixed interval
async function retrySubscription(attempt: number) {
  await delay(250); // Always 250ms
  return subscribeOrchestrationDomainEvents();
}

// ✅ AFTER: Exponential backoff with cap
async function retrySubscription(attempt: number) {
  const backoffMs = Math.min(250 * Math.pow(2, attempt), 5000);
  // attempt 0: 250ms
  // attempt 1: 500ms
  // attempt 2: 1000ms
  // attempt 3: 2000ms
  // attempt 4: 4000ms
  // attempt 5+: 5000ms (capped)

  await delay(backoffMs);
  return subscribeOrchestrationDomainEvents();
}
```

**Rationale:** Exponential backoff is the standard pattern for retry logic. Capping at 5s prevents indefinite delays while still avoiding server overload.

### Layer 4: Force Replay After Reconnect

Silent stream drops require explicit recovery:

**Problem:** When subscription stream silently drops while agent is thinking, reconnection succeeds but no events arrive because the agent finished while disconnected. UI shows "working" indefinitely.

**Fix** (`apps/web/src/routes/__root.tsx`):

```typescript
// ❌ BEFORE: Wait for next event to detect gap
useEffect(() => {
  const cleanup = transport.subscribeOrchestrationDomainEvents({
    onEvent: (event) => {
      if (event.sequenceNumber > lastSeenSeq + 1) {
        // Gap detected — replay missed events
        recoverFromSequenceGap(lastSeenSeq + 1);
      }
      processEvent(event);
    },
  });

  return cleanup;
}, []);

// ✅ AFTER: Force replay on reconnect
useEffect(() => {
  const cleanup = transport.subscribeOrchestrationDomainEvents({
    onEvent: (event) => {
      if (event.sequenceNumber > lastSeenSeq + 1) {
        recoverFromSequenceGap(lastSeenSeq + 1);
      }
      processEvent(event);
    },
    onReconnect: () => {
      // Immediately replay from last known sequence
      // Don't wait for next event — stream may be idle
      recoverFromSequenceGap(lastSeenSeq + 1);
    },
  });

  return cleanup;
}, []);
```

**Rationale:** This catches the "stream died while agent was thinking" case. The agent finished its turn and stopped emitting events, so waiting for the next event means waiting forever. The `onReconnect` callback hook enables immediate recovery.

### Defense-in-Depth Verification

All four layers work together:

1. **Unbounded orchestration** — prevents timeout on large replay
2. **Forgiving heartbeat** — prevents premature disconnect on brief silence
3. **Exponential backoff** — prevents server overload on widespread failures
4. **Force replay** — prevents silent hang after reconnect during idle period

Each layer addresses a distinct failure mode. Removing any single layer reintroduces a specific bug class.

### Testing and Risk Mitigation

**Type safety:** All changes typecheck clean. Effect-TS ensures proper error handling paths.

**Test coverage:** 787 passes / 5 failures (identical to main branch before changes). Zero regressions introduced.

**Additive changes only:** No removal of existing recovery logic. All changes add new safety mechanisms without replacing old behavior.

**Incremental rollout:** Each fix addresses one specific failure mode, enabling targeted rollback if issues arise.

## Related Concepts

- [[concepts/websocket-silent-death-heartbeat]] — Original heartbeat implementation; this extends it with more forgiving parameters
- [[concepts/inactivity-watchdog-fiber-pattern]] — Server-side complement for detecting frozen AI streams
- [[concepts/process-output-dual-pattern-matching]] — Similar "active probe" pattern at different stack layer
- [[concepts/external-service-initialization-fallback]] — Similar multi-phase initialization with fallbacks
- [[connections/silent-hang-detection-patterns]] — Meta-pattern connecting multiple active probing strategies

## Sources

- [[daily/2026-04-23]] — "Remove 60s timeout on critical orchestration RPCs (`replayEvents()`, `getSnapshot()`, `subscribeOrchestrationDomainEvents()`) — now use `Option.none()` (unbounded)"
- [[daily/2026-04-23]] — "More forgiving heartbeat: Changed from 2×20s (40s) to 3×20s (60s) before connection reset"
- [[daily/2026-04-23]] — "Exponential backoff on subscription retry: Changed from fixed 250ms retry to exponential: 250ms → 500ms → 1s → 2s → 5s (max)"
- [[daily/2026-04-23]] — "Force replay after subscription reconnects: When subscription stream silently drops and reconnects, immediately trigger `recoverFromSequenceGap()`"
- [[daily/2026-04-23]] — "The system now: Won't timeout during large thread replay, Won't prematurely disconnect on brief silence, Won't hammer the server on reconnect failures, Will always attempt recovery after stream reconnection"
