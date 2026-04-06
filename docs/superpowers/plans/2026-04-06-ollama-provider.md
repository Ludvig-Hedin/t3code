# Ollama Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ollama as a first-class provider — selectable from the model picker in chat, showing live installed models, with pull/quit controls — wired through all 5 layers exactly as Codex/Claude/Gemini are.

**Architecture:** The Ollama adapter talks directly to `http://localhost:11434` via `fetch` (no CLI binary). Models are discovered live from `GET /api/tags`. Full multi-turn conversation history is maintained per session in a `messages[]` array. Two new RPC methods (`ollama.pullModel`, `ollama.quitServer`) are added to the existing Effect RPC group for UI model management.

**Tech Stack:** Effect (Schema, Layer, Ref, PubSub, Stream), Node.js `fetch`, React, Tailwind, lucide-react icons

---

## File Map

| Path                                                         | Create / Modify | Responsibility                                                                                                         |
| ------------------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/orchestration.ts`                    | Modify          | Add `"ollama"` to `ProviderKind` literal                                                                               |
| `packages/contracts/src/model.ts`                            | Modify          | `OllamaModelOptions`, defaults, display name, aliases                                                                  |
| `packages/contracts/src/settings.ts`                         | Modify          | `OllamaSettings` schema + `ServerSettings.providers.ollama` + patch schemas                                            |
| `packages/contracts/src/rpc.ts`                              | Modify          | `WS_METHODS.ollamaPullModel/quitServer`, two `Rpc.make` definitions, add to `WsRpcGroup`                               |
| `apps/server/src/provider/Services/OllamaProvider.ts`        | Create          | Service tag for snapshot                                                                                               |
| `apps/server/src/provider/Services/OllamaAdapter.ts`         | Create          | Service tag for adapter                                                                                                |
| `apps/server/src/provider/Layers/OllamaProvider.ts`          | Create          | Health check via `GET /api/tags`, live model list                                                                      |
| `apps/server/src/provider/Layers/OllamaAdapter.ts`           | Create          | Full session lifecycle: startSession, sendTurn (SSE streaming), interruptTurn, stopSession, readThread, rollbackThread |
| `apps/server/src/provider/Layers/ProviderRegistry.ts`        | Modify          | Add OllamaProvider slot                                                                                                |
| `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` | Modify          | Add OllamaAdapter to default adapters                                                                                  |
| `apps/server/src/ws.ts`                                      | Modify          | Handle `ollama.pullModel` and `ollama.quitServer` RPC calls                                                            |
| `apps/web/src/providerModels.ts`                             | Modify          | Add `ollama` to `getProviderModelsByProvider`                                                                          |
| `apps/web/src/session-logic.ts`                              | Modify          | Add `"ollama"` to `PROVIDER_OPTIONS` and `ProviderPickerKind`                                                          |
| `apps/web/src/components/Icons.tsx`                          | Modify          | Add `OllamaIcon` SVG                                                                                                   |
| `apps/web/src/components/chat/ProviderModelPicker.tsx`       | Modify          | Ollama icon, install button, pull/quit menu items                                                                      |
| `apps/web/src/components/chat/PullModelDialog.tsx`           | Create          | Pull model dialog with curated list + text input                                                                       |
| `apps/web/src/wsRpcClient.ts`                                | Modify          | Typed client methods for `ollama.pullModel` and `ollama.quitServer`                                                    |

---

## Task 1: Extend `ProviderKind` in contracts

**Files:**

- Modify: `packages/contracts/src/orchestration.ts`

- [ ] **Step 1: Add `"ollama"` to the `ProviderKind` literal union and `DEFAULT_PROVIDER_KIND` guard**

Open `packages/contracts/src/orchestration.ts`. Find the `ProviderKind` definition (line 26) and `DEFAULT_PROVIDER_KIND` (line 42):

```ts
// Before
export const ProviderKind = Schema.Literals(["codex", "claudeAgent", "gemini"]);

// After
export const ProviderKind = Schema.Literals(["codex", "claudeAgent", "gemini", "ollama"]);
```

`DEFAULT_PROVIDER_KIND` stays `"codex"` — no change needed there.

- [ ] **Step 2: Run typecheck to confirm no breakage**

```bash
cd /path/to/repo && bun typecheck 2>&1 | head -40
```

Expected: errors only in files that now need `"ollama"` added (model.ts, settings.ts) — not panicked structural breaks.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/orchestration.ts
git commit -m "feat(contracts): add 'ollama' to ProviderKind"
```

---

## Task 2: Add Ollama model metadata to contracts

**Files:**

- Modify: `packages/contracts/src/model.ts`

- [ ] **Step 1: Add `OllamaModelOptions` and update all provider records**

Open `packages/contracts/src/model.ts`. Make these additions:

After `GeminiModelOptions` (around line 25):

```ts
export const OllamaModelOptions = Schema.Struct({});
export type OllamaModelOptions = typeof OllamaModelOptions.Type;
```

In `ProviderModelOptions.fields` struct, after `gemini`:

```ts
ollama: Schema.optional(OllamaModelOptions),
```

In `DEFAULT_MODEL_BY_PROVIDER`, after `gemini`:

```ts
ollama: "llama3.2",
```

In `DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER`, after `gemini`:

```ts
ollama: "llama3.2",
```

In `MODEL_SLUG_ALIASES_BY_PROVIDER`, after the `gemini` block:

```ts
ollama: {
  llama3: "llama3.2",
  qwen: "qwen2.5-coder",
  mistral: "mistral",
},
```

In `PROVIDER_DISPLAY_NAMES`, after `gemini`:

```ts
ollama: "Ollama",
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

Expected: remaining errors only in settings.ts (ollama missing from providers shape).

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/model.ts
git commit -m "feat(contracts): add OllamaModelOptions and defaults"
```

