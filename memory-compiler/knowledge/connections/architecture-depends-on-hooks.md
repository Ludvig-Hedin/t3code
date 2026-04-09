---
title: "Connection: Architecture Depends on Hook Execution Context"
connects:
  - "concepts/memory-compiler-three-stage-pipeline"
  - "concepts/hook-execution-context"
  - "concepts/subprocess-detachment-macos"
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Connection: Architecture Depends on Hook Execution Context

## The Connection

The memory compiler's 3-stage pipeline (SessionStart → SessionEnd/PreCompact → compile.py) is fundamentally dependent on specific hook execution contexts and subprocess detachment behavior. The entire architecture works because hooks fire at predictable times with specific working directory contexts, and because subprocess detachment is configured correctly to survive parent process exit.

## Key Insight

Without understanding how hooks execute and detach processes, the architecture seems magical: "how does compilation happen in the background?" The answer is not magic—it's careful process management. The pipeline design *requires* correct subprocess detachment on each platform, and *requires* absolute path resolution because hook execution contexts vary.

In other words: the architecture is the **sum of hook behavior + path resolution + process detachment**. Change any of these, and the pipeline breaks.

## Evidence

From the daily log:

1. **Architecture design assumes hook firing sequence**: SessionStart at start, SessionEnd/PreCompact at end
2. **Process detachment is mandatory**: "SessionEnd hook spawns flush.py from project root; flush.py then spawns compile.py with start_new_session=True"
3. **Path resolution must be absolute**: "Resolved path resolution issues: Python scripts use `Path(__file__).resolve().parent.parent` to locate ROOT; hook execution context matters"
4. **Subprocess behavior is platform-specific**: "macOS subprocess detachment: `start_new_session=True` in Popen detaches... design choice in upstream"

The conversation repeatedly loops back to: "we need detachment for this to work," "we need absolute paths for this to work," "hook context varies, so we need X."

## Design Implications

- Cannot simplify the architecture without changing hooks (e.g., if hooks could be synchronous and waited for compilation, wouldn't need detachment)
- Any change to hook timing breaks assumptions (e.g., SessionStart hook runs before context is set up)
- Port to new platform = verify subprocess detachment behavior for that platform
- Troubleshooting compilation failures should begin with: "did the hook fire?" → "did the process detach?" → "did the script find the correct path?"

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] - The architecture being described
- [[concepts/hook-execution-context]] - The execution context that enables/constrains the architecture
- [[concepts/subprocess-detachment-macos]] - The platform-specific behavior that makes async compilation possible
