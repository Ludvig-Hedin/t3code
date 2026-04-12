---
title: "Provider-Scoped Configuration with Fallback Chains"
aliases: [config-fallback, provider-defaults, scoped-settings, configuration-hierarchy]
tags: [configuration, user-settings, design-pattern, extensibility]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Provider-Scoped Configuration with Fallback Chains

Complex systems with multiple providers benefit from hierarchical configuration: provider-specific settings with global defaults as fallback, then server defaults as the final fallback. This pattern allows users to set global defaults while still overriding on a per-provider basis, and ensures the system always has a valid value even if users don't configure anything.

## Key Points

- **Three-level hierarchy** - Provider-scoped setting → global default → server default
- **User can set each level independently** - Per-provider model picker, global default model, or rely on server
- **Empty string means "use fallback"** - Reset buttons use empty string; code chains fallbacks properly
- **UI reflects hierarchy** - Show global default only if it differs from server default; show provider defaults always
- **Filtering based on connection state** - Only show available/connected providers in picker
- **Prevents invalid states** - Fallback chain ensures no empty or null values flow through

## Details

### The Configuration Hierarchy

```typescript
// Level 1: Provider-scoped setting (most specific)
const defaultModelByProvider = {
  openai: "gpt-4",
  claude: "claude-3-sonnet",
};

// Level 2: Global default (medium specificity)
const globalDefaultModel = "gpt-4";

// Level 3: Server default (least specific)
const serverDefaultModel = "gpt-3.5-turbo";

// Resolution function
function resolveModelForProvider(provider) {
  return defaultModelByProvider[provider] ?? globalDefaultModel ?? serverDefaultModel;
}
```

### User Workflows

**Scenario 1: User sets global default**

```
Action: Settings → Default model → pick gpt-4
Result: All providers use gpt-4 (unless overridden per-provider)
```

**Scenario 2: User overrides for specific provider**

```
Action: Settings → Provider defaults → OpenAI → pick claude-3-opus
Result: OpenAI uses claude-3-opus; others use global default
```

**Scenario 3: User resets provider override**

```
Action: Settings → Provider defaults → OpenAI → click Reset button
Effect: defaultModelByProvider['openai'] = '' (empty string)
Resolution: Empty string → use global default → use server default
```

### Implementation Pattern

```typescript
interface SettingsStore {
  defaultModel: string; // Global default (level 2)
  defaultModelByProvider: Record<string, string>; // Provider-scoped (level 1)
}

// Resolution with proper fallback chaining
function getModelForProvider(provider: string, settings: SettingsStore): string {
  // Level 1: Check provider-specific setting
  const providerModel = settings.defaultModelByProvider[provider];
  if (providerModel && providerModel.length > 0) {
    return providerModel;
  }

  // Level 2: Fall back to global default
  if (settings.defaultModel && settings.defaultModel.length > 0) {
    return settings.defaultModel;
  }

  // Level 3: Fall back to server default
  return getServerDefaultModel();
}
```

### UI Design Patterns

**Global Default Row** (only show when meaningful):

```typescript
function SettingsPanel() {
  const serverDefault = getServerDefaultModel();
  const userDefault = store.defaultModel;

  // Only show if user has set something different from server
  if (userDefault && userDefault !== serverDefault) {
    return (
      <SettingRow label="Default model">
        <ModelPicker value={userDefault} onChange={...} />
        <ResetButton onClick={() => store.setDefaultModel('')} />
      </SettingRow>
    );
  }
}
```

**Provider Defaults Section** (show all connected providers):

```typescript
function ProviderDefaults() {
  const connectedProviders = store.connectedProviders; // Only show these
  const defaults = store.defaultModelByProvider;

  return connectedProviders.map(provider => (
    <SettingRow key={provider.id} label={provider.name}>
      <ModelPicker
        value={defaults[provider.id] ?? ''}
        onChange={(model) => store.setProviderDefault(provider.id, model)}
        availableModels={provider.availableModels} // Only show what's available
      />
      <ResetButton
        onClick={() => store.setProviderDefault(provider.id, '')}
        disabled={!defaults[provider.id]}
      />
    </SettingRow>
  ));
}
```

### Key Implementation Details

**1. Filter by connection state:**

```typescript
// Don't show settings for unconnected providers
const providers = store.providers.filter((p) => p.isConnected);
```

**2. Show only available models:**

```typescript
// User may have configured a model that's no longer available
// Filter picker to show only currently available options
const availableModels = provider.models.filter((m) => m.available);
```

**3. Reset uses empty string, not deletion:**

```typescript
// ❌ WRONG: delete the key
delete defaultModelByProvider[provider.id];
// → Next access: undefined → fallback chain breaks if not defensive

// ✅ CORRECT: set to empty string
defaultModelByProvider[provider.id] = "";
// → Next access: empty string → fallback chain works normally
```

**4. Fallback chaining must check for truthiness:**

```typescript
// ❌ WRONG: falsy check
const model = userSetting || globalDefault || serverDefault;
// → If userSetting is 0 or false, this breaks

// ✅ CORRECT: explicit length/type check
const model =
  userSetting && userSetting.length > 0
    ? userSetting
    : globalDefault && globalDefault.length > 0
      ? globalDefault
      : serverDefault;
```

### Persistence

Store the configuration in user settings or database:

```typescript
// In user settings document/row
{
  defaultModel: 'gpt-4',
  defaultModelByProvider: {
    'openai': 'gpt-4-turbo',
    'claude': 'claude-3-sonnet'
  }
}

// On new thread creation, apply these defaults
function createNewThread(provider: string) {
  const model = resolveModelForProvider(provider, userSettings);
  return { provider, model }; // Pre-populated with defaults
}
```

### Testing

Test all three levels:

```typescript
describe("Model resolution", () => {
  it("uses provider-specific override", () => {
    const model = resolveModelForProvider("openai", {
      defaultModel: "gpt-4",
      defaultModelByProvider: { openai: "gpt-3.5-turbo" },
    });
    expect(model).toBe("gpt-3.5-turbo");
  });

  it("falls back to global default", () => {
    const model = resolveModelForProvider("openai", {
      defaultModel: "gpt-4",
      defaultModelByProvider: { claude: "claude-3-sonnet" }, // no openai entry
    });
    expect(model).toBe("gpt-4");
  });

  it("falls back to server default", () => {
    const model = resolveModelForProvider("openai", {
      defaultModel: "", // explicitly empty
      defaultModelByProvider: {},
    });
    expect(model).toBe(getServerDefaultModel());
  });
});
```

## Related Concepts

- [[concepts/zustand-selector-stability]] - Provider config selectors must be stable references
- [[concepts/settings-ui-management-pattern]] - Settings panel is the UI for this configuration
- [[concepts/http-endpoint-authentication-patterns]] - Similar fallback pattern for auth tokens

## Sources

- [[daily/2026-04-12.md]] - "Added global + per-provider default model settings UI with proper fallbacks and filtering; show only available/connected models"
- [[daily/2026-04-12.md]] - "Add `defaultModelByProvider` Record field to settings schema, keyed by ProviderKind; create two UI sections: global default row + provider defaults section"
- [[daily/2026-04-12.md]] - "Empty string from reset operations need proper fallback chaining so they don't break downstream logic"