---

## Task 3: Add `OllamaSettings` to contracts settings schema

**Files:**

- Modify: `packages/contracts/src/settings.ts`

- [ ] **Step 1: Add `OllamaSettings` schema**

After the `GeminiSettings` block (around line 88):

```ts
export const OllamaSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  baseUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "http://localhost:11434")),
});
export type OllamaSettings = typeof OllamaSettings.Type;
```

- [ ] **Step 2: Add `ollama` to `ServerSettings.providers`**

In the `providers` struct inside `ServerSettings` (around line 127), after `gemini`:

```ts
ollama: OllamaSettings.pipe(Schema.withDecodingDefault(() => ({}))),
```

- [ ] **Step 3: Add `OllamaModelOptionsPatch` and wire into `ModelSelectionPatch`**

After `GeminiModelOptionsPatch` (around line 174):

```ts
const OllamaModelOptionsPatch = Schema.Struct({});
```

Add `ollama` variant to `ModelSelectionPatch` union (after the `gemini` struct in the `Schema.Union`):

```ts
Schema.Struct({
  provider: Schema.optionalKey(Schema.Literal("ollama")),
  model: Schema.optionalKey(TrimmedNonEmptyString),
  options: Schema.optionalKey(OllamaModelOptionsPatch),
}),
```

- [ ] **Step 4: Add `OllamaSettingsPatch` and wire into `ServerSettingsPatch`**

After `GeminiSettingsPatch` (around line 211):

```ts
const OllamaSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  baseUrl: Schema.optionalKey(Schema.String),
});
```

In `ServerSettingsPatch.fields.providers`, after `gemini`:

```ts
ollama: Schema.optionalKey(OllamaSettingsPatch),
```

- [ ] **Step 5: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

Expected: clean or only errors in server files that haven't been updated yet.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/settings.ts
git commit -m "feat(contracts): add OllamaSettings and patch schema"
```

---

## Task 4: Add `ollama.pullModel` and `ollama.quitServer` RPC methods

**Files:**

- Modify: `packages/contracts/src/rpc.ts`

- [ ] **Step 1: Add method name constants to `WS_METHODS`**

In `WS_METHODS` (around line 102), after the `pluginsRemove` entry and before `subscribeOrchestrationDomainEvents`:

```ts
// Ollama management methods
ollamaPullModel: "ollama.pullModel",
ollamaQuitServer: "ollama.quitServer",
```

- [ ] **Step 2: Add Rpc definitions**

After `WsPluginsRemoveRpc` (around line 507) and before `export const WsRpcGroup`:

```ts
// ── Ollama RPCs ─────────────────────────────────────────────────────────

export const WsOllamaPullModelRpc = Rpc.make(WS_METHODS.ollamaPullModel, {
  payload: Schema.Struct({ model: Schema.String }),
  success: Schema.Struct({ success: Schema.Boolean, error: Schema.optional(Schema.String) }),
});

export const WsOllamaQuitServerRpc = Rpc.make(WS_METHODS.ollamaQuitServer, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ success: Schema.Boolean, message: Schema.optional(Schema.String) }),
});
```

- [ ] **Step 3: Add to `WsRpcGroup`**

Inside `RpcGroup.make(...)`, add at the end before the closing `)`:

```ts
WsOllamaPullModelRpc,
WsOllamaQuitServerRpc,
```

- [ ] **Step 4: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

Expected: clean in contracts; errors in ws.ts (handler not yet implemented).

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/rpc.ts
git commit -m "feat(contracts): add ollama.pullModel and ollama.quitServer RPC methods"
```

---

## Task 5: Create `OllamaProvider` service and layer

**Files:**

- Create: `apps/server/src/provider/Services/OllamaProvider.ts`
- Create: `apps/server/src/provider/Layers/OllamaProvider.ts`

- [ ] **Step 1: Create the service interface**

Create `apps/server/src/provider/Services/OllamaProvider.ts`:

```ts
/**
 * OllamaProvider - Ollama HTTP server snapshot service.
 *
 * Probes the local Ollama server (GET /api/tags) to discover
 * installed models and report health status.
 *
 * @module OllamaProvider
 */
import { ServiceMap } from "effect";

import type { ServerProvider } from "@t3tools/contracts";

export interface OllamaProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class OllamaProvider extends ServiceMap.Service<OllamaProvider, OllamaProviderShape>()(
  "t3/provider/Services/OllamaProvider",
) {}
```

- [ ] **Step 2: Create the layer implementation**

Create `apps/server/src/provider/Layers/OllamaProvider.ts`:

