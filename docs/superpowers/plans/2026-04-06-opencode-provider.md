# OpenCode Provider Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OpenCode CLI as a fourth provider in Bird Code, with full streaming, session management, model search, and permission handling — matching the Codex/Claude/Gemini integration pattern.

**Architecture:** Spawn `opencode serve` as a subprocess per Bird Code server session; communicate via HTTP REST + SSE on a dynamic localhost port. An `OpenCodeAdapter` (implementing `ProviderAdapterShape`) translates HTTP/SSE into canonical `ProviderRuntimeEvent`s. An `OpenCodeProvider` snapshot loader fetches models from `GET /config/providers` at startup, falling back to a curated static list.

**Tech Stack:** Effect (Layers/Services pattern), Node.js `fetch` + streaming SSE, TypeScript, React/Tailwind for UI.

---

## File Map

### New files

| File                                                          | Responsibility                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/contracts/src/opencode.ts`                          | OpenCode-specific schemas (re-exported from contracts index) |
| `apps/server/src/provider/Services/OpenCodeProvider.ts`       | Service tag for OpenCode provider snapshot                   |
| `apps/server/src/provider/Services/OpenCodeAdapter.ts`        | Service tag for OpenCode adapter                             |
| `apps/server/src/provider/Layers/OpenCodeAppServerManager.ts` | Spawns/manages `opencode serve` subprocess; HTTP client      |
| `apps/server/src/provider/Layers/OpenCodeProvider.ts`         | Snapshot loader: version check, model fetch, fallback list   |
| `apps/server/src/provider/Layers/OpenCodeAdapter.ts`          | Full `ProviderAdapterShape` implementation over HTTP+SSE     |

### Modified files

| File                                                         | Change                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/contracts/src/orchestration.ts`                    | Add `"opencode"` to `ProviderKind`; add `OpenCodeModelSelection` to `ModelSelection` union |
| `packages/contracts/src/model.ts`                            | Add `OpenCodeModelOptions`; add `"opencode"` to all `Record<ProviderKind, …>` maps         |
| `packages/contracts/src/settings.ts`                         | Add `OpenCodeSettings` schema; add to `ServerSettings.providers`; add patch types          |
| `packages/contracts/src/index.ts`                            | Re-export new opencode types                                                               |
| `apps/server/src/provider/Layers/ProviderRegistry.ts`        | Wire in `OpenCodeProvider`                                                                 |
| `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` | Wire in `OpenCodeAdapter`                                                                  |
| `apps/web/src/session-logic.ts`                              | Add `"opencode"` to `PROVIDER_OPTIONS`                                                     |
| `apps/web/src/components/chat/ProviderModelPicker.tsx`       | Add OpenCode tab + model search bar                                                        |
| `apps/web/src/providerModels.ts`                             | Add `"opencode"` handling to utility functions                                             |

---

## Task 1: Extend contracts — ProviderKind + model types

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`
- Modify: `packages/contracts/src/model.ts`

- [ ] **Step 1: Add `"opencode"` to `ProviderKind`**

In `packages/contracts/src/orchestration.ts`, change line 26:

```typescript
// Before:
export const ProviderKind = Schema.Literals(["codex", "claudeAgent", "gemini"]);

// After:
export const ProviderKind = Schema.Literals(["codex", "claudeAgent", "gemini", "opencode"]);
```

Also add the import for `OpenCodeModelOptions` at the top (will be created in next step) and add `OpenCodeModelSelection` + update the `ModelSelection` union. Full additions after the `GeminiModelSelection` block:

```typescript
// Add import alongside existing model imports at top of file:
import {
  ClaudeModelOptions,
  CodexModelOptions,
  GeminiModelOptions,
  OpenCodeModelOptions,
} from "./model";

// Add after GeminiModelSelection (around line 63):
export const OpenCodeModelSelection = Schema.Struct({
  provider: Schema.Literal("opencode"),
  model: TrimmedNonEmptyString,
  options: Schema.optionalKey(OpenCodeModelOptions),
});
export type OpenCodeModelSelection = typeof OpenCodeModelSelection.Type;

// Update ModelSelection union (around line 65):
export const ModelSelection = Schema.Union([
  CodexModelSelection,
  ClaudeModelSelection,
  GeminiModelSelection,
  OpenCodeModelSelection,
]);
export type ModelSelection = typeof ModelSelection.Type;
```

- [ ] **Step 2: Add `OpenCodeModelOptions` + update all ProviderKind records in `model.ts`**

```typescript
// Add after GeminiModelOptions (around line 26):
export const OpenCodeModelOptions = Schema.Struct({});
export type OpenCodeModelOptions = typeof OpenCodeModelOptions.Type;

// Update ProviderModelOptions struct:
export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  claudeAgent: Schema.optional(ClaudeModelOptions),
  gemini: Schema.optional(GeminiModelOptions),
  opencode: Schema.optional(OpenCodeModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

// Update DEFAULT_MODEL_BY_PROVIDER — opencode default is resolved at runtime
// from GET /config; this is only the static fallback used by contracts:
export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.4",
  claudeAgent: "claude-sonnet-4-6",
  gemini: "gemini-2.5-pro",
  opencode: "moonshot/kimi-k2-5",
};

