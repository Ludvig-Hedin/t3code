---
title: "External Service Initialization with Fallback Strategy"
aliases: [service-initialization, fallback-model, model-caching]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# External Service Initialization with Fallback Strategy

Integrating external services (like Ollama for local AI) requires robust initialization that handles multiple failure modes: service not running, service running but misconfigured, configured model not available, network issues. A layered fallback strategy probes multiple candidate URLs (localhost:11434, localhost:8080, etc.), caches the working model or falls back to a default model (llama3.2), and wraps discovery in error handling that treats discovery failures as "service not available" rather than fatal errors.

## Key Points

- **Multiple candidate URLs** - Services may run on different ports depending on configuration; try a list of candidates
- **Model caching vs fallback** - Remember which model is available locally; fall back to a common default if not found
- **Non-fatal discovery failures** - If model discovery fails, treat it as temporary and continue with cached/default model
- **Initialization timeout** - External service startup takes time; must wait with backoff before assuming failure
- **Environment-aware configuration** - Different environments (dev, staging, prod) may have different service locations

## Details

### The Initialization Pattern

```typescript
async function initializeOllama(): Promise<{
  modelName: string;
  baseUrl: string;
}> {
  const candidates = [
    "http://localhost:11434", // Default Ollama port
    "http://localhost:8080", // Alternative port
    process.env.OLLAMA_BASE_URL, // Environment override
  ].filter(Boolean);

  // Phase 1: Find working URL
  const workingUrl = await probeUrls(candidates);
  if (!workingUrl) {
    // Service not available; continue with defaults
    return { modelName: "llama3.2", baseUrl: null };
  }

  // Phase 2: Discover available models
  let modelName = "llama3.2"; // Default
  try {
    const { models } = await fetch(`${workingUrl}/api/tags`).then((r) => r.json());
    if (models && models.length > 0) {
      // Cache the first available model
      modelName = models[0].name;
    }
  } catch (e) {
    // Discovery failed; fall back to default
    console.warn("Failed to discover models, using default:", e);
  }

  return { modelName, baseUrl: workingUrl };
}
```

### Multi-Phase Initialization

**Phase 1: Availability** - Does the service respond at all?

```typescript
async function probeUrls(candidates: string[]): Promise<string | null> {
  for (const url of candidates) {
    try {
      const response = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return url;
    } catch (e) {
      // Try next candidate
    }
  }
  return null;
}
```

**Phase 2: Model Availability** - What models are installed?

```typescript
async function discoverModels(baseUrl: string): Promise<string[]> {
  try {
    const { models } = await fetch(`${baseUrl}/api/tags`).then((r) => r.json());
    return models.map((m) => m.name);
  } catch {
    return ["llama3.2"]; // Fallback default
  }
}
```

### Why Non-Fatal Failures Matter

If model discovery is fatal (throws), then Ollama integration becomes:

- Cannot start if service is temporarily unavailable
- Cannot start if CORS is misconfigured
- Cannot start if firewall blocks discovery endpoint

With non-fatal failures:

- Service starts with default model (`llama3.2`)
- Later, when model is actually needed, discovery can retry
- User doesn't experience startup failure due to external service

### Environment Configuration Example

```typescript
// In .env
OLLAMA_BASE_URL=http://remote-ollama:11434

// In initialization
const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
```

This allows different deployment environments (dev on localhost, prod on remote service) without code changes.

## Related Concepts

- [[concepts/process-serialization-piggyback]] - Ollama process spawning uses piggyback pattern
- [[concepts/git-branch-resolution-fallback]] - Same fallback strategy pattern applied to git branches

## Sources

- [[daily/2026-04-12.md]] - "Ollama client uses 60s model cache + fallback to `llama3.2` if `/api/tags` fails."
- [[daily/2026-04-12.md]] - "Implemented AI command bar feature for terminal using Ollama. Fixed TypeScript `exactOptionalPropertyTypes` strictness issue in `ollamaClient.ts`."
- [[daily/2026-04-12.md]] - "All code typecheck + lint passes; 66 keybinding tests pass. Manual test required: start dev server, press Cmd+K in terminal, verify floating bar appears + Ollama integration works."
