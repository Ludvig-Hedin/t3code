---
title: "Model Selection UI Pattern: Default Fallbacks and Provider-Specific Overrides"
aliases: [model-picker, default-model, provider-defaults, settings-ui]
tags: [ui-pattern, configuration, user-experience, model-selection]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Model Selection UI Pattern: Default Fallbacks and Provider-Specific Overrides

Model selection (in chat UIs, code generation, etc.) requires a layered fallback system: global default > provider-specific default > server-provided default. The UI should reflect this hierarchy with two sections: a global "Default model" row (visible only when relevant) and a "Provider defaults" section showing model options for each connected provider. Selectors must handle early-exit cases (manifest/auto providers) and label strings must distinguish between friendly display names and canonical slugs to avoid confusion.

## Key Points

- **Fallback hierarchy:** Per-provider default → global default → server default
- **UI layout:** Two sections (global "Default model" + "Provider defaults" list)
- **Early-exit handling:** Manifest and auto selectors need explicit fallback cases in resolvers
- **Label clarity:** "Auto" (friendly) vs "auto" (slug) distinction prevents user confusion
- **Persistence:** Defaults stored in settings; wired into composer draft store on session start

## Details

### Fallback Hierarchy

When a user starts a new chat thread, the system picks a model in this order:

1. **Per-provider default** - If user set a default for this provider, use it

   ```typescript
   const modelForProvider = defaultModelByProvider[selectedProvider];
   ```

2. **Global default** - If user set a global default, use it (if selected provider supports it)

   ```typescript
   const globalDefault = settings.defaultModel;
   ```

3. **Server default** - Built-in server fallback (e.g., OpenAI's default model)
   ```typescript
   const serverDefault = getDefaultServerModel(provider);
   ```

### Settings UI Layout

The settings panel includes two sections:

**Section 1: Global Default (Conditional)**

```
Default model [Auto v]  [Reset to server default]
```

Visible only when `defaultProvider !== "use-latest"`. Shows the global default model with a picker and reset button.

**Section 2: Provider Defaults (Always Visible)**

```
Provider defaults
├── OpenAI
│   └── GPT-4o [Reset]
├── Claude
│   └── Claude Opus [Reset]
└── Llama2
    └── Llama2 70B [Reset]
```

Lists all connected/configured providers with their individual model defaults. Each row has:

- Provider name
- Current model picker (shows only available/connected models)
- Reset button (clears back to server default)

### Early-Exit Fallback Cases

When resolving model selection, certain provider types require explicit handling:

```typescript
function resolveSelectableModel(provider: Provider, currentModel: string) {
  // Manifest provider (auto) - needs explicit case
  if (provider.type === "manifest") {
    return "auto"; // Return canonical slug, allow callback to fire
  }

  // Gemini provider - special case
  if (provider.type === "gemini") {
    return currentModel || "gemini-2.0";
  }

  // OpenAI - special case
  if (provider.type === "openai") {
    return currentModel || "gpt-4o";
  }

  // Fallback for unknown provider types
  return currentModel || getDefaultServerModel(provider);
}
```

Without explicit early-exit cases, some providers silently fall through to a default, and their selection callbacks don't fire. This causes the UI to show the previous model even though a new one was selected.

### Label Display vs. Slug

Models are stored as slugs (canonical names) but displayed as friendly labels:

```typescript
const MODEL_DISPLAY_NAMES = {
  "gpt-4o": "GPT-4o",
  "claude-opus": "Claude Opus",
  "llama2-70b": "Llama2 70B",
  auto: "Auto",
};

function getModelLabel(slug: string): string {
  return MODEL_DISPLAY_NAMES[slug] || slug;
}
```

The picker shows labels ("Auto", "GPT-4o") but stores/sends slugs ("auto", "gpt-4o") to the backend. This prevents confusion when:

- Auto model selection happens (UI shows "Auto" not "auto")
- Manifest provider is selected (label distinguishes display from value)
- Models are renamed server-side (UI labels update without breaking stored values)

### React Implementation

```typescript
// In settings panel
export function ModelDefaults() {
  const { defaultModel, defaultModelByProvider } = useSettings();
  const defaultProvider = useDefaultProvider();

  // Section 1: Global default (conditional)
  const showGlobal = defaultProvider !== 'use-latest';
  if (showGlobal) {
    return (
      <ModelPicker
        label="Default model"
        value={defaultModel}
        provider={defaultProvider}
        onChange={(slug) => updateDefaultModel(slug)}
        onReset={() => updateDefaultModel(null)}
      />
    );
  }

  // Section 2: Provider defaults (always visible)
  return (
    <div className="space-y-2">
      <h3>Provider defaults</h3>
      {availableProviders.map(provider => (
        <div key={provider.id} className="flex items-center gap-2">
          <span>{provider.name}</span>
          <ModelPicker
            value={defaultModelByProvider[provider.kind]}
            provider={provider}
            onChange={(slug) => updateProviderDefault(provider.kind, slug)}
            onReset={() => updateProviderDefault(provider.kind, null)}
          />
        </div>
      ))}
    </div>
  );
}
```

### Composer Integration (Future)

Currently, defaults are stored but not used on new thread startup. The next phase wires them into the composer draft store:

```typescript
// apps/web/src/stores/_chat.index.ts
export function applyStickyState(thread: ChatThread) {
  const { defaultModel, defaultModelByProvider } = getSettings();
  const defaultProvider = getDefaultProvider();

  // Fallback chain: per-provider → global → server
  const model =
    defaultModelByProvider[defaultProvider] ??
    defaultModel ??
    getDefaultServerModel(defaultProvider);

  return {
    ...thread,
    selectedModel: model,
  };
}
```

This ensures new threads pick the user's preferred model automatically.

## Related Concepts

- [[concepts/settings-ui-management-pattern]] - General settings management patterns
- [[concepts/provider-adapter-shape-pattern]] - Providers in the adapter system
- [[concepts/zustand-selector-anti-patterns]] - State management for defaults

## Sources

- [[daily/2026-04-12.md]] - "Fixing auto model selection bug in chat picker... auto model selection didn't visually highlight when picked (still showed previous model)"
- [[daily/2026-04-12.md]] - "Add `resolveSelectableModel` fallback case for manifest/auto to return canonical slug, allowing callback to fire"
- [[daily/2026-04-12.md]] - "Fix label display to show 'Auto' (friendly) instead of 'auto' (raw slug) when provider is manifest"
- [[daily/2026-04-12.md]] - "Add `defaultModelByProvider` Record field to settings schema... Create two UI sections: global 'Default model' row (visible when default provider ≠ 'use-latest') + 'Provider defaults' section"
