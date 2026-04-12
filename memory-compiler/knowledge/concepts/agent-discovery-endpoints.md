---
title: "Agent Discovery Endpoints for Capability Advertisement"
aliases: [discovery-endpoint, agent-cards, capability-discovery]
tags: [architecture, api-design, agent-system]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Agent Discovery Endpoints for Capability Advertisement

A2A agents expose a public (unauthenticated) discovery endpoint that advertises what methods and capabilities they provide. This allows external clients to discover available agents, list their methods, and understand the parameters without needing API documentation. The discovery endpoint returns "agent cards"—structured descriptions of each agent's capabilities—enabling dynamic client adaptation.

## Key Points

- **Public discovery endpoint** - No authentication required; external clients can discover agents
- **Agent cards** - Structured metadata (name, description, methods, parameters) describing each agent
- **Dynamic adaptation** - Clients can discover capabilities at runtime and adapt accordingly
- **Parameter schema** - Each method includes parameter definitions for validation and UI generation
- **Read-only operation** - Discovery poses no security risk (information is public)

## Details

### Discovery Endpoint

```
GET /a2a/agents
Response: {
  agents: [
    {
      id: "agent-1",
      name: "Document Analyzer",
      description: "Analyzes documents and extracts insights",
      methods: [
        {
          name: "analyze",
          description: "Analyze document content",
          params: {
            document: {type: "string", description: "Document content"},
            analysis_type: {type: "enum", values: ["summary", "entities", "sentiment"]}
          }
        }
      ]
    }
  ]
}
```

### Agent Card Structure

Each agent card includes:

- `id` - Unique identifier for the agent
- `name` - Human-readable agent name
- `description` - What the agent does
- `methods` - Array of available RPC methods
  - `name` - Method name
  - `description` - What the method does
  - `params` - Parameter definitions (type, description, constraints)

### Client-Side Use Case

A client discovering agents can:

1. Fetch agent cards from the discovery endpoint
2. Display a list of available agents and their methods
3. Generate dynamic UI based on parameter schemas
4. Call methods with validated inputs

This enables:

- UI auto-generation (forms generated from parameter schemas)
- Agent switching without code changes (discover agents at startup)
- Error prevention (validate inputs against schemas before calling)

### A2A Discovery Specifics

The A2A spec mandates:

- Discovery endpoint is public (no authentication)
- Agent cards include method parameter schemas
- Clients MUST not assume a fixed set of agents (discover dynamically)

## Related Concepts

- [[concepts/http-endpoint-authentication-patterns]] - Discovery is public; operations are authenticated
- [[concepts/provider-adapter-shape-pattern]] - The adapter must support discovery
- [[concepts/effect-services-layers-pattern]] - Discovery is typically a read-only layer

## Sources

- [[daily/2026-04-09]] - "Agent card endpoint stays public per A2A spec (discovery endpoint)"
- [[daily/2026-04-09]] - "Web UI includes Settings panel for managing A2A agents with discover/register/remove capabilities"
