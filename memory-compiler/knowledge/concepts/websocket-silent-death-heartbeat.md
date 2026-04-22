---
title: "WebSocket Silent Death and Heartbeat Recovery"
aliases: [websocket-heartbeat, ws-ping-pong, silent-connection-death, ws-reconnect]
tags: [networking, websocket, resilience, debugging]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# WebSocket Silent Death and Heartbeat Recovery

WebSocket connections silently die on sleep/wake cycles, NAT idle timeouts, cloudflared tunnel drops, and VPN reconnects — neither client nor server notices without an active heartbeat mechanism. Without detection, the application appears "working" indefinitely (spinner, active state) while the underlying connection is dead. The fix is a client-side heartbeat that pings a lightweight RPC endpoint on a regular interval and tears down the connection after consecutive failures.

## Key Points

- **Silent death has many causes** — sleep/wake, NAT idle timeout, cloudflared restart, VPN reconnect; the TCP socket doesn't receive a FIN or RST
- **Neither side detects the failure** — TCP keepalive defaults are too slow (minutes to hours); the application layer must probe actively
- **Heartbeat pattern** — ping every 20s via a lightweight RPC call (`server.getSettings`); 10s per-ping timeout; tear down after 2 consecutive failures
- **Recovery strategy** — after heartbeat death detection: log to console, tear down transport, `window.location.reload()` to cleanly rebuild all subscriptions
- **Request timeouts are also needed** — individual RPC requests need 60s timeout and client acquisition needs 30s timeout; without these, hung requests block forever

## Details

### The Silent Death Problem

A WebSocket connection (`ws://`) or secure WebSocket (`wss://`) between a web client and a backend appears healthy at the JavaScript layer even when the underlying TCP connection is dead. The `readyState` property may still report `OPEN` because:

1. The browser hasn't attempted to send data since the connection died
2. No TCP FIN or RST was received (the peer just disappeared)
3. OS-level TCP keepalive hasn't fired yet (default: 2 hours on most systems)

During this window, any RPC call dispatched over the WebSocket enters a void — it never receives a response, and the calling code hangs on an unresolved Promise forever.

### Manifestation in AI Chat Applications

In a chat application using WebSocket RPC (like t3code), the silent death manifests as:

- User sends a message; AI appears to be "working" indefinitely
- Sidebar shows spinner for hours
- Stop button does nothing (the stop request also goes into the void)
- Console shows "WebSocket is closed before the connection is established" (a symptom, not the cause)
- The Codex desktop app (using stdio, same process tree) is immune to this failure mode

### Heartbeat Implementation

```typescript
// wsTransport.ts
const HEARTBEAT_INTERVAL_MS = 20_000; // Ping every 20s
const HEARTBEAT_TIMEOUT_MS = 10_000; // Each ping must respond within 10s
const MAX_CONSECUTIVE_FAILURES = 2; // Tear down after 2 misses

function startHeartbeat(transport: WsTransport, onDead: () => void) {
  let consecutiveFailures = 0;
  let isDead = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const fireDeadOnce = () => {
    if (isDead) return;
    isDead = true;
    if (interval !== null) {
      clearInterval(interval);
      interval = null;
    }
    onDead();
  };

  interval = setInterval(() => {
    if (isDead) return;
    void (async () => {
      try {
        await transport.request(
          "server.getSettings",
          {},
          {
            timeout: HEARTBEAT_TIMEOUT_MS,
          },
        );
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          if (interval !== null) {
            clearInterval(interval);
            interval = null;
          }
          fireDeadOnce();
        }
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    if (interval !== null) clearInterval(interval);
    interval = null;
  };
}

// Usage
const stopHeartbeat = startHeartbeat(transport, () => {
  console.error("[ws] Connection dead — reloading");
  transport.teardown();
  window.location.reload();
});
// Call stopHeartbeat() when tearing down the transport manually
```

### Per-Request Timeouts

Complementary to the heartbeat, individual requests need timeouts to prevent indefinite hangs:

```typescript
/** Rejects after `ms` with `new Error(message)` — use with `Promise.race` for deadlines. */
function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

class WsTransport {
  async request(method: string, params: unknown, opts?: { timeout?: number }) {
    const timeout = opts?.timeout ?? 60_000; // 60s default
    const clientTimeout = 30_000; // 30s to acquire client

    const client = await Promise.race([
      this.getClient(),
      rejectAfter(clientTimeout, "Client acquisition timeout"),
    ]);

    return Promise.race([
      client.call(method, params),
      rejectAfter(timeout, `Request timeout: ${method}`),
    ]);
  }
}
```

### Why `window.location.reload()`

When the WebSocket dies, all active subscriptions, pending requests, and cached connection state are invalid. Rather than attempting surgical reconnection (which requires re-subscribing to every active query, re-authenticating, and handling partial state), a full page reload:

- Cleanly destroys all stale state
- Re-establishes the WebSocket from scratch
- Re-runs all subscription hooks naturally
- Is fast enough (~1-2s) that users barely notice

For production systems, a reconnect-with-resubscribe approach is more elegant but significantly more complex.

### Why stdio is Immune

The Codex desktop app communicates with the AI backend via stdio (subprocess stdin/stdout). This communication channel:

- Never crosses a network boundary
- Cannot be interrupted by NAT, VPN, or sleep/wake
- Is backed by OS pipes within the same process group
- Has no concept of "connection death" — if the subprocess dies, the pipe immediately closes with an error

This explains why the same bug was never observed in the desktop app.

## Related Concepts

- [[concepts/inactivity-watchdog-fiber-pattern]] — Server-side equivalent: detecting frozen streams from the provider side
- [[concepts/process-serialization-piggyback-pattern]] — Both involve detecting and recovering from silent process failures
- [[concepts/external-service-initialization-fallback]] — Heartbeat failure triggers a recovery strategy similar to service initialization fallback

## Sources

- [[daily/2026-04-20.md]] — "WebSocket connections silently die on sleep/wake, NAT idle, cloudflared, VPN — neither side notices without an active heartbeat"
- [[daily/2026-04-20.md]] — "Added `startHeartbeat()` with `onDead` callback — pings every 20s via `server.getSettings`, 10s per-ping timeout; after 2 consecutive failures → logs, tears down transport, calls `window.location.reload()`"
- [[daily/2026-04-20.md]] — "Effect RPC `RequestOptions.timeout` was dead code — declared in the type but the implementation discarded it entirely"
- [[daily/2026-04-20.md]] — "Codex desktop app uses stdio (same process tree), so it's immune to all network-layer WebSocket failure modes"