```ts
/**
 * OllamaProviderLive - Probes local Ollama server for health and installed models.
 *
 * Unlike CLI-based providers, Ollama is an HTTP server. We call GET /api/tags
 * to list installed models. No binary path — just a configurable baseUrl.
 *
 * @module OllamaProviderLive
 */
import type { ModelCapabilities, OllamaSettings, ServerProviderModel } from "@t3tools/contracts";
import { APP_NAME } from "@t3tools/shared/branding";
import { Effect, Equal, Layer, Stream } from "effect";

import { buildServerProvider, providerModelsFromSettings } from "../providerSnapshot";
import { makeManagedServerProvider } from "../makeManagedServerProvider";
import { OllamaProvider } from "../Services/OllamaProvider";
import { ServerSettingsService } from "../../serverSettings";

const PROVIDER = "ollama" as const;
const DEFAULT_TIMEOUT_MS = 5_000;

const EMPTY_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

interface OllamaTagsResponse {
  models: Array<{ name: string; size: number; modified_at: string }>;
}

export const checkOllamaProviderStatus = Effect.fn("checkOllamaProviderStatus")(function* () {
  const ollamaSettings = yield* Effect.service(ServerSettingsService).pipe(
    Effect.flatMap((service) => service.getSettings),
    Effect.map((settings) => settings.providers.ollama),
  );
  const checkedAt = new Date().toISOString();

  if (!ollamaSettings.enabled) {
    return buildServerProvider({
      provider: PROVIDER,
      enabled: false,
      checkedAt,
      models: [],
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `Ollama is disabled in ${APP_NAME} settings.`,
      },
    });
  }

  const baseUrl = ollamaSettings.baseUrl;

  // Attempt to contact the Ollama server
  const tagsResult = yield* Effect.tryPromise({
    try: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      try {
        const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as OllamaTagsResponse;
      } finally {
        clearTimeout(timer);
      }
    },
    catch: (err) => err as Error,
  }).pipe(Effect.result);

  if (tagsResult._tag === "Failure") {
    const err = tagsResult.cause;
    const isConnRefused =
      String(err).includes("ECONNREFUSED") ||
      String(err).includes("fetch failed") ||
      String(err).includes("aborted");
    return buildServerProvider({
      provider: PROVIDER,
      enabled: true,
      checkedAt,
      models: [],
      probe: {
        installed: isConnRefused ? false : true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isConnRefused
          ? `Ollama is not running. Install it from ollama.com or start it with \`ollama serve\`.`
          : `Failed to reach Ollama at ${baseUrl}: ${String(err)}`,
      },
    });
  }

  const tagsData = tagsResult.value;
  const liveModels: ReadonlyArray<ServerProviderModel> = (tagsData.models ?? []).map((m) => ({
    slug: m.name,
    name: m.name,
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  }));

  // providerModelsFromSettings merges custom models; pass the live list as the "built-in" list
  // and an empty customModels array (Ollama has no custom models concept).
  const models = providerModelsFromSettings(liveModels, PROVIDER, []);

  return buildServerProvider({
    provider: PROVIDER,
    enabled: true,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: null,
      status: models.length === 0 ? "warning" : "ready",
      auth: { status: "unknown" },
      message:
        models.length === 0
          ? `Ollama is running but has no models installed. Pull a model to get started.`
          : `Ollama is running with ${models.length} model${models.length === 1 ? "" : "s"}.`,
    },
  });
});

