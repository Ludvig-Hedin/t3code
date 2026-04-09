---
title: "Memory Compiler Three-Stage Pipeline"
aliases: [pipeline, capture-compile-inject, 3-stage-architecture]
tags: [architecture, memory-compiler, automation]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Memory Compiler Three-Stage Pipeline

The memory compiler operates as a 3-stage data flow: context injection, transcript capture, and daily log compilation. This architecture ensures knowledge is automatically extracted from conversations and made available for future sessions without manual intervention.

## Key Points

- **SessionStart** injects knowledge context (index + recent daily log) at the beginning of each session
- **SessionEnd / PreCompact** capture the conversation transcript and spawn a background flush process
- **compile.py** processes the daily log to extract concepts into structured wiki articles
- The pipeline is fully automated via hooks in `.claude/settings.json`
- Both SessionEnd and PreCompact hooks spawn flush.py as detached background processes to survive after Claude Code exits

## Details

### Stage 1: SessionStart (Context Injection)

When Claude Code starts a new session in the memory-compiler project, the SessionStart hook reads `knowledge/index.md` and the most recent daily log, outputting them as JSON. This ensures every conversation begins with access to the knowledge base.

The hook runs in under 1 second with pure local I/O (no API calls) and outputs max 20,000 characters to avoid overwhelming the context window.

### Stage 2: SessionEnd / PreCompact (Transcript Capture)

Two hooks capture conversation transcripts:
- **SessionEnd** fires when the user closes the session
- **PreCompact** fires before Claude Code auto-compacts the context window (important for long sessions)

Both read the JSONL transcript from Claude Code's internal format and spawn `flush.py` as a fully detached background process. The detached process ensures the flush operation completes even after Claude Code's hook process exits.

Deduplication prevents duplicate flushes: if the same session was flushed within 60 seconds, the newer flush exits immediately.

### Stage 3: Compile.py (Log → Wiki Articles)

The `flush.py` background process calls Claude Agent SDK to decide what from the conversation is worth saving. It appends structured bullet points to `daily/YYYY-MM-DD.md`.

At the end of day (after 6 PM local time), if today's daily log changed since last compilation, `flush.py` spawns `compile.py` as another detached background process. The compiler reads the daily log and uses Claude Agent SDK to extract concepts, create or update wiki articles, and maintain the knowledge base index and log.

This auto-trigger at 6 PM avoids excessive API calls while ensuring daily logs are compiled within hours of being created.

## Related Concepts

- [[concepts/hook-execution-context]] - How hooks fire and interact with working directory
- [[concepts/python-path-resolution]] - How compile.py locates ROOT directory
- [[concepts/subprocess-detachment-macos]] - Technical details of background process spawning

## Sources

- [[daily/2026-04-09]] - "Clarified 3-stage pipeline: SessionStart (context injection) → SessionEnd/PreCompact (transcript capture) → compile.py (daily log → knowledge articles)"
- [[daily/2026-04-09]] - "End-of-day auto-compilation: If it's past 6 PM local time and today's daily log has changed since its last compilation, spawns compile.py as another detached background process"
