# Provider Freeze Investigation — 2026-04-18

> **Status:** investigation complete, backend fix awaiting approval.
>
> **Scope:** Claude and Codex threads stop producing events after ~2 minutes
> and the sidebar stays stuck on "Working" indefinitely. User request: "make
> the connection never drop or freeze or timeout."

## Summary

The **WebSocket itself is not the problem.** Effect RPC's
`layerProtocolSocket` already sends an application-level ping every 5 s
(`apps/server/node_modules/effect/dist/unstable/rpc/RpcClient.js:624`), so
Bun's 120 s default `websocket.idleTimeout` cannot fire on an active session.

The real root cause of the "works for ~2 min then freezes" behavior lives in
the **provider adapter layer**, and the reason the UI stays stuck on "Working"
is that the sidebar pill is derived purely from `session.status === "running"`
with no liveness check.

## Evidence

### 1. WS-level keepalive is already present

- `apps/web/src/rpc/protocol.ts:24` → client uses
  `RpcClient.layerProtocolSocket({ retryTransientErrors: true })`.
- Effect RPC's `makeProtocolSocket` spawns a pinger that emits a
  `constPing` every 5 s and closes the socket if no `Pong` comes back
  (`RpcClient.js:529`, `:566-571`, `:610-630`).
- Result: Bun's 120 s WS idle timeout is never reached on an active
  connection. Adding another heartbeat at the app layer would be redundant.

### 2. Claude adapter has no per-message timeout or liveness guard

- The Claude SDK is consumed via
  `Stream.fromAsyncIterable(context.query, …)` at
  [`apps/server/src/provider/Layers/ClaudeAdapter.ts:2236`](../apps/server/src/provider/Layers/ClaudeAdapter.ts).
- No `Stream.timeout`, no `AbortController`, no idle watchdog on the
  async iterator. If the Claude SDK's upstream HTTP connection stalls,
  the iterator simply hangs until the OS socket times out (~2 min on
  Node/Bun default).
- When that finally fires, the iterator either errors (→ `handleStreamExit`
  emits a `failed` turn) or returns (→ same, but `"interrupted"`). Between
  stall start and OS timeout, the UI has no signal at all.

### 3. Codex subprocess only guards the initial JSON-RPC request

- `apps/server/src/codexAppServerManager.ts:1246` has
  `timeoutMs = 20_000` — but this only applies to `sendRequest`
  round-trips (e.g. `newSession`), not to the streaming
  `onNotification` path.
- Subprocess `exit`/`error` are handled (`:986-998`) but there is no
  "subprocess is alive but silent" detection. If `codex app-server`
  wedges on an upstream API call, the manager waits indefinitely.

### 4. Sidebar "Working" never clears because it trusts a stale status

- [`apps/web/src/components/Sidebar.logic.ts:334`](../apps/web/src/components/Sidebar.logic.ts)
  returns the "Working" pill purely on `thread.session?.status === "running"`.
- The server only transitions `session.status` to `closed` / `failed` /
  `ready` when the provider adapter emits a terminating event. A silent
  provider never emits one, so the status stays `"running"` forever.

## What shipped in this PR (confident, low-risk)

- Sidebar now shows a **single gray spinner** when a thread is "Working"
  instead of the blue spinner + blue dot + "Working" text triplet. See
  the changelog entry.
- This does NOT fix the freeze, it only stops the redundant duplication.

## Proposed backend fix — requires approval

To make the connection feel "as robust as the Claude and Codex apps", I
recommend a three-layer defense, each small enough to land independently:

### Fix A — Idle-event watchdog per running session

- In `apps/server/src/provider/Layers/ClaudeAdapter.ts` and
  `apps/server/src/codexAppServerManager.ts`, after each emitted
  `ProviderRuntimeEvent`, bump a per-session "last activity" timestamp.
- A fiber per active session checks this every 10 s. If no activity for
  > 60 s **and** the provider reports a turn in progress, emit a
  > synthetic heartbeat event (`type: "session.heartbeat"`, severity
  > `info`) so the UI can tell "still thinking" vs "silent forever".
- If no activity for > 180 s (configurable), emit a `session.stalled`
  event, transition `session.status` → `"stalled"`, and let the user
  decide to interrupt or retry.

Touches only provider adapter code; no contract changes if we re-use the
existing `provider.runtime.warning` event for heartbeats.

### Fix B — `Stream.timeoutToError` on the Claude async iterable

- Wrap
  `Stream.fromAsyncIterable(context.query, …)` with
  `Stream.timeoutFail({ duration: "45 seconds", ... })` per message pull.
- Forces the OS-level 2 min hang down to a fast, deterministic failure
  that the existing `handleStreamExit` path already handles.
- Pairs with Fix A: the watchdog surfaces the issue, the timeout actually
  ends the stuck turn.

### Fix C — Sidebar pill reacts to `stalled`

- Add a `"Stalled"` branch in `resolveThreadStatusPill` (after Fix A
  adds the status). Amber dot, no pulse, tooltip "Provider has been
  silent for >3 min — click to interrupt."
- ~15 lines in `Sidebar.logic.ts` + a string in `Sidebar.tsx`.

### Estimated cost

| Fix                | Files                                                       | Risk                                                   |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------ |
| A — watchdog       | ClaudeAdapter.ts, codexAppServerManager.ts, 1 shared helper | Medium — fiber lifecycle must be tied to session scope |
| B — stream timeout | ClaudeAdapter.ts                                            | Low — pure Stream composition                          |
| C — UI state       | Sidebar.logic.ts, Sidebar.tsx (+ test)                      | Trivial                                                |

I intentionally did **not** implement A–C in this PR because any of them
can reshape provider-lifecycle semantics (e.g., what happens to a
long-running tool call that legitimately takes 5 min?). I want sign-off
on the thresholds (60 s heartbeat, 180 s stalled, 45 s per-message) before
writing the fiber plumbing.

## Recommendation

Approve Fix A + Fix B + Fix C as a single follow-up PR. If you want only
the UX-visible part first, Fix C alone (after a trivial stub that emits
`stalled` after 180 s) gets the user out of the "stuck Working" state
immediately, even if the subprocess is still wedged in the background.

## Files touched in this PR

- [apps/web/src/components/Sidebar.tsx](../apps/web/src/components/Sidebar.tsx)
- [apps/web/src/components/Sidebar.logic.ts](../apps/web/src/components/Sidebar.logic.ts)
- [changelog.md](../changelog.md)
- [reports/provider-freeze-investigation.md](./provider-freeze-investigation.md) (this file)
