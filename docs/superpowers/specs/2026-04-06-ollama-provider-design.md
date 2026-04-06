# Ollama Provider — Design Spec

**Date:** 2026-04-06  
**Status:** Approved  
**Scope:** Add Ollama as a first-class chat provider, matching the Codex/Claude/Gemini provider pattern across all layers.

---

## 1. Overview

Ollama is a locally-running LLM server (`http://localhost:11434`) that exposes an OpenAI-compatible REST API. Unlike Codex/Claude/Gemini (which wrap CLIs), the Ollama adapter talks to this HTTP endpoint directly — no binary path needed.

Key properties:

- Models are **dynamic**: pulled from `GET /api/tags` at runtime, not hardcoded.
- Conversation history is **full multi-turn**: the adapter maintains a `messages[]` array per session and sends the full context on each turn (identical to how Claude/Codex work).
- Model switching is **in-session**: each request carries a `model` field, so switching doesn't require a session restart.
- No approval/sandbox flows: Ollama is a chat LLM, not a code execution agent.

---

## 2. Architecture

Ollama follows the same 5-layer provider pattern used by Codex, Claude, and Gemini:

```
contracts/           → ProviderKind union + OllamaSettings schema + model defaults
server/Layers/       → OllamaProvider.ts  (health check + live model list)
                     → OllamaAdapter.ts   (session lifecycle, sendTurn via HTTP)
server/Services/     → OllamaProvider.ts  (service interface)
                     → OllamaAdapter.ts   (service interface)
server/              → ProviderRegistry   (add ollama slot)
                     → ProviderAdapterRegistry (add OllamaAdapter)
web/                 → session-logic.ts   (PROVIDER_OPTIONS)
                     → ProviderModelPicker.tsx (dynamic model list, pull/quit actions)
                     → SettingsPanels.tsx (Ollama settings panel)
                     → Icons.tsx          (Ollama icon)
```

---

## 3. Contracts Layer (`packages/contracts/`)

### 3.1 `orchestration.ts` — `ProviderKind`

```ts
// Before
Schema.Literals(["codex", "claudeAgent", "gemini"]);

// After
Schema.Literals(["codex", "claudeAgent", "gemini", "ollama"]);
```

### 3.2 `model.ts` additions

```ts
export const OllamaModelOptions = Schema.Struct({});
export type OllamaModelOptions = typeof OllamaModelOptions.Type;

// Add to ProviderModelOptions:
ollama: Schema.optional(OllamaModelOptions),

// Add to DEFAULT_MODEL_BY_PROVIDER:
ollama: "llama3.2",

// Add to DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER:
ollama: "llama3.2",

// Add to MODEL_SLUG_ALIASES_BY_PROVIDER:
ollama: {
  "llama3": "llama3.2",
  "qwen": "qwen2.5-coder",
  "mistral": "mistral",
},

// Add to PROVIDER_DISPLAY_NAMES:
ollama: "Ollama",
```

### 3.3 `settings.ts` additions

```ts
export const OllamaSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  baseUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "http://localhost:11434")),
  // No customModels — models come live from Ollama API
});
export type OllamaSettings = typeof OllamaSettings.Type;
```

Add to `ServerSettings.providers`:

```ts
ollama: OllamaSettings.pipe(Schema.withDecodingDefault(() => ({}))),
```

Add `OllamaModelOptions` patch (empty struct) and `ollama` entry to `ModelSelectionPatch`, `ServerSettingsPatch.providers`.

---

## 4. Server Snapshot Layer

### `apps/server/src/provider/Services/OllamaProvider.ts`

```ts
export interface OllamaProviderShape {
  readonly getSnapshot: Effect.Effect<ServerProvider>;
  readonly refresh: Effect.Effect<ServerProvider>;
  readonly streamChanges: Stream.Stream<ServerProvider>;
}

export class OllamaProvider extends ServiceMap.Service<OllamaProvider, OllamaProviderShape>()(
  "t3/provider/Services/OllamaProvider",
) {}
```

### `apps/server/src/provider/Layers/OllamaProvider.ts`

- `checkOllamaProviderStatus()`:
  - `GET {baseUrl}/api/tags` with 5 s timeout.
  - On success: parse `{ models: [{ name, size, modified_at }] }` → `ServerProviderModel[]`. Each model: `slug = name`, `name = name`, `isCustom = false`, empty capabilities.
  - On network error (ECONNREFUSED / timeout): status `"error"`, message `"Ollama is not running. Start it with \`ollama serve\` or open the Ollama app."`, `installed: false`.
  - On disabled: status `"warning"`, message `"Ollama is disabled in settings."`.
- Uses `makeManagedServerProvider` exactly like `GeminiProviderLive`.

---

## 5. Server Adapter Layer

