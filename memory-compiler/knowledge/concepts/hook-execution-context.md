---
title: "Hook Execution Context and Working Directory"
aliases: [hook-context, hook-cwd, hook-execution]
tags: [hooks, environment, subprocess]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Hook Execution Context and Working Directory

Claude Code hooks (SessionStart, SessionEnd, PreCompact) fire with specific working directory and environment contexts. Understanding how hooks interact with cwd is critical for correct path resolution and subprocess spawning in the memory compiler.

## Key Points

- **SessionStart** executes with project root as cwd
- **SessionEnd** executes with project root as cwd; spawns flush.py as detached background process
- **PreCompact** same as SessionEnd; fires before context window auto-compaction
- Hook working directory is NOT the same as the spawned subprocess's working directory
- Scripts use absolute path resolution (`Path(__file__).resolve()`) to handle variable cwd
- Hook invocations must specify `uv run --directory` to ensure correct venv is used

## Details

### Hook Execution Flow

1. Claude Code detects hook trigger (SessionStart, SessionEnd, or PreCompact)
2. Hook command executes in `.claude/settings.json` context (project root cwd)
3. For SessionStart: output is injected into Claude's system context
4. For SessionEnd/PreCompact: hook reads transcript from stdin/file, spawns detached subprocess

### The Problem with Working Directory

When SessionEnd hook spawns `flush.py` as a detached process:

- Hook itself runs in project root
- Spawned process may inherit different cwd (implementation detail)
- Hardcoded paths like `./daily/` break in child process
- Solution: use `Path(__file__).resolve()` to make paths absolute

### Detached Subprocess Spawning

Both SessionEnd and PreCompact spawn background processes that survive after the hook exits:

- The spawned process is fully detached
- Uses `uv run --directory` to invoke with correct venv
- Any subsequent spawning (e.g., flush.py → compile.py) must also detach properly
- Deduplication guard prevents the same session from flushing twice within 60 seconds

## Related Concepts

- [[concepts/python-path-resolution]] - Absolute path resolution for variable cwd
- [[concepts/subprocess-detachment-macos]] - Platform-specific detachment behavior
- [[concepts/memory-compiler-three-stage-pipeline]] - How hooks fit into the pipeline

## Sources

- [[daily/2026-04-09]] - "Hook working directory: SessionEnd hook spawns flush.py from project root; flush.py then spawns compile.py with start_new_session=True"
- [[daily/2026-04-09]] - "Resolved path resolution issues... hook execution context matters"