// Update DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER:
export const DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.4-mini",
  claudeAgent: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  opencode: "moonshot/kimi-k2-5",
};

// Update MODEL_SLUG_ALIASES_BY_PROVIDER — keep all existing keys, add opencode:
// Find the existing export and add "opencode: {}," as a new entry.
// The existing codex/claudeAgent/gemini entries are preserved unchanged.
export const MODEL_SLUG_ALIASES_BY_PROVIDER: Record<ProviderKind, Record<string, string>> = {
  // ... keep all existing codex, claudeAgent, gemini alias entries unchanged ...
  opencode: {}, // no aliases needed; slugs are already in canonical "provider/model" form
};

// Update PROVIDER_DISPLAY_NAMES:
export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  gemini: "Gemini",
  opencode: "OpenCode",
};
```

- [ ] **Step 3: Run typecheck to confirm contracts compile**

```bash
cd /path/to/t3code && bun typecheck
```

Expected: passes (or only errors in files that haven't been updated yet — that's fine at this stage).

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/orchestration.ts packages/contracts/src/model.ts
git commit -m "feat(contracts): add opencode to ProviderKind and model schemas"
```

---

## Task 2: Add `OpenCodeSettings` to contracts/settings.ts

**Files:**

- Modify: `packages/contracts/src/settings.ts`

- [ ] **Step 1: Add `OpenCodeSettings` schema**

After `GeminiSettings` (around line 88), add:

```typescript
export const OpenCodeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: makeBinaryPathSetting("opencode"),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),
});
export type OpenCodeSettings = typeof OpenCodeSettings.Type;
```

- [ ] **Step 2: Add opencode to `ServerSettings.providers` struct**

Change the `providers` field in `ServerSettings` (around line 127):

```typescript
providers: Schema.Struct({
  codex: CodexSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  claudeAgent: ClaudeSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  gemini: GeminiSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  opencode: OpenCodeSettings.pipe(Schema.withDecodingDefault(() => ({}))),
}).pipe(Schema.withDecodingDefault(() => ({}))),
```

- [ ] **Step 3: Add opencode to `ServerSettingsPatch`**

After `GeminiSettingsPatch` definition, add:

```typescript
const OpenCodeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});
```

And add `opencode: Schema.optionalKey(OpenCodeSettingsPatch)` inside the `providers` struct in `ServerSettingsPatch`.

Also add to `ModelSelectionPatch` union:

```typescript
Schema.Struct({
  provider: Schema.optionalKey(Schema.Literal("opencode")),
  model: Schema.optionalKey(TrimmedNonEmptyString),
  options: Schema.optionalKey(Schema.Struct({})),
}),
```

- [ ] **Step 4: Run typecheck**

```bash
bun typecheck
```

Expected: passes for contracts package.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/settings.ts
git commit -m "feat(contracts): add OpenCodeSettings schema"
```

---

## Task 3: Create `OpenCodeAppServerManager` — subprocess + HTTP client

**Files:**

- Create: `apps/server/src/provider/Layers/OpenCodeAppServerManager.ts`

- [ ] **Step 1: Create the file**

```typescript
/**
 * OpenCodeAppServerManager - Manages the `opencode serve` subprocess and
 * provides a typed HTTP client for communicating with its REST API.
 *
 * One server process is shared across all OpenCode threads in a single
 * Bird Code server session. The port is resolved dynamically starting from
 * 4096 and incrementing on conflict.
 *
 * @module OpenCodeAppServerManager
 */
import { Effect, Ref, Scope } from "effect";
import { type ChildProcess as NodeChildProcess, spawn } from "node:child_process";

const STARTING_PORT = 4096;
const MAX_PORT_ATTEMPTS = 20;
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_MAX_MS = 10_000;

export interface OpenCodeHttpClient {
  readonly baseUrl: string;
  readonly get: <T>(path: string) => Promise<T>;
  readonly post: <T>(path: string, body?: unknown) => Promise<T>;
  readonly delete: (path: string) => Promise<void>;
  readonly patch: <T>(path: string, body?: unknown) => Promise<T>;
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(300),
    });
    // If something responds, port is taken
    return !res.ok;
  } catch {
    return true; // ECONNREFUSED means port is free
  }
}

async function findFreePort(): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = STARTING_PORT + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error("Could not find a free port for opencode serve");
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(
    `opencode server at ${baseUrl} did not become healthy within ${HEALTH_POLL_MAX_MS}ms`,
  );
}

function makeHttpClient(baseUrl: string): OpenCodeHttpClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`opencode HTTP ${method} ${path} → ${res.status}: ${text}`);
    }
    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    baseUrl,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    delete: (path) => request<void>("DELETE", path),
    patch: (path, body) => request("PATCH", path, body ?? {}),
  };
}

export interface OpenCodeServerHandle {
  readonly client: OpenCodeHttpClient;
  readonly stop: () => void;
}

/**
 * Spawns `opencode serve` and waits until healthy. Returns a handle with an
 * HTTP client and a stop function. Meant to be called once and reused.
 */
export async function startOpenCodeServer(binaryPath: string): Promise<OpenCodeServerHandle> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child: NodeChildProcess = spawn(binaryPath, ["serve", "--port", String(port)], {
    stdio: "ignore",
    detached: false,
  });

  // Propagate child exit as an unhandled error for diagnostics
  child.on("error", (err) => {
    console.error("[OpenCodeAppServerManager] child process error:", err);
  });

  await waitForHealth(baseUrl);

  return {
    client: makeHttpClient(baseUrl),
    stop: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
    },
  };
}

