---
title: "Python Path Resolution in Scripts"
aliases: [root-path, script-paths, path-discovery]
tags: [python, environment, setup]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Python Path Resolution in Scripts

Memory compiler scripts locate the project ROOT directory using `Path(__file__).resolve().parent.parent` to enable portable, context-agnostic file operations. This pattern ensures scripts work correctly regardless of where they're invoked from and how the Python environment is configured.

## Key Points

- Use `Path(__file__).resolve().parent.parent` to locate the project ROOT directory from any script
- Path resolution must be absolute (using `.resolve()`) to work correctly in all execution contexts
- Scripts use ROOT to locate knowledge/, daily/, and other directories
- This pattern avoids hardcoding paths and works across different development machines
- Resolving from script location (not current working directory) handles hook execution contexts where cwd may vary

## Details

The canonical pattern used in memory-compiler scripts:

```python
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
KNOWLEDGE_DIR = ROOT_DIR / "knowledge"
DAILY_DIR = ROOT_DIR / "daily"
```

This works because:

1. `__file__` gives the script's location at runtime
2. `.resolve()` converts to absolute path, handling symlinks and `..` correctly
3. `.parent.parent` goes up two levels: script is in `scripts/`, one level up is `memory-compiler/`, another level up would be project root (adjusted based on actual structure)

### Why Not Use Current Working Directory?

Hooks execute with unpredictable working directory contexts. SessionEnd hook may run from project root, but when it spawns `flush.py`, the subprocess may inherit a different cwd. Using `__file__` ensures the script always knows where it is, making path resolution bulletproof across hook execution and subprocess spawning.

## Related Concepts

- [[concepts/venv-isolation-with-uv]] - How environment scoping affects script execution
- [[concepts/hook-execution-context]] - Working directory context in hook execution

## Sources

- [[daily/2026-04-09]] - "Resolved path resolution issues: Python scripts use `Path(__file__).resolve().parent.parent` to locate ROOT; hook execution context matters"
