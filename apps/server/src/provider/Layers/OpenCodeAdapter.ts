/**
 * OpenCodeAdapter Layer — HTTP+SSE implementation of ProviderAdapterShape
 * for the OpenCode provider.
 *
 * Communicates with a local `opencode serve` process via REST API and
 * subscribes to session events via SSE. One opencode server is shared
 * across all sessions (managed by OpenCodeAppServerManager).
 *
 * Verified API (opencode v1.3.x):
 *   POST   /session                              — create session
 *   POST   /session/{id}/message                — send prompt
 *   POST   /session/{id}/abort                  — interrupt turn
 *   DELETE /session/{id}                        — stop session
 *   GET    /event?sessionID={id}                — SSE stream
 *
 * SSE format: each line is `data: {json}` where json = { type, properties }.
 * There is no separate `event:` header line.
 *
 * @module OpenCodeAdapterLive
 */
import { APP_NAME } from "@t3tools/shared/branding";
import type {
  ProviderKind,
  ProviderRuntimeEvent,
  ProviderSession,
  ProviderTurnStartResult,
  ProviderUserInputAnswers,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import { ProviderAdapterRequestError, ProviderAdapterSessionNotFoundError } from "../Errors.ts";
import { OpenCodeAdapter, type OpenCodeAdapterShape } from "../Services/OpenCodeAdapter.ts";
import {
  makeOpenCodeServerHandleRef,
  type OpenCodeHttpClient,
} from "./OpenCodeAppServerManager.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const PROVIDER = "opencode" as const satisfies ProviderKind;

/** Max SSE reconnect attempts before emitting turn.error */
const SSE_MAX_RECONNECTS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

/** Build a canonical ProviderRuntimeEvent with common fields pre-filled. */
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
 * Parse an OpenCode model slug (e.g. "openrouter/anthropic/claude-haiku-4.5")
 * into { providerID, modelID } for the opencode REST API.
 *
 * The API expects the first path segment as providerID and the rest as modelID.
 * Examples:
 *   "openrouter/anthropic/claude-haiku-4.5" → { providerID: "openrouter", modelID: "anthropic/claude-haiku-4.5" }
 *   "opencode/big-pickle"                   → { providerID: "opencode",   modelID: "big-pickle" }
 */
function parseModelSlug(slug: string): { providerID: string; modelID: string } {
  const slashIdx = slug.indexOf("/");
  if (slashIdx === -1) {
    // No slash — treat entire slug as modelID under "openrouter" (best-effort fallback)
    return { providerID: "openrouter", modelID: slug };
  }
  return {
    providerID: slug.slice(0, slashIdx),
    modelID: slug.slice(slashIdx + 1),
  };
}

// ---------------------------------------------------------------------------
// Session state kept per thread
// ---------------------------------------------------------------------------

interface OpenCodeSessionState {
  readonly session: ProviderSession;
  /** The opencode server-side session ID (returned from POST /session). */
  readonly opencodeSessionId: string;
  /** Model slug used for this session (e.g. "openrouter/anthropic/claude-haiku-4.5"). */
  readonly modelSlug: string;
  /** AbortController for the active SSE connection, if any. */
  sseAbort: AbortController | null;
  /** Number of consecutive SSE reconnect failures. */
  sseReconnects: number;
}

// ---------------------------------------------------------------------------
// SSE event listener
// ---------------------------------------------------------------------------

/**
 * opencode SSE envelope: every `data:` line is a JSON object with this shape.
 * There is no separate `event:` prefix — the type lives inside the JSON.
 */
interface OpenCodeSseEnvelope {
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Subscribe to opencode SSE events for a session and map them into
 * canonical ProviderRuntimeEvents published to the shared PubSub.
 *
 * SSE path: GET /event?sessionID={id}
 * Each `data:` line contains a complete JSON envelope { type, properties }.
 *
 * Reconnects up to SSE_MAX_RECONNECTS times with exponential backoff.
 */
function startSseListener(
  client: OpenCodeHttpClient,
  sessionState: OpenCodeSessionState,
  threadId: ThreadId,
  turnId: TurnId,
  emitEvent: (event: ProviderRuntimeEvent) => void,
): AbortController {
  const abort = new AbortController();

  const connect = (attempt: number) => {
    // Filter to this session's events to avoid cross-session noise
    const url = `${client.baseUrl}/event?sessionID=${sessionState.opencodeSessionId}`;
    fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: abort.signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) {
          throw new Error(`SSE connect failed: ${res.status}`);
        }
        // Reset reconnect counter on successful connection
        sessionState.sseReconnects = 0;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Each SSE message is a single `data: {json}` line followed by a blank line.
          // We split on newlines and process each `data:` line immediately.
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const jsonStr = line.slice(5).trim();
            if (!jsonStr) continue;
            try {
              const envelope = JSON.parse(jsonStr) as OpenCodeSseEnvelope;
              mapSseEvent(envelope, threadId, turnId, emitEvent);
            } catch {
              // Malformed JSON — skip silently
            }
          }
        }

        // Stream ended cleanly — if not aborted, attempt reconnect
        if (!abort.signal.aborted) {
          reconnect(attempt);
        }
      })
      .catch((_err: unknown) => {
        if (abort.signal.aborted) return;
        reconnect(attempt);
      });
  };

  const reconnect = (attempt: number) => {
    sessionState.sseReconnects++;
    if (sessionState.sseReconnects > SSE_MAX_RECONNECTS) {
      emitEvent(
        makeThreadEvent(
          "turn.error" as ProviderRuntimeEvent["type"],
          threadId,
          { message: "SSE connection lost after max reconnect attempts.", detail: null } as never,
          turnId,
        ),
      );
      return;
    }
    // Exponential backoff: 1s, 2s, 3s
    const delayMs = sessionState.sseReconnects * 1000;
    setTimeout(() => {
      if (!abort.signal.aborted) {
        connect(attempt + 1);
      }
    }, delayMs);
  };

  connect(0);
  return abort;
}

