---
title: "Ollama Integration Patterns: Model Fallbacks and Process Management"
aliases: [ollama-client, model-fallbacks, external-service-integration]
tags: [ollama, llm, process-management, service-integration]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Ollama Integration Patterns: Model Fallbacks and Process Management

Ollama is a local LLM runtime that can be integrated into applications to provide AI features without external API calls. Integration requires handling process lifecycle management, model availability, and client cleanup. Key patterns include: probing multiple candidate URLs for Ollama running at default and custom ports, falling back to a default model if the requested model isn't available, using 60-second model cache to avoid repeated `/api/tags` calls, and proper AbortController cleanup for request cancellation.

## Key Points

- **Process serialization:** Use piggyback wait pattern to prevent concurrent spawns of `ollama serve`
- **Multiple candidate URLs:** Probe common ports (11434 default, plus any configured alternatives) for Ollama availability
- **Model fallback:** If requested model isn't available, fall back to `llama3.2` (or configurable default)
- **Model cache:** Cache `/api/tags` response for 60 seconds to avoid repeated tag queries
- **CORS configuration:** Ollama allows all CORS origins by default; custom configs may require explicit whitelist
- **Request cleanup:** Use AbortController for request cancellation on unmount or escape key, preventing memory leaks
- **TypeScript strictness:** `exactOptionalPropertyTypes` may require explicit null handling on optional fields like `RequestInit.signal`

## Details

### Process Management

Ollama runs as a separate OS process. Starting it requires:

1. Detecting if already running (fast-path: ping candidate URLs)
2. If not running, spawn `ollama serve` (use [[concepts/process-serialization-piggyback-pattern]] to prevent race conditions)
3. Wait for the process to become responsive (e.g., 15-second timeout)
4. Return the working URL for subsequent calls

### Model Availability and Fallback

Not all Ollama installations have the same models. Request the preferred model, but have a fallback:

```typescript
async function ensureModelAvailable(preferred: string): Promise<string> {
  const tags = await fetchModels(); // Calls /api/tags
  if (tags.includes(preferred)) {
    return preferred;
  }
  if (tags.includes("llama3.2")) {
    return "llama3.2"; // Fallback
  }
  // Fall back to first available model
  return tags[0];
}
```

### Model Cache

The `/api/tags` endpoint lists available models. Calling it repeatedly is wasteful; cache for 60 seconds:

```typescript
let modelCache: { tags: string[]; timestamp: number } | null = null;

async function getAvailableModels(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.timestamp < 60000) {
    return modelCache.tags;
  }
  const response = await fetch(`${ollamaUrl}/api/tags`);
  const { models } = await response.json();
  const tags = models.map((m) => m.name);
  modelCache = { tags, timestamp: Date.now() };
  return tags;
}
```

### Request Cleanup

Streaming requests (especially from AI models) may take seconds or minutes. If the user closes the UI or navigates away, abort the request:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

try {
  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    body: JSON.stringify({ model, prompt }),
    signal: controller.signal,
  });
  // Process response
} finally {
  clearTimeout(timeoutId);
}
```

On component unmount, call `controller.abort()` to cancel any in-flight request.

### TypeScript Strictness Issue

With `exactOptionalPropertyTypes` enabled, TypeScript requires explicit null handling:

```typescript
// WRONG: TypeScript error
const init: RequestInit = {
  signal: abortSignal, // Might be undefined
};

// RIGHT: explicitly null
const init: RequestInit = {
  signal: abortSignal ?? null, // Explicit null for undefined signal
};
```

This is a strictness choice in TypeScript; it catches accidental undefined values.

## Related Concepts

- [[concepts/process-serialization-piggyback-pattern]] - Pattern used for serializing Ollama process spawning
- [[concepts/terminal-ai-command-bar]] - UI feature that depends on Ollama integration

## Sources

- [[daily/2026-04-12.md]] - "Ollama client uses 60s model cache + fallback to `llama3.2` if `/api/tags` fails"
- [[daily/2026-04-12.md]] - "Fixed TypeScript `exactOptionalPropertyTypes` strictness issue in `ollamaClient.ts` where `signal: signal ?? null` was required on `RequestInit.signal`"
- [[daily/2026-04-12.md]] - "Ollama defaults to allowing all CORS origins, but custom configs might need explicit whitelist"
- [[daily/2026-04-12.md]] - "AbortController used for request cleanup on unmount/escape"
- [[daily/2026-04-12.md]] - "Fixed a critical race condition in OllamaAdapter.ts where concurrent calls to `ensureOllamaRunning` could spawn multiple `ollama serve` processes simultaneously"