export const OllamaProviderLive = Layer.effect(
  OllamaProvider,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

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
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck 2>&1 | head -50
```

Expected: errors about `providerModelsFromSettings` signature match (check the exact signature in `providerSnapshot.ts` first if needed) and missing `OllamaSettings` import — fix inline if found.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Services/OllamaProvider.ts \
        apps/server/src/provider/Layers/OllamaProvider.ts
git commit -m "feat(server): add OllamaProvider service and health-check layer"
```

---

## Task 6: Create `OllamaAdapter` service and layer

**Files:**

- Create: `apps/server/src/provider/Services/OllamaAdapter.ts`
- Create: `apps/server/src/provider/Layers/OllamaAdapter.ts`

- [ ] **Step 1: Create the service interface**

Create `apps/server/src/provider/Services/OllamaAdapter.ts`:

```ts
/**
 * OllamaAdapter - Ollama session adapter service tag.
 *
 * Implements ProviderAdapterShape via HTTP calls to the local Ollama server.
 * Full multi-turn conversation history is maintained in-memory per session.
 *
 * @module OllamaAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterShape } from "./ProviderAdapter.ts";
import type { ProviderAdapterError } from "../Errors.ts";

export type OllamaAdapterShape = ProviderAdapterShape<ProviderAdapterError>;

export class OllamaAdapter extends ServiceMap.Service<OllamaAdapter, OllamaAdapterShape>()(
  "t3/provider/Services/OllamaAdapter",
) {}
```

- [ ] **Step 2: Create the layer**

Create `apps/server/src/provider/Layers/OllamaAdapter.ts`:

```ts
/**
 * OllamaAdapterLive - Ollama HTTP adapter for full provider lifecycle.
 *
 * Drives chat via POST /v1/chat/completions (OpenAI-compatible, streaming SSE).
 * Maintains full messages[] history per session. Uses AbortController per turn
 * for interrupt support. No CLI process — pure fetch.
 *
 * @module OllamaAdapterLive
 */
import type {
  ModelSelection,
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
import { OllamaAdapter, type OllamaAdapterShape } from "../Services/OllamaAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const PROVIDER = "ollama" as const satisfies ProviderKind;

function nowIso(): string {
  return new Date().toISOString();
}

function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type OllamaTurnState = "completed" | "failed" | "interrupted";

interface OllamaTurnRecord {
  readonly id: TurnId;
  readonly userContent: string;
  readonly assistantContent: string;
  readonly model: string;
  readonly state: OllamaTurnState;
}

interface OllamaSessionState {
  readonly session: ProviderSession;
  readonly modelSelection?: ModelSelection;
  // Full conversation history sent on each turn
  messages: OllamaMessage[];
  turns: OllamaTurnRecord[];
  interruptedTurns: Set<TurnId>;
  // Per-turn AbortControllers for interrupt support
  abortControllers: Map<TurnId, AbortController>;
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

export const OllamaAdapterLive = Layer.effect(
  OllamaAdapter,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;
    const sessionsRef = yield* Ref.make(new Map<ThreadId, OllamaSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    const getBaseUrl = Effect.gen(function* () {
      const settings = yield* serverSettings.getSettings;
      return settings.providers.ollama.baseUrl;
    });

    const startSession: OllamaAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const now = nowIso();
        const sessionState: OllamaSessionState = {
          session: {
            provider: PROVIDER,
            status: "ready",
            runtimeMode: input.runtimeMode,
            threadId: input.threadId,
            cwd: input.cwd,
            model: input.modelSelection?.model,
            resumeCursor: input.resumeCursor,
            createdAt: now,
            updatedAt: now,
          },
          ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
          messages: [],
          turns: [],
          interruptedTurns: new Set(),
          abortControllers: new Map(),
        };
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
          return next;
        });
        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "Ollama session started.",
            ...(input.resumeCursor !== undefined ? { resume: input.resumeCursor } : {}),
          }),
        );
        yield* emitEvent(
          makeThreadEvent("thread.started", input.threadId, {
            providerThreadId: input.threadId,
          }),
        );
        return sessionState.session;
      });

    const sendTurn: OllamaAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(input.threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const modelSelection = input.modelSelection ?? sessionState.modelSelection;
        const model = modelSelection?.model ?? sessionState.session.model ?? "llama3.2";
        const userContent = input.input?.trim() ?? "";
        const baseUrl = yield* getBaseUrl;

        // Append user message to conversation history
        sessionState.messages.push({ role: "user", content: userContent });

        // Create an AbortController so interruptTurn can cancel the fetch
        const abortController = new AbortController();
        sessionState.abortControllers.set(turnId, abortController);

        // Update session status to running
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(input.threadId);
          if (!current) return sessions;
          next.set(input.threadId, {
            ...current,
            session: {
              ...current.session,
              status: "running",
              activeTurnId: turnId,
              model,
              updatedAt: nowIso(),
            },
          });
          return next;
        });

        yield* emitEvent(makeThreadEvent("turn.started", input.threadId, { model }, turnId));

        // Stream from Ollama's OpenAI-compatible endpoint
        let assistantContent = "";
        let turnState: OllamaTurnState = "completed";
        let errorMessage: string | undefined;

        yield* Effect.tryPromise({
          try: async () => {
            const res = await fetch(`${baseUrl}/v1/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: abortController.signal,
              body: JSON.stringify({
                model,
                messages: sessionState.messages,
                stream: true,
              }),
            });

            if (!res.ok) {
              const body = await res.text().catch(() => "");
              throw new Error(`Ollama returned HTTP ${res.status}: ${body}`);
            }

            const reader = res.body?.getReader();
            if (!reader) throw new Error("No response body from Ollama");
            const decoder = new TextDecoder();

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              for (const line of chunk.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string } }>;
                  };
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    assistantContent += delta;
                    // Emit delta synchronously — we're in a Promise so can't yield Effect
                    // The event will be published via a separate mechanism.
                    // Store delta for batch emit below.
                  }
                } catch {
                  // Ignore malformed SSE lines
                }
              }
            }
          },
          catch: (err) => err as Error,
        })
          .pipe(
            Effect.tapError((err) => {
              const msg = String(err);
              if (msg.includes("AbortError") || msg.includes("aborted")) {
                turnState = "interrupted";
              } else {
                turnState = "failed";
                errorMessage = msg;
              }
              return Effect.void;
            }),
            Effect.ignore,
          )
          .pipe(
            // Re-read assistantContent after streaming — emit the full content as one delta
            // (SSE chunks were accumulated; Effect can't yield inside the async loop)
            Effect.andThen(
              Effect.gen(function* () {
                if (turnState !== "interrupted" && assistantContent.length > 0) {
                  yield* emitEvent(
                    makeThreadEvent(
                      "content.delta",
                      input.threadId,
                      { streamKind: "assistant_text", delta: assistantContent },
                      turnId,
                    ),
                  );
                }
              }),
            ),
          );

        // NOTE: The streaming approach above accumulates content and emits once.
        // For true token-by-token streaming inside Effect, a more advanced approach
        // using Effect.Stream.fromAsyncIterable would be needed. This is intentionally
        // kept simple for v1 — it behaves correctly, just with one large delta event.

        // Emit final turn event
        if (turnState === "interrupted") {
          yield* emitEvent(
            makeThreadEvent(
              "turn.aborted",
              input.threadId,
              { reason: "Interrupted by user." },
              turnId,
            ),
          );
        } else {
          yield* emitEvent(
            makeThreadEvent(
              "turn.completed",
              input.threadId,
              {
                state: turnState,
                ...(errorMessage ? { errorMessage } : {}),
              },
              turnId,
            ),
          );
        }

        // Append assistant reply to conversation history (only on success)
        if (turnState === "completed" && assistantContent.length > 0) {
          sessionState.messages.push({ role: "assistant", content: assistantContent });
        }

        // Record turn and clean up
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(input.threadId);
          if (!current) return sessions;
          const nextAbortControllers = new Map(current.abortControllers);
          nextAbortControllers.delete(turnId);
          const nextTurn: OllamaTurnRecord = {
            id: turnId,
            userContent,
            assistantContent,
            model,
            state: turnState,
          };
          next.set(input.threadId, {
            ...current,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
            turns: [...current.turns, nextTurn],
            interruptedTurns: new Set(
              Array.from(current.interruptedTurns).filter((t) => t !== turnId),
            ),
            abortControllers: nextAbortControllers,
          });
          return next;
        });

        return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
      });

    const interruptTurn: OllamaAdapterShape["interruptTurn"] = (threadId, turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;
        const targetTurnId = turnId ?? sessionState.session.activeTurnId;
        if (!targetTurnId) return;
        // Abort the in-flight fetch
        sessionState.abortControllers.get(targetTurnId)?.abort();
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(threadId);
          if (!current) return sessions;
          next.set(threadId, {
            ...current,
            interruptedTurns: new Set([...current.interruptedTurns, targetTurnId]),
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
          });
          return next;
        });
      });

    const respondToRequest: OllamaAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Ollama adapter does not support request responses (${String(requestId)} -> ${decision}).`,
          detail: null,
        }),
      );

    const respondToUserInput: OllamaAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Ollama adapter does not support structured user input (${String(requestId)}).`,
          detail: null,
        }),
      );

    const stopSession: OllamaAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;
        // Abort any in-flight requests
        for (const controller of sessionState.abortControllers.values()) {
          controller.abort();
        }
        yield* emitEvent(
          makeThreadEvent("session.exited", threadId, {
            reason: "Session stopped.",
            recoverable: false,
            exitKind: "graceful",
          }),
        );
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.delete(threadId);
          return next;
        });
      });

    const listSessions: OllamaAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: OllamaAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    const readThread: OllamaAdapterShape["readThread"] = (threadId) =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => {
          const state = sessions.get(threadId);
          return {
            threadId,
            turns: state
              ? state.turns.map((turn) => ({
                  id: turn.id,
                  items: [
                    { role: "user", text: turn.userContent },
                    { role: "assistant", text: turn.assistantContent },
                  ],
                }))
              : [],
          };
        }),
      );

    const rollbackThread: OllamaAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        const state = sessions.get(threadId);
        if (!state) return { threadId, turns: [] };

        const nextTurns = state.turns.slice(0, Math.max(0, state.turns.length - numTurns));
        // Each turn = 1 user message + 1 assistant message; trim messages[] accordingly
        const nextMessages = state.messages.slice(
          0,
          Math.max(0, state.messages.length - numTurns * 2),
        );

        yield* Ref.update(sessionsRef, (s) => {
          const next = new Map(s);
          const current = next.get(threadId);
          if (!current) return s;
          next.set(threadId, {
            ...current,
            turns: nextTurns,
            messages: nextMessages,
            session: { ...current.session, updatedAt: nowIso() },
          });
          return next;
        });

        return {
          threadId,
          turns: nextTurns.map((turn) => ({
            id: turn.id,
            items: [
              { role: "user", text: turn.userContent },
              { role: "assistant", text: turn.assistantContent },
            ],
          })),
        };
      });

    const stopAll: OllamaAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const state of sessions.values()) {
          for (const controller of state.abortControllers.values()) {
            controller.abort();
          }
          yield* emitEvent(
            makeThreadEvent("session.exited", state.session.threadId, {
              reason: "All sessions stopped.",
              recoverable: false,
              exitKind: "graceful",
            }),
          );
        }
        yield* Ref.set(sessionsRef, new Map());
      });

    return {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "in-session" },
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
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies OllamaAdapterShape;
  }),
);
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck 2>&1 | head -50
```

Expected: clean or only errors about the registry wiring (next task).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Services/OllamaAdapter.ts \
        apps/server/src/provider/Layers/OllamaAdapter.ts
git commit -m "feat(server): add OllamaAdapter with full session lifecycle and SSE streaming"
```

