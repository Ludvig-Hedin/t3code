---
title: "Terminal AI Command Bar: Generating Shell Commands with LLM"
aliases: [terminal-ai, command-generation, ai-ux]
tags: [terminal, ai-features, ux-design, keyboard-shortcuts]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Terminal AI Command Bar: Generating Shell Commands with LLM

The terminal AI command bar is a floating overlay UI (accessible via Cmd+K) that uses a local LLM (Ollama) to generate shell commands based on user prompts. The feature enables rapid command discovery without leaving the terminal or searching documentation. Implementation uses keyboard shortcuts, floating overlay positioning, request cancellation, and careful state management to provide a seamless UX.

## Key Points

- **Keyboard shortcut:** Cmd+K opens the command bar (follows IDE convention); Ctrl+L clears terminal
- **Floating overlay:** Not fullscreen modal; overlays the terminal, allowing context visibility
- **Local LLM:** Uses Ollama integration to generate commands without external API calls
- **Request cancellation:** AbortController clears in-flight requests on escape or unmount
- **Model selection:** Falls back to available models if preferred model isn't installed
- **Seamless UX:** Generated command appears in terminal input, ready for execution or edit

## Details

### UI Design

The command bar is a floating input field that appears above the terminal content:

```
┌─ Terminal ────────────────┐
│ $ ls -la                  │
│ $ cd projects             │
│ $ npm run build           │
│ ┌─ Command Bar ───────┐   │
│ │ Generate shell cmd: │   │
│ │ "show disk usage"   │   │
│ │ [Run] [Edit] [×]    │   │
│ └─────────────────────┘   │
└───────────────────────────┘
```

Positioning floats above the input line, allowing the user to see surrounding terminal context while typing the prompt.

### Keyboard Interaction

- **Cmd+K** - Open command bar (or focus if already open)
- **Escape** - Close command bar and cancel any in-flight request
- **Ctrl+L** - Clear terminal (unchanged, still works)
- **Enter** - Execute generated command (or prompt if command bar is open)

This mirrors IDE conventions where Cmd+K opens command palettes.

### Implementation Pattern

```typescript
function ThreadTerminalDrawer() {
  const [commandPrompt, setCommandPrompt] = useState("");
  const [showCommandBar, setShowCommandBar] = useState(false);
  const [generatedCommand, setGeneratedCommand] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const handleGenerateCommand = async (prompt: string) => {
    controllerRef.current = new AbortController();
    try {
      const command = await ollama.generate(prompt, {
        signal: controllerRef.current.signal,
      });
      setGeneratedCommand(command);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        // Error handling
      }
    } finally {
      controllerRef.current = null;
    }
  };

  const handleEscape = () => {
    controllerRef.current?.abort();
    setShowCommandBar(false);
  };

  // Cmd+K keyboard handling...
}
```

### Ollama Integration Points

The command bar depends on [[concepts/ollama-integration-patterns]]:

- Process availability (ensures Ollama is running)
- Model fallback (uses available model if preferred isn't installed)
- Model cache (reuses `/api/tags` results within 60 seconds)
- Request cleanup (AbortController cancels generation on escape)

### UX Considerations

**Speed:** Model cache and process serialization ensure minimal latency for repeated use.

**Context:** Floating overlay keeps terminal history visible; user can see context for the command they're generating.

**Editability:** Generated command appears in terminal input field, not executed immediately. User can edit or run as-is.

**Fallback:** If Ollama isn't available, graceful degradation shows an error; terminal continues functioning normally.

## Related Concepts

- [[concepts/ollama-integration-patterns]] - Ollama client and process management
- [[concepts/process-serialization-piggyback-pattern]] - Pattern used to serialize Ollama spawning
- [[concepts/keyboard-shortcut-design]] - Cmd+K convention and conflict resolution

## Sources

- [[daily/2026-04-12.md]] - "Implemented AI command bar feature for terminal that uses Ollama to generate shell commands on Cmd+K"
- [[daily/2026-04-12.md]] - "Cmd+K chosen as shortcut (matches IDE convention); Ctrl+L still clears terminal"
- [[daily/2026-04-12.md]] - "Command bar implemented as floating overlay (not fullscreen modal) for better UX"
- [[daily/2026-04-12.md]] - "AbortController used for request cleanup on unmount/escape"
- [[daily/2026-04-12.md]] - "Requires local Ollama running (`ollama serve`) with a model pulled"
