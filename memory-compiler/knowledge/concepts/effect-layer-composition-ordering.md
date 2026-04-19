---
title: "Effect Layer Composition Ordering in provideMerge"
aliases: [layer-provideMerge, effect-layer-ordering, dependency-resolution-order]
tags: [effect, architecture, debugging, dependency-injection]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-13
updated: 2026-04-13
---

# Effect Layer Composition Ordering in provideMerge

Effect's `Layer.provideMerge` composes service layers, but argument order matters for dependency resolution. Swapping the argument order can break the dependency graph, causing services to fail to resolve at runtime even though TypeScript compiles cleanly. This is a subtle bug because the type signatures may be compatible in either order, but the runtime resolution order changes.

## Key Points

- **Argument order in `Layer.provideMerge` affects dependency resolution** — the first argument is the layer being provided to, the second provides dependencies
- **Type-safe but runtime-broken** — swapped arguments may still typecheck but fail at runtime when a required service isn't available
- **Manifests as missing service errors** — SqlClient or similar dependencies fail to resolve, causing cryptic runtime crashes
- **Fix is simple but diagnosis is hard** — reverting to the correct argument order fixes it instantly; finding the swap requires careful diffing
- **Check `git diff` early** — when debugging dependency resolution failures in Effect, compare against last known working commit before deep investigation

## Details

### The Bug Pattern

Effect's `Layer.provideMerge(targetLayer, providerLayer)` means: "provide `providerLayer`'s services to `targetLayer`." If the arguments are accidentally swapped:

```typescript
// ✅ CORRECT: SqlClient layer provides to the persistence layer
Layer.provideMerge(persistenceLayer, sqlClientLayer);

// ❌ WRONG: Reversed — persistence tries to provide to SqlClient
Layer.provideMerge(sqlClientLayer, persistenceLayer);
```

In the wrong order, the persistence layer doesn't receive its SqlClient dependency, causing a runtime resolution failure. TypeScript may not catch this because both layers export compatible service types.

### Why TypeScript Doesn't Catch It

`Layer.provideMerge` is generic over its input and output service types. When two layers have overlapping type signatures (both export services, both require services), swapping them produces a valid type but incorrect runtime behavior. The type system verifies that the composition is structurally valid, not that the dependency direction is semantically correct.

### Debugging Strategy

When Effect services fail to resolve at runtime:

1. **Check `git diff` against last working commit** — look for Layer composition changes
2. **Verify argument order** in all `Layer.provideMerge`, `Layer.provide`, and `Layer.merge` calls
3. **Trace the dependency graph** — which layer needs which service? Ensure the provider comes second
4. **Revert and test** — if a recent commit touched Layer composition, revert it and verify the fix

### Real-World Instance

The Sqlite.ts persistence layer in Bird Code had its `Layer.provideMerge` arguments swapped during uncommitted experimental changes. The SqlClient dependency couldn't resolve, causing the entire persistence layer to fail at startup. The fix was a single-line revert to the correct argument order.

## Related Concepts

- [[concepts/effect-services-layers-pattern]] — The architectural pattern where Layer composition is used
- [[concepts/typecheck-validation-gates]] — TypeCheck catches many bugs but not semantic ordering issues

## Sources

- [[daily/2026-04-12.md]] — "Isolated `Sqlite.ts` layer configuration bug: `Layer.provideMerge` argument order swap broke SqlClient dependency resolution"
- [[daily/2026-04-12.md]] — "Reverted `apps/server/src/persistence/Layers/Sqlite.ts` to committed version (only actual code fix needed)"
- [[daily/2026-04-12.md]] — "Check `git diff` early on critical files rather than debugging runtime environment"
