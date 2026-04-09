---
title: "HTTP Endpoint Authentication Patterns"
aliases: [bearer-token-auth, api-key-auth, endpoint-auth, env-var-secrets]
tags: [security, authentication, http, configuration]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# HTTP Endpoint Authentication Patterns

HTTP endpoints fall into two categories: public (discovery, capability announcement) and authenticated (operations, state changes). Authentication can be implemented via Bearer tokens in the Authorization header or API keys from environment variables. Each endpoint should declare its auth requirements explicitly; public endpoints bypass auth, authenticated endpoints validate credentials via middleware.

## Key Points

- **Public endpoints** enable capability discovery and read-only operations without credentials
- **Authenticated endpoints** require Bearer tokens (Authorization header) or environment variable API keys
- Auth middleware validates tokens before routing to handlers
- Public endpoints are defensible (discovery is low-risk); authenticated endpoints protect operations
- Environment variable configuration (`A2A_INBOUND_AUTH_TOKEN`, `A2A_AUTH_TOKEN`) enables multi-environment deployment

## Details

### Public Endpoints

Public endpoints (e.g., agent card discovery) allow external clients to discover what agents are available and their capabilities without authentication. These are safe because they don't enable operations—just advertisement.

```
GET /a2a/agents     → returns {agents: [{name, description, methods}]}
```

No auth required; rate-limiting or IP restrictions optional.

### Authenticated Endpoints

Operations that modify state or access private data require authentication. Two patterns:

**Bearer Token (HTTP Authorization header)**
```
POST /a2a/rpc
Authorization: Bearer <token>
Content-Type: application/json

{"jsonrpc": "2.0", "method": "task.create", ...}
```

The middleware checks the Bearer token against `A2A_INBOUND_AUTH_TOKEN` (inbound requests from external agents).

**Environment Variable API Keys**
```
// Outbound requests from local agent to remote agent
fetch(`https://remote-agent/a2a/rpc`, {
  headers: {
    Authorization: `Bearer ${process.env.A2A_AUTH_TOKEN}`
  }
})
```

When the local agent calls a remote agent, it uses `A2A_AUTH_TOKEN` (the remote agent's inbound token).

### Middleware Pattern

```typescript
app.post('/a2a/rpc', authMiddleware, rpcHandler);

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === process.env.A2A_INBOUND_AUTH_TOKEN) {
    next();
  } else {
    res.status(401).json({error: 'Unauthorized'});
  }
}
```

This keeps auth logic separate from business logic, making it easy to test and modify.

## Related Concepts

- [[concepts/provider-adapter-shape-pattern]] - Adapters may use this auth pattern for inbound/outbound calls
- [[concepts/agent-discovery-endpoints]] - Public endpoints commonly support discovery
- [[concepts/systematic-feature-implementation-phases]] - Auth is phase 8; implemented after RPC handlers

## Sources

- [[daily/2026-04-09]] - "A2A HTTP endpoint includes auth middleware supporting Bearer tokens and API keys via `A2A_INBOUND_AUTH_TOKEN` env var"
- [[daily/2026-04-09]] - "JSON-RPC endpoint requires authentication when configured"
- [[daily/2026-04-09]] - "Agent card endpoint stays public per A2A spec"
