---
title: "Flush Pipeline Failure Modes and Error Resilience"
aliases: [flush-errors, flush-failure, pipeline-resilience, claude-agent-sdk-errors]
tags: [memory-compiler, error-handling, resilience, operations]
sources:
  - "daily/2026-04-17.md"
  - "daily/2026-04-18.md"
created: 2026-04-17
updated: 2026-04-18
---

# Flush Pipeline Failure Modes and Error Resilience

The memory compiler's flush pipeline (flush.py) can enter a repeated failure state where the Claude Agent SDK's `query()` function fails consistently across many invocations. On 2026-04-17, flush.py failed ~20 consecutive times over a 2-hour window (19:53–21:14) with identical errors: "Command failed with exit code 1 — Check stderr output for details." The pattern recurred on 2026-04-18 with intermittent failures (2 FLUSH_ERROR entries at 15:37 and 15:52, interspersed with successful flushes), suggesting the root cause is transient rather than persistent. The failures reveal several resilience gaps: no exponential backoff, no circuit breaker, opaque error messages, and no adaptive behavior after repeated failures.

## Key Points

- **Repeated identical failures** — The same `query()` exception fired ~20 times across 2 hours with no variation in error or behavior
- **Opaque error messages** — "Check stderr output for details" provides no actionable information; stderr is not captured or logged
- **No backoff or circuit breaker** — Each session-end hook fires flush.py independently; there is no awareness of prior failures
- **No persistent failure state** — `last-flush.json` tracks deduplication (session_id + timestamp) but not failure counts or error history
- **Non-blocking to user** — Flush failures are background operations; the user's Claude Code session is unaffected, but knowledge capture silently stops

## Details

### The Failure Pattern

On 2026-04-17, the flush pipeline exhibited a cascading failure pattern:

```
19:21 - FLUSH_OK (success)
19:23 - FLUSH_OK (success)
19:30 - FLUSH_OK (success)
19:34 - FLUSH_OK (success)
19:36 - FLUSH_OK (success)
19:45 - FLUSH_OK (success)
19:53 - FLUSH_ERROR (first failure)
19:55 - FLUSH_ERROR (repeat)
19:55 - FLUSH_ERROR (repeat)
19:56 - FLUSH_ERROR (repeat)
... (15+ more identical failures through 21:14)
```

The transition from consistent success to consistent failure suggests an external dependency change (API rate limit, credential expiration, SDK bug, or upstream service issue) rather than a code defect. However, the pipeline has no mechanism to distinguish transient from persistent failures.

### Error Anatomy

Every failure produced an identical traceback:

```python
File "flush.py", line 162, in run_flush
    async for message in query(...)
File "claude_agent_sdk/query.py", line 122, in query
    async for message in client.process_query(...)
File "claude_agent_sdk/_internal/client.py", line 147, in process_query
    async for data in query.receive_messages():
File "claude_agent_sdk/_internal/query.py", line 726, in receive_messages
    raise Exception(message.get("error", "Unknown error"))
Exception: Command failed with exit code 1
Error output: Check stderr output for details
```

The error originates in the Claude Agent SDK's internal message processing. The "exit code 1" suggests the SDK spawned a subprocess (likely Claude Code CLI) that failed, but the error message provides no details about *why* it failed. The "Check stderr output" instruction is unhelpful because flush.py does not capture or log stderr from the SDK's internal subprocess.

### Missing Resilience Patterns

**1. No exponential backoff:** Each hook invocation independently attempts a flush. If the underlying issue is transient (rate limit, network blip), immediate retries would waste resources. A backoff strategy (1s → 2s → 4s → 8s → give up) would reduce noise.

**2. No circuit breaker:** After N consecutive failures, the pipeline should stop attempting flushes for a cooldown period. Currently, every session-end event triggers a new flush attempt regardless of history.

**3. No error logging to daily log:** Failures are logged as `FLUSH_ERROR` entries in the daily log, but the error details are not actionable. Capturing the SDK's stderr would provide debugging information.

**4. No failure-count tracking:** `last-flush.json` tracks session deduplication but not failure state. Adding a `consecutive_failures` counter and `last_error` field would enable circuit-breaking logic.

**5. No alerting:** Twenty consecutive failures over 2 hours went unnoticed until manual log review. A threshold-based alert (e.g., after 3 failures) would surface the issue sooner.

### Impact on Knowledge Capture

When flush.py fails consistently, the pipeline's Stage 2 (transcript capture) breaks silently:

- Session transcripts are not processed
- Daily log entries are not appended
- Auto-compilation at 6 PM has nothing new to compile
- Knowledge from those sessions is permanently lost unless manually recovered from JSONL transcript files

The user experiences no visible error (flush is a background process), making the failure mode particularly insidious.

### Recommended Improvements

1. **Capture stderr** from the SDK subprocess and include it in error logs
2. **Add exponential backoff** within flush.py for transient failures (retry 3 times with increasing delay)
3. **Track failure state** in `last-flush.json` (consecutive_failures, last_error_time, last_error_message)
4. **Circuit breaker** — skip flush attempts for 30 minutes after 5 consecutive failures
5. **Surface errors** — write a human-readable summary to stdout so session-end hooks can surface the issue

### Continued Failures on 2026-04-18

The same failure pattern recurred on 2026-04-18 with 2 FLUSH_ERROR entries (at 13:37 and 13:52 UTC) interspersed among successful FLUSH_OK entries. The errors were identical to the 2026-04-17 pattern: `query()` raising "Command failed with exit code 1" with the same uninformative "Check stderr output for details" message. Unlike the sustained failure window on 2026-04-17 (~20 consecutive failures over 2 hours), the 2026-04-18 failures were intermittent — successful flushes occurred before, between, and after the errors. This suggests the underlying cause may be transient resource contention or rate limiting rather than a persistent configuration issue. The intermittent pattern further supports the need for retry logic with backoff, as a single retry would likely succeed for these transient failures.

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] — The pipeline architecture where flush failures break Stage 2
- [[concepts/subprocess-detachment-macos]] — Flush.py runs as a detached process; errors don't propagate to the user
- [[concepts/auto-compilation-triggers]] — Compilation depends on flush populating the daily log; flush failures break the trigger chain
- [[concepts/external-service-initialization-fallback]] — Similar pattern of handling external service failures gracefully

## Sources

- [[daily/2026-04-17.md]] — "FLUSH_ERROR ts=2026-04-17T17:53:47 [...] Exception: Command failed with exit code 1" — first of ~20 identical failures
- [[daily/2026-04-17.md]] — Failures continued from 19:53 through 21:14, approximately every 1-5 minutes, all with identical traceback
- [[daily/2026-04-17.md]] — Earlier flushes at 19:21, 19:23, 19:30, 19:34, 19:36, 19:45 all returned FLUSH_OK, indicating the failure was a state transition, not a persistent configuration issue
- [[daily/2026-04-18.md]] — 2 intermittent FLUSH_ERROR entries at 13:37 and 13:52 UTC with identical traceback, interspersed with FLUSH_OK successes — suggests transient rather than persistent failures
