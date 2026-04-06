# OpenCode Provider Integration — Design Spec

**Date:** 2026-04-06  
**Status:** Awaiting implementation plan

---

## Context

Bird Code currently supports three coding agent providers: Codex (JSON-RPC over stdio), Claude (Anthropic Agent SDK), and Gemini (Google API). The goal is to add **OpenCode** (`opencode` CLI) as a fourth provider with full feature parity: streaming events, session continuity, model selection with search, and approval/permission handling.

OpenCode is fundamentally different from Codex in its transport layer — it exposes an **HTTP REST + Server-Sent Events** interface via `opencode serve` rather than JSON-RPC over stdio — but the integration strategy maps cleanly onto the existing `ProviderAdapterShape` contract.

---

## Architecture Overview

```
Browser (Web App)
  └── ProviderModelPicker (+ search bar for opencode)
        └── RPC: thread.turn.start { modelSelection: { provider: "opencode", model } }

Server
  └── ProviderCommandReactor
        └── ProviderService.startSession(...)
              └── OpenCodeAdapter (implements ProviderAdapterShape)
                    └── OpenCodeAppServerManager
                          ├── spawns: `opencode serve --port <dynamic>`
                          ├── polls: GET /health until ready
                          ├── sessions: POST /sessions, POST /sessions/{id}/prompt
                          ├── events: GET /events/subscribe (SSE stream)
                          └── permissions: POST /sessions/{id}/permissions/{id}

  └── OpenCodeProvider (snapshot loader)
        ├── GET /config/providers → live model list
        └── fallback: curated static model list
```

---

## Changes by Package

### 1. `packages/contracts` — Schema & Type Extensions

**`src/orchestration.ts`**

- Add `"opencode"` to `ProviderKind` union: `"codex" | "claudeAgent" | "gemini" | "opencode"`
- Add `OpenCodeModelSelection` to the `ModelSelection` union (shape: `{ provider: "opencode", model: string }`)

**`src/model.ts`**

