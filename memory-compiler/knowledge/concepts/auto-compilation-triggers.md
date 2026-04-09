---
title: "Auto-Compilation Triggers and Daily Log Hashing"
aliases: [auto-trigger, 6pm-compilation, log-hashing]
tags: [automation, compilation, state-management]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Auto-Compilation Triggers and Daily Log Hashing

The memory compiler automatically triggers compilation at 6 PM local time if the daily log has changed since its last compilation. This pattern avoids excessive API calls while ensuring knowledge is extracted within hours of being captured, implemented via SHA-256 hashing in `state.json`.

## Key Points

- Compilation auto-triggers at 6 PM local time (configurable via `COMPILE_AFTER_HOUR = 18`)
- Trigger only fires if today's daily log changed since last compilation
- State tracking uses SHA-256 hashes of daily log files, stored in `state.json`
- Hash comparison is fast (no API calls) and prevents redundant compilation
- Manual compilation is always available: `uv run --directory memory-compiler python scripts/compile.py`
- No cron job needed; trigger logic lives in flush.py background process

## Details

### Trigger Logic

When flush.py runs after a session ends:

1. Checks current time against `COMPILE_AFTER_HOUR` (6 PM)
2. Loads `state.json` to find last SHA-256 hash of `daily/YYYY-MM-DD.md`
3. Computes current hash of today's daily log
4. If hashes differ (log changed) AND it's past 6 PM, spawns compile.py as detached process
5. compile.py updates the hash in state.json after successful compilation

### Why 6 PM?

Daily logs accumulate throughout the day as sessions end. Waiting until 6 PM:
- Batches multiple sessions' conversations into one compilation run
- Reduces API costs (one compile per day instead of one per session)
- Ensures knowledge is available by next morning (compiled during evening)
- Prevents excessive API calls while maintaining prompt knowledge extraction

### Manual Compilation

The auto-trigger is a convenience; manual compilation is always available:
```bash
uv run --directory memory-compiler python scripts/compile.py              # compile new/changed
uv run --directory memory-compiler python scripts/compile.py --all        # force recompile
uv run --directory memory-compiler python scripts/compile.py --file daily/2026-04-01.md
```

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] - How auto-trigger fits the 3-stage pipeline
- [[concepts/hook-execution-context]] - When auto-trigger logic runs

## Sources

- [[daily/2026-04-09]] - "End-of-day auto-compilation: If it's past 6 PM local time and today's daily log has changed since its last compilation, spawns compile.py as another detached background process"
- [[daily/2026-04-09]] - "Set venv within memory-compiler/ rather than project root (cleaner isolation). Configured compile.py auto-trigger at 6 PM if daily log changed (avoids excessive API calls)"
