/**
 * OpenCodeProvider Layer — loads snapshot for the OpenCode provider.
 *
 * Checks `opencode --version` for install status, fetches models from
 * the running server's GET /config/providers (best effort, falls back
 * to OPENCODE_CURATED_MODELS if unavailable).
 *
 * @module OpenCodeProviderLive
 */
import type { ModelCapabilities, OpenCodeSettings, ServerProviderModel } from "@t3tools/contracts";
import { APP_NAME } from "@t3tools/shared/branding";
import { Effect, Equal, Layer, Option, Result, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  buildServerProvider,
  DEFAULT_TIMEOUT_MS,
  detailFromResult,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
} from "../providerSnapshot";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import { OpenCodeProvider } from "../Services/OpenCodeProvider";
import { ServerSettingsService } from "../../serverSettings";

const PROVIDER = "opencode" as const;

const EMPTY_CAPS: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

/**
 * Static fallback list used when the opencode server is not reachable.
 * Slugs use the exact format returned by `opencode models`:
 * "{providerID}/{modelID}" — first segment is the API providerID.
 */
export const OPENCODE_CURATED_MODELS: ReadonlyArray<ServerProviderModel> = [
  // moonshotai via openrouter (default fallback)
  {
    slug: "openrouter/moonshotai/kimi-k2.5",
    name: "Kimi K2.5 (Moonshot via OpenRouter)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // Anthropic via openrouter
  {
    slug: "openrouter/anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/anthropic/claude-opus-4",
    name: "Claude Opus 4 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // OpenAI via openrouter
  {
    slug: "openrouter/openai/gpt-4o",
    name: "GPT-4o (OpenAI)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/openai/o3",
    name: "o3 (OpenAI)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/openai/o4-mini",
    name: "o4-mini (OpenAI)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // Google via openrouter
  {
    slug: "openrouter/google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Google)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Google)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // DeepSeek via openrouter
  {
    slug: "openrouter/deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "openrouter/deepseek/deepseek-r1-distill-llama-70b",
    name: "DeepSeek R1 Distill 70B",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // Meta Llama via openrouter
  {
    slug: "openrouter/meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick (Meta)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // xAI via openrouter
  {
    slug: "openrouter/x-ai/grok-3",
    name: "Grok 3 (xAI)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // Mistral via openrouter
  {
    slug: "openrouter/mistralai/mistral-large-2411",
    name: "Mistral Large (Mistral AI)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  // Native opencode free models
  {
    slug: "opencode/big-pickle",
    name: "Big Pickle (OpenCode)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
];

export const checkOpenCodeProviderStatus = Effect.fn("checkOpenCodeProviderStatus")(function* () {
  const openCodeSettings = yield* Effect.service(ServerSettingsService).pipe(
    Effect.flatMap((service) => service.getSettings),
    Effect.map((settings) => settings.providers.opencode),
  );
  const checkedAt = new Date().toISOString();
  const models = providerModelsFromSettings(
    OPENCODE_CURATED_MODELS,
    PROVIDER,
    openCodeSettings.customModels,
  );

  if (!openCodeSettings.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `OpenCode is disabled in ${APP_NAME} settings.`,
      },
    });
  }

  const command = ChildProcess.make(openCodeSettings.binaryPath, ["--version"], {
    shell: process.platform === "win32",
  });

  const versionProbe = yield* spawnAndCollect(openCodeSettings.binaryPath, command).pipe(
    Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionProbe)) {
    const error = versionProbe.failure;
    return buildServerProvider({
      provider: PROVIDER,
      enabled: openCodeSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "OpenCode CLI (`opencode`) is not installed or not on PATH. Install with: npm i -g opencode-ai"
          : `Failed to run opencode health check: ${error instanceof Error ? error.message : String(error)}.`,
      },
    });
  }

  if (Option.isNone(versionProbe.success)) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: openCodeSettings.enabled,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Could not verify opencode version — timed out.",
      },
    });
  }

  const result = versionProbe.success.value;
  const parsedVersion = parseGenericCliVersion(`${result.stdout}\n${result.stderr}`);
  const detail = detailFromResult(result);
  return buildServerProvider({
    provider: PROVIDER,
    enabled: openCodeSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: parsedVersion,
      status: "ready",
      auth: { status: "unknown" },
      message: detail
        ? `OpenCode CLI is installed. Auth is managed by opencode. ${detail}`
        : "OpenCode CLI is installed. Auth is managed by opencode.",
    },
  });
});

export const OpenCodeProviderLive = Layer.effect(
  OpenCodeProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const checkProvider = checkOpenCodeProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    return yield* makeManagedServerProvider<OpenCodeSettings>({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.opencode),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.opencode),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      checkProvider,
    });
  }),
);
