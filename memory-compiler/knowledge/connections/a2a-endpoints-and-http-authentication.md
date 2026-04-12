---
title: "Connection: A2A Endpoints and HTTP Authentication"
connects:
  - "concepts/agent-discovery-endpoints"
  - "concepts/http-endpoint-authentication-patterns"
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Connection: A2A Endpoints and HTTP Authentication

## The Connection

A2A agents implement a strategic separation of concerns across two HTTP endpoints: the **agent card discovery endpoint** (public) and the **JSON-RPC endpoint** (authenticated). This separation is not arbitrary—it reflects a security principle: read-only discovery is safe to expose publicly, while operations require authentication.

## Key Insight

Many API designers assume "authentication for everything" or "public for everything." A2A demonstrates a third option: **layered trust**. External clients can freely discover what agents exist and what they do (discovery endpoint is public), but calling methods requires a Bearer token (JSON-RPC endpoint is authenticated). This enables:

- **Zero-knowledge integration** - New clients discover agents without API docs
- **Secure operations** - Method calls are protected by token validation
- **Compliance** - Discovery is information; operations are guarded

In other words: you can READ the menu, but you must authenticate to ORDER.

## Evidence

From the daily log:

1. **Explicit separation**: "Agent card endpoint stays public per A2A spec (discovery endpoint)" + "JSON-RPC endpoint requires authentication when configured"

2. **Bearer token auth for operations**: "A2A HTTP endpoint includes auth middleware supporting Bearer tokens and API keys via `A2A_INBOUND_AUTH_TOKEN` env var"

3. **Environment variable configuration enables multi-environment deployment**: "Set environment variables: `A2A_INBOUND_AUTH_TOKEN` (inbound), `A2A_AUTH_TOKEN` (outbound)" — different tokens for different environments/deployments

The conversation reflects: discovery is SAFE to expose, operations are GUARDED.

## Design Pattern

This pattern generalizes beyond A2A:

```
Endpoint: GET /api/services        → Public (lists available services)
Endpoint: POST /api/services/{id}  → Authenticated (creates/modifies)
Endpoint: GET /api/services/{id}   → Public (read details)
```

Separating read (discovery) from write (operations) by authentication level is a powerful pattern for building extensible, secure systems.

## Related Concepts

- [[concepts/agent-discovery-endpoints]] - The public discovery side
- [[concepts/http-endpoint-authentication-patterns]] - The authenticated operations side
- [[concepts/provider-adapter-shape-pattern]] - The adapter must handle both endpoints