/**
 * Effect-managed singleton handle. Acquired once per server session scope.
 * Exposes a Ref so adapters can obtain the client without re-spawning.
 */
export const makeOpenCodeServerHandleRef = (binaryPath: string) =>
  Effect.gen(function* () {
    const handleRef = yield* Ref.make<OpenCodeServerHandle | null>(null);

    const getOrStart = Effect.gen(function* () {
      const existing = yield* Ref.get(handleRef);
      if (existing) return existing;
      const handle = yield* Effect.promise(() => startOpenCodeServer(binaryPath));
      yield* Ref.set(handleRef, handle);
      return handle;
    });

    const stop = Effect.gen(function* () {
      const handle = yield* Ref.get(handleRef);
      handle?.stop();
      yield* Ref.set(handleRef, null);
    });

    return { getOrStart, stop };
  });
```

- [ ] **Step 2: Verify file compiles**

```bash
bun typecheck
```

Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/provider/Layers/OpenCodeAppServerManager.ts
git commit -m "feat(server): add OpenCodeAppServerManager subprocess + HTTP client"
```

---

## Task 4: Create `OpenCodeProvider` service tag + snapshot loader

**Files:**

- Create: `apps/server/src/provider/Services/OpenCodeProvider.ts`
- Create: `apps/server/src/provider/Layers/OpenCodeProvider.ts`

- [ ] **Step 1: Create the service tag**

`apps/server/src/provider/Services/OpenCodeProvider.ts`:

```typescript
/**
 * OpenCodeProvider - Service tag for OpenCode provider snapshot.
 * Mirrors GeminiProvider/ClaudeProvider/CodexProvider service contracts.
 *
 * @module OpenCodeProvider
 */
import { ServiceMap } from "effect";
import type { ServerProvider } from "@t3tools/contracts";

export interface OpenCodeProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class OpenCodeProvider extends ServiceMap.Service<OpenCodeProvider, OpenCodeProviderShape>()(
  "t3/provider/Services/OpenCodeProvider",
) {}
```

- [ ] **Step 2: Create the snapshot Layer**

`apps/server/src/provider/Layers/OpenCodeProvider.ts`:

```typescript
/**
 * OpenCodeProvider Layer — loads snapshot for the OpenCode provider.
 *
 * Checks `opencode --version` for install status, then fetches models from
 * the running server's GET /config/providers endpoint (started lazily).
 * Falls back to OPENCODE_CURATED_MODELS if the server is not reachable.
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

/** Static fallback list used when opencode server is not reachable. */
export const OPENCODE_CURATED_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "moonshot/kimi-k2-5",
    name: "Kimi K2.5 (Moonshot)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "anthropic/claude-opus-4",
    name: "Claude Opus 4 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "anthropic/claude-haiku-4",
    name: "Claude Haiku 4 (Anthropic)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  { slug: "openai/gpt-4o", name: "GPT-4o (OpenAI)", isCustom: false, capabilities: EMPTY_CAPS },
  { slug: "openai/o3", name: "o3 (OpenAI)", isCustom: false, capabilities: EMPTY_CAPS },
  { slug: "openai/o4-mini", name: "o4-mini (OpenAI)", isCustom: false, capabilities: EMPTY_CAPS },
  {
    slug: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro (Google)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Google)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "mistral/mistral-large",
    name: "Mistral Large",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  {
    slug: "meta-llama/llama-3.3-70b",
    name: "Llama 3.3 70B (Meta)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
  { slug: "deepseek/deepseek-r1", name: "DeepSeek R1", isCustom: false, capabilities: EMPTY_CAPS },
  { slug: "qwen/qwen-2.5-72b", name: "Qwen 2.5 72B", isCustom: false, capabilities: EMPTY_CAPS },
  { slug: "xai/grok-3", name: "Grok 3 (xAI)", isCustom: false, capabilities: EMPTY_CAPS },
  {
    slug: "cohere/command-r-plus",
    name: "Command R+ (Cohere)",
    isCustom: false,
    capabilities: EMPTY_CAPS,
  },
];

/**
 * Attempt to fetch available models from running opencode server.
 * Returns null if unreachable (caller falls back to curated list).
 */
async function fetchServerModels(
  baseUrl: string,
): Promise<ReadonlyArray<ServerProviderModel> | null> {
  try {
    const res = await fetch(`${baseUrl}/config/providers`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      providers?: Array<{ id: string; models?: Array<{ id: string; name?: string }> }>;
    };
    if (!Array.isArray(data.providers)) return null;
    const models: ServerProviderModel[] = [];
    for (const provider of data.providers) {
      for (const model of provider.models ?? []) {
        const slug = `${provider.id}/${model.id}`;
        models.push({
          slug,
          name: model.name ?? slug,
          isCustom: false,
          capabilities: EMPTY_CAPS,
        });
      }
    }
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
}

/**
 * Attempt to read user's default model from running opencode server config.
 * Returns null if unavailable.
 */
async function fetchDefaultModel(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/config`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { model?: string; default?: { model?: string } };
    return data.model ?? data.default?.model ?? null;
  } catch {
    return null;
  }
}

