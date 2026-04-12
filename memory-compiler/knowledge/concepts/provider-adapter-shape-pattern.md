---
title: "Provider Adapter Shape Pattern"
aliases: [adapter-shape, pluggable-provider, provider-interface]
tags: [architecture, provider-system, plugin-pattern]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Provider Adapter Shape Pattern

Bird Code's provider system uses a `ProviderAdapterShape` interface to define what every provider (OpenAI, Claude, A2A, etc.) must implement. Each provider registers an adapter that conforms to this shape; new features are added by registering them through the provider adapter registry. This pattern decouples the provider system from specific integrations and enables plugging in new providers without modifying core code.

## Key Points

- `ProviderAdapterShape` defines required methods: initialize, validate, call, stream, cleanup
- Each provider implements the shape; registry maps provider names to adapters
- Adding a new provider means creating one adapter that conforms to the shape
- A2A agents are integrated as a provider: `provider="a2a"` routes calls to the A2A adapter
- Registering adapters enables runtime extensibility without recompilation

## Details

### The Shape Contract

A provider adapter must implement:

```typescript
interface ProviderAdapterShape {
  name: string;
  initialize(config: ProviderConfig): Promise<void>;
  validate(input: ProviderInput): ProviderValidationResult;
  call(request: ProviderRequest): Promise<ProviderResponse>;
  stream(request: ProviderRequest): AsyncIterable<ProviderChunk>;
  cleanup(): Promise<void>;
}
```

Each method has a clear contract:

- `initialize` - Setup (load credentials, validate config)
- `validate` - Pre-flight checks before calling
- `call` - Synchronous request/response
- `stream` - Streaming response for long-running operations
- `cleanup` - Teardown (close connections, release resources)

### Implementation Example: A2A Adapter

The A2A adapter implements this shape for remote A2A agents:

```typescript
class A2aAdapter implements ProviderAdapterShape {
  name = "a2a";

  async call(request) {
    // Marshal request to JSON-RPC
    // POST to remote agent /a2a/rpc
    // Parse response, handle errors
    return response;
  }

  async *stream(request) {
    // POST to /a2a/rpc with streaming response
    // Parse SSE chunks and yield
  }
}

registry.register("a2a", new A2aAdapter());
```

When user selects `provider="a2a"`, the system routes through this adapter.

### Registry Pattern

```typescript
class ProviderAdapterRegistry {
  private adapters = new Map<string, ProviderAdapterShape>();

  register(name: string, adapter: ProviderAdapterShape) {
    this.adapters.set(name, adapter);
  }

  get(name: string): ProviderAdapterShape {
    return this.adapters.get(name);
  }
}
```

The registry is typically initialized once at startup and read at every request. This enables dynamic provider addition without recompiling.

## Related Concepts

- [[concepts/effect-services-layers-pattern]] - Provider adapters are one layer of the effect pattern
- [[concepts/http-endpoint-authentication-patterns]] - Adapters may handle auth for remote providers
- [[concepts/agent-discovery-endpoints]] - Adapters may support discovery (e.g., A2A's public agent card endpoint)

## Sources

- [[daily/2026-04-09]] - "A2a adapter implemented as full `ProviderAdapterShape` following same pattern as existing providers"
- [[daily/2026-04-09]] - "Set environment variables: `A2A_INBOUND_AUTH_TOKEN` (inbound), `A2A_AUTH_TOKEN` (outbound)"