---

## Task 7: Wire Ollama into provider registries

**Files:**

- Modify: `apps/server/src/provider/Layers/ProviderRegistry.ts`
- Modify: `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`

- [ ] **Step 1: Add OllamaProvider to `ProviderRegistry.ts`**

Open `apps/server/src/provider/Layers/ProviderRegistry.ts`.

Add imports at the top:

```ts
import { OllamaProviderLive } from "./OllamaProvider";
import type { OllamaProviderShape } from "../Services/OllamaProvider";
import { OllamaProvider } from "../Services/OllamaProvider";
```

Change `loadProviders` signature and body (add 4th slot):

```ts
const loadProviders = (
  codexProvider: CodexProviderShape,
  claudeProvider: ClaudeProviderShape,
  geminiProvider: GeminiProviderShape,
  ollamaProvider: OllamaProviderShape,
): Effect.Effect<readonly [ServerProvider, ServerProvider, ServerProvider, ServerProvider]> =>
  Effect.all(
    [
      codexProvider.getSnapshot,
      claudeProvider.getSnapshot,
      geminiProvider.getSnapshot,
      ollamaProvider.getSnapshot,
    ],
    { concurrency: "unbounded" },
  );
```

Inside `ProviderRegistryLive` `Effect.gen`, yield the new provider:

```ts
const ollamaProvider = yield * OllamaProvider;
```

Update every call to `loadProviders` and `syncProviders` to pass `ollamaProvider`. Add stream subscription:

```ts
yield *
  Stream.runForEach(ollamaProvider.streamChanges, () => syncProviders()).pipe(Effect.forkScoped);
```

Update the `refresh` switch:

```ts
case "ollama":
  yield* ollamaProvider.refresh;
  break;
```

Add `ollamaProvider.refresh` to the default `Effect.all` array.

End of file — add to the `Layer.provideMerge` chain:

```ts
.pipe(
  Layer.provideMerge(CodexProviderLive),
  Layer.provideMerge(ClaudeProviderLive),
  Layer.provideMerge(GeminiProviderLive),
  Layer.provideMerge(OllamaProviderLive),  // add this line
)
```

- [ ] **Step 2: Add OllamaAdapter to `ProviderAdapterRegistry.ts`**

Open `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`.

Add imports:

```ts
import { OllamaAdapter } from "../Services/OllamaAdapter.ts";
```

In `makeProviderAdapterRegistry`, update the default adapters array:

```ts
const adapters =
  options?.adapters !== undefined
    ? options.adapters
    : [yield * CodexAdapter, yield * ClaudeAdapter, yield * GeminiAdapter, yield * OllamaAdapter];
```

Add to the `ProviderAdapterRegistryLive` layer composition (at the bottom of the file):

```ts
export const ProviderAdapterRegistryLive = Layer.effect(
  ProviderAdapterRegistry,
  makeProviderAdapterRegistry(),
).pipe(Layer.provide(OllamaAdapterLive));
```

