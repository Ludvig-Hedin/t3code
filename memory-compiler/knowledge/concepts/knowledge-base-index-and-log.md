---
title: "Knowledge Base Index and Log Structure"
aliases: [index-structure, log-structure, wiki-metadata]
tags: [knowledge-base, structure, metadata]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Knowledge Base Index and Log Structure

The knowledge base maintains two structural files: `knowledge/index.md` (master catalog) and `knowledge/log.md` (build log). The index enables efficient retrieval by listing all articles with metadata, while the log tracks compilation history and enables incremental compilation.

## Key Points

- `knowledge/index.md` is the master catalog listing every article with summary and sources
- `knowledge/log.md` is append-only, tracking compilation operations and API costs
- Index format uses Markdown tables for human readability and LLM scannability
- Log uses timestamped entries with source file and list of articles created/updated
- Both files are read at the start of every compilation to maintain context
- Index enables query optimization; log enables state tracking and cost auditing

## Details

### Index Format

`knowledge/index.md` contains a table:

```markdown
| Article                    | Summary                     | Compiled From       | Updated    |
| -------------------------- | --------------------------- | ------------------- | ---------- |
| [[concepts/supabase-auth]] | Row-level security patterns | daily/2026-04-02.md | 2026-04-02 |
```

**Why a table?**

- Compact, scannable by LLM and human
- Wikilinks enable navigation within the knowledge base
- Summary column answers "do I need to read the full article?"
- Sources column enables incremental compilation (recompile only if source changed)
- Updated date helps prioritize stale articles

### Log Format

`knowledge/log.md` is append-only:

```markdown
## [2026-04-01T14:30:00] compile | Daily Log 2026-04-01

- Source: daily/2026-04-01.md
- Articles created: [[concepts/nextjs-project-structure]], [[concepts/tailwind-setup]]
- Articles updated: (none)

## [2026-04-02T09:00:00] query | "How do I handle auth redirects?"

- Consulted: [[concepts/supabase-auth]], [[concepts/nextjs-middleware]]
- Filed to: [[qa/auth-redirect-handling]]
```

**Log purposes:**

- Chronological audit trail of knowledge base changes
- Cost tracking (each entry notes compilation cost)
- State snapshot (which articles exist, what sources they came from)
- Enables recompilation logic (check log to see if daily/X was already compiled)

### Incremental Compilation

compile.py reads the log to determine what's already been compiled:

1. Load `state.json` (SHA-256 hashes of daily logs)
2. If daily/YYYY-MM-DD.md hash matches stored hash, skip compilation
3. Otherwise, compile and update hash
4. Append new entry to `knowledge/log.md`

This avoids recompiling unchanged daily logs, reducing API costs.

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] - Index and log are maintained by compile.py
- [[concepts/auto-compilation-triggers]] - Log entries are what track compilation state

## Sources

- [[daily/2026-04-09]] - "Knowledge index format: knowledge/index.md holds concept links; knowledge/log.md tracks daily log references (used for recall)"
