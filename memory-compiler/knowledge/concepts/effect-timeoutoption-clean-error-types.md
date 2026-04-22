---
title: "Effect.timeoutOption for Clean Error Channel Types"
aliases: [timeoutOption, effect-timeout-clean, timeout-without-exception]
tags: [effect, typescript, error-handling, type-safety]
sources:
  - "daily/2026-04-19.md"
created: 2026-04-19
updated: 2026-04-19
---

# Effect.timeoutOption for Clean Error Channel Types

Effect's `Effect.timeout` combinator adds `TimeoutException` to the error channel of the resulting effect type. When the timeout behavior should be transparent (handled inline without propagating a new error type to callers), `Effect.timeoutOption` is the correct alternative: it wraps the result in `Option<A>`, returning `None` on timeout and `Some<A>` on success, leaving the error channel unchanged.

## Key Points

- **`Effect.timeout` pollutes error channel** — adds `TimeoutException` to `E`, forcing all callers to handle it or widen their own error type
- **`Effect.timeoutOption` keeps error channel clean** — returns `Effect<Option<A>, E, R>` instead of `Effect<A, E | TimeoutException, R>`
- **`None` signals timeout** — callers pattern-match on `Option.isNone` to detect timeout without needing an exception case
- **Use when timeout is a control flow branch, not a failure** — if timeout means "fall back to a different action," `timeoutOption` is semantically cleaner
- **Use `Effect.timeout` when timeout is a true failure** — if exceeding the timeout is an error the caller must handle explicitly

## Details

### The Problem with `Effect.timeout`

```typescript
// Effect.timeout widens the error type
const interrupted: Effect.Effect<void, TimeoutException | InterruptError, never> = query
  .interrupt()
  .pipe(Effect.timeout(Duration.seconds(5)));

// Every caller now must handle TimeoutException:
interrupted.pipe(
  Effect.catchTag("TimeoutException", () => fallback()),
  Effect.catchTag("InterruptError", () => otherFallback()),
);
```

When `query.interrupt()` can already fail with its own error types, adding `TimeoutException` forces every function in the call chain to acknowledge the new error. This creates type noise, especially when the timeout is just a "give up and move on" signal rather than a meaningful failure case.

### The Solution: `Effect.timeoutOption`

```typescript
// Effect.timeoutOption returns Option without changing error channel
const maybeInterrupted: Effect.Effect<Option.Option<void>, InterruptError, never> = query
  .interrupt()
  .pipe(Effect.timeoutOption(Duration.seconds(5)));

// Caller matches on Option — no new error type to handle
const result = yield * maybeInterrupted;
if (Option.isNone(result)) {
  // Timeout: fall through to force-stop
  yield * stopSessionInternal("failed", "Interrupt timed out");
}
```

The error channel stays as `InterruptError` (or whatever the original effect's error is). The timeout is expressed as a normal control-flow branch using Option, not as an exception.

### When to Use Which

| Situation                                  | Use                                    |
| ------------------------------------------ | -------------------------------------- |
| Timeout = failure that callers must handle | `Effect.timeout`                       |
| Timeout = "try but fall back silently"     | `Effect.timeoutOption`                 |
| Timeout = "try but ignore result if slow"  | `Effect.timeoutOption` + ignore `None` |
| Need the exact timeout error for logging   | `Effect.timeout` + `catchTag`          |

### Applied: Interrupt with Fallback

In ClaudeAdapter and CodexAdapter, `query.interrupt()` is given a 5-second budget. If the subprocess is frozen and doesn't respond to the interrupt signal within that window, the adapter falls through to `stopSessionInternal` to forcibly fiber-interrupt the session. This is a "try gracefully, then force" pattern — not a failure. `timeoutOption` expresses this cleanly:

```typescript
const interruptResult = yield * query.interrupt().pipe(Effect.timeoutOption(Duration.seconds(5)));
if (Option.isNone(interruptResult)) {
  yield * stopSessionInternal("failed", "Force-interrupted after timeout");
}
```

## Related Concepts

- [[concepts/inactivity-watchdog-fiber-pattern]] — The watchdog that triggers `stopSessionInternal` when streams freeze
- [[concepts/effect-layer-composition-ordering]] — Another Effect-specific subtlety with runtime vs compile-time behavior
- [[concepts/null-undefined-type-coercion-bugs]] — Related theme: type-level distinctions that matter at runtime

## Sources

- [[daily/2026-04-19]] — "Add a 5s timeout to `query.interrupt()` in ClaudeAdapter and CodexAdapter; on timeout, fall through to `stopSessionInternal` (force fiber interrupt). Used `Effect.timeoutOption` to avoid adding error types."
- [[daily/2026-04-19]] — "Effect's `Effect.timeout` adds `TimeoutException` to the error channel; use `Effect.timeoutOption` instead to keep the error type clean."