### `apps/server/src/provider/Services/OllamaAdapter.ts`

Mirrors `GeminiAdapter` service interface — implements `ProviderAdapterShape<ProviderAdapterError>`.

### `apps/server/src/provider/Layers/OllamaAdapter.ts`

**Session state:**

```ts
interface OllamaMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OllamaTurnRecord {
  readonly id: TurnId;
  readonly userMessage: string;
  readonly assistantMessage: string;
  readonly model: string;
  readonly state: "completed" | "failed" | "interrupted";
}

interface OllamaSessionState {
  readonly session: ProviderSession;
  readonly modelSelection?: ModelSelection;
  readonly messages: OllamaMessage[]; // full conversation history
  readonly turns: OllamaTurnRecord[];
  readonly interruptedTurns: Set<TurnId>;
  readonly abortControllers: Map<TurnId, AbortController>;
}
```

**`startSession`:**

- Creates session state with `messages: []`.
- Emits `session.started` + `thread.started` events (same as Gemini).

**Transport:** Uses Node.js built-in `fetch` (not `runProcess`) — Ollama is an HTTP server, not a CLI. The `AbortController` is passed as `signal` to `fetch` for interrupt support.

**`sendTurn`:**

1. Append user message to `messages[]`.
2. POST `{baseUrl}/v1/chat/completions` with:
   ```json
   {
     "model": "<resolved model>",
     "messages": [...full history...],
     "stream": true
   }
   ```
3. Store an `AbortController` keyed by `turnId` (for interrupt support).
4. Emit `turn.started`.
5. Read SSE stream: each `data: {...}` chunk → extract `choices[0].delta.content` → emit `content.delta` with `streamKind: "assistant_text"`.
6. On stream end: emit `turn.completed` with `state: "completed"`.
7. Append assistant response to `messages[]`.
8. On abort: emit `turn.aborted`, state `"interrupted"`.
9. On fetch error: emit `turn.completed` with `state: "failed"` + `errorMessage`.

**`interruptTurn`:**

- Call `.abort()` on the stored `AbortController` for that `turnId`.

**`respondToRequest` / `respondToUserInput`:**

- Emit `runtime.warning` (not implemented — Ollama has no approval flows).

**`stopSession`:**

- Abort any active turn, remove session, emit `session.exited`.

**`readThread` / `rollbackThread`:**

- Same pattern as Gemini: build `ProviderThreadSnapshot` from `turns[]`.
- On rollback of N turns: truncate `turns[]` to `turns.length - N` AND truncate `messages[]` to `messages.length - (N * 2)`, since each turn contributes exactly 1 user message + 1 assistant message to the history array.

**`refreshRateLimits`:** `Effect.void` (no rate limits).

**Capabilities:** `{ sessionModelSwitch: "in-session" }`.

---

## 6. Registry Wiring

### `ProviderRegistry.ts`

Add `OllamaProvider` alongside Codex/Claude/Gemini in `loadProviders`, `syncProviders`, `refresh` switch, stream subscriptions, and `ProviderRegistryLive` layer composition.

### `ProviderAdapterRegistry.ts`

Add `OllamaAdapter` to the default adapters array.

---

## 7. New WebSocket RPC Methods

Add two new methods to `NativeApi` in `packages/contracts/src/rpc.ts`:

```ts
"ollama.pullModel": {
  input: Schema.Struct({ model: Schema.String }),
  output: Schema.Struct({ success: Schema.Boolean, error: Schema.optional(Schema.String) }),
}
"ollama.quitServer": {
  input: Schema.Struct({}),
  output: Schema.Struct({ success: Schema.Boolean }),
}
```

Server implementations:

- `ollama.pullModel`: `POST {baseUrl}/api/pull` with `{ name: model, stream: false }`. Returns success/error.
- `ollama.quitServer`: `POST {baseUrl}/api/close` (Ollama ≥ 0.4.x). Fallback: no-op with message.

These are wired in `wsServer.ts` following the existing method dispatch pattern.

---

## 8. Web UI Layer

### 8.1 `session-logic.ts`

```ts
{ value: "ollama", label: "Ollama", available: true },
```

Add `"ollama"` to `ProviderPickerKind`.

### 8.2 Icon

Add an `OllamaIcon` SVG to `Icons.tsx` (a simple llama silhouette SVG, or a text-based "O" icon matching the style). Add it to `PROVIDER_ICON_BY_PROVIDER`.

### 8.3 `ProviderModelPicker.tsx`

- Models for Ollama come from `modelOptionsByProvider["ollama"]` (populated live from server snapshot, not hardcoded).
- When Ollama is not running: show `"Not running"` badge (same as "Not installed" for other providers).
- **Ollama sub-menu extras** (below model list, separated by a divider):
  - **"Pull model…"** → opens `PullModelDialog`
  - **"Quit Ollama"** → calls `ollama.quitServer` RPC, shows brief toast

