import {
  DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ProviderKind,
  type ServerProvider,
} from "@t3tools/contracts";
import { normalizeModelSlug, resolveSelectableModel } from "@t3tools/shared/model";
import { getComposerProviderState } from "./components/chat/composerProviderRegistry";
import { UnifiedSettings } from "@t3tools/contracts/settings";
import {
  getDefaultServerModel,
  getProviderModels,
  resolveSelectableProvider,
} from "./providerModels";

const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;

export type ProviderCustomModelConfig = {
  provider: ProviderKind;
  title: string;
  description: string;
  placeholder: string;
  example: string;
};

export interface AppModelOption {
  slug: string;
  name: string;
  isCustom: boolean;
}

const PROVIDER_CUSTOM_MODEL_CONFIG: Record<ProviderKind, ProviderCustomModelConfig> = {
  codex: {
    provider: "codex",
    title: "Codex",
    description: "Save additional Codex model slugs for the picker and `/model` command.",
    placeholder: "your-codex-model-slug",
    example: "gpt-6.7-codex-ultra-preview",
  },
  claudeAgent: {
    provider: "claudeAgent",
    title: "Claude",
    description: "Save additional Claude model slugs for the picker and `/model` command.",
    placeholder: "your-claude-model-slug",
    example: "claude-sonnet-5-0",
  },
  gemini: {
    provider: "gemini",
    title: "Gemini",
    description: "Save additional Gemini model slugs for the picker and `/model` command.",
    placeholder: "your-gemini-model-slug",
    example: "gemini-3.1-pro-preview",
  },
  opencode: {
    provider: "opencode",
    title: "OpenCode",
    description: "Save additional OpenCode model slugs for the picker and `/model` command.",
    placeholder: "your-opencode-model-slug",
    example: "moonshot/kimi-k2-5",
  },
  ollama: {
    provider: "ollama",
    title: "Ollama",
    description: "Save additional Ollama model slugs for the picker and `/model` command.",
    placeholder: "your-ollama-model-slug",
    example: "llama3.2",
  },
  // manifest always uses "auto" — the router decides the actual model. No custom slugs needed.
  manifest: {
    provider: "manifest",
    title: "Auto",
    description: "Manifest auto-router — routes each request to the cheapest capable model.",
    placeholder: "auto",
    example: "auto",
  },
  // a2a = Agent-to-Agent protocol. Remote agents accessed via HTTP — no custom model slugs.
  a2a: {
    provider: "a2a",
    title: "A2A",
    description: "Agent-to-Agent protocol — remote agents accessed via HTTP.",
    placeholder: "remote-agent",
    example: "remote-agent",
  },
};

export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined>,
  builtInModelSlugs: ReadonlySet<string>,
  provider: ProviderKind = "codex",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();

  for (const candidate of models) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

export function getAppModelOptions(
  settings: UnifiedSettings,
  providers: ReadonlyArray<ServerProvider>,
  provider: ProviderKind,
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getProviderModels(providers, provider).map(
    ({ slug, name, isCustom }) => ({
      slug,
      name,
      isCustom,
    }),
  );
  const seen = new Set(options.map((option) => option.slug));
  const trimmedSelectedModel = selectedModel?.trim().toLowerCase();
  const builtInModelSlugs = new Set(
    getProviderModels(providers, provider)
      .filter((model) => !model.isCustom)
      .map((model) => model.slug),
  );

  // OllamaSettings does not have customModels — fall back to empty array.
  // A2A providers have no entry in settings.providers; the cast handles missing keys safely.
  const customModels =
    (
      (settings.providers as Record<string, unknown>)[provider] as
        | { customModels?: readonly string[] }
        | undefined
    )?.customModels ?? [];
  for (const slug of normalizeCustomModelSlugs(customModels, builtInModelSlugs, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      slug,
      name: slug,
      isCustom: true,
    });
  }

  const normalizedSelectedModel = normalizeModelSlug(selectedModel, provider);
  const selectedModelMatchesExistingName =
    typeof trimmedSelectedModel === "string" &&
    options.some((option) => option.name.toLowerCase() === trimmedSelectedModel);
  if (
    normalizedSelectedModel &&
    !seen.has(normalizedSelectedModel) &&
    !selectedModelMatchesExistingName
  ) {
    options.push({
      slug: normalizedSelectedModel,
      name: normalizedSelectedModel,
      isCustom: true,
    });
  }

  return options;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  settings: UnifiedSettings,
  providers: ReadonlyArray<ServerProvider>,
  selectedModel: string | null | undefined,
): string {
  const resolvedProvider = resolveSelectableProvider(providers, provider);
  // Gemini, OpenCode, Ollama, and Manifest use dynamic model slugs that bypass the
  // selectable-options resolution path — normalise directly to the canonical slug instead.
  if (
    resolvedProvider === "gemini" ||
    resolvedProvider === "opencode" ||
    resolvedProvider === "ollama" ||
    resolvedProvider === "manifest"
  ) {
    return (
      normalizeModelSlug(selectedModel, resolvedProvider) ??
      getDefaultServerModel(providers, resolvedProvider)
    );
  }
  const options = getAppModelOptions(settings, providers, resolvedProvider, selectedModel);
  return (
    resolveSelectableModel(resolvedProvider, selectedModel, options) ??
    getDefaultServerModel(providers, resolvedProvider)
  );
}

