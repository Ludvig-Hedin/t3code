# AGENTS.md

> Claude / Codex / general agent instructions.
>
> **Shared project context lives in [`PROJECT.md`](PROJECT.md)** — read it first.
> This file contains only agent-framework-specific additions.

## Agent-specific notes

- Use the `Skill` tool to invoke skills before responding to any request.
- Always check [`PROJECT.md`](PROJECT.md) for shared architecture and coding standards before
  adding new patterns here.

## File Edit Transparency (all providers)

Whenever you edit or create a file, you **must** output:

1. The **full file path** (e.g. `apps/server/src/foo.ts`)
2. A **brief description** of what changed and why
3. A **compact diff preview** with 1 to 4 representative changed lines or line pairs

**Format:**

```text
✏️  apps/server/src/foo.ts
  — Added null-check before calling `bar()` to prevent crash on cold start
  — Diff preview:
    - if (foo) {
    + if (foo && bar) {
    - return baz
    + return baz ?? fallback
```

For **Claude Code**: a PostToolUse hook in `.claude/settings.json` handles this automatically
via `git diff`, so it appears inline after each edit. The hook should show the exact file path and a
short diff window, not a full file dump. No manual output needed there.

For **Codex, Gemini, Cursor, OpenCode, and any other provider**: since hooks are not
available, you must output the file path + change summary + compact diff preview yourself in your
response text, immediately after every edit. Do not batch them at the end.

---

> **For all project context** (architecture, package roles, providers, subsystems, coding
> standards, file path formatting, reference repos, task completion requirements, etc.)
> **→ see [`PROJECT.md`](PROJECT.md).**