### 8.4 `PullModelDialog` (new component)

A modal dialog with:

- A text input: "Model name" (placeholder: `llama3.2`, `qwen2.5-coder:7b`)
- A curated popular models list below the input (scrollable chips/radio items):
  ```
  llama3.2          — Meta Llama 3.2 (3B, fast)
  llama3.2:1b       — Meta Llama 3.2 (1B, lightest)
  llama3.3          — Meta Llama 3.3 (70B)
  qwen2.5-coder     — Qwen 2.5 Coder (7B)
  qwen2.5-coder:32b — Qwen 2.5 Coder (32B)
  mistral           — Mistral 7B
  gemma3            — Google Gemma 3 (4B)
  gemma3:27b        — Google Gemma 3 (27B)
  phi4              — Microsoft Phi-4 (14B)
  deepseek-r1       — DeepSeek R1 (7B)
  codellama         — Meta Code Llama (7B)
  ```
- Clicking a chip populates the text input.
- "Pull" button → calls `ollama.pullModel({ model })`, shows loading state, success/error feedback.
- "Cancel" button.

### 8.5 `SettingsPanels.tsx` — Ollama Settings Panel

New panel section "Ollama" showing:

- Enable/disable toggle
- Base URL input (default `http://localhost:11434`)
- Status indicator (running / not running)
- Installed models list with model size + "Delete" button per model (calls `DELETE /api/delete` via a new `ollama.deleteModel` RPC — optional, can be deferred to v2)
- "Pull a model" shortcut button → opens `PullModelDialog`
- "Quit Ollama" button

---

## 9. Error Handling & Edge Cases

| Scenario                                 | Behavior                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama not running when starting session | `startSession` emits `session.started` optimistically; `sendTurn` fails with `content.delta` error message + `turn.completed` state `"failed"` |
| Model not pulled                         | `sendTurn` gets a 404 from Ollama; emits error message: `"Model 'X' is not installed. Pull it from the Ollama settings panel."`                |
| Turn interrupted mid-stream              | AbortController fires; stream stops; `turn.aborted` emitted                                                                                    |
| Ollama disabled in settings              | Provider snapshot shows `status: "warning"`, picker shows "Disabled" badge                                                                     |
| `ollama.quitServer` on older Ollama      | Graceful no-op with user-visible message "Your Ollama version does not support remote quit."                                                   |

---

## 10. Out of Scope (v1)

- Ollama model deletion from UI (can add `ollama.deleteModel` in a follow-up)
- Streaming pull progress (pull is fire-and-forget for v1; dialog shows spinner)
- Image/attachment support (Ollama supports multimodal but v1 is text-only)
- Configuring Ollama system prompts from UI
- Ollama running on a remote host (baseUrl is user-configurable, so it works, but no dedicated UX)

---

## 11. Files Changed

| File                                                         | Change                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `packages/contracts/src/orchestration.ts`                    | Add `"ollama"` to `ProviderKind`                                    |
| `packages/contracts/src/model.ts`                            | `OllamaModelOptions`, defaults, display name, aliases               |
| `packages/contracts/src/settings.ts`                         | `OllamaSettings`, add to `ServerSettings.providers` + patch schemas |
| `packages/contracts/src/rpc.ts`                              | `ollama.pullModel`, `ollama.quitServer` methods                     |
| `apps/server/src/provider/Services/OllamaProvider.ts`        | New service interface                                               |
| `apps/server/src/provider/Services/OllamaAdapter.ts`         | New service interface                                               |
| `apps/server/src/provider/Layers/OllamaProvider.ts`          | Health check + live model list                                      |
| `apps/server/src/provider/Layers/OllamaAdapter.ts`           | Full session adapter                                                |
| `apps/server/src/provider/Layers/ProviderRegistry.ts`        | Wire OllamaProvider                                                 |
| `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` | Wire OllamaAdapter                                                  |
| `apps/server/src/ws.ts` / `wsServer.ts`                      | Add `ollama.*` method handlers                                      |
| `apps/web/src/session-logic.ts`                              | Add ollama to `PROVIDER_OPTIONS`                                    |
| `apps/web/src/components/Icons.tsx`                          | `OllamaIcon`                                                        |
| `apps/web/src/components/chat/ProviderModelPicker.tsx`       | Ollama sub-menu extras                                              |
| `apps/web/src/components/chat/PullModelDialog.tsx`           | New component                                                       |
| `apps/web/src/components/settings/SettingsPanels.tsx`        | Ollama settings panel                                               |
| `apps/web/src/wsRpcClient.ts`                                | Typed client for new ollama RPC methods                             |
