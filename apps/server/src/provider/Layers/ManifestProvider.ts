/**
 * ManifestProviderLive — "Auto" provider snapshot layer.
 *
 * Reports status by detecting which of the user's connected providers are
 * available right now.  Status meaning:
 *
 *   "ready"   — at least one local provider is reachable / installed
 *   "warning" — enabled in settings but no provider found; help text shown
 *   "disabled"— disabled in settings
 *
 * Detection order mirrors the adapter waterfall:
 *   1. Custom baseUrl (if set) — ping its health endpoint
 *   2. Ollama           — GET {baseUrl}/api/tags
 *   3. Codex CLI        — `codex --version`
 *   4. Claude Code CLI  — `claude --version`
 *   5. Gemini CLI       — `gemini --version`
 *
 * Re-checks whenever any provider's settings change (not just manifest) so
 * that installing Ollama or connecting Claude Code is reflected immediately.
 *
 * @module ManifestProviderLive
 */
import { spawn } from "node:child_process";

import type { ModelCapabilities, ServerProviderModel, ServerSettings } from "@t3tools/contracts";
import { Equal, Effect, Layer, Stream } from "effect";

import { buildServerProvider } from "../providerSnapshot";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import { ManifestProvider } from "../Services/ManifestProvider";
import { ServerSettingsService } from "../../serverSettings";

const PROVIDER = "manifest" as const;

const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

const BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  { slug: "auto", name: "Auto", isCustom: false, capabilities: EMPTY_CAPABILITIES },
];

// ---------------------------------------------------------------------------
// Plain-async detection helpers
// ---------------------------------------------------------------------------

/** Try a quick HTTP ping and return true if the server responds OK. */
async function pingOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check whether an Ollama instance is running AND has at least one model.
 * We check /api/tags (which lists models) rather than a generic health endpoint.
 */
async function ollamaHasModels(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return false;
    const json = (await res.json()) as { models?: unknown[] };
    return Array.isArray(json.models) && json.models.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check whether a CLI binary is installed and callable.
 * Uses `--version` which all the supported CLIs implement.
 * Times out after 3 seconds to keep startup snappy.
 */
async function binaryExists(binaryPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binaryPath, ["--version"], {
        stdio: "ignore",
        shell: process.platform === "win32",
      });
    } catch {
      settle(false);
      return;
    }

    child.on("error", () => settle(false));
    child.on("close", (code) => settle(code === 0));

    const timer = setTimeout(() => {
      child.kill();
      settle(false);
    }, 3_000);
    if (typeof timer.unref === "function") timer.unref();
  });
}

// ---------------------------------------------------------------------------
// Auto-route detection — mirrors the adapter waterfall
// ---------------------------------------------------------------------------

type DetectResult =
  | { readonly kind: "ready"; readonly via: string }
  | { readonly kind: "none"; readonly message: string };

/**
 * Detect which routing path will be used and report the result.
 * Returns "ready" as soon as the first viable option is found.
 */
async function detectAutoRoute(providers: ServerSettings["providers"]): Promise<DetectResult> {
  // 1. Custom endpoint override
  if (providers.manifest.baseUrl) {
    const ok = await pingOk(`${providers.manifest.baseUrl}/api/v1/health`);
    return ok
      ? { kind: "ready", via: `custom endpoint (${providers.manifest.baseUrl})` }
      : {
          kind: "none",
          message: `Custom endpoint ${providers.manifest.baseUrl} is unreachable.`,
        };
  }

  // 2. Ollama
  if (providers.ollama.enabled && (await ollamaHasModels(providers.ollama.baseUrl))) {
    return { kind: "ready", via: "Ollama" };
  }

  // 3. Codex CLI
  if (providers.codex.enabled && (await binaryExists(providers.codex.binaryPath))) {
    return { kind: "ready", via: "Codex" };
  }

  // 4. Claude Code CLI
  if (providers.claudeAgent.enabled && (await binaryExists(providers.claudeAgent.binaryPath))) {
    return { kind: "ready", via: "Claude Code" };
  }

  // 5. Gemini CLI
  if (providers.gemini.enabled && (await binaryExists(providers.gemini.binaryPath))) {
    return { kind: "ready", via: "Gemini" };
  }

  return {
    kind: "none",
    message:
      "No connected provider found. " +
      "Install Ollama, Codex, Claude Code, or Gemini to enable Auto routing.",
  };
}

// ---------------------------------------------------------------------------
// Effect provider status check
// ---------------------------------------------------------------------------

export const checkManifestProviderStatus = Effect.fn("checkManifestProviderStatus")(function* () {
  // Read ALL provider settings — Auto routing depends on every provider's config.
  // orDie converts ServerSettingsError to a defect (programmer error, not recoverable).
  const providers = yield* Effect.service(ServerSettingsService).pipe(
    Effect.flatMap((service) => service.getSettings),
    Effect.map((s) => s.providers),
    Effect.orDie,
  );

  const checkedAt = new Date().toISOString();

  if (!providers.manifest.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models: BUILT_IN_MODELS,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Auto routing is disabled in settings.",
      },
    });
  }

  // Use Effect.promise — detectAutoRoute handles all throws internally.
  const detected = yield* Effect.promise(() => detectAutoRoute(providers));

  if (detected.kind === "none") {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models: BUILT_IN_MODELS,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: detected.message,
      },
    });
  }

  return buildServerProvider({
    provider: PROVIDER,
    enabled: true,
    checkedAt,
    models: BUILT_IN_MODELS,
    probe: {
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      message: `Auto routing via ${detected.via}.`,
    },
  });
});

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const ManifestProviderLive = Layer.effect(
  ManifestProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

    const checkProvider = checkManifestProviderStatus().pipe(
      Effect.provideService(ServerSettingsService, serverSettings),
    );

    // Watch ALL settings — changes to Ollama, Codex, Claude, or Gemini should
    // trigger a re-check of Auto routing availability.
    return yield* makeManagedServerProvider<ServerSettings>({
      getSettings: serverSettings.getSettings.pipe(Effect.orDie),
      streamSettings: serverSettings.streamChanges,
      haveSettingsChanged: (previous, next) => !Equal.equals(previous, next),
      checkProvider,
    });
  }),
);