export function getCustomModelOptionsByProvider(
  settings: UnifiedSettings,
  providers: ReadonlyArray<ServerProvider>,
  selectedProvider?: ProviderKind | null,
  selectedModel?: string | null,
): Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>> {
  return {
    codex: getAppModelOptions(
      settings,
      providers,
      "codex",
      selectedProvider === "codex" ? selectedModel : undefined,
    ),
    claudeAgent: getAppModelOptions(
      settings,
      providers,
      "claudeAgent",
      selectedProvider === "claudeAgent" ? selectedModel : undefined,
    ),
    gemini: getAppModelOptions(
      settings,
      providers,
      "gemini",
      selectedProvider === "gemini" ? selectedModel : undefined,
    ),
    opencode: getAppModelOptions(
      settings,
      providers,
      "opencode",
      selectedProvider === "opencode" ? selectedModel : undefined,
    ),
    ollama: getAppModelOptions(
      settings,
      providers,
      "ollama",
      selectedProvider === "ollama" ? selectedModel : undefined,
    ),
    // manifest always has a single "auto" model — no custom slugs
    manifest: getAppModelOptions(
      settings,
      providers,
      "manifest",
      selectedProvider === "manifest" ? selectedModel : undefined,
    ),
    // a2a = remote agents via HTTP — no custom model slugs
    a2a: getAppModelOptions(
      settings,
      providers,
      "a2a",
      selectedProvider === "a2a" ? selectedModel : undefined,
    ),
  };
}

export function resolveAppModelSelectionState(
  settings: UnifiedSettings,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  return resolveConfiguredModelSelectionState(
    settings.textGenerationModelSelection,
    settings,
    providers,
  );
}

export function resolveConfiguredModelSelectionState(
  selection: ModelSelection | null | undefined,
  settings: UnifiedSettings,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection {
  const resolvedSelection = selection ?? {
    provider: "codex" as const,
    model: DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex,
  };
  const provider = resolveSelectableProvider(providers, resolvedSelection.provider);

  // When the provider changed due to fallback (e.g. selected provider was disabled),
  // don't carry over the old provider's model — use the fallback provider's default.
  const selectedModel = provider === resolvedSelection.provider ? resolvedSelection.model : null;
  const model = resolveAppModelSelection(provider, settings, providers, selectedModel);
  const { modelOptionsForDispatch } = getComposerProviderState({
    provider,
    model,
    models: getProviderModels(providers, provider),
    prompt: "",
    modelOptions: {
      [provider]: provider === resolvedSelection.provider ? resolvedSelection.options : undefined,
    },
  });

  // A2A model selections are not resolved through this settings-based path.
  return {
    provider,
    model,
    ...(modelOptionsForDispatch ? { options: modelOptionsForDispatch } : {}),
  } as ModelSelection;
}