function runOpenCodeCommand(binaryPath: string, args: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const command = ChildProcess.make(binaryPath, [...args], {
      shell: process.platform === "win32",
    });
    return yield* spawnAndCollect(binaryPath, command);
  });
}

export const checkOpenCodeProviderStatus = (serverBaseUrl?: string) =>
  Effect.fn("checkOpenCodeProviderStatus")(function* () {
    const openCodeSettings = yield* Effect.service(ServerSettingsService).pipe(
      Effect.flatMap((service) => service.getSettings),
      Effect.map((settings) => settings.providers.opencode),
    );
    const checkedAt = new Date().toISOString();

    // Attempt to get live models from running server; fall back to curated list
    const liveModels = serverBaseUrl ? await fetchServerModels(serverBaseUrl) : null;
    const builtInModels = liveModels ?? OPENCODE_CURATED_MODELS;
    const models = providerModelsFromSettings(
      builtInModels,
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

    const versionProbe = yield* runOpenCodeCommand(openCodeSettings.binaryPath, ["--version"]).pipe(
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

    const checkProvider = checkOpenCodeProviderStatus()(undefined).pipe(
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
```

- [ ] **Step 3: Run typecheck**

```bash
bun typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Services/OpenCodeProvider.ts apps/server/src/provider/Layers/OpenCodeProvider.ts
git commit -m "feat(server): add OpenCodeProvider snapshot loader with model fetch + curated fallback"
```

---

## Task 5: Create `OpenCodeAdapter` service tag + implementation

**Files:**

- Create: `apps/server/src/provider/Services/OpenCodeAdapter.ts`
- Create: `apps/server/src/provider/Layers/OpenCodeAdapter.ts`

- [ ] **Step 1: Create the service tag**

`apps/server/src/provider/Services/OpenCodeAdapter.ts`:

```typescript
/**
 * OpenCodeAdapter - Service tag for OpenCode provider adapter.
 * Mirrors GeminiAdapter/ClaudeAdapter/CodexAdapter service contracts.
 *
 * @module OpenCodeAdapter
 */
import { ServiceMap } from "effect";
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface OpenCodeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "opencode";
}

export class OpenCodeAdapter extends ServiceMap.Service<OpenCodeAdapter, OpenCodeAdapterShape>()(
  "t3/provider/Services/OpenCodeAdapter",
) {}
```

- [ ] **Step 2: Create the adapter Layer**

`apps/server/src/provider/Layers/OpenCodeAdapter.ts`:

```typescript
/**
 * OpenCodeAdapter Layer — implements ProviderAdapterShape for OpenCode.
 *
 * Spawns `opencode serve` via OpenCodeAppServerManager, then communicates
 * via REST (sessions, prompts, abort, permissions) and SSE (event stream).
 * Translates OpenCode HTTP/SSE events into canonical ProviderRuntimeEvents.
 *
 * @module OpenCodeAdapterLive
 */
import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderTurnStartResult,
  ProviderUserInputAnswers,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import { ProviderAdapterSessionNotFoundError } from "../Errors.ts";
import { OpenCodeAdapter, type OpenCodeAdapterShape } from "../Services/OpenCodeAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import {
  makeOpenCodeServerHandleRef,
  type OpenCodeServerHandle,
} from "./OpenCodeAppServerManager.ts";

const PROVIDER = "opencode" as const satisfies ProviderKind;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenCodeSession {
  readonly opencodeSessionId: string; // ID returned by POST /sessions
  readonly providerSession: ProviderSession;
  readonly modelSlug: string;
  readonly pendingPermissions: Map<string, string>; // permissionId → requestId
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}
function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

function makeThreadEvent<T extends ProviderRuntimeEvent["type"]>(
  type: T,
  threadId: ThreadId,
  payload: Extract<ProviderRuntimeEvent, { type: T }>["payload"],
  turnId?: TurnId,
): Extract<ProviderRuntimeEvent, { type: T }> {
  return {
    eventId: newEventId() as Extract<ProviderRuntimeEvent, { type: T }>["eventId"],
    provider: PROVIDER,
    threadId,
    createdAt: nowIso(),
    ...(turnId ? { turnId } : {}),
    type,
    payload,
  } as Extract<ProviderRuntimeEvent, { type: T }>;
}

/**
 * Parse model string "provider/model" into { providerID, modelID }.
 * E.g. "anthropic/claude-sonnet-4-5" → { providerID: "anthropic", modelID: "claude-sonnet-4-5" }
 */
function parseModelSlug(slug: string): { providerID: string; modelID: string } {
  const slash = slug.indexOf("/");
  if (slash === -1) return { providerID: "anthropic", modelID: slug };
  return { providerID: slug.slice(0, slash), modelID: slug.slice(slash + 1) };
}

/**
 * Lightweight SSE line parser. Calls onEvent for each complete `data:` line.
 * Runs as a streaming fetch consumer.
 */
async function consumeSse(
  url: string,
  onEvent: (type: string, data: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data:")) {
        try {
          const payload = JSON.parse(line.slice(5).trim()) as {
            type?: string;
            properties?: unknown;
          };
          onEvent(payload.type ?? "unknown", payload.properties ?? {});
        } catch {
          /* malformed line — skip */
        }
      }
    }
  }
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export const OpenCodeAdapterLive = Layer.effect(
  OpenCodeAdapter,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const settings = yield* serverSettings.getSettings;
    const openCodeSettings = settings.providers.opencode;

    // Shared server handle (spawned lazily on first startSession)
    const serverHandleManager = yield* makeOpenCodeServerHandleRef(openCodeSettings.binaryPath);

    // Session state: threadId → OpenCodeSession
    const sessionsRef = yield* Ref.make(new Map<ThreadId, OpenCodeSession>());

    // Canonical event bus
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    // Active SSE abort controllers keyed by threadId
    const sseControllers = new Map<ThreadId, AbortController>();

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSession = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((m) => m.get(threadId)));

    // ── SSE subscription ──────────────────────────────────────────────────────

    /**
     * Subscribe to the opencode SSE stream and emit canonical events.
     * Runs in a forked fiber; reconnects up to 3 times on disconnect.
     */
    const subscribeToSse = (
      handle: OpenCodeServerHandle,
      opencodeSessionId: string,
      threadId: ThreadId,
      turnIdRef: { current: TurnId | undefined },
    ) =>
      Effect.promise(async () => {
        const url = `${handle.client.baseUrl}/events/subscribe?sessionId=${opencodeSessionId}`;
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (attempts < MAX_ATTEMPTS) {
          const controller = new AbortController();
          sseControllers.set(threadId, controller);
          try {
            await consumeSse(
              url,
              (type, props) => {
                const p = props as Record<string, unknown>;
                const turnId = turnIdRef.current;

                switch (type) {
                  case "session.updated": {
                    if (p["status"] === "running" && turnId) {
                      void Effect.runPromise(
                        emitEvent(
                          makeThreadEvent("turn.started", threadId, { model: undefined }, turnId),
                        ),
                      );
                    }
                    if (p["status"] === "idle" && turnId) {
                      void Effect.runPromise(
                        emitEvent(
                          makeThreadEvent("turn.completed", threadId, { usage: undefined }, turnId),
                        ),
                      );
                      turnIdRef.current = undefined;
                    }
                    break;
                  }
                  case "message.part.text": {
                    if (turnId && typeof p["text"] === "string") {
                      void Effect.runPromise(
                        emitEvent(
                          makeThreadEvent(
                            "content.delta",
                            threadId,
                            { delta: p["text"] as string },
                            turnId,
                          ),
                        ),
                      );
                    }
                    break;
                  }
                  case "message.completed": {
                    if (turnId) {
                      void Effect.runPromise(
                        emitEvent(
                          makeThreadEvent("turn.completed", threadId, { usage: undefined }, turnId),
                        ),
                      );
                      turnIdRef.current = undefined;
                    }
                    break;
                  }
                  case "session.error": {
                    const msg =
                      typeof p["message"] === "string" ? p["message"] : "OpenCode session error";
                    void Effect.runPromise(
                      emitEvent(makeThreadEvent("turn.error", threadId, { message: msg }, turnId)),
                    );
                    break;
                  }
                  case "permission.requested": {
                    const permissionId = typeof p["id"] === "string" ? p["id"] : "";
                    const detail = typeof p["detail"] === "string" ? p["detail"] : undefined;
                    void Effect.runPromise(
                      emitEvent(
                        makeThreadEvent(
                          "request.opened",
                          threadId,
                          {
                            requestId:
                              permissionId as import("@t3tools/contracts").ApprovalRequestId,
                            requestKind: "command",
                            detail,
                            createdAt: nowIso(),
                          },
                          turnId,
                        ),
                      ),
                    );
                    break;
                  }
                  default:
                    // Unknown events: log and pass through silently
                    break;
                }
              },
              controller.signal,
            );
            break; // clean disconnect
          } catch (err) {
            attempts++;
            if (attempts >= MAX_ATTEMPTS) {
              void Effect.runPromise(
                emitEvent(
                  makeThreadEvent("turn.error", threadId, {
                    message: `SSE stream disconnected after ${MAX_ATTEMPTS} attempts.`,
                  }),
                ),
              );
            } else {
              await new Promise((r) => setTimeout(r, 1000 * attempts));
            }
          } finally {
            sseControllers.delete(threadId);
          }
        }
      });

    // ── Adapter methods ───────────────────────────────────────────────────────

    const startSession: OpenCodeAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const handle = yield* serverHandleManager.getOrStart;
        const modelSlug = input.modelSelection?.model ?? "moonshot/kimi-k2-5";

        // Attempt to resolve user's configured default from server config
        const serverDefaultModel = yield* Effect.promise(async () => {
          try {
            const config = await handle.client.get<{ model?: string }>("/config");
            return config.model ?? null;
          } catch {
            return null;
          }
        });
        const resolvedModel =
          input.modelSelection?.model ?? serverDefaultModel ?? "moonshot/kimi-k2-5";

        const opencodeSession = yield* Effect.promise(() =>
          handle.client.post<{ id: string }>("/sessions", {
            title: `thread-${input.threadId}`,
          }),
        );
        const opencodeSessionId = opencodeSession.id;

        const now = nowIso();
        const providerSession: ProviderSession = {
          provider: PROVIDER,
          status: "ready",
          runtimeMode: input.runtimeMode,
          threadId: input.threadId,
          cwd: input.cwd,
          model: resolvedModel,
          resumeCursor: input.resumeCursor,
          createdAt: now,
          updatedAt: now,
        };

        const session: OpenCodeSession = {
          opencodeSessionId,
          providerSession,
          modelSlug: resolvedModel,
          pendingPermissions: new Map(),
        };

        yield* Ref.update(sessionsRef, (m) => {
          const next = new Map(m);
          next.set(input.threadId, session);
          return next;
        });

        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "OpenCode session started.",
            ...(input.resumeCursor !== undefined ? { resume: input.resumeCursor } : {}),
          }),
        );
        yield* emitEvent(
          makeThreadEvent("thread.started", input.threadId, {
            providerThreadId: opencodeSessionId,
          }),
        );

        return providerSession;
      });

    const sendTurn: OpenCodeAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const session = yield* getSession(input.threadId);
        if (!session) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }
        const handle = yield* serverHandleManager.getOrStart;
        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const modelSlug = input.modelSelection?.model ?? session.modelSlug;
        const { providerID, modelID } = parseModelSlug(modelSlug);

        // Keep a mutable ref so SSE callbacks can set the current turnId
        const turnIdRef: { current: TurnId | undefined } = { current: turnId };

        // Start SSE listener before submitting prompt to avoid race
        yield* subscribeToSse(handle, session.opencodeSessionId, input.threadId, turnIdRef).pipe(
          Effect.forkScoped,
        );

        yield* emitEvent(
          makeThreadEvent("turn.started", input.threadId, { model: modelSlug }, turnId),
        );

        yield* Effect.promise(() =>
          handle.client.post(`/sessions/${session.opencodeSessionId}/prompt`, {
            prompt: typeof input.input === "string" ? input.input : "",
            model: { providerID, modelID },
          }),
        );

        return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
      });

    const interruptTurn: OpenCodeAdapterShape["interruptTurn"] = (threadId) =>
      Effect.gen(function* () {
        const session = yield* getSession(threadId);
        if (!session) return;
        const handle = yield* serverHandleManager.getOrStart;
        // Abort SSE stream first
        sseControllers.get(threadId)?.abort();
        yield* Effect.promise(() =>
          handle.client.post(`/sessions/${session.opencodeSessionId}/abort`),
        ).pipe(Effect.orElse(() => Effect.void));
      });

    const respondToRequest: OpenCodeAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      Effect.gen(function* () {
        const session = yield* getSession(threadId);
        if (!session) return;
        const handle = yield* serverHandleManager.getOrStart;
        const permissionId = requestId as string;
        // OpenCode accepts { approved: boolean } for permission responses
        yield* Effect.promise(() =>
          handle.client.post(`/sessions/${session.opencodeSessionId}/permissions/${permissionId}`, {
            approved: decision === "accept" || decision === "acceptForSession",
          }),
        ).pipe(Effect.orElse(() => Effect.void));
      });

    const respondToUserInput: OpenCodeAdapterShape["respondToUserInput"] = (
      _threadId,
      _requestId,
      _answers,
    ) =>
      // OpenCode does not have a user-input request protocol in v1; no-op
      Effect.void;

    const stopSession: OpenCodeAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const session = yield* getSession(threadId);
        if (!session) return;
        sseControllers.get(threadId)?.abort();
        const handle = yield* serverHandleManager.getOrStart;
        yield* Effect.promise(() =>
          handle.client.delete(`/sessions/${session.opencodeSessionId}`),
        ).pipe(Effect.orElse(() => Effect.void));
        yield* Ref.update(sessionsRef, (m) => {
          const next = new Map(m);
          next.delete(threadId);
          return next;
        });
      });

    const listSessions: OpenCodeAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((m) => Array.from(m.values()).map((s) => s.providerSession)),
      );

    const hasSession: OpenCodeAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((m) => m.has(threadId)));

    const readThread: OpenCodeAdapterShape["readThread"] = (threadId) =>
      Effect.gen(function* () {
        const session = yield* getSession(threadId);
        if (!session) {
          return yield* new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        // Return a minimal snapshot — turns are tracked server-side by opencode
        return { threadId, turns: [] };
      });

    const rollbackThread: OpenCodeAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const session = yield* getSession(threadId);
        if (!session) {
          return yield* new ProviderAdapterSessionNotFoundError({ provider: PROVIDER, threadId });
        }
        const handle = yield* serverHandleManager.getOrStart;
        // Revert N times
        for (let i = 0; i < numTurns; i++) {
          yield* Effect.promise(() =>
            handle.client.post(`/sessions/${session.opencodeSessionId}/revert`),
          ).pipe(Effect.orElse(() => Effect.void));
        }
        return { threadId, turns: [] };
      });

    const stopAll: OpenCodeAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const threadId of sessions.keys()) {
          yield* stopSession(threadId);
        }
        yield* serverHandleManager.stop;
      });

    const refreshRateLimits: OpenCodeAdapterShape["refreshRateLimits"] = (_threadId) =>
      // OpenCode does not expose rate limit info in v1
      Effect.void;

    return {
      provider: PROVIDER,
      capabilities: {
        // Model set per-prompt; session restart is trivial
        sessionModelSwitch: "restart-session",
      },
      startSession,
      sendTurn,
      interruptTurn,
      respondToRequest,
      respondToUserInput,
      stopSession,
      listSessions,
      hasSession,
      readThread,
      rollbackThread,
      stopAll,
      refreshRateLimits,
      get streamEvents() {
        return Stream.fromPubSub(eventsPubSub);
      },
    } satisfies OpenCodeAdapterShape;
  }),
);
```

- [ ] **Step 3: Run typecheck**

```bash
bun typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Services/OpenCodeAdapter.ts apps/server/src/provider/Layers/OpenCodeAdapter.ts
git commit -m "feat(server): add OpenCodeAdapter with HTTP+SSE ProviderAdapterShape implementation"
```

---

## Task 6: Wire OpenCode into ProviderRegistry + ProviderAdapterRegistry

**Files:**

- Modify: `apps/server/src/provider/Layers/ProviderRegistry.ts`
- Modify: `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`

- [ ] **Step 1: Update `ProviderRegistry.ts`**

Add OpenCode imports and wire into load/sync/refresh:

```typescript
// Add imports after GeminiProviderLive:
import { OpenCodeProviderLive } from "./OpenCodeProvider";
import type { OpenCodeProviderShape } from "../Services/OpenCodeProvider";
import { OpenCodeProvider } from "../Services/OpenCodeProvider";

