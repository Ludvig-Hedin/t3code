---
title: "Node.js Readline Close Race Condition"
aliases: [readline-race, child-close-readline, buffered-output-race]
tags: [nodejs, debugging, process-management, async]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Node.js Readline Close Race Condition

Node.js `child.on('close')` can fire before readline interfaces (wrapping the child's stdout/stderr) have emitted all buffered lines. Code that reads error buffers in the `close` handler sees empty arrays because readline hasn't finished processing. The fix is a coordinator function that waits for all three close events (child process close + stdout readline close + stderr readline close) before consuming output buffers.

## Key Points

- **`child.on('close')` doesn't guarantee readline completion** — the child process exits, but buffered data in readline's internal buffer may not yet be emitted as `'line'` events
- **Symptom: empty error output on crash** — error buffers are read in the close handler but are still empty, so UI shows "Process exited with code 1" with no details
- **Three events must be coordinated** — child close, stdout readline close, stderr readline close; only read buffers after all three
- **Coordinator pattern** — `maybeEmitCrash()` increments a counter on each close event; only processes output when counter reaches 3
- **Applies to any readline-wrapped subprocess** — dev servers, build tools, linters; any subprocess where error output is captured via readline

## Details

### The Race Condition

When a subprocess crashes, the following events occur in non-deterministic order:

1. Subprocess exits (triggers `child.on('close', code)`)
2. OS flushes the subprocess's stdout pipe buffer
3. Node.js readline processes buffered stdout data (emits remaining `'line'` events)
4. readline emits `'close'` for stdout
5. Same for stderr (steps 2-4)

The common but incorrect assumption is that by the time `child.on('close')` fires, all output has been consumed:

```typescript
// ❌ BROKEN: readline may not have emitted all lines yet
const errorLines: string[] = [];

const rl = readline.createInterface({ input: child.stderr });
rl.on("line", (line) => errorLines.push(line));

child.on("close", (code) => {
  if (code !== 0) {
    // errorLines may be EMPTY — readline hasn't finished!
    showError(errorLines.join("\n") || "No details available");
  }
});
```

### The Fix: Coordinator Pattern

```typescript
// ✅ CORRECT: Wait for all three close events
const stdoutLines: string[] = [];
const stderrLines: string[] = [];
let closeCount = 0;
let exitCode: number | null = null;

const maybeEmitCrash = () => {
  closeCount++;
  if (closeCount < 3) return; // Not all streams closed yet

  if (exitCode !== 0) {
    const output = stderrLines.length > 0 ? stderrLines : stdoutLines;
    showError(output.join("\n"));
  }
};

const rlStdout = readline.createInterface({ input: child.stdout });
const rlStderr = readline.createInterface({ input: child.stderr });

rlStdout.on("line", (line) => stdoutLines.push(line));
rlStderr.on("line", (line) => stderrLines.push(line));

rlStdout.on("close", maybeEmitCrash);
rlStderr.on("close", maybeEmitCrash);

child.on("close", (code) => {
  exitCode = code;
  maybeEmitCrash();
});
```

The coordinator increments on each of the three close events. Only when all three have fired does it consume the buffers and emit the crash information.

### Error UI Split

Once the race condition is fixed and error output is reliably captured, the UI can distinguish three cases:

1. **Live logs present** — show the scrollback of recent output (user was watching the process)
2. **Captured output with content** — show in a `<pre>` block (crash details, stack trace)
3. **Nothing captured** — show the command that was run plus a common-causes checklist (missing dependency, wrong port, permissions)

### Why This Matters for Developer Tools

IDEs and preview panels that spawn dev servers must show useful error information when the server crashes. Without the race condition fix, crashes show only "exited with code 1" — useless for debugging. With the fix, the actual error (e.g., "EADDRINUSE: port 3000 already in use") is displayed immediately.

## Related Concepts

- [[concepts/process-output-dual-pattern-matching]] — Complementary pattern: detecting errors in real-time output vs. collecting them after crash
- [[concepts/dev-server-status-visualization]] — The UI component that displays these crash details to users
- [[concepts/startup-milestone-logging]] — Both involve parsing subprocess output for UX purposes

## Sources

- [[daily/2026-04-20.md]] — "Root cause identified: readline race condition where `child.on('close')` fired before readline emitted all buffered output, leaving error buffers empty"
- [[daily/2026-04-20.md]] — "Fix readline race with a `maybeEmitCrash()` coordinator that waits for all three events (child close + both readline close) before reading output buffers"
- [[daily/2026-04-20.md]] — "Error UI split into three distinct cases: live logs present, captured output with newlines (show in `<pre>`), nothing captured (show command + common causes checklist)"