Wait — check how the current file composes. The existing pattern may differ. Open the file and add `OllamaAdapter` to whatever layer provision pattern is already used (see `ClaudeAdapter`, `CodexAdapter`, `GeminiAdapter` imports and how they're provided).

- [ ] **Step 3: Typecheck**

```bash
bun typecheck 2>&1 | head -50
```

Expected: clean or only web-side errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/provider/Layers/ProviderRegistry.ts \
        apps/server/src/provider/Layers/ProviderAdapterRegistry.ts
git commit -m "feat(server): wire OllamaProvider and OllamaAdapter into registries"
```

---

## Task 8: Handle `ollama.pullModel` and `ollama.quitServer` in `ws.ts`

**Files:**

- Modify: `apps/server/src/ws.ts`

- [ ] **Step 1: Add the two handlers**

Open `apps/server/src/ws.ts`. Find the handler map (the large object where `[WS_METHODS.serverRefreshProviders]` etc. appear, around line 625).

Add these two handlers alongside the other `WS_METHODS` entries:

```ts
[WS_METHODS.ollamaPullModel]: (input) =>
  observeRpcEffect(
    WS_METHODS.ollamaPullModel,
    Effect.gen(function* () {
      const settings = yield* serverSettings.getSettings;
      const baseUrl = settings.providers.ollama.baseUrl;
      const result = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(`${baseUrl}/api/pull`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: input.model, stream: false }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { success: false as const, error: `HTTP ${res.status}: ${body}` };
          }
          return { success: true as const };
        },
        catch: (err) => ({ success: false as const, error: String(err) }),
      }).pipe(Effect.orElseSucceed(() => ({ success: false as const, error: "Unknown error" })));
      // Refresh provider snapshot so new model appears in picker
      yield* providerRegistry.refresh("ollama").pipe(Effect.orElseSucceed(() => []));
      return result;
    }),
  ),

[WS_METHODS.ollamaQuitServer]: (_input) =>
  observeRpcEffect(
    WS_METHODS.ollamaQuitServer,
    Effect.gen(function* () {
      const settings = yield* serverSettings.getSettings;
      const baseUrl = settings.providers.ollama.baseUrl;
      const result = yield* Effect.tryPromise({
        try: async () => {
          const res = await fetch(`${baseUrl}/api/close`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            return {
              success: false as const,
              message: `Ollama returned HTTP ${res.status}. Your version may not support remote quit.`,
            };
          }
          return { success: true as const, message: "Ollama has been quit." };
        },
        catch: (err) => ({
          success: false as const,
          message: `Could not quit Ollama: ${String(err)}`,
        }),
      }).pipe(
        Effect.orElseSucceed(() => ({
          success: false as const,
          message: "Unknown error quitting Ollama.",
        })),
      );
      return result;
    }),
  ),
```

Make sure `serverSettings` is available in scope (it already is — check line ~165 of `ws.ts`).

- [ ] **Step 2: Typecheck**

```bash
bun typecheck 2>&1 | head -50
```

Expected: clean or web-only errors.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ws.ts
git commit -m "feat(server): handle ollama.pullModel and ollama.quitServer RPC"
```

---

## Task 9: Update web `providerModels.ts` and `session-logic.ts`

**Files:**

- Modify: `apps/web/src/providerModels.ts`
- Modify: `apps/web/src/session-logic.ts`

- [ ] **Step 1: Add `ollama` to `getProviderModelsByProvider`**

Open `apps/web/src/providerModels.ts`. In `getProviderModelsByProvider`, add after `gemini`:

```ts
ollama: getProviderModels(providers, "ollama"),
```

- [ ] **Step 2: Add Ollama to `PROVIDER_OPTIONS` in `session-logic.ts`**

Open `apps/web/src/session-logic.ts`. Find `PROVIDER_OPTIONS` array (around line 25):

```ts
export type ProviderPickerKind = ProviderKind | "cursor";

export const PROVIDER_OPTIONS: Array<{
  value: ProviderPickerKind;
  label: string;
  available: boolean;
}> = [
  { value: "codex", label: "Codex", available: true },
  { value: "claudeAgent", label: "Claude", available: true },
  { value: "gemini", label: "Gemini", available: true },
  { value: "ollama", label: "Ollama", available: true }, // add this
  { value: "cursor", label: "Cursor", available: false },
];
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/providerModels.ts apps/web/src/session-logic.ts
git commit -m "feat(web): add ollama to provider model map and picker options"
```

---

## Task 10: Add `OllamaIcon` to `Icons.tsx`

**Files:**

- Modify: `apps/web/src/components/Icons.tsx`

- [ ] **Step 1: Add the Ollama icon SVG**

Open `apps/web/src/components/Icons.tsx`. Add after the last `export const` icon (around line 414):

```tsx
export const OllamaIcon: Icon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* Stylised llama head silhouette — simple geometric version */}
    <circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9" />
    <ellipse cx="9" cy="5.5" rx="1.2" ry="2.2" fill="currentColor" />
    <ellipse cx="15" cy="5.5" rx="1.2" ry="2.2" fill="currentColor" />
    <path d="M6 14c0-3.314 2.686-6 6-6s6 2.686 6 6v4H6v-4z" fill="currentColor" opacity="0.85" />
    <circle cx="10.5" cy="8" r="0.7" fill="white" />
    <circle cx="13.5" cy="8" r="0.7" fill="white" />
  </svg>
);
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/Icons.tsx
git commit -m "feat(web): add OllamaIcon SVG"
```

---

## Task 11: Add `ollama` typed RPC methods to `wsRpcClient.ts`

**Files:**

- Modify: `apps/web/src/wsRpcClient.ts`

- [ ] **Step 1: Extend the client with Ollama methods**

Open `apps/web/src/wsRpcClient.ts`. Find the interface that types the WS RPC client (the object with `server`, `git`, `terminal`, etc. namespaces — around line 88).

