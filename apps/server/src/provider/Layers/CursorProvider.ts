import type {
  CursorSettings,
  ModelCapabilities,
  ServerProvider,
  ServerProviderAuth,
  ServerProviderModel,
  ServerProviderState,
} from "@t3tools/contracts";
import { APP_NAME } from "@t3tools/shared/branding";
import { Cause, Effect, Equal, Layer, Option, Result, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  buildServerProvider,
  DEFAULT_TIMEOUT_MS,
  detailFromResult,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type CommandResult,
} from "../providerSnapshot";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import { CursorProvider } from "../Services/CursorProvider";
import { ServerSettingsService } from "../../serverSettings";

const PROVIDER = "cursor" as const;

const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

const FALLBACK_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "composer-2-fast",
    name: "Composer 2 Fast",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "composer-2",
    name: "Composer 2",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "auto",
    name: "Auto",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

function stripAnsi(value: string): string {
  return value
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/\r/g, "");
}

function cleanOutput(value: string): string {
  return stripAnsi(value).trim();
}

function runCursorCommand(args: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const settingsService = yield* ServerSettingsService;
    const cursorSettings = yield* settingsService.getSettings.pipe(
      Effect.map((settings) => settings.providers.cursor),
    );
    const command = ChildProcess.make(cursorSettings.binaryPath, [...args], {
      shell: process.platform === "win32",
    });
    return yield* spawnAndCollect(cursorSettings.binaryPath, command);
  });
}

function parseCursorAuthStatus(result: CommandResult): {
  readonly status: Exclude<ServerProviderState, "disabled">;
  readonly auth: ServerProviderAuth;
  readonly message?: string;
} {
  const output = cleanOutput(`${result.stdout}\n${result.stderr}`);
  const lowerOutput = output.toLowerCase();

  const loggedInMatch = output.match(/logged in as\s+([^\s]+)/i);
  if (loggedInMatch) {
    const label = loggedInMatch[1]?.trim();
    return {
      status: "ready",
      auth: { status: "authenticated", ...(label ? { label } : {}) },
      message: label ? `Cursor CLI is authenticated as ${label}.` : "Cursor CLI is authenticated.",
    };
  }

  if (
    lowerOutput.includes("not logged in") ||
    lowerOutput.includes("not authenticated") ||
    lowerOutput.includes("login required") ||
    lowerOutput.includes("run `cursor-agent login`") ||
    lowerOutput.includes("run cursor-agent login")
  ) {
    return {
      status: "error",
      auth: { status: "unauthenticated" },
      message: "Cursor CLI is not authenticated. Run `cursor-agent login` and try again.",
    };
  }

  if (result.code === 0) {
    return {
      status: "warning",
      auth: { status: "unknown" },
      message:
        "Cursor CLI responded successfully, but authentication status could not be determined.",
    };
  }

  const detail = detailFromResult(result);
  return {
    status: "warning",
    auth: { status: "unknown" },
    message: detail
      ? `Could not verify Cursor authentication status. ${detail}`
      : "Could not verify Cursor authentication status.",
  };
}

function parseCursorModelsOutput(output: string): ReadonlyArray<ServerProviderModel> {
  const lines = cleanOutput(output)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const seen = new Set<string>();
  const models: Array<ServerProviderModel> = [];

  for (const line of lines) {
    if (
      line.startsWith("Loading models") ||
      line === "Available models" ||
      line.startsWith("Tip:")
    ) {
      continue;
    }

    const separatorIndex = line.indexOf(" - ");
    if (separatorIndex <= 0) {
      continue;
    }

    const slug = line.slice(0, separatorIndex).trim();
    const rawName = line
      .slice(separatorIndex + 3)
      .replace(/\s+\((?:default|current)\)/gi, "")
      .trim();

    if (!slug || seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    models.push({
      slug,
      name: rawName || slug,
      isCustom: false,
      capabilities: EMPTY_CAPABILITIES,
    });
  }

  return models;
}

export const checkCursorProviderStatus = Effect.fn("checkCursorProviderStatus")(function* () {
  const cursorSettings = yield* Effect.service(ServerSettingsService).pipe(
    Effect.flatMap((service) => service.getSettings),
    Effect.map((settings) => settings.providers.cursor),
  );
  const checkedAt = new Date().toISOString();

  if (!cursorSettings.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models: providerModelsFromSettings(FALLBACK_MODELS, PROVIDER, cursorSettings.customModels),
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `Cursor is disabled in ${APP_NAME} settings.`,
      },
    });
  }

  const versionProbe = yield* runCursorCommand(["--version"]).pipe(
    Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionProbe)) {
    const error = versionProbe.failure;
    return buildServerProvider({
      provider: PROVIDER,
      enabled: cursorSettings.enabled,
      checkedAt,
      models: providerModelsFromSettings(FALLBACK_MODELS, PROVIDER, cursorSettings.customModels),
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Cursor CLI (`cursor-agent`) is not installed or not on PATH."
          : `Failed to execute Cursor CLI health check: ${Cause.pretty(Cause.die(error)).trimEnd()}.`,
      },
    });
  }

  if (Option.isNone(versionProbe.success)) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: cursorSettings.enabled,
      checkedAt,
      models: providerModelsFromSettings(FALLBACK_MODELS, PROVIDER, cursorSettings.customModels),
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Could not verify Cursor version. Timed out while running command.",
      },
    });
  }

  const versionResult = versionProbe.success.value;
  const parsedVersion = parseGenericCliVersion(
    cleanOutput(`${versionResult.stdout}\n${versionResult.stderr}`),
  );

  const authProbe = yield* runCursorCommand(["status"]).pipe(
    Effect.timeoutOption(DEFAULT_TIMEOUT_MS),
    Effect.result,
  );

  const authStatus =
    Result.isSuccess(authProbe) && Option.isSome(authProbe.success)
      ? parseCursorAuthStatus(authProbe.success.value)
      : {
          status: "warning" as const,
          auth: { status: "unknown" } satisfies ServerProviderAuth,
          message: "Could not verify Cursor authentication status.",
        };

  const modelsProbe = yield* runCursorCommand(["models"]).pipe(
    Effect.timeoutOption("10 seconds"),
    Effect.result,
  );

  const detectedModels =
    Result.isSuccess(modelsProbe) && Option.isSome(modelsProbe.success)
      ? parseCursorModelsOutput(
          `${modelsProbe.success.value.stdout}\n${modelsProbe.success.value.stderr}`,
        )
      : FALLBACK_MODELS;

  const models = providerModelsFromSettings(
    detectedModels.length > 0 ? detectedModels : FALLBACK_MODELS,
    PROVIDER,
    cursorSettings.customModels,
  );

  return buildServerProvider({
    provider: PROVIDER,
    enabled: cursorSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: parsedVersion,
      status: authStatus.status,
      auth: authStatus.auth,
      ...(authStatus.message !== undefined ? { message: authStatus.message } : {}),
    },
  });
});

export const CursorProviderLive = Layer.effect(
  CursorProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const checkProvider = checkCursorProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );

    return yield* makeManagedServerProvider<CursorSettings>({
      getSettings: serverSettings.getSettings.pipe(
        Effect.map((settings) => settings.providers.cursor),
        Effect.orDie,
      ),
      streamSettings: serverSettings.streamChanges.pipe(
        Stream.map((settings) => settings.providers.cursor),
      ),
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      checkProvider,
    });
  }),
);
