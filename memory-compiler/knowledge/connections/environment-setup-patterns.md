---
title: "Connection: Environment Setup Patterns - Path Resolution and venv Isolation"
connects:
  - "concepts/python-path-resolution"
  - "concepts/venv-isolation-with-uv"
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Connection: Environment Setup Patterns - Path Resolution and venv Isolation

## The Connection

Path resolution and virtual environment isolation are complementary environment setup patterns that together ensure the memory compiler scripts run correctly across different machines and execution contexts. They address two sides of the same problem: "how do I know where I am and what dependencies I have?"

## Key Insight

These patterns are often conflated or assumed to be orthogonal, but they're actually tightly coupled:

- **Path resolution** answers: "Where is my project ROOT?"
- **venv isolation** answers: "What Python environment should I use?"

If path resolution fails, scripts can't find `knowledge/` or `daily/`. If venv isolation fails, scripts can't import `anthropic` or `dotenv`. In practice:

- Path resolution must work in the correct venv (the one with dependencies installed)
- venv isolation must be scoped correctly so paths are consistent
- Both must work across different hook execution contexts (ProjectRoot, session context, etc.)

## Evidence

From the daily log:

1. **Path resolution verified after venv isolation**: "Verified venv isolation: `uv run --directory memory-compiler` correctly scopes dependencies to `memory-compiler/.venv`" → then "Resolved path resolution issues"

2. **Both address the same problem**: "Used `uv run --directory memory-compiler` pattern for hook subprocess calls to scope Python environment properly" + "Python scripts use `Path(__file__).resolve().parent.parent` to locate ROOT; hook execution context matters"

3. **They're interdependent**: If venv isolation is wrong, path resolution still works but scripts crash on imports. If path resolution is wrong, venv works but scripts can't find knowledge artifacts.

## Design Pattern

The combined pattern is:

```bash
# Hook configuration
uv run --directory memory-compiler python scripts/compile.py
                   # ↑ isolates venv

# Within script
ROOT_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = ROOT_DIR / "knowledge"
                # ↑ resolves path absolutely
```

This pattern ensures:

- Correct dependencies are loaded (`uv` scoping)
- Correct files are found (absolute path resolution)
- Works across different machines (no hardcoded paths)
- Works across different hook contexts (no cwd assumptions)

## Related Concepts

- [[concepts/python-path-resolution]] - Absolute path resolution pattern
- [[concepts/venv-isolation-with-uv]] - Virtual environment isolation pattern
- [[concepts/hook-execution-context]] - The execution contexts that require both patterns