// Update loadProviders signature:
const loadProviders = (
  codexProvider: CodexProviderShape,
  claudeProvider: ClaudeProviderShape,
  geminiProvider: GeminiProviderShape,
  openCodeProvider: OpenCodeProviderShape,
): Effect.Effect<readonly [ServerProvider, ServerProvider, ServerProvider, ServerProvider]> =>
  Effect.all(
    [codexProvider.getSnapshot, claudeProvider.getSnapshot, geminiProvider.getSnapshot, openCodeProvider.getSnapshot],
    { concurrency: "unbounded" },
  );

// In ProviderRegistryLive Effect.gen, add:
const openCodeProvider = yield* OpenCodeProvider;
// Update all calls to loadProviders to pass openCodeProvider as 4th arg.

// Update refresh switch:
case "opencode":
  yield* openCodeProvider.refresh;
  break;
// Update default branch:
default:
  yield* Effect.all(
    [codexProvider.refresh, claudeProvider.refresh, geminiProvider.refresh, openCodeProvider.refresh],
    { concurrency: "unbounded" },
  );
  break;

// Update streamChanges subscriptions:
yield* Stream.runForEach(openCodeProvider.streamChanges, () => syncProviders()).pipe(Effect.forkScoped);

// Update Layer.provideMerge chain at the bottom:
.pipe(
  Layer.provideMerge(CodexProviderLive),
  Layer.provideMerge(ClaudeProviderLive),
  Layer.provideMerge(GeminiProviderLive),
  Layer.provideMerge(OpenCodeProviderLive),
)
```

- [ ] **Step 2: Update `ProviderAdapterRegistry.ts`**

```typescript
// Add import:
import { OpenCodeAdapter } from "../Services/OpenCodeAdapter.ts";