/**
 * Map a single SSE envelope from opencode into a canonical ProviderRuntimeEvent.
 *
 * Verified event types (opencode v1.3.x):
 *   session.status     { status: { type: "busy" | "idle" } }  — running/completed
 *   session.idle       {}                                       — turn completed
 *   session.error      { error: { data: { message: string } } } — turn error
 *   message.part.delta { field: "text", delta: string }         — streaming text
 */
function mapSseEvent(
  envelope: OpenCodeSseEnvelope,
  threadId: ThreadId,
  turnId: TurnId,
  emitEvent: (event: ProviderRuntimeEvent) => void,
): void {
  const props = envelope.properties;
  switch (envelope.type) {
    case "session.status": {
      const status = (props.status as { type?: string } | undefined)?.type;
      // "busy" = model is thinking; "idle" = turn completed
      if (status === "idle") {
        emitEvent(makeThreadEvent("turn.completed", threadId, { state: "completed" }, turnId));
      }
      // We already emit turn.started eagerly in sendTurn; skip busy to avoid duplicate.
      break;
    }
    case "session.idle": {
      // Redundant with session.status idle, but emit turn.completed as a safety net.
      // The duplicate is harmless because the orchestration layer deduplicates by turnId.
      emitEvent(makeThreadEvent("turn.completed", threadId, { state: "completed" }, turnId));
      break;
    }
    case "message.part.delta": {
      // Streaming text delta from the assistant.
      // props: { field: "text", delta: string, messageID, partID, sessionID }
      if (props.field === "text" && typeof props.delta === "string" && props.delta.length > 0) {
        emitEvent(
          makeThreadEvent(
            "content.delta",
            threadId,
            { streamKind: "assistant_text", delta: props.delta },
            turnId,
          ),
        );
      }
      break;
    }
    case "session.error": {
      // error shape: { name: string, data: { message: string } }
      const errData = props.error as { data?: { message?: string } } | undefined;
      const message =
        errData?.data?.message ?? (typeof props.message === "string" ? props.message : "Unknown opencode session error");
      emitEvent(
        makeThreadEvent(
          "turn.error" as ProviderRuntimeEvent["type"],
          threadId,
          { message, detail: null } as never,
          turnId,
        ),
      );
      break;
    }
    case "permission.requested": {
      emitEvent(
        makeThreadEvent(
          "request.opened",
          threadId,
          {
            requestType: "command_execution_approval",
            detail: typeof props.description === "string" ? props.description : undefined,
            args: props,
          },
          turnId,
        ),
      );
      break;
    }
    default:
      // Unknown event type — silently skip (future-proof)
      break;
  }
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const OpenCodeAdapterLive = Layer.effect(
  OpenCodeAdapter,
  Effect.gen(function* () {
    // Get binary path from settings for the server manager
    const serverSettings = yield* ServerSettingsService;
    const settings = yield* serverSettings.getSettings;
    const binaryPath = settings.providers.opencode.binaryPath;

    const serverManager = yield* makeOpenCodeServerHandleRef(binaryPath);

    const sessionsRef = yield* Ref.make(new Map<ThreadId, OpenCodeSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    /** Synchronous emit for use inside SSE callbacks (non-Effect context). */
    const emitEventSync = (event: ProviderRuntimeEvent): void => {
      Effect.runFork(emitEvent(event));
    };

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    const updateSessionState = (
      threadId: ThreadId,
      updater: (current: OpenCodeSessionState) => OpenCodeSessionState,
    ) =>
      Ref.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        const current = next.get(threadId);
        if (!current) return sessions;
        next.set(threadId, updater(current));
        return next;
      });

    // -----------------------------------------------------------------------
    // Adapter methods
    // -----------------------------------------------------------------------

    const startSession: OpenCodeAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const handle = yield* serverManager.getOrStart.pipe(
          Effect.mapError(
            (e) =>
              new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "startSession",
                detail: `Failed to start opencode server: ${e instanceof Error ? e.message : String(e)}`,
              }),
          ),
        );

        // Resolve default model:
        // Priority: 1) explicit caller selection, 2) GET /config default, 3) hardcoded fallback
        const configResult = yield* Effect.tryPromise({
          try: () => handle.client.get<{ model?: string }>("/config"),
          catch: () => null as { model?: string } | null,
        }).pipe(Effect.orElseSucceed(() => null));
        const serverDefault = configResult?.model ?? null;
        // Use the exact slug format returned by opencode (e.g. "openrouter/anthropic/claude-haiku-4.5")
        const modelSlug =
          input.modelSelection?.model ?? serverDefault ?? "openrouter/moonshotai/kimi-k2.5";

        // Create session on opencode server — POST /session (no body required)
        const sessionRes = yield* Effect.tryPromise({
          try: () => handle.client.post<{ id: string }>("/session", {}),
          catch: (err) =>
            new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "startSession",
              detail: `POST /session failed: ${err instanceof Error ? err.message : String(err)}`,
            }),
        });
        const opencodeSessionId = sessionRes.id;

        const now = nowIso();
        const providerSession: ProviderSession = {
          provider: PROVIDER,
          status: "ready",
          runtimeMode: input.runtimeMode,
          threadId: input.threadId,
          cwd: input.cwd,
          model: modelSlug,
          resumeCursor: input.resumeCursor,
          createdAt: now,
          updatedAt: now,
        };

        const sessionState: OpenCodeSessionState = {
          session: providerSession,
          opencodeSessionId,
          modelSlug,
          sseAbort: null,
          sseReconnects: 0,
        };

        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
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
        const sessionState = yield* getSessionState(input.threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        const handle = yield* serverManager.getOrStart.pipe(
          Effect.mapError(
            (e) =>
              new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "sendTurn",
                detail: `Failed to get opencode server handle: ${e instanceof Error ? e.message : String(e)}`,
              }),
          ),
        );

        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const modelSlug = input.modelSelection?.model ?? sessionState.modelSlug;
        const { providerID, modelID } = parseModelSlug(modelSlug);

        // Update session state to running
        yield* updateSessionState(input.threadId, (current) => ({
          ...current,
          session: {
            ...current.session,
            status: "running",
            activeTurnId: turnId,
            model: modelSlug,
            updatedAt: nowIso(),
          },
        }));

        yield* emitEvent(
          makeThreadEvent("turn.started", input.threadId, { model: modelSlug }, turnId),
        );

        // Start SSE listener before sending the prompt so we don't miss early events
        const sseAbort = startSseListener(
          handle.client,
          sessionState,
          input.threadId,
          turnId,
          emitEventSync,
        );

        yield* updateSessionState(input.threadId, (current) => ({
          ...current,
          sseAbort,
        }));

        // Send message to opencode — POST /session/{id}/message
        // Body: { parts: [{ type: "text", text: string }], model: { providerID, modelID } }
        yield* Effect.tryPromise({
          try: () =>
            handle.client.post(`/session/${sessionState.opencodeSessionId}/message`, {
              parts: [{ type: "text", text: input.input ?? "" }],
              model: { providerID, modelID },
            }),
          catch: (err) =>
            new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "sendTurn",
              detail: `POST /session/${sessionState.opencodeSessionId}/message failed: ${err instanceof Error ? err.message : String(err)}`,
            }),
        }).pipe(Effect.tapError(() => Effect.sync(() => sseAbort.abort())));

        return {
          threadId: input.threadId,
          turnId,
        } satisfies ProviderTurnStartResult;
      });

    const interruptTurn: OpenCodeAdapterShape["interruptTurn"] = (threadId, _turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        // Abort SSE first
        sessionState.sseAbort?.abort();

        // POST /session/{id}/abort to cancel the running turn
        const handle = yield* serverManager.getOrStart.pipe(Effect.orDie);
        yield* Effect.tryPromise({
          try: () => handle.client.post(`/session/${sessionState.opencodeSessionId}/abort`),
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));

        const targetTurnId = _turnId ?? sessionState.session.activeTurnId;
        yield* updateSessionState(threadId, (current) => ({
          ...current,
          sseAbort: null,
          session: {
            ...current.session,
            status: "ready",
            activeTurnId: undefined,
            updatedAt: nowIso(),
          },
        }));

        if (targetTurnId) {
          yield* emitEvent(
            makeThreadEvent(
              "turn.aborted",
              threadId,
              { reason: "Interrupted by user." },
              targetTurnId,
            ),
          );
        }
      });

    const respondToRequest: OpenCodeAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
          });
        }

        const handle = yield* serverManager.getOrStart.pipe(Effect.orDie);
        const approved = decision === "accept" || decision === "acceptForSession";
        yield* Effect.tryPromise({
          try: () =>
            handle.client.post(
              `/session/${sessionState.opencodeSessionId}/permissions/${requestId}`,
              { approved },
            ),
          catch: (err) =>
            new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "respondToRequest",
              detail: `POST permissions failed: ${err instanceof Error ? err.message : String(err)}`,
            }),
        });
      });

    const respondToUserInput: OpenCodeAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `OpenCode adapter does not yet implement structured user input responses (${String(requestId)}).`,
          detail: null,
        }),
      );

    const stopSession: OpenCodeAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        // Abort SSE
        sessionState.sseAbort?.abort();

        // DELETE /session/{id}
        const handle = yield* serverManager.getOrStart.pipe(Effect.orDie);
        yield* Effect.tryPromise({
          try: () => handle.client.delete(`/session/${sessionState.opencodeSessionId}`),
          catch: () => null,
        }).pipe(Effect.orElseSucceed(() => null));

        yield* emitEvent(
          makeThreadEvent("session.exited", threadId, {
            reason: `Session stopped from ${APP_NAME}.`,
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

    const listSessions: OpenCodeAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: OpenCodeAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    const readThread: OpenCodeAdapterShape["readThread"] = (threadId) =>
      Effect.succeed({
        threadId,
        turns: [] as ReadonlyArray<{ id: TurnId; items: ReadonlyArray<unknown> }>,
      });

    const rollbackThread: OpenCodeAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return { threadId, turns: [] };
        }

        const handle = yield* serverManager.getOrStart.pipe(Effect.orDie);
        // POST /session/{id}/revert N times
        for (let i = 0; i < numTurns; i++) {
          const revertResult = yield* Effect.tryPromise({
            try: () => handle.client.post(`/session/${sessionState.opencodeSessionId}/revert`),
            catch: () => "revert-failed" as const,
          }).pipe(Effect.orElseSucceed(() => "revert-failed" as const));
          if (revertResult === "revert-failed") break;
        }

        return { threadId, turns: [] };
      });

    const stopAll: OpenCodeAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const [threadId, state] of sessions.entries()) {
          state.sseAbort?.abort();
          yield* emitEvent(
            makeThreadEvent("session.exited", threadId, {
              reason: `All sessions stopped from ${APP_NAME}.`,
              recoverable: false,
              exitKind: "graceful",
            }),
          );
        }
        // Stop the opencode server process
        yield* serverManager.stop;
        yield* Ref.set(sessionsRef, new Map());
      });

    return {
      provider: PROVIDER,
      capabilities: {
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
      // OpenCode does not expose a rate-limit read API; no-op.
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies OpenCodeAdapterShape;
  }),
);
