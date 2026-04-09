---
title: "venv Isolation with uv run --directory"
aliases: [venv-scoping, isolated-environment, uv-pattern]
tags: [environment, python, dependency-management]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# venv Isolation with uv run --directory

The memory-compiler is isolated in its own subdirectory with a dedicated virtual environment using `uv run --directory`. This pattern prevents dependency conflicts between the memory-compiler (`requirements: claude-agent-sdk, python-dotenv, tzdata`) and the larger monorepo, while keeping the compiler self-contained and portable.

## Key Points

- Memory-compiler is isolated in `/memory-compiler/` subdirectory
- Uses `uv run --directory memory-compiler` to scope the Python environment
- Virtual environment lives at `memory-compiler/.venv` (not at project root)
- Hooks call scripts using `uv run --directory memory-compiler python scripts/compile.py`
- This pattern cleanly separates the compiler's dependencies from the main monorepo
- Isolation prevents API key leakage and keeps builds independent

## Details

Without `--directory` scoping, `uv run` would look for dependencies at the project root, potentially causing conflicts or polluting the monorepo's dependency tree. With scoping, `uv` treats `memory-compiler/` as its own Python project:

1. `uv` looks for `pyproject.toml` in `memory-compiler/` (found)
2. Creates/activates `.venv` within `memory-compiler/`
3. Installs only the compiler's dependencies
4. Runs the script with that isolated environment

### Hook Integration

Hooks configured in `.claude/settings.json` invoke scripts like:
```bash
uv run --directory memory-compiler python scripts/compile.py
```

This ensures hooks always use the correct isolated environment, even if the hook execution context's cwd varies.

## Related Concepts

- [[concepts/python-path-resolution]] - Path discovery works with isolated environments
- [[concepts/hook-execution-context]] - How hooks specify environment

## Sources

- [[daily/2026-04-09]] - "Verified venv isolation: `uv run --directory memory-compiler` correctly scopes dependencies to `memory-compiler/.venv`, avoiding project root pollution"
- [[daily/2026-04-09]] - "Used `uv run --directory memory-compiler` pattern for hook subprocess calls to scope Python environment properly"