Add an `ollama` namespace entry to the interface:

```ts
readonly ollama: {
  readonly pullModel: RpcUnaryMethod<typeof WS_METHODS.ollamaPullModel>;
  readonly quitServer: RpcUnaryNoArgMethod<typeof WS_METHODS.ollamaQuitServer>;
};
```

Then find where the client object is constructed and add the matching implementation (follow the exact same pattern as `server`, `git`, etc. in that file). The method wiring will call `client.request(WS_METHODS.ollamaPullModel, input)` and `client.request(WS_METHODS.ollamaQuitServer, {})`.

- [ ] **Step 2: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/wsRpcClient.ts
git commit -m "feat(web): add typed ollama RPC methods to wsRpcClient"
```

---

## Task 12: Create `PullModelDialog` component

**Files:**

- Create: `apps/web/src/components/chat/PullModelDialog.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/chat/PullModelDialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "~/lib/utils";

const CURATED_MODELS = [
  { slug: "llama3.2", label: "Llama 3.2", description: "Meta • 3B • Fast" },
  { slug: "llama3.2:1b", label: "Llama 3.2 1B", description: "Meta • 1B • Lightest" },
  { slug: "llama3.3", label: "Llama 3.3", description: "Meta • 70B • Powerful" },
  { slug: "qwen2.5-coder", label: "Qwen 2.5 Coder", description: "Alibaba • 7B • Code" },
  { slug: "qwen2.5-coder:32b", label: "Qwen 2.5 Coder 32B", description: "Alibaba • 32B • Code" },
  { slug: "mistral", label: "Mistral", description: "Mistral AI • 7B" },
  { slug: "gemma3", label: "Gemma 3", description: "Google • 4B" },
  { slug: "gemma3:27b", label: "Gemma 3 27B", description: "Google • 27B" },
  { slug: "phi4", label: "Phi-4", description: "Microsoft • 14B" },
  { slug: "deepseek-r1", label: "DeepSeek R1", description: "DeepSeek • 7B" },
  { slug: "codellama", label: "Code Llama", description: "Meta • 7B • Code" },
] as const;

interface PullModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPull: (model: string) => Promise<{ success: boolean; error?: string }>;
}

