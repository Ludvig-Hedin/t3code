---
title: "Terminal Command Generation with Local LLMs (Ollama)"
aliases: [terminal-ai, command-bar, ollama-terminal, local-llm-integration]
tags: [terminal, ai, ux, local-models, ollama]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Terminal Command Generation with Local LLMs (Ollama)

In-terminal AI features can leverage local LLMs (via Ollama) to generate context-aware shell commands without sending terminal content to external APIs. A Cmd+K command bar provides an intuitive, IDE-like interface for requesting command suggestions. Key design decisions include: floating overlay UI (not fullscreen), request cleanup via AbortController, and graceful degradation when Ollama is unavailable or a model isn't cached.

## Key Points

- **Cmd+K shortcut convention** - Matches IDE/OS conventions; familiar to users across tools
- **Floating overlay not fullscreen modal** - Better UX for terminal context; user can still see terminal output while typing in the bar
- **Ollama integration with fallback** - Uses 60s model cache to check available models; falls back to `llama3.2` if tags endpoint fails
- **Local-only LLM calls** - Terminal content never leaves the machine; privacy-preserving
- **AbortController cleanup** - Requests cancelled on unmount/escape to prevent memory leaks and orphaned requests
- **CORS configuration consideration** - Ollama defaults to allowing all origins, but custom configs might restrict

## Details

### UI Pattern: Floating Command Bar

Rather than a fullscreen modal modal that takes over the entire terminal, a floating overlay balances:

- **Visibility** - Command bar is prominently visible when active (Cmd+K brings focus)
- **Context** - Terminal output remains visible below/behind the bar
- **Escape hatch** - Pressing Escape closes the bar; user can dismiss instantly without menu navigation
- **Lightweight feel** - Overlay gives the sense of "quick action" rather than context-switching

Implementation typically uses a fixed-position div with z-index layering, close-on-escape handlers, and focus management.

### Ollama Integration

A local Ollama instance provides the LLM without API keys or external dependencies:

```typescript
// Check available models with cache
const { data } = await axios.get("http://localhost:11434/api/tags", {
  timeout: 60000, // 60s cache by Ollama
});
const availableModels = data.models?.map((m) => m.name) || [];

// Fall back to llama3.2 if tags fails
const model = availableModels.includes("llama3.2") ? "llama3.2" : availableModels[0];
```

The `/api/tags` endpoint lists downloaded models. If the request fails (Ollama not running, network issue), the code falls back to a sensible default (`llama3.2`). This graceful degradation lets the feature work with partial failures.

### Request Lifecycle and Cleanup

Long-running LLM generation can be cancelled if the user closes the command bar or unmounts the component:

```typescript
const controller = new AbortController();

try {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, model }),
    signal: controller.signal, // Cancellable
  });
} finally {
  controller.abort(); // Clean up on unmount
}
```

`AbortController` ensures:

- Requests are cancelled if user presses Escape before response completes
- Component unmounting cancels in-flight requests
- No orphaned promises or resource leaks

### Privacy Implications

By using a local LLM:

- Terminal history, code, commands stay on the user's machine
- No API calls to OpenAI, Claude, or other external services
- No logging of terminal content on third-party servers
- Trade-off: slower response (local inference) and requires Ollama installation

## Related Concepts

- [[concepts/ollama-concurrent-safety-patterns]] - Serialization pattern for reliable Ollama initialization
- [[concepts/react-hydration-errors-html-constraints]] - General React/DOM considerations for terminal UI components

## Sources

- [[daily/2026-04-12.md]] - Implemented AI command bar feature for terminal using Cmd+K shortcut
- [[daily/2026-04-12.md]] - Ollama client uses 60s model cache + fallback to `llama3.2` if tags endpoint fails
- [[daily/2026-04-12.md]] - Floating overlay chosen over fullscreen modal for better UX in terminal context
- [[daily/2026-04-12.md]] - AbortController used for request cleanup on unmount/escape
- [[daily/2026-04-12.md]] - All code passes typecheck; 66 keybinding tests pass; requires local Ollama running
