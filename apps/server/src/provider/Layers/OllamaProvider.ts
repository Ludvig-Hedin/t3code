/**
 * OllamaProviderLive - Layer implementation for the OllamaProvider service.
 *
 * Performs a health check by calling GET /api/tags on the configured Ollama
 * base URL. Parses the response to discover installed models and constructs
 * a ServerProvider snapshot for the UI.
 *
 * Unlike CLI-based providers (Gemini, Claude), Ollama uses HTTP — no
 * ChildProcessSpawner dependency is needed here.
 *
 * @module OllamaProviderLive
 */
import type { OllamaSettings, ServerProviderModel } from "@t3tools/contracts";
import { ModelCapabilities } from "@t3tools/contracts";
import { APP_NAME } from "@t3tools/shared/branding";
import { Effect, Equal, Layer, Result, Stream } from "effect";

import { buildServerProvider, providerModelsFromSettings } from "../providerSnapshot";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import { OllamaProvider } from "../Services/OllamaProvider";
import { ServerSettingsService } from "../../serverSettings";

const PROVIDER = "ollama" as const;

/**
 * Tagged error for Ollama HTTP fetch failures.
 * Using a tagged error (instead of global Error) preserves Effect type safety.
 */
class OllamaFetchError {
  readonly _tag = "OllamaFetchError";
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

/**
 * Shape returned by GET /api/tags from the Ollama HTTP API.
 * We only extract the fields we need for model discovery.
 */
interface OllamaTagsResponse {
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
  }>;
}

/**
 * checkOllamaProviderStatus - probes the local Ollama server via HTTP.
 *
 * Uses a 5-second AbortController timeout to avoid hanging on a slow
 * or unresponsive server. Interprets ECONNREFUSED / fetch failures as
 * "not running" rather than "missing" (Ollama is installed via script,
 * not a PATH binary like Gemini/Claude).
 */
export const checkOllamaProviderStatus = Effect.fn("checkOllamaProviderStatus")(function* () {
  const ollamaSettings = yield* Effect.service(ServerSettingsService).pipe(
    Effect.flatMap((service) => service.getSettings),
    Effect.map((settings) => settings.providers.ollama),
  );

  const checkedAt = new Date().toISOString();

  if (!ollamaSettings.enabled) {
    // Disabled in settings — report warning, no models merged from live HTTP
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models: providerModelsFromSettings([], PROVIDER, []),
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `Ollama is disabled in ${APP_NAME} settings.`,
      },
    });
  }

  const baseUrl = ollamaSettings.baseUrl.replace(/\/$/, "");

  // Use Effect.tryPromise with an AbortController to avoid hanging on a
  // slow or unresponsive Ollama server (5-second timeout).
  const tagsResult = yield* Effect.tryPromise({
    try: (signal) => fetch(`${baseUrl}/api/tags`, { signal }),
    // Tagged error preserves Effect type safety (avoids globalErrorInEffectCatch warning)
    catch: (cause) => new OllamaFetchError("fetch failed", cause),
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.flatMap((res) =>
      res.ok
        ? Effect.tryPromise({
            try: () => res.json() as Promise<OllamaTagsResponse>,
            // Tagged error preserves Effect type safety (avoids globalErrorInEffectCatch warning)
            catch: (cause) => new OllamaFetchError("json parse failed", cause),
          })
        : Effect.fail(new OllamaFetchError(`HTTP ${res.status}`)),
    ),
    Effect.result,
  );

  if (Result.isFailure(tagsResult)) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: ollamaSettings.enabled,
      checkedAt,
      models: providerModelsFromSettings([], PROVIDER, []),
      probe: {
        installed: false,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message:
          "Ollama is not running. Install it from ollama.com or start it with `ollama serve`.",
      },
    });
  }

  const tagsResponse = tagsResult.success;

  // Build ServerProviderModel entries from the live HTTP response.
  // These are treated as "built-in" models (discovered from Ollama, not user-defined).
  const liveModels: ReadonlyArray<ServerProviderModel> = (tagsResponse?.models ?? []).map(
    (m): ServerProviderModel => ({
      slug: m.name,
      name: m.name,
      isCustom: false,
      // Ollama models don't expose capability metadata via /api/tags
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        contextWindowOptions: [],
        promptInjectedEffortLevels: [],
      } satisfies ModelCapabilities,
    }),
  );

  // Pass [] as customModels — user-defined models are added via providerModelsFromSettings
  const models = providerModelsFromSettings(liveModels, PROVIDER, []);
  const modelCount = liveModels.length;

  if (modelCount === 0) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: ollamaSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Ollama is running but has no models installed. Pull a model to get started.",
      },
    });
  }

  return buildServerProvider({
    provider: PROVIDER,
    enabled: ollamaSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "unknown" },
      message: `Ollama is running with ${modelCount} model(s).`,
    },
  });
});

/**
 * OllamaProviderLive - wires the OllamaProvider service with reactive settings
 * tracking and automatic refresh via makeManagedServerProvider.
 *
 * Follows the same pattern as GeminiProviderLive but without ChildProcessSpawner
 * since all health checks go through HTTP fetch.
 */
export const OllamaProviderLive = Layer.effect(
  OllamaProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

    // Provide ServerSettingsService dependency to the check function
    const checkProvider = checkOllamaProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
    );

    return yield* makeManagedServerProvider<OllamaSettings>({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.ollama),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.ollama),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      checkProvider,
    });
  }),
);