// Update adapters list in makeProviderAdapterRegistry:
const adapters =
  options?.adapters !== undefined
    ? options.adapters
    : [yield * CodexAdapter, yield * ClaudeAdapter, yield * GeminiAdapter, yield * OpenCodeAdapter];
```

Also update `ProviderAdapterRegistryLive` to provide the `OpenCodeAdapterLive` layer:

```typescript
// Find where ProviderAdapterRegistryLive is exported and ensure
// OpenCodeAdapterLive is provided via Layer.provideMerge or in server.ts
```

Check `apps/server/src/server.ts` to see how adapters are provided — add `OpenCodeAdapterLive` in the same pattern as `GeminiAdapterLive`.

- [ ] **Step 3: Run typecheck**

```bash
bun typecheck
```

Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Layers/ProviderRegistry.ts apps/server/src/provider/Layers/ProviderAdapterRegistry.ts
git commit -m "feat(server): wire OpenCode into ProviderRegistry and ProviderAdapterRegistry"
```

---

## Task 7: Update Web — session-logic + providerModels

**Files:**

- Modify: `apps/web/src/session-logic.ts`
- Modify: `apps/web/src/providerModels.ts`

- [ ] **Step 1: Add opencode to `PROVIDER_OPTIONS` in `session-logic.ts`**

