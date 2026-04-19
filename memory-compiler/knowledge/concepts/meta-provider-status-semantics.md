---
title: "Meta-Provider Status Semantics"
aliases: [manifest-provider, auto-provider, provider-status-types]
tags: [provider-system, ui-pattern, architecture, status-handling]
sources:
  - "daily/2026-04-13.md"
created: 2026-04-13
updated: 2026-04-13
---

# Meta-Provider Status Semantics

In a multi-provider system (OpenAI, Claude, Ollama, etc.), a "manifest" or "auto" provider is a meta-provider that automatically selects the best available real provider. Unlike real providers, a meta-provider's "warning" or "not installed" status is expected and normal — it simply means no local providers are currently detected, not that something is broken. UI components must distinguish between real provider status (where "warning" means genuinely degraded) and meta-provider status (where "warning" is the default state and should not block selection).

## Key Points

- **Meta-providers are not real providers** - "Auto" / "manifest" is a routing layer, not a concrete LLM integration
- **Status semantics differ** - For real providers, `status: "warning"` means degraded; for meta-providers, it means "no local routing target detected" (expected)
- **UI must not block meta-provider selection** - Generic `status !== "ready"` guards should not prevent selecting "Auto"
- **Status values** - Providers report `"ready"`, `"warning"`, or `"error"` with optional `installed: boolean`
- **The "not installed" label is misleading for meta-providers** - Auto-detection doesn't need to be "installed"; it's always available as a routing strategy

## Details

### Provider Status Model

Every provider in the system reports a status object:

```typescript
interface ProviderStatus {
  status: "ready" | "warning" | "error";
  installed?: boolean;
  message?: string;
}
```

For **real providers** (OpenAI, Ollama, Claude):

- `ready` + `installed: true` = fully operational
- `warning` + `installed: false` = not configured or unavailable
- `error` = broken configuration or API failure

For the **manifest/auto provider**:

- `warning` + `installed: false` = no local providers detected for auto-routing (this is the normal state when only cloud providers are available)
- `ready` + `installed: true` = at least one local provider is available for auto-routing

### Why the Bug Occurred

The provider picker used a single status check for all providers:

```typescript
if (provider.status !== "ready") {
  // Render as "NOT INSTALLED" — disabled, grey, unclickable
  return <DisabledProviderItem />;
}
```

This check is correct for Ollama (if not running, show "NOT INSTALLED"). But for the manifest provider, `status: "warning"` is the **default state** — blocking selection means "Auto" is never clickable unless the user happens to have local providers running.

### The Conceptual Fix

Meta-providers need their own status interpretation:

```typescript
// Meta-provider: always selectable
if (provider.type === "manifest") {
  return <ClickableItem label="Auto" />;
}

// Real provider: respect status
if (provider.status !== "ready") {
  return <DisabledItem label="NOT INSTALLED" />;
}
```

The key insight is that "Auto" is a **selection strategy**, not a provider to be installed. It should always be available as an option, even when its status indicates no local targets are detected.

### Implications for Provider Architecture

This pattern generalizes: any system with both concrete implementations and meta/routing layers must handle status differently for each category. Other examples:

- **Load balancer** - A load balancer being "degraded" (one backend down) doesn't mean you can't select it
- **DNS resolver** - A resolver having "no cached entries" doesn't mean DNS is broken
- **Package registry** - A registry mirror being "out of date" doesn't mean it's unusable

The meta-layer's status reflects the health of what it routes to, not its own availability.

## Related Concepts

- [[concepts/rendering-pipeline-specificity-ordering]] - The rendering order fix that implements this distinction
- [[concepts/provider-adapter-shape-pattern]] - The adapter system where meta-providers live
- [[concepts/model-selection-ui-pattern]] - The UI where this status distinction matters

## Sources

- [[daily/2026-04-13.md]] - "When manifest auto-detection finds no available routing target, its status is 'warning' with `installed: false`, causing it to render as disabled 'NOT INSTALLED'"
- [[daily/2026-04-13.md]] - "The manifest/auto provider is special — it's a meta-provider for auto-detection, so its 'not installed' status shouldn't block selection like it would for a real provider"
- [[daily/2026-04-13.md]] - "Status values for providers: 'ready', 'warning', 'error' — manifest frequently has 'warning' when no local providers are detected, which is expected and shouldn't prevent selection"
