---
title: "Project Instructions Injection Pipeline in t3code"
aliases: [project-instructions, ai-context-injection, system-prompt-pipeline]
tags: [architecture, ai, integration, editor]
sources:
  - "daily/2026-04-18.md"
created: 2026-04-18
updated: 2026-04-18
---

# Project Instructions Injection Pipeline in t3code

The t3code editor feeds project-specific context into the AI chat system via a multi-stage pipeline: settings (storage) → IPC from main process (transport) → AI chat component (consumption) → system prompt (injection). The memory compiler was integrated into this existing pipeline to automatically compile and inject project knowledge into every AI conversation, replacing the manual plain-text `projectInstructions` field with compiled, structured output.

## Key Points

- **Existing pipeline** — `projectInstructions` were already stored in settings, loaded via IPC, and injected into system prompts before the memory compiler integration
- **Settings as storage** — Project instructions are persisted in the editor's settings system, surviving across sessions
- **IPC transport** — Main process (Electron/Tauri) loads instructions and sends them to the renderer via IPC handlers
- **System prompt injection** — The AI chat component includes project instructions in the system prompt sent to Claude
- **Auto-compilation on project open** — Memory compiler runs automatically when a project is opened, updating the instructions

## Details

### Pipeline Architecture

The data flows through four stages:

```
[Settings Store] → [Main Process IPC] → [AI Chat Component] → [System Prompt to Claude]
     │                    │                      │                      │
     │                    │                      │                      └─ Claude receives
     │                    │                      │                         compiled context
     │                    │                      └─ Reads instructions
     │                    │                         from IPC response
     │                    └─ Handles IPC request,
     │                       returns instructions
     └─ Stores compiled
        memory output
```

### Integration Points

The memory compiler hooks into this pipeline at the storage layer:

1. **Project opens** → Memory compiler runs, scanning project files
2. **Compiler output** → Structured markdown with prioritized sections
3. **Output stored** → Written to settings as `projectInstructions`
4. **AI chat starts** → Instructions loaded via IPC and included in system prompt
5. **Claude receives** → Project context available from first message

### Pre-Existing System

Before memory compiler integration, the `projectInstructions` field was:

- A plain text field in settings
- Manually edited by users
- No auto-loading from project files
- No structured format or prioritization

The existing `CLAUDE.md` file reading was separate from `projectInstructions` — Claude Code reads `CLAUDE.md` directly, but the editor's AI chat system had its own instruction injection mechanism.

### What Changed with Integration

After integration:

- `projectInstructions` is automatically populated by the memory compiler
- Content is structured with priority sections (project identity, standards, architecture)
- File tree and tech stack are auto-generated
- Instructions update when the project changes (on open, potentially on file change)
- Users can still override or supplement via settings UI

### IPC Handler Pattern

The IPC handler follows the standard t3code pattern:

```typescript
// Main process handler
ipcMain.handle("get-project-instructions", async (event, projectId) => {
  const settings = await loadSettings(projectId);
  return settings.projectInstructions || "";
});

// Renderer consumption
const instructions = await window.api.getProjectInstructions(projectId);
```

This keeps the main process as the authority for settings data, with the renderer requesting it on demand.

## Related Concepts

- [[concepts/ai-context-content-prioritization]] — What content to include in the compiled output and in what order
- [[concepts/memory-compiler-three-stage-pipeline]] — The compilation pipeline that produces the content
- [[concepts/standalone-to-workspace-package-refactoring]] — The refactoring that made programmatic compilation possible
- [[concepts/settings-ui-management-pattern]] — Settings UI where users can view/override compiled instructions
- [[concepts/rpc-layer-expansion-pattern]] — IPC handlers follow a similar contracts-first expansion pattern

## Sources

- [[daily/2026-04-18.md]] — "The existing `projectInstructions` flow goes: settings → IPC from main process → AI chat → system prompt"
- [[daily/2026-04-18.md]] — "Integrated compiled memory into the editor's AI chat system prompt via the existing `projectInstructions` pipeline"
- [[daily/2026-04-18.md]] — "Auto-compiles on project open"
- [[daily/2026-04-18.md]] — "Currently just a plain text field; no auto-loading from files"
- [[daily/2026-04-18.md]] — "Replace/enhance the `projectInstructions` in AI chat"
