---
title: "Subprocess Detachment on macOS"
aliases: [process-detachment, background-process, macos-popen]
tags: [subprocess, macos, process-management]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Subprocess Detachment on macOS

Detaching background processes on macOS requires specific Popen configuration to ensure child processes survive after the parent hook process exits. The memory compiler uses `start_new_session=True` to create a new process group, preventing process termination when the parent exits.

## Key Points

- On macOS/Linux: use `start_new_session=True` in `subprocess.Popen()` to detach processes
- On Windows: use `CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS` flags
- Without detachment, child process dies when parent (the hook) exits
- Memory compiler spawns flush.py and compile.py as detached processes to ensure background execution
- Detachment ensures flush operations and compilation complete even if Claude Code closes

## Details

### Python Implementation Pattern

```python
import subprocess
import platform

if platform.system() == "Windows":
    # Windows-specific flags
    proc = subprocess.Popen(
        ["uv", "run", "--directory", "memory-compiler", "python", "scripts/compile.py"],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
    )
else:
    # macOS/Linux
    proc = subprocess.Popen(
        ["uv", "run", "--directory", "memory-compiler", "python", "scripts/compile.py"],
        start_new_session=True
    )
```

### Why Detachment Matters

Hooks are short-lived. When SessionEnd hook finishes:

1. Hook process exits
2. Without detachment, child process (flush.py) would receive SIGHUP and terminate
3. With `start_new_session=True`, flush.py belongs to a new process group
4. flush.py continues even after hook exits

This pattern allows:

- Flush operations to complete asynchronously
- Flush to spawn compile.py without blocking
- Entire pipeline to run without user interaction

### Design Note on macOS

On macOS, subprocess detachment works even without explicit flags in some contexts (e.g., when spawned from hooks). However, explicit `start_new_session=True` is the correct, cross-platform approach and should always be used for background processes.

## Related Concepts

- [[concepts/hook-execution-context]] - Hook execution and process spawning
- [[concepts/memory-compiler-three-stage-pipeline]] - How detached processes fit the pipeline

## Sources

- [[daily/2026-04-09]] - "macOS subprocess detachment: `start_new_session=True` in Popen detaches; without it still works when spawned from hooks (design choice in upstream)"