```typescript
// Change PROVIDER_OPTIONS:
export const PROVIDER_OPTIONS: Array<{
  value: ProviderPickerKind;
  label: string;
  available: boolean;
}> = [
  { value: "codex", label: "Codex", available: true },
  { value: "claudeAgent", label: "Claude", available: true },
  { value: "gemini", label: "Gemini", available: true },
  { value: "opencode", label: "OpenCode", available: true }, // ← add this
  { value: "cursor", label: "Cursor", available: false },
];
```

- [ ] **Step 2: Verify `providerModels.ts` functions work with opencode**

Open `apps/web/src/providerModels.ts`. These functions use `Record<ProviderKind, …>` lookups. Because we've added `"opencode"` to the `ProviderKind` union and to all record defaults in contracts, these should work without changes. Run typecheck to confirm:

```bash
bun typecheck
```

If any function has a switch/case or explicit union check over `ProviderKind`, add the `"opencode"` case.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/session-logic.ts apps/web/src/providerModels.ts
git commit -m "feat(web): add opencode to PROVIDER_OPTIONS"
```

---

## Task 8: Update `ProviderModelPicker` — add OpenCode tab + model search bar

**Files:**

- Modify: `apps/web/src/components/chat/ProviderModelPicker.tsx`

- [ ] **Step 1: Add OpenCode to the provider icon map and remove the "coming soon" entry**

Find and update these sections:

```typescript
// 1. Add OpenCode to PROVIDER_ICON_BY_PROVIDER:
const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  cursor: CursorIcon,
  opencode: OpenCodeIcon, // ← add this (OpenCodeIcon already imported)
};