- Add `OpenCodeModelOptions` schema (initially empty, extensible — mirrors `GeminiModelOptions`)
- Add `"opencode"` to `DEFAULT_MODEL_BY_PROVIDER` (default: user's configured default model from `GET /config` if available, otherwise `"moonshot/kimi-k2-5"` as hardcoded fallback)
- Add `"opencode"` to `DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER`
- Add `"opencode"` to `PROVIDER_DISPLAY_NAMES` → `"OpenCode"`

---

### 2. `apps/server` — Provider Implementation

#### `src/provider/Layers/OpenCodeAppServerManager.ts` _(new)_

Analogous to `codexAppServerManager.ts`. Responsibilities:

- **Spawn**: `opencode serve --port <port>` as a child process. Port is dynamically assigned (start from 4096, increment on conflict).
- **Readiness**: Poll `GET /health` with exponential backoff (max 10s) before declaring the server ready.
- **Lifecycle**: One server process per Bird Code session (not per thread). Reuse across threads.
- **Shutdown**: `SIGTERM` on `stopAll()`.
- **HTTP client**: Use Node's built-in `fetch` (available in Node 18+). No new dependencies needed.
- **SSE**: Use `EventSource` polyfill or `fetch` with streaming body to consume `GET /events/subscribe`.

#### `src/provider/Layers/OpenCodeProvider.ts` _(new)_

Analogous to `CodexProvider.ts`. Responsibilities:

- **`checkOpenCodeProviderStatus()`**: Runs `opencode --version` to detect installation and version.
- **`getOpenCodeModels(serverUrl)`**: Calls `GET /config/providers` → maps to `ServerProviderModel[]`.
  - Falls back to `OPENCODE_CURATED_MODELS` (static list ~20 popular models across Anthropic, OpenAI, Google, Mistral, local) if server unavailable or call fails.
- **`OpenCodeProviderLive`**: Effect Layer that manages snapshot lifecycle with caching and change detection — same pattern as `CodexProviderLive`.
- **Model capabilities**: Initially all models get `EMPTY_CAPABILITIES` (no reasoning effort toggles). Can be enriched later per-model.

**Curated fallback model list** (~20 entries, covering):

- `moonshot/kimi-k2-5` (hardcoded fallback default)
- `anthropic/claude-sonnet-4-5`, `anthropic/claude-opus-4`, `anthropic/claude-haiku-4`
- `openai/gpt-4o`, `openai/o3`, `openai/o4-mini`
- `google/gemini-2.5-pro`, `google/gemini-2.5-flash`
- `mistral/mistral-large`, `meta-llama/llama-3.3-70b`
- A handful of others (DeepSeek, Qwen, etc.)

#### `src/provider/Layers/OpenCodeAdapter.ts` _(new)_

Implements `ProviderAdapterShape`. Key methods:

| Method             | Implementation                                                                       |
| ------------------ | ------------------------------------------------------------------------------------ |
| `startSession`     | `POST /sessions` → store `{ sessionId, threadId }` mapping                           |
| `sendTurn`         | `POST /sessions/{id}/prompt` with `{ prompt: text, model: { providerID, modelID } }` |
| `interruptTurn`    | `POST /sessions/{id}/abort`                                                          |
| `respondToRequest` | `POST /sessions/{id}/permissions/{permissionId}`                                     |
| `stopSession`      | `DELETE /sessions/{id}`                                                              |
| `streamEvents`     | `GET /events/subscribe` (SSE) → map to canonical `ProviderRuntimeEvent`              |
| `readThread`       | `GET /sessions/{id}` → reconstruct `ProviderThreadSnapshot`                          |
| `rollbackThread`   | `POST /sessions/{id}/revert` N times                                                 |

**SSE → Canonical Event Mapping:**

OpenCode SSE events (`{ type, properties }`) map to `ProviderRuntimeEvent` as follows:

| OpenCode SSE `type`                 | Canonical event             |
| ----------------------------------- | --------------------------- |
| `session.updated` (status: running) | `turn.started`              |
| `message.part.text` delta           | `content.delta` (text)      |
| `message.completed`                 | `turn.completed`            |
| `session.error`                     | `turn.error`                |
| `permission.requested`              | `request.opened` (approval) |
| `session.updated` (status: idle)    | `turn.completed` (fallback) |

> Note: OpenCode's exact SSE event type names will be confirmed from `GET /events/subscribe` at runtime. The adapter will include a safe unknown-event passthrough to avoid crashes on new event types.

**Capabilities:**

```typescript
capabilities: {
  sessionModelSwitch: "restart-session";
  // Model is set per-prompt, but sessions are cheap to recreate
}
```

#### `src/provider/Layers/ProviderRegistry.ts` — Update

- Import and include `OpenCodeProviderLive` in `loadProviders()` alongside Codex, Claude, Gemini.

#### `src/provider/Layers/ProviderService.ts` — Update

- Register `OpenCodeAdapter` in `ProviderAdapterRegistry`.

---

### 3. `apps/web` — UI Changes

#### `src/components/chat/ProviderModelPicker.tsx` — Update

- Add OpenCode as a fourth provider option with the OpenCode logo/icon.
- **Search bar**: When the selected provider is `"opencode"`, show a text input that filters the model list. This is necessary because OpenCode can expose 75+ models. The search filters by model name/ID substring, case-insensitive.
- The search bar replaces the flat dropdown for OpenCode only — other providers keep their existing menu UI.
- Remove the "Coming soon: OpenCode" placeholder.

#### `src/providerModels.ts` — Update

- Add `"opencode"` handling to all utility functions (`getProviderModels`, `resolveSelectableProvider`, `getDefaultServerModel`, etc.). These are already provider-agnostic; adding the new key to the record types is sufficient.

#### `src/session-logic.ts` — Update

- Add `"opencode"` to `PROVIDER_OPTIONS`.

#### `src/lib/providerReactQuery.ts` — Update

- Ensure OpenCode provider snapshot is handled in queries.

#### `apps/web/src/modelSelection.ts` — Update

- Support up to 32 custom models for `"opencode"` provider (same as Gemini pattern).

---

## Model Search Bar — UX Design

The search bar appears inline in the provider model picker when `provider === "opencode"`:

```
[ OpenCode ▼ ] [ 🔍 Search models...        ]
               ┌─────────────────────────────┐
               │ anthropic/claude-sonnet-4-5  │ ← highlighted
               │ anthropic/claude-opus-4      │
               │ openai/gpt-4o                │
               │ openai/o3                    │
               │ google/gemini-2.5-pro        │
               │ ...                          │
               └─────────────────────────────┘
```

- Filter is client-side (models already loaded in state).
- Pressing Enter or clicking selects the top result.
- Empty search shows all models, grouped by provider prefix (`anthropic/`, `openai/`, etc.).
- Custom models added via the existing custom model dialog appear at the top with an "Custom" badge.

---

## Authentication

OpenCode manages its own authentication per-provider (stored in `~/.local/share/opencode/auth.json`). The Bird Code server does **not** manage OpenCode credentials — users configure `opencode auth` separately in their terminal. The snapshot will reflect `auth.status: "unauthenticated"` if credentials are missing for the selected model's provider.

---

## Dependencies

- **`@opencode-ai/sdk`** (optional): The TypeScript SDK wraps the HTTP API. We should evaluate whether to use it or make raw `fetch` calls.
  - **Recommendation: raw `fetch`** — keeps the dependency surface minimal, consistent with how Gemini is integrated, and avoids coupling to an early-stage SDK.
- **No new runtime deps required** for SSE: Node 18+ supports `fetch` with streaming response bodies. We'll implement a lightweight SSE parser (~30 lines).

---

## Error Handling

| Scenario                      | Behavior                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `opencode` not installed      | Snapshot `state: "error"`, message: "opencode CLI not found. Install with `npm i -g opencode-ai`." |
| Server fails to start         | `startSession` returns error; orchestration emits `turn.error`                                     |
| Model not available (no auth) | `POST /sessions/{id}/prompt` returns error → emit `turn.error` with message                        |
| SSE connection drops          | Reconnect with backoff (3 attempts), then mark session `state: "error"`                            |

---

## Testing & Verification

1. **Unit**: Mock HTTP calls in `OpenCodeAdapter` tests; verify SSE → canonical event mapping for each event type.
2. **Integration**: Start `opencode serve` in a test environment, send a prompt, verify events flow through to the WebSocket client.
3. **UI**: Verify model search filters correctly; verify provider picker shows OpenCode option; verify status banner reflects install/auth state.
4. **Regression**: Ensure existing Codex, Claude, Gemini providers are unaffected (`bun run test`, `bun typecheck`, `bun lint`).

---

## File Change Summary

| File                                                          | Change                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/contracts/src/orchestration.ts`                     | Add `"opencode"` to `ProviderKind`, `OpenCodeModelSelection` |
| `packages/contracts/src/model.ts`                             | Add `OpenCodeModelOptions`, defaults, display name           |
| `apps/server/src/provider/Layers/OpenCodeAppServerManager.ts` | New — subprocess + HTTP client                               |
| `apps/server/src/provider/Layers/OpenCodeProvider.ts`         | New — snapshot loader                                        |
| `apps/server/src/provider/Layers/OpenCodeAdapter.ts`          | New — adapter implementation                                 |
| `apps/server/src/provider/Layers/ProviderRegistry.ts`         | Register OpenCode provider                                   |
| `apps/server/src/provider/Layers/ProviderService.ts`          | Register OpenCode adapter                                    |
| `apps/web/src/components/chat/ProviderModelPicker.tsx`        | Add OpenCode option + search bar                             |
| `apps/web/src/providerModels.ts`                              | Add opencode to utility functions                            |
| `apps/web/src/session-logic.ts`                               | Add opencode to PROVIDER_OPTIONS                             |
| `apps/web/src/modelSelection.ts`                              | Add opencode custom model support                            |
| `apps/web/src/lib/providerReactQuery.ts`                      | Handle opencode snapshot                                     |
