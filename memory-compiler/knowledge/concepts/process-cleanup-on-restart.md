---
title: "Process Cleanup on Restart: Await Exit Before Map Deletion"
aliases: [process-restart-cleanup, eaddrinuse-prevention, session-map-cleanup]
tags: [process-management, cleanup, race-condition, nodejs, reliability]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# Process Cleanup on Restart: Await Exit Before Map Deletion

When restarting a subprocess that binds to a port or other exclusive resource, you must await the actual process exit before deleting it from session tracking maps and spawning the replacement. Removing the map entry immediately after sending SIGTERM creates a race where the new process starts before the old process releases the port, causing EADDRINUSE errors.

## Key Points

- **SIGTERM is non-blocking** — Sending a kill signal returns immediately; the process may take time to exit
- **Await actual exit event** — Use `process.on('exit')` or equivalent before proceeding
- **Delete from map after exit** — Map entry removal signals "slot is free"; do this only when actually free
- **EADDRINUSE is the symptom** — New process can't bind to port still held by dying process
- **Race window is small but real** — Especially under load, the overlap window grows

## Details

### The Bug Pattern

A common session management pattern:

```javascript
const sessions = new Map(); // sessionId -> { process, port, ... }

async function restartSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.process.kill("SIGTERM");
    sessions.delete(sessionId); // BUG: deleted before process actually exits
  }

  // Start new process immediately
  const newProcess = spawn("server", ["--port", session.port]);
  sessions.set(sessionId, { process: newProcess, port: session.port });
  // ERROR: EADDRINUSE - old process still holds the port!
}
```

### The Correct Pattern

```javascript
async function restartSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    // Send termination signal
    session.process.kill("SIGTERM");

    // Wait for actual exit
    await new Promise((resolve) => {
      session.process.on("exit", resolve);
      // Timeout fallback in case process ignores SIGTERM
      setTimeout(() => {
        session.process.kill("SIGKILL");
        resolve();
      }, 5000);
    });

    // NOW it's safe to delete from map
    sessions.delete(sessionId);
  }

  // Start new process - port is guaranteed free
  const newProcess = spawn("server", ["--port", session.port]);
  sessions.set(sessionId, { process: newProcess, port: session.port });
}
```

### Why This Matters

The security audit that identified this bug found it caused:

1. **Session restart failures** — Users clicking "restart" got cryptic EADDRINUSE errors
2. **Port exhaustion** — Failed restarts left orphan processes holding ports
3. **Cascading failures** — Retry logic spawned more processes, worsening the port exhaustion
4. **Difficult debugging** — The race is timing-dependent; harder to reproduce in development

### Broader Pattern: Map-as-State-Machine

Session maps often serve as implicit state machines:

- Entry exists → session is active
- Entry absent → slot is free

This creates coupling between map state and resource state. The invariant "map entry exists IFF resources are held" must be maintained by coordinating deletion with resource release.

### Defensive Patterns

Beyond awaiting exit:

1. **Port pooling** — Don't reuse the same port; allocate from a pool of available ports
2. **SO_REUSEADDR** — Allows binding to TIME_WAIT ports (but doesn't help if process is still alive)
3. **Health check before bind** — New process probes port before binding; retries if busy
4. **Graceful shutdown protocol** — Process acknowledges termination via IPC before parent proceeds

## Related Concepts

- [[concepts/nodejs-readline-close-race]] — Another pattern where process exit timing matters
- [[concepts/process-serialization-piggyback-pattern]] — Related process lifecycle coordination pattern
- [[concepts/inactivity-watchdog-fiber-pattern]] — Watchdog-based cleanup of stuck processes

## Sources

- [[daily/2026-05-09.md]] — "Process cleanup on restart: must await actual process exit before deleting from session maps (EADDRINUSE bugs)"
