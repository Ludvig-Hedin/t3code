---
title: "Provider Default Model Fallback Chains"
aliases: [model-defaults, fallback-chains, settings-defaults, label-display]
tags: [configuration, defaults, ui-management, state-management]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Provider Default Model Fallback Chains

When managing per-provider AI model defaults, multiple fallback levels are necessary: global default, per-provider defaults, model availability, and server defaults. Fallback chains ensure a model is always selected, even if intermediate levels fail or return empty. Additionally, label display must distinguish between canonical slugs (e.g., "auto") and user-friendly strings (e.g., "Auto").

## Key Points

- Multiple fallback levels: per-provider override → global default → server default → error handling
- Empty string (`""`) from UI reset actions must trigger fallback chain (not propagate as-is)
- Display labels must use user-friendly strings; canonical slugs should be hidden from users
- Only show available models (models that are connected/enabled, not placeholders)
- Per-row reset buttons should clear the override back to server default (via fallback)

## Details

### The Fallback Chain

```typescript
function resolveModelForProvider(
  provider: string,
  settings: UserSettings,
  serverDefaults: ModelDefaults,
): string {
  // Level 1: Per-provider override
  const providerDefault = settings.defaultModelByProvider[provider];
  if (providerDefault && providerDefault !== "") {
    return providerDefault;
  }

  // Level 2: Global default (if provider is the default provider)
  if (provider === settings.defaultProvider && settings.defaultModel) {
    return settings.defaultModel;
  }

  // Level 3: Server default for this provider
  if (serverDefaults[provider]) {
    return serverDefaults[provider];
  }

  // Level 4: Any available model for this provider
  const availableModels = getAvailableModels(provider);
  if (availableModels.length > 0) {
    return availableModels[0];
  }

  // Level 5: Error/fallback
  return "unknown";
}
```

Each level is consulted in order; the first non-empty, valid result wins.

### Label Display: Slug vs Friendly String

```typescript
function getModelLabel(slug: string): string {
  const labels: Record<string, string> = {
    "auto": "Auto",           // Friendly label for "auto" slug
    "claude-opus": "Claude Opus",
    "gpt-4-turbo": "GPT-4 Turbo",
    // ... other models
  };

  return labels[slug] || slug;  // Fall back to slug if no label defined
}

// In UI
const modelSlug = "auto";
<span>{getModelLabel(modelSlug)}</span>  // Shows "Auto" not "auto"
```

Without this mapping, users see internal slugs ("auto", "gpt-4-turbo") instead of readable names ("Auto", "GPT-4 Turbo").

### Reset Button Behavior

```typescript
function handleReset(provider: string) {
  // Clear the per-provider override
  setSettings((prev) => ({
    ...prev,
    defaultModelByProvider: {
      ...prev.defaultModelByProvider,
      [provider]: "", // Empty string triggers fallback
    },
  }));

  // The next resolve call will skip the per-provider level
  // and fall back to global/server defaults
  const newModel = resolveModelForProvider(provider, updatedSettings, serverDefaults);
  updateModel(newModel);
}
```

Resetting to `""` (empty string) is crucial—it signals "use default" rather than "clear all overrides and error."

### Settings UI Structure

```jsx
// Global default (visible when using a "use-latest" provider)
{
  settings.defaultProvider !== "use-latest" && (
    <SettingsRow>
      <Label>Default model</Label>
      <ModelPicker
        value={settings.defaultModel}
        onChange={setDefaultModel}
        models={allAvailableModels}
      />
    </SettingsRow>
  );
}

// Per-provider defaults
<SettingsSection title="Provider defaults">
  {connectedProviders.map((provider) => (
    <SettingsRow key={provider}>
      <Label>{provider}</Label>
      <ModelPicker
        value={settings.defaultModelByProvider[provider] || ""}
        onChange={(model) => setProviderDefault(provider, model)}
        models={getAvailableModels(provider)}
      />
      <Button onClick={() => handleReset(provider)}>Reset</Button>
    </SettingsRow>
  ))}
</SettingsSection>;
```

Show only connected providers; each has its own picker with models specific to that provider. Reset buttons clear overrides back to defaults.

### Integration with Store

The fallback chain must integrate with the drafts store so new threads use the resolved defaults:

```typescript
// In drafts store startup
const defaultModel = resolveModelForProvider(settings.defaultProvider, settings, serverDefaults);

state.draft.model = defaultModel; // Use resolved value, not raw setting
```

## Related Concepts

- [[concepts/git-branch-agnostic-base-resolution]] - Similar fallback chain pattern for git branch selection
- [[concepts/rpc-layer-expansion-pattern]] - Settings endpoints often expand RPC contracts with new fields

## Sources

- [[daily/2026-04-12.md]] - "Fixing auto model selection bug: manifest provider's selection callback silently dropped due to missing early-exit fallback in resolver"
- [[daily/2026-04-12.md]] - "Add `defaultModelByProvider` Record field to settings schema... create two UI sections: global default row + per-provider defaults"
- [[daily/2026-04-12.md]] - "Display labels must distinguish between canonical slugs and user-friendly strings... show 'Auto' (friendly) instead of 'auto' (raw slug)"
- [[daily/2026-04-12.md]] - "Empty string from reset operations need proper fallback chaining so they don't break downstream logic"
