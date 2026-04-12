---
title: "Connection: Provider Configuration Extends Adapter Shape"
connects:
  - "concepts/provider-adapter-shape-pattern"
  - "concepts/provider-scoped-config-fallback"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Provider Configuration Extends Adapter Shape

## The Connection

The `ProviderAdapterShape` interface defines what every provider must **do** (initialize, validate, call, stream, cleanup). Provider-scoped configuration patterns define what providers should **prefer** (which model, which endpoint, which auth method). These are complementary: the adapter shape is the contract for behavior, while configuration provides the input parameters for that behavior. Together, they enable fully pluggable, configurable providers.

## Key Insight

A provider that implements the adapter shape is executable but not yet _usable_—it needs configuration. The global/provider-scoped default model pattern answers the question "which model should this provider use?" Config fallback chains ensure there's always a valid answer, even if the user doesn't explicitly configure anything.

In other words: **adapters are the engine; configuration is the fuel selection**.

## Evidence

From the daily log:

1. **Adapter shape is the minimal contract**: "Providers implement ProviderAdapterShape interface (initialize, validate, call, stream, cleanup) for pluggability"

2. **Configuration is orthogonal to the shape**: "Added global + per-provider default model settings UI with proper fallbacks and filtering"

3. **Config affects which provider gets called**: When user selects a model, that selection cascades through the adapter (via `call()` or `stream()` methods), which use the configured model to initialize the provider.

4. **Multiple configuration levels are needed**: Global default (all providers), provider-scoped override (this provider only), server fallback (hardcoded minimum)

## Pattern Recognition

When implementing a new provider, developers must:

1. Implement `ProviderAdapterShape` (phase 5 of systematic implementation)
2. Define what configuration parameters that provider accepts (phase 8 of systematic implementation)
3. Wire configuration into the adapter's `initialize()` and `call()` methods
4. Test both the adapter behavior AND the configuration resolution

Skipping configuration (step 2) leaves the provider working but inflexible—users can't customize behavior.

## Related Concepts

- [[concepts/provider-adapter-shape-pattern]] - The adapter interface
- [[concepts/provider-scoped-config-fallback]] - The configuration pattern
- [[concepts/systematic-feature-implementation-phases]] - Configuration lives in phase 8 (auth/user-facing options)
