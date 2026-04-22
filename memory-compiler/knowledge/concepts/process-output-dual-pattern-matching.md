---
title: "Process Output Dual-Pattern Matching for Success and Error Detection"
aliases: [error-pattern-detection, process-watcher, dual-pattern-matching, fail-fast-process]
tags: [process-management, error-handling, debugging, ux]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Process Output Dual-Pattern Matching for Success and Error Detection

Process output watchers that only match success patterns (e.g., "tunnel URL ready") will hang forever when the process fails — the success pattern never appears, and the watcher times out after 30+ seconds with no useful information. The fix is to always add error pattern matching alongside success patterns, so failures are detected and reported immediately instead of silently timing out.

## Key Points

- **Success-only watchers hang on failure** — if the spawned process prints an error and exits, the watcher never sees its success pattern and blocks until timeout
- **Error patterns should be checked first** — evaluate error regex before success regex on each line of output to fail fast
- **Surface the actual error message** — capture the process's error output and pass it to the UI, not a generic "timed out" message
- **Common error patterns** — `error|failed|refused|no such host|dial tcp|connection refused|permission denied` cover most subprocess failure modes
- **Fail fast over silent retry** — immediately surface the error rather than retrying silently, so users can fix the underlying issue (DNS, network, permissions)

## Details

### The Problem: Success-Only Watchers

A tunnel manager spawns `cloudflared` and watches stdout for a URL pattern indicating the tunnel is ready:

```typescript
// ❌ BROKEN: Only watches for success
function waitForTunnel(process: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject("Timeout"), 30_000);

    process.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
  });
}
```

When `cloudflared` fails (e.g., DNS resolution fails: `dial tcp: lookup api.cloudflare.com: no such host`), it prints the error to stdout/stderr and exits. The watcher never sees its URL pattern, sits for 30 seconds, then reports "Timeout" — providing no useful information about why the tunnel failed.

### The Fix: Dual-Pattern Matching

```typescript
// ✅ CORRECT: Watch for both success and error patterns
function waitForTunnel(process: ChildProcess): Promise<string> {
  const ERROR_PATTERNS =
    /error|failed|refused|no such host|dial tcp|connection refused|permission denied/i;

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      process.stdout?.off("data", handleOutput);
      process.stderr?.off("data", handleOutput);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const handleOutput = (chunk: Buffer) => {
      const line = chunk.toString();

      // Check error patterns FIRST (fail fast)
      if (ERROR_PATTERNS.test(line)) {
        finish(() => reject(new Error(`Tunnel failed: ${line.trim()}`)));
        return;
      }

      // Then check success pattern
      const match = line.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (match) {
        finish(() => resolve(match[0]));
      }
    };

    process.stdout?.on("data", handleOutput);
    process.stderr?.on("data", handleOutput);
    process.once("error", (err) => finish(() => reject(err)));

    timeout = setTimeout(
      () => finish(() => reject(new Error("Timeout waiting for tunnel"))),
      30_000,
    );
  });
}
```

### Why Error Patterns Should Be Checked First

In a single line of output, it's possible (though rare) for both patterns to match. Prioritizing error detection ensures:

1. The error is reported immediately (within milliseconds of the process printing it)
2. The user sees the actual failure reason, not a generic timeout
3. No 30-second wait for something that already failed

### Real-World Example: cloudflared DNS Failure

The `cloudflared` tunnel binary failed with:

```
ERR error="dial tcp: lookup api.cloudflare.com: no such host"
```

This was printed to stdout within 1-2 seconds of spawning. Without error pattern matching, the tunnel manager waited the full 30-second timeout before reporting failure. With dual-pattern matching, the error is detected in <2 seconds and the actual DNS resolution failure is surfaced to the user.

### Downstream Impact

The tunnel failure also caused a misleading iOS connection error. The iOS app tried to connect using the tunnel URL embedded in the pairing code — but since the tunnel never established, the URL was invalid. The "local network" permission error on iOS was a red herring; the real problem was on the desktop side (tunnel never came up).

### Generalization

This pattern applies to any process-watcher scenario:

- **Dev server startup** — watch for both "ready on port X" and "EADDRINUSE" / "Module not found"
- **Build processes** — watch for both "Build complete" and "Error:" / "SyntaxError"
- **Database migrations** — watch for both "Migration complete" and "relation already exists"

The meta-rule: **any process output watcher must have both a success path and a failure path**.

## Related Concepts

- [[concepts/dev-server-status-visualization]] — Dev server milestone logging also watches process output but for progress rather than pass/fail
- [[concepts/startup-milestone-logging]] — Similar pattern of parsing process output, but this article focuses on the error detection gap
- [[concepts/external-service-initialization-fallback]] — Fail-fast error detection enables faster fallback to alternative services

## Sources

- [[daily/2026-04-20.md]] — "Added error pattern detection (`error|failed|refused|no such host|dial tcp|connection refused|permission denied`) in `_spawnTunnel()` before the success check, so errors are reported immediately instead of waiting for 30s timeout"
- [[daily/2026-04-20.md]] — "Process output watchers that only match success patterns will hang forever when the process fails — always add error pattern matching alongside success patterns"
- [[daily/2026-04-20.md]] — "`cloudflared` prints errors to stderr/stdout before exiting; the regex-based watcher architecture works fine but needs both paths covered"
