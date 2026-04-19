---
title: "Rendering Pipeline Specificity Ordering"
aliases: [conditional-check-order, specialized-before-generic, rendering-path-ordering]
tags: [react, rendering, ui-pattern, debugging]
sources:
  - "daily/2026-04-13.md"
created: 2026-04-13
updated: 2026-04-13
---

# Rendering Pipeline Specificity Ordering

When a React component renders different items through a sequence of conditional checks (status gates, type checks, feature flags), specialized cases must be checked before generic fallbacks. If a generic guard (e.g., `status !== "ready"` → render as disabled) appears before a specialized check (e.g., `type === "manifest"` → render as always-clickable), the generic guard intercepts the item and the specialized rendering never executes. This is the rendering equivalent of CSS specificity or route ordering: specific before general.

## Key Points

- **Specialized checks must precede generic guards** - A type-specific rendering block (e.g., manifest provider) must be evaluated before a generic status gate (e.g., `status !== "ready"`)
- **Silent failures** - The generic guard doesn't error; it renders the item in a wrong state (disabled instead of clickable), making the bug subtle
- **Dual-path inconsistency** - Components with multiple rendering paths (e.g., "locked" vs "unlocked" provider picker) may handle specificity correctly in one path but not the other
- **Meta-types need special treatment** - Auto/manifest providers are not real providers; their "warning" or "not installed" status is expected and should not trigger the same UI as a genuinely missing provider
- **Fix is reordering, not adding logic** - The fix is moving the specialized check before the generic one, not adding new conditions

## Details

### The Bug Pattern

The provider picker component had two rendering paths:

**Locked path (existing thread):** Manifest/auto always renders as clickable because the specialized check comes first (lines 307-328). This path worked correctly.

**Unlocked path (new thread):** All providers pass through a generic `status !== "ready"` check (line 337) first. When manifest auto-detection has no available routing target, its status is `"warning"` with `installed: false`. The generic check intercepts it and renders "NOT INSTALLED" (disabled), preventing the user from ever reaching the manifest-specific rendering block (line 447).

```typescript
// ❌ WRONG ORDER: Generic guard before specialized check
for (const provider of providers) {
  // Generic guard catches manifest before specialized check runs
  if (provider.status !== "ready") {
    return <DisabledItem label="NOT INSTALLED" />;
  }

  // This never executes for manifest because it was caught above
  if (provider.type === "manifest") {
    return <ClickableItem label="Auto" />;
  }
}

// ✅ CORRECT ORDER: Specialized check before generic guard
for (const provider of providers) {
  // Specialized check runs first
  if (provider.type === "manifest") {
    return <ClickableItem label="Auto" />;
  }

  // Generic guard only catches non-manifest providers
  if (provider.status !== "ready") {
    return <DisabledItem label="NOT INSTALLED" />;
  }
}
```

### Why This Is Hard to Spot

1. **Works in one path** - The locked-provider path handled this correctly, so the bug only appeared on new thread creation
2. **No errors** - The generic guard silently renders a valid (but wrong) UI state
3. **Intermittent** - If the manifest provider happened to have `status: "ready"` (local providers detected), the bug wouldn't manifest
4. **State management works fine** - Tracing through `normalizeModelSelection`, `resolveSelectableProvider`, and the store showed no issues; the bug was purely in rendering order

### The Debugging Journey

The investigation traced the full selection pipeline:

1. `ProviderModelPicker` → `onProviderModelChange` → `setModelSelection` → store update
2. `resolveSelectableProvider`, `normalizeModelSlug`, `normalizeProviderKind` — all returned valid values
3. The state management pipeline was correct; the issue was that the "Auto" option never rendered as clickable in the first place

This is a common debugging anti-pattern: investigating the data flow when the actual bug is in the view layer.

### General Principle

This pattern mirrors several other ordering issues:

- **CSS specificity** - More specific selectors must override generic ones
- **Route matching** - Specific routes before catch-alls (see [[concepts/route-wildcard-trailing-slash]])
- **Switch/case ordering** - Specific cases before default
- **Middleware ordering** - Auth bypass for specific routes before generic auth middleware

The underlying principle: **when multiple conditions can match the same input, evaluate the most specific first**.

## Related Concepts

- [[concepts/model-selection-ui-pattern]] - The provider picker where this bug occurred
- [[concepts/route-wildcard-trailing-slash]] - Same specificity ordering principle in routing

## Sources

- [[daily/2026-04-13.md]] - "Root cause: In the unlocked provider picker path, all providers go through a `status !== 'ready'` check. When manifest auto-detection has no available routing target, its status is 'warning' with `installed: false`, causing it to render as disabled 'NOT INSTALLED' instead of reaching the clickable manifest-specific rendering block."
- [[daily/2026-04-13.md]] - "Fix: Move the manifest-specific check before the status check so 'Auto' always renders as a clickable item, consistent with the locked-provider path behavior."
- [[daily/2026-04-13.md]] - "The provider picker has two rendering paths: 'locked' (existing thread) and 'unlocked' (new thread) — they handled the manifest/auto provider inconsistently."
