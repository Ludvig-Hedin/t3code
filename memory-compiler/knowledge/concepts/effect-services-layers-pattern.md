---
title: "Effect Services + Layers Architectural Pattern"
aliases: [effect-pattern, services-layers, layer-architecture]
tags: [architecture, design-pattern, backend-structure]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Effect Services + Layers Architectural Pattern

Effect Services + Layers is Bird Code's architectural pattern for structuring backend services. Each feature (e.g., A2A protocol, auth, persistence) is organized as a service with distinct layers: contracts (types), business logic, persistence layer, and RPC handlers. This pattern provides consistent structure, enables testing at layer boundaries, and makes it easy to extend or replace implementations.

## Key Points

- Each service has: contract layer (types), business logic, persistence/data layer, and RPC handlers
- Layers are loosely coupled via contracts; implementations are swappable
- Pattern enables clean separation of concerns (business logic ≠ data access ≠ RPC marshalling)
- Used across Bird Code's persistence, preview, project setup, providers, and A2A services
- Facilitates multi-phase implementation: contracts first, then business logic, persistence, RPC

## Details

The pattern consists of:

**Contract Layer** - Pure types and interfaces defining what the service does. No implementation. Examples: `A2aAgentCard`, `A2aTaskResponse`, `ProviderAdapterShape`. This layer is the "source of truth" for the service's API.

**Business Logic Layer** - The service's core functionality. Works with contracts but doesn't know about persistence or RPC details. Example: validating agent cards, routing requests, managing lifecycle. Testable in isolation with mocked data.

**Persistence/Data Layer** - How data is stored. Different implementations can be swapped without changing business logic. Example: `Sqlite` layer for A2A tasks and cards uses the same interface as other persistence implementations. Enables testing against real or in-memory databases.

**RPC Handlers** - Converting incoming requests (HTTP, WebSocket) to service calls and responses. Unmarshals JSON into contracts, calls business logic, marshals results back. One handler per RPC method.

### Why This Pattern

Monolithic services without layers become difficult to test and modify:
- Can't test business logic without a database
- Can't test RPC handling without the full service
- Changing storage strategy requires rewriting business logic

Layers decouple these concerns:
- Test business logic with mock persistence
- Test RPC with mock business logic
- Swap database implementations without touching business logic

## Related Concepts

- [[concepts/systematic-feature-implementation-phases]] - Pattern fits naturally into 8-phase implementation
- [[concepts/provider-adapter-shape-pattern]] - Adapters are one layer of this pattern
- [[concepts/typecheck-validation-gates]] - Compile-time checks verify contracts match implementations

## Sources

- [[daily/2026-04-09]] - "All 8 phases implemented following Bird Code's existing Effect Services + Layers pattern"
- [[daily/2026-04-09]] - "A2A implementation required 8 distinct layers working together systematically"
