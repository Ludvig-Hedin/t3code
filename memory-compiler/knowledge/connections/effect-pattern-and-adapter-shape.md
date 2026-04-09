---
title: "Connection: Effect Services + Layers Pattern Enables Provider Adapter Shape"
connects:
  - "concepts/effect-services-layers-pattern"
  - "concepts/provider-adapter-shape-pattern"
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Connection: Effect Services + Layers Pattern Enables Provider Adapter Shape

## The Connection

The `ProviderAdapterShape` interface (which every provider must implement) is itself a natural outcome of the Effect Services + Layers pattern. When you structure services as distinct layers (contract, business logic, data, RPC), the minimal contract needed to plug a service into a system is exactly what `ProviderAdapterShape` specifies. In other words, the adapter shape is the **contract layer of a service**, extracted as a reusable interface.

## Key Insight

Without the Effect pattern, building pluggable providers is ad-hoc. With the Effect pattern:

- **Contract layer** = The types the provider implements
- **Business logic layer** = The provider's core logic
- **Data layer** = The provider's storage
- **RPC layer** = How the provider is called

When you extract just the **contract layer** as `ProviderAdapterShape`, you have a minimal, complete interface for plugging providers in. New providers can be added by implementing this single interface.

In other words: **the adapter shape is the contract layer of the effect pattern made explicit and reusable**.

## Evidence

From the daily log:

1. **Adapters implement the same pattern as other services**: "A2a adapter implemented as full `ProviderAdapterShape` following same pattern as existing providers"

2. **The shape defines a complete contract**: The adapter must implement `initialize`, `validate`, `call`, `stream`, `cleanup` — these are the contract-level operations every provider must support.

3. **Multiple providers conform to the same shape**: OpenAI, Claude, A2A all implement `ProviderAdapterShape`, meaning they follow the same effect services + layers pattern internally.

## Design Implications

- **New providers** are added by implementing `ProviderAdapterShape` (the contract layer)
- **Shared adapters** can exist (e.g., both A2A and OpenAI might use the same HTTP layer internally)
- **Testing** is consistent across providers (each implements the same interface, so testing is the same)
- **Evolution** is managed at the interface level (if all providers must support a new operation, add it to the shape)

## Related Concepts

- [[concepts/effect-services-layers-pattern]] - The broader pattern
- [[concepts/provider-adapter-shape-pattern]] - The adapter as contract layer
- [[concepts/systematic-feature-implementation-phases]] - Implementing a new provider as an adapter follows the 8-phase pattern