export function PullModelDialog({ open, onOpenChange, onPull }: PullModelDialogProps) {
  const [modelValue, setModelValue] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePull = async () => {
    const model = modelValue.trim();
    if (!model) return;
    setIsPulling(true);
    setResultMessage(null);
    try {
      const result = await onPull(model);
      if (result.success) {
        setResultMessage({ ok: true, text: `Successfully pulled '${model}'.` });
        setModelValue("");
      } else {
        setResultMessage({ ok: false, text: result.error ?? "Pull failed." });
      }
    } finally {
      setIsPulling(false);
    }
  };

  const handleClose = () => {
    if (isPulling) return;
    setModelValue("");
    setResultMessage(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pull Ollama model</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Model name</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handlePull();
              }}
            >
              <Input
                autoFocus
                disabled={isPulling}
                value={modelValue}
                onChange={(e) => {
                  setModelValue(e.target.value);
                  setResultMessage(null);
                }}
                placeholder="llama3.2, qwen2.5-coder:7b, ..."
                aria-label="Model name"
              />
            </form>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Popular models
            </p>
            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
              {CURATED_MODELS.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  disabled={isPulling}
                  onClick={() => {
                    setModelValue(m.slug);
                    setResultMessage(null);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-muted/60 focus:outline-none focus:bg-muted/60",
                    modelValue === m.slug && "bg-muted font-medium",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <span className="block">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.description}</span>
                </button>
              ))}
            </div>
          </div>
          {resultMessage && (
            <p
              className={cn(
                "text-sm",
                resultMessage.ok ? "text-green-600 dark:text-green-400" : "text-destructive",
              )}
            >
              {resultMessage.text}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isPulling}>
            {resultMessage?.ok ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => void handlePull()} disabled={isPulling || !modelValue.trim()}>
            {isPulling ? "Pulling…" : "Pull"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/PullModelDialog.tsx
git commit -m "feat(web): add PullModelDialog with curated model list"
```

---

## Task 13: Update `ProviderModelPicker.tsx` for Ollama

**Files:**

- Modify: `apps/web/src/components/chat/ProviderModelPicker.tsx`

- [ ] **Step 1: Import `OllamaIcon`, `PullModelDialog`, and add RPC client access**

At the top of `ProviderModelPicker.tsx`, add to the existing imports:

```tsx
import { OllamaIcon } from "../Icons";
import { PullModelDialog } from "./PullModelDialog";
```

Update `PROVIDER_ICON_BY_PROVIDER` to include `ollama`:

```ts
const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  ollama: OllamaIcon,
  cursor: CursorIcon,
};
```

- [ ] **Step 2: Add props for Ollama RPC actions**

Add two optional props to `ProviderModelPicker`:

```ts
onOllamaPullModel?: (model: string) => Promise<{ success: boolean; error?: string }>;
onOllamaQuitServer?: () => void;
```

- [ ] **Step 3: Add state for Ollama dialogs**

Inside `ProviderModelPicker`, add state:

```ts
const [isPullModelDialogOpen, setIsPullModelDialogOpen] = useState(false);
const isOllama = activeProvider === "ollama";
```

- [ ] **Step 4: Add Ollama-specific menu items and "not running" install state**

Inside the `MenuSubPopup` for each provider (the `AVAILABLE_PROVIDER_OPTIONS.map` block), the current code checks `liveProvider.status !== "ready"` and shows a disabled item.

For Ollama specifically when `!liveProvider?.installed`, show an "Install" action instead of just a disabled badge. Find the block that renders the unavailable provider item (around line 229) and add an Ollama-specific branch:

```tsx
if (liveProvider && liveProvider.status !== "ready") {
  // Special case: Ollama not running — show install link
  if (option.value === "ollama") {
    return (
      <MenuItem
        key={option.value}
        onSelect={() => {
          window.open("https://ollama.com/download", "_blank");
        }}
      >
        <OptionIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground/85"
        />
        <span>{option.label}</span>
        <span className="ms-auto text-[11px] text-blue-500 uppercase tracking-[0.08em]">
          Install ↗
        </span>
      </MenuItem>
    );
  }
  // existing disabled rendering for other providers...
  const unavailableLabel = ...
```

Inside the `MenuSubPopup` for `option.value === "ollama"` (after the model radio list), add:

```tsx
{
  option.value === "ollama" ? (
    <>
      <MenuDivider />
      <MenuItem
        onSelect={() => {
          setIsPullModelDialogOpen(true);
          setIsMenuOpen(false);
        }}
      >
        Pull model…
      </MenuItem>
      {props.onOllamaQuitServer ? (
        <MenuItem
          onSelect={() => {
            props.onOllamaQuitServer?.();
            setIsMenuOpen(false);
          }}
        >
          Quit Ollama
        </MenuItem>
      ) : null}
    </>
  ) : null;
}
```

- [ ] **Step 5: Add `PullModelDialog` to the JSX return**

At the end of the component's return (alongside the existing Gemini custom model `Dialog`), add:

```tsx
{
  props.onOllamaPullModel ? (
    <PullModelDialog
      open={isPullModelDialogOpen}
      onOpenChange={setIsPullModelDialogOpen}
      onPull={props.onOllamaPullModel}
    />
  ) : null;
}
```

- [ ] **Step 6: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat/ProviderModelPicker.tsx
git commit -m "feat(web): add Ollama icon, install link, pull/quit menu items to ProviderModelPicker"
```

---

## Task 14: Wire Ollama RPC callbacks into the `ProviderModelPicker` call-site

**Files:**

- Modify: whichever file renders `<ProviderModelPicker />` (find with `grep -r "ProviderModelPicker" apps/web/src --include="*.tsx" -l`)

- [ ] **Step 1: Find the call-site**

```bash
grep -r "ProviderModelPicker" /path/to/repo/apps/web/src --include="*.tsx" -l
```

- [ ] **Step 2: Import the WS client and pass Ollama callbacks**

At the call-site, import the WS client (follow the existing pattern — look for how `wsClient` or `rpcClient` is used in that file). Add:

```tsx
onOllamaPullModel={async (model) => {
  try {
    return await wsClient.ollama.pullModel({ model });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}}
onOllamaQuitServer={() => {
  void wsClient.ollama.quitServer({}).catch(console.error);
}}
```

- [ ] **Step 3: Typecheck**

```bash
bun typecheck 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add <call-site file>
git commit -m "feat(web): wire ollama pull/quit callbacks into ProviderModelPicker"
```

---

## Task 15: Final typecheck, lint, and format

- [ ] **Step 1: Run full typecheck**

```bash
bun typecheck 2>&1
```

Expected: zero errors.

- [ ] **Step 2: Run lint**

```bash
bun lint 2>&1 | head -60
```

Fix any reported issues. Common issues: unused imports, missing type annotations on function parameters.

- [ ] **Step 3: Run formatter**

```bash
bun fmt 2>&1
```

Stage any auto-fixed files.

- [ ] **Step 4: Commit formatting fixes if any**

```bash
git add -A
git commit -m "chore: apply fmt and lint fixes for Ollama provider"
```

- [ ] **Step 5: Smoke-test checklist (manual)**

- [ ] Start the server (`bun run dev` or equivalent) with Ollama running (`ollama serve`)
- [ ] Open the model picker in chat — "Ollama" appears as a provider
- [ ] Ollama sub-menu shows installed models (pulled via `ollama pull llama3.2` beforehand)
- [ ] Start a session with Ollama + llama3.2, send a message — response appears in chat
- [ ] Interrupt a turn mid-response — `turn.aborted` fires, conversation stops cleanly
- [ ] Open "Pull model…" — curated list appears, type `tinyllama`, click Pull — model pulls
- [ ] New model appears in Ollama sub-menu after pull completes
- [ ] "Quit Ollama" closes the Ollama server process
- [ ] Stop Ollama, reload — Ollama entry shows "Install ↗" which opens ollama.com/download

---

## Self-Review Notes

**Spec coverage check:**

- ✅ `ProviderKind` extended
- ✅ `OllamaSettings` schema (baseUrl, enabled)
- ✅ Server health check via `GET /api/tags` (live model list)
- ✅ `OllamaAdapter` with full session lifecycle + SSE streaming + AbortController interrupts
- ✅ Full `messages[]` conversation history maintained per session
- ✅ `rollbackThread` trims both `turns[]` and `messages[]` (N×2 messages per N turns)
- ✅ Registry wiring (both ProviderRegistry and ProviderAdapterRegistry)
- ✅ `ollama.pullModel` and `ollama.quitServer` RPC methods (contracts + ws.ts handler)
- ✅ `OllamaIcon` SVG
- ✅ `PROVIDER_OPTIONS` + `ProviderPickerKind` updated
- ✅ `PullModelDialog` with curated model list + free-text input
- ✅ "Install ↗" link when Ollama not running
- ✅ Pull/Quit menu items in `ProviderModelPicker`
- ✅ `wsRpcClient.ts` typed ollama namespace
- ✅ `providerModels.ts` ollama slot

**What's not in v1 (intentionally):**

- Model deletion from UI (deferred)
- Streaming pull progress (pull is blocking, dialog shows spinner)
- Ollama settings panel (deferred — the model picker covers the core UX)
- Image/attachment support
