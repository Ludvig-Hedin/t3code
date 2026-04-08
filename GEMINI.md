# GEMINI.md

> Gemini CLI project instructions.
>
> **Shared project context lives in [`PROJECT.md`](PROJECT.md)** — read it first.
> This file contains only Gemini-specific additions and tool equivalences.

## Gemini-specific notes

- Gemini CLI uses `activate_skill` instead of the `Skill` tool.
- Skills are auto-discovered from installed plugins at session start.
- Tool mapping equivalences are loaded automatically via this file.

## File Edit Transparency

Gemini CLI does not support PostToolUse hooks, so you must output file paths and diffs manually.

After **every** file edit or creation, output this inline in your response:

```
✏️  path/to/file.ts
  — What changed and why (one line)
```

Do not batch these at the end of your response. Output them as you go, immediately after
each edit. This makes it easy to follow what changed without scrolling to a summary.

---

> **For all project context** (architecture, package roles, providers, subsystems, coding
> standards, file path formatting, reference repos, task completion requirements, etc.)
> **→ see [`PROJECT.md`](PROJECT.md).**
