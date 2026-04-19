---
title: "Connection: Memory Compiler Output Feeds Project Instructions Pipeline"
connects:
  - "concepts/memory-compiler-three-stage-pipeline"
  - "concepts/ai-context-content-prioritization"
  - "concepts/project-instructions-injection-pipeline"
  - "concepts/standalone-to-workspace-package-refactoring"
sources:
  - "daily/2026-04-18.md"
created: 2026-04-18
updated: 2026-04-18
---

# Connection: Memory Compiler Output Feeds Project Instructions Pipeline

## The Connection

The memory compiler (which compiles project knowledge from markdown files) and the project instructions pipeline (which injects context into AI chat system prompts) are two halves of a complete system. The compiler produces structured, prioritized content; the pipeline delivers it to Claude at the right moment. Neither is useful alone: a compiler without injection produces files no one reads; a pipeline without compilation injects stale, manual, unprioritized content.

## Key Insight

The refactoring of the memory compiler from a standalone CLI tool into a workspace package was specifically motivated by this connection. A standalone tool can only be run manually (`npx ts-node src/index.ts`); a workspace package with a programmatic API can be called from the editor's main process when a project opens:

```
[Project opens] → [MemoryCompiler.compile()] → [output stored in settings] → [IPC handler serves it] → [AI chat includes in system prompt]
```

This chain only works when:

1. The compiler is importable (not just a CLI — requires the package refactoring)
2. The output is prioritized (not raw dump — requires content prioritization)
3. The pipeline exists (settings → IPC → system prompt — pre-existing in t3code)

The three concepts converge at a single point: the `projectInstructions` field in settings becomes the bridge between compilation and injection.

## Evidence

From the daily log:

1. **Compiler needed to be a library:** "I want to make the setup easier" → led to full package refactoring, which then enabled programmatic integration
2. **Content prioritization emerged from integration:** "will it even work well from a user's perspective?" → analysis of what AI actually needs revealed the priority hierarchy
3. **Pipeline was pre-existing:** "The existing projectInstructions flow goes: settings → IPC from main process → AI chat → system prompt" → the delivery mechanism already existed; the compiler just needed to populate it
4. **End-to-end integration:** "Auto-compiles on project open" → the compiler's output feeds directly into the pipeline's storage layer

## Design Implications

- **Compiler changes affect AI quality** — Changes to content prioritization, section weighting, or template structure directly impact how well the AI understands the project
- **Pipeline changes affect freshness** — If the pipeline caches instructions, compiler updates may not reach the AI until cache invalidates
- **Both must agree on format** — The compiler produces markdown; the pipeline injects it as plain text into the system prompt. If either changes format, the other must adapt
- **Testing requires end-to-end** — Unit testing the compiler or pipeline alone doesn't verify the chain works; integration testing with actual AI chat is needed

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] — The compilation architecture
- [[concepts/ai-context-content-prioritization]] — What content to produce
- [[concepts/project-instructions-injection-pipeline]] — How content reaches the AI
- [[concepts/standalone-to-workspace-package-refactoring]] — What made the integration possible
