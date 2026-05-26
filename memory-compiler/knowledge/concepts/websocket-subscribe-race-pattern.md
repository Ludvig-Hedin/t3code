---
title: "WebSocket Subscribe Race Pattern: Subscribe Before Replay"
aliases: [ws-subscribe-race, pubsub-race-condition, event-gap-pattern, subscribe-before-replay]
tags: [websocket, pubsub, race-condition, effect, event-sourcing]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# WebSocket Subscribe Race Pattern: Subscribe Before Replay

When a client connects to a WebSocket that streams events from a PubSub system with historical replay, the subscription must be established BEFORE requesting historical events. Subscribing after replay creates a race window where events published during replay are lost. The correct pattern uses `Effect.acquireRelease` to guarantee subscription setup precedes any data fetching.

## Key Points

- **Subscribe THEN replay** — Establish PubSub subscription before requesting historical events to prevent gaps
- **Race window during replay** — Events published while fetching history are lost if subscription isn't active
- **Effect.acquireRelease guarantees ordering** — Subscription is the "acquire" phase; cleanup is the "release" phase
- **Reorder buffer for late arrivals** — Events may arrive out of order; buffer and sort by sequence number
- **Gap timer detects missed events** — If expected sequence number doesn't arrive within timeout, request backfill

## Details

### The Race Condition

Consider a typical event-streaming WebSocket:

1. Client connects
2. Client requests last 100 events (historical replay)
3. Client subscribes to new events
4. Client processes events in order

The bug: if an event is published between steps 2 and 3, it's never delivered. The client sees events 1-100 from history, then event 102+ from the subscription, with event 101 silently lost.

### The Correct Pattern

```
1. Client connects
2. Client subscribes to new events (subscription active)
3. Client requests last 100 events (historical replay)
4. Client deduplicates overlapping events by sequence number
5. Client processes events in order
```

Now event 101 published during step 3 arrives via the subscription. The client sees it twice (once in history if replay is slow, once via subscription) but deduplication handles this.

### Effect.acquireRelease Implementation

In Effect-TS, this pattern maps naturally to `Effect.acquireRelease`:

```typescript
const eventStream = Effect.acquireRelease(
  // Acquire: subscribe first, capture subscription handle
  subscribeToEvents(channelId),
  // Release: unsubscribe on cleanup
  (subscription) => unsubscribe(subscription),
).pipe(
  Effect.flatMap((subscription) =>
    // After subscription is active, fetch history
    fetchHistoricalEvents(channelId).pipe(
      Effect.flatMap((history) =>
        // Merge history with live subscription stream
        mergeWithDeduplication(history, subscription.stream),
      ),
    ),
  ),
);
```

The `acquireRelease` guarantees that subscription is fully established before `flatMap` executes.

### Handling Event Gaps

Even with correct ordering, events can be lost (network issues, server restart). A gap timer provides defense:

1. Track last received sequence number
2. When receiving event N+2 (expecting N+1), start gap timer
3. If N+1 doesn't arrive within timeout (e.g., 5 seconds), request backfill for missing range
4. Reorder buffer holds out-of-order events until gaps are filled

### Why This Was Critical

This pattern emerged from a security audit finding (C3) that identified "stuck mid-turn" issues. Sessions would freeze because:

1. Client subscribed after requesting session state
2. Event completing the turn was published during state fetch
3. Client never received completion event
4. UI showed perpetual loading spinner

The fix required restructuring the WebSocket connection lifecycle to always subscribe before any data requests.

## Related Concepts

- [[concepts/websocket-resilience-defense-layers]] — Subscribe-before-replay is one layer of WS resilience
- [[concepts/websocket-silent-death-heartbeat]] — Heartbeat detects connection loss; this pattern prevents event loss
- [[concepts/late-event-ingestion-guard]] — Related pattern for rejecting stale events after session completion

## Sources

- [[daily/2026-05-09.md]] — "WS subscribe race pattern: must subscribe to PubSub BEFORE historical replay to avoid event gaps (`Effect.acquireRelease`)"
- [[daily/2026-05-09.md]] — "Fix WS subscribe race: subscribe before replay, add gap timer to reorder buffer (C3)" — action item from security audit
