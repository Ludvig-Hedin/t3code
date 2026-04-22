---
title: "Connection: Silent Hang Detection Requires Active Probing Across Layers"
connects:
  - "concepts/websocket-silent-death-heartbeat"
  - "concepts/inactivity-watchdog-fiber-pattern"
  - "concepts/process-output-dual-pattern-matching"
  - "concepts/stream-takewhile-freeze-limitation"
sources:
  - "daily/2026-04-20.md"
  - "daily/2026-04-19.md"
created: 2026-04-20
updated: 2026-04-20
---

# Connection: Silent Hang Detection Requires Active Probing Across Layers

## The Connection

Three distinct debugging sessions across two days revealed the same meta-pattern at different layers of the stack: when a communication channel can silently die (WebSocket connection, subprocess stdout pipe, tunnel process), passive observation (waiting for data to arrive) is insufficient for detecting the failure. Active probing (heartbeat pings, watchdog timers, error pattern matching) is required at each layer independently.

## Key Insight

Silent hangs occur because the detecting code is **reactive** — it waits for events that will never come. The fix in every case is to become **proactive** — actively check at intervals whether the channel is still alive, rather than assuming "no news is good news."

| Layer                 | Silent hang cause              | Passive (broken)            | Active (fix)                              |
| --------------------- | ------------------------------ | --------------------------- | ----------------------------------------- |
| Network (WebSocket)   | NAT timeout, sleep/wake        | Wait for next RPC response  | Heartbeat ping every 20s                  |
| Process (AI provider) | Frozen subprocess              | `takeWhile(() => !stopped)` | Watchdog fiber polling `lastActivityAtMs` |
| Subprocess output     | Process prints error and exits | Wait for success pattern    | Dual-pattern match (error + success)      |

## Evidence

**WebSocket (2026-04-20):** "WebSocket connections silently die on sleep/wake, NAT idle, cloudflared, VPN — neither side notices without an active heartbeat." Fix: ping every 20s, tear down after 2 failures.

**Provider stream (2026-04-19):** "`Stream.takeWhile` predicate never evaluates when source is frozen; watchdog fiber is the correct stop mechanism." Fix: companion fiber checking elapsed time independently.

**Tunnel process (2026-04-20):** "Process output watchers that only match success patterns will hang forever when the process fails." Fix: match error patterns alongside success patterns, fail fast.

## Shared Design Principle

**Never assume "no data = still working."** At every boundary where data flows asynchronously:

1. Define a maximum acceptable silence period
2. Actively probe at intervals shorter than that period
3. On probe failure, surface the error immediately rather than waiting longer
4. Make the detection independent of the data channel (don't rely on the dead channel to tell you it's dead)

This principle applies recursively: the WebSocket heartbeat detects dead network connections; the watchdog fiber detects dead provider streams; the error pattern matcher detects dead tunnel processes. Each operates at a different layer but implements the same "active probe → timeout → surface error" pattern.

## Related Concepts

- [[concepts/websocket-silent-death-heartbeat]] — Network layer: heartbeat detects dead WebSocket
- [[concepts/inactivity-watchdog-fiber-pattern]] — Application layer: watchdog detects frozen AI stream
- [[concepts/process-output-dual-pattern-matching]] — Process layer: error regex detects failed subprocess
- [[concepts/stream-takewhile-freeze-limitation]] — Why passive observation fails for frozen sources