// 2. Remove COMING_SOON_PROVIDER_OPTIONS entirely:
// Delete these lines:
// const COMING_SOON_PROVIDER_OPTIONS = [
//   { id: "opencode", label: "OpenCode", icon: OpenCodeIcon },
// ] as const;
```

- [ ] **Step 2: Add model search state + search bar component**

Add search state at the top of the `ProviderModelPicker` component:

```typescript
const [modelSearchQuery, setModelSearchQuery] = useState("");
```

Add a computed filtered model list:

```typescript
const openCodeModels = getProviderModelsForProvider(modelOptionsByProvider, "opencode");
const filteredOpenCodeModels =
  modelSearchQuery.trim().length === 0
    ? openCodeModels
    : openCodeModels.filter(
        (m) =>
          m.label.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
          m.value.toLowerCase().includes(modelSearchQuery.toLowerCase()),
      );
```

- [ ] **Step 3: Add OpenCode model picker with inline search bar**

Inside the provider menu render, add OpenCode as a menu item that shows a sub-menu (or inline panel) with a search bar and model list. Locate where the existing provider menu items are rendered (the `MenuRadioGroup` or `MenuGroup` blocks) and add:

```tsx
{
  /* OpenCode provider section */
}
<MenuSub>
  <MenuSubTrigger>
    <OpenCodeIcon className="size-4" />
    OpenCode
  </MenuSubTrigger>
  <MenuSubPopup>
    {/* Model search input */}
    <div className="px-2 py-1.5">
      <Input
        autoFocus
        placeholder="Search models…"
        value={modelSearchQuery}
        onChange={(e) => setModelSearchQuery(e.target.value)}
        className="h-7 text-xs"
      />
    </div>
    <MenuDivider />
    <MenuRadioGroup
      value={provider === "opencode" ? model : ""}
      onValueChange={(value) => {
        setModelSearchQuery("");
        onProviderModelChange("opencode", value);
        setIsMenuOpen(false);
      }}
    >
      {filteredOpenCodeModels.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted-foreground">No models found</div>
      )}
      {filteredOpenCodeModels.map((m) => (
        <MenuRadioItem key={m.value} value={m.value}>
          {m.label}
        </MenuRadioItem>
      ))}
    </MenuRadioGroup>
  </MenuSubPopup>
</MenuSub>;
```

Reset `modelSearchQuery` when the menu closes:

```typescript
// In the onOpenChange handler (or wherever setIsMenuOpen(false) is called):
setModelSearchQuery("");
```

- [ ] **Step 4: Run typecheck + lint**

```bash
bun typecheck && bun lint
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ProviderModelPicker.tsx
git commit -m "feat(web): add OpenCode to model picker with searchable model list"
```

---

## Task 9: Final verification pass

- [ ] **Step 1: Run full typecheck + lint**

```bash
bun typecheck && bun lint
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Run tests**

```bash
bun run test
```

Expected: all existing tests pass (no regressions). OpenCode has no unit tests yet — that's acceptable for this integration; snapshot/adapter tests can be added in a follow-up.

- [ ] **Step 3: Manual smoke test**

1. Start the Bird Code server: `bun run dev` (or the project's equivalent)
2. Open the web app
3. Open the provider picker — verify OpenCode appears alongside Codex/Claude/Gemini
4. With opencode CLI installed: verify the provider shows as "ready" in the status banner
5. Without opencode CLI: verify the status shows the install message
6. Select OpenCode + type in the model search bar — verify filtering works
7. Select a model and send a prompt — verify streaming output appears
8. Interrupt a turn — verify abort works
9. Switch to another provider — verify it still works (no regressions)

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any remaining changes
git commit -m "feat: add OpenCode as fourth provider with HTTP+SSE streaming and model search"
```

---

## Notes

- **SSE event type names**: The exact names (`session.updated`, `message.part.text`, etc.) are inferred from the OpenCode SDK docs and may need adjusting once tested against a live server. The adapter uses a safe `default: break` for unknown events.
- **Server lifecycle**: `opencode serve` is spawned lazily on first `startSession` call. If the server fails to start, the error surfaces as a `turn.error` event and the session is not created.
- **Auth**: OpenCode manages its own credentials via `opencode auth`. Bird Code does not proxy auth — users set it up in their terminal. The provider snapshot will reflect `auth.status: "unknown"` since we cannot easily introspect it without an API.
- **Default model**: On `startSession`, the adapter calls `GET /config` to resolve the user's configured default. If unavailable, it falls back to `moonshot/kimi-k2-5`.
