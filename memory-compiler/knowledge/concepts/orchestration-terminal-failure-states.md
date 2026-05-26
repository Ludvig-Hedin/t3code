---
title: Orchestration Terminal Failure States
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Orchestration Terminal Failure States

Orchestration systems must handle multiple terminal failure states — not just "error" but also "interrupted" — with distinct semantics for each.

## Key Points

- Terminal states include both `"error"` and `"interrupted"` (user cancellation)
- UI must handle both states: error shows retry option, interrupted shows resume option
- Type systems should enumerate all terminal states, not use catch-all string types
- PID file + reap-on-next-launch pattern handles daemon zombie processes

## Details

Effect-based orchestration systems track execution status through a state machine. The common mistake is treating only `"error"` as the terminal failure state:

### Terminal State Taxonomy

```typescript
type ExecutionStatus =
  | "idle"        // Not started
  | "running"     // In progress
  | "completed"   // Success
  | "error"       // Failed due to error
  | "interrupted" // Cancelled by user/system
```

### Semantic Differences

| State | Cause | User Action | Cleanup |
|-------|-------|-------------|---------|
| `error` | Exception, timeout, provider failure | Retry with same input | May need resource cleanup |
| `interrupted` | User pressed Stop, session timeout | Resume or start fresh | Must halt gracefully |

### Implementation Implications

1. **UI handling**: "Interrupted" should not show error styling (red borders, error icons)
2. **Logging**: Interrupted is informational, not an error condition
3. **State persistence**: Both need to be recoverable states
4. **WebSocket signals**: Reconnect handler must distinguish which terminal state occurred

### Daemon Process Cleanup

For orchestration involving spawned processes (like cloudflared tunnels), the `"interrupted"` state requires special handling:

**PID file + reap-on-next-launch pattern:**
1. Write daemon PID to file on spawn
2. On orchestration start, check for stale PID file
3. If exists, attempt to kill process and delete file
4. Then proceed with fresh spawn

This handles zombie daemons from crashes or ungraceful shutdowns (H9 fix in t3code).

## Related Concepts

- [[concepts/late-event-ingestion-guard]] — Rejecting events after terminal state
- [[concepts/phase-derivation-turn-id-guard]] — UI derivation from execution state
- [[concepts/process-cleanup-on-restart]] — Related cleanup pattern for process lifecycle

## Sources

- daily/2026-05-10.md — Session (15:49): "Terminal failure states in orchestration: 'interrupted' and 'error' (not just 'error')"
- daily/2026-05-10.md — Session (15:49): "H9 (cloudflared zombies): Implemented PID file + reap-on-next-launch pattern for daemon cleanup"
