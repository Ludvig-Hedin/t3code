/**
 * OllamaAdapter Layer - HTTP-based Ollama provider adapter.
 *
 * Connects to a local (or remote) Ollama server via the OpenAI-compatible
 * `/v1/chat/completions` endpoint with SSE streaming. Maintains full
 * multi-turn conversation history per session in-memory.
 *
 * Key design points:
 * - No CLI spawning — uses Node.js `fetch` with SSE streaming.
 * - One `AbortController` per active turn enables real-time interrupts.
 * - Full `messages[]` array sent on each turn for multi-turn context.
 * - SSE chunks are accumulated into a single string; ONE `content.delta`
 *   event is emitted after streaming completes (consistent with other adapters).
 * - Rolling back N turns removes N×2 messages (1 user + 1 assistant each).
 *
 * @module OllamaAdapterLive
 */
import { spawn } from "node:child_process";
import { APP_NAME } from "@t3tools/shared/branding";
import type {
  ModelSelection,
  ProviderKind,
  ProviderRuntimeEvent,
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

// ── Internal state types ─────────────────────────────────────────────────────

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
  // Full message history sent to Ollama on every turn for multi-turn context
  messages: OllamaMessage[];
  turns: OllamaTurnRecord[];
  interruptedTurns: Set<TurnId>;
  // One AbortController per active turn; keyed by TurnId for targeted cancel
  abortControllers: Map<TurnId, AbortController>;
}

// ── SSE response shape from /v1/chat/completions ────────────────────────────

interface OllamaSseDelta {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

// ── Module-level helpers (no closure dependency) ─────────────────────────────

const PROVIDER = "ollama" as const satisfies ProviderKind;
const DEFAULT_MODEL = "llama3.2";

function nowIso(): string {
  return new Date().toISOString();
}

function newEventId(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Constructs a typed ProviderRuntimeEvent without any `undefined` fields leaking.
 * Copied exactly from GeminiAdapter to stay consistent across adapters.
 */
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
 * Read and accumulate an SSE stream from the Ollama `/v1/chat/completions`
 * endpoint. Returns the full assistant text and whether the request was aborted.
 *
 * NOTE: This is a plain async function. Because we cannot `yield*` Effect
 * inside a Promise, all Effect-dependent logic (emitting events) must happen
 * after this resolves in the Effect chain via `.pipe(Effect.andThen(...))`.
 */
async function readOlllamaSseStream(
  response: Response,
  signal: AbortSignal,
): Promise<{ assistantContent: string; aborted: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) {
    return { assistantContent: "", aborted: false };
  }

  const decoder = new TextDecoder();
  let assistantContent = "";
  let aborted = false;

  try {
    while (true) {
      if (signal.aborted) {
        aborted = true;
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Each SSE chunk may contain multiple `data: ...` lines
      for (const line of chunk.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const json = trimmed.slice(5).trim();
        if (json === "[DONE]") continue;
        try {
          const parsed = JSON.parse(json) as OllamaSseDelta;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            assistantContent += delta;
          }
        } catch {
          // Skip malformed SSE lines — Ollama occasionally emits keep-alive pings
        }
      }
    }
  } catch (err) {
    // AbortError from the AbortController signal
    if (err instanceof Error && err.name === "AbortError") {
      aborted = true;
    }
  } finally {
    // Always release the reader lock so the underlying socket can be reused
    reader.releaseLock();
  }

  return { assistantContent, aborted };
}

// ── Ollama connectivity & auto-start helpers ─────────────────────────────────

/**
 * Quick connectivity probe — returns true if the Ollama API responds within
 * 2 seconds. Used by ensureOllamaRunning to check reachability before and
 * after attempting to spawn `ollama serve`.
 */
async function pingOllama(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Module-level serialisation lock for Ollama auto-start.
 *
 * When multiple concurrent turns all fail with a connection error at the same
 * time, only the first caller spawns `ollama serve`; every subsequent caller
 * piggybacks on the same in-flight promise rather than spawning additional
 * processes. Cleared in a `finally` block after the promise settles so that a
 * future disconnection (e.g. the user quits Ollama and sends another prompt)
 * triggers a fresh spawn rather than waiting on an already-resolved promise.
 */
let ensureOllamaPromise: Promise<string | null> | null = null;

/**
 * Ensure Ollama is reachable, auto-starting it if needed.
 *
 * Strategy:
 * 1. Check the configured URL and, if it uses "localhost", also check 127.0.0.1
 *    (macOS can route localhost → ::1 (IPv6) while Ollama listens on 127.0.0.1).
 * 2. If neither is reachable, serialise the spawn: if another caller already
 *    holds the module-level lock promise, await that and then re-check
 *    pingOllama so we return the reachable candidate URL (or null) ourselves.
 * 3. Otherwise own the lock, spawn `ollama serve` in the background, poll
 *    until one of the candidate URLs responds or timeoutMs elapses, then clear
 *    the lock so subsequent calls can retry if needed.
 *
 * Returns the first URL that becomes reachable, or null if the timeout expires.
 */
async function ensureOllamaRunning(
  configuredBaseUrl: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  // Build candidate URLs: configured + optional IPv4 fallback.
  // macOS occasionally resolves 'localhost' → ::1 (IPv6) while Ollama listens
  // on 127.0.0.1 (IPv4), so we always probe the IPv4 variant as a fallback.
  const candidates = [configuredBaseUrl];
  if (/localhost/i.test(configuredBaseUrl)) {
    candidates.push(configuredBaseUrl.replace(/localhost/gi, "127.0.0.1"));
  }

  // Fast path: check reachability before touching the lock.
  // If Ollama is already running (the common case) return immediately.
  for (const url of candidates) {
    if (await pingOllama(url)) return url;
  }

  // None reachable — serialise the spawn attempt.
  // If another concurrent caller already holds the lock, piggyback on its
  // promise, then re-check reachability ourselves so we return the correct URL.
  if (ensureOllamaPromise !== null) {
    await ensureOllamaPromise;
    for (const url of candidates) {
      if (await pingOllama(url)) return url;
    }
    return null;
  }

  // We are the first caller to discover Ollama is down — own the lock.
  ensureOllamaPromise = (async (): Promise<string | null> => {
    try {
      // Spawn `ollama serve` detached so it survives beyond this process and
      // can be reused by subsequent sessions.
      try {
        const proc = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
        proc.unref();
      } catch {
        // `ollama` not found in PATH — cannot auto-start
        return null;
      }

      // Poll until one of the candidate URLs responds or the deadline is reached
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        for (const url of candidates) {
          if (await pingOllama(url)) return url;
        }
      }

      return null;
    } finally {
      // Always clear the lock after the promise settles (success or failure) so
      // a later disconnection can trigger a fresh spawn attempt.
      ensureOllamaPromise = null;
    }
  })();

  return ensureOllamaPromise;
}

/**
 * Returns true if the httpError string is an HTTP status error (e.g. "404: …").
 * These are intentional server responses — we should NOT retry them with auto-start.
 * Connection errors (ECONNREFUSED, "fetch failed", etc.) return false.
 */
function isOllamaHttpStatusError(httpError: string): boolean {
  return /^\d{3}:/.test(httpError.trim());
}

/**
 * Execute one Ollama chat-completions request and stream the response.
 * All errors are caught and returned as { httpError } so the Effect chain
 * stays clean. Extracted so it can be called twice — first attempt then
 * once more after auto-start with the confirmed reachable URL.
 */
async function fetchOllamaCompletions(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  signal: AbortSignal,
): Promise<{ assistantContent: string; aborted: boolean; httpError: string | null }> {
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      // Treat non-2xx as a failed turn — error text surfaced in turn.completed
      return {
        assistantContent: "",
        aborted: false,
        httpError: `${response.status}: ${errorText}`,
      };
    }

    const { assistantContent, aborted } = await readOlllamaSseStream(response, signal);
    return { assistantContent, aborted, httpError: null };
  } catch (err) {
    // AbortError from controller.abort() means the turn was interrupted
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      assistantContent: "",
      aborted: isAbort,
      httpError: isAbort ? null : String(err),
    };
  }
}

// ── Layer ────────────────────────────────────────────────────────────────────

export const OllamaAdapterLive = Layer.effect(
  OllamaAdapter,
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService;
    const sessionsRef = yield* Ref.make(new Map<ThreadId, OllamaSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    const updateSessionState = (
      threadId: ThreadId,
      updater: (current: OllamaSessionState) => OllamaSessionState,
    ) =>
      Ref.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        const current = next.get(threadId);
        if (!current) return sessions;
        next.set(threadId, updater(current));
        return next;
      });

    const createSession = (input: ProviderSessionStartInput): OllamaSessionState => {
      const now = nowIso();
      return {
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
    };

    // ── startSession ──────────────────────────────────────────────────────────

    const startSession: OllamaAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const sessionState = createSession(input);
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
          return next;
        });
        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "Ollama HTTP session started.",
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

    // ── sendTurn ──────────────────────────────────────────────────────────────

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
        const model = modelSelection?.model ?? sessionState.session.model ?? DEFAULT_MODEL;

        // Build the user message content (plain text; attachments noted but not embedded)
        let userContent = typeof input.input === "string" ? input.input.trim() : "";
        if (input.attachments && input.attachments.length > 0) {
          const attachmentLines = input.attachments
            .map((a) => `[Attachment: ${a.name} (${a.mimeType}, ${a.sizeBytes} bytes)]`)
            .join("\n");
          userContent = userContent ? `${userContent}\n${attachmentLines}` : attachmentLines;
        }

        // Append user message to history BEFORE the fetch so it is visible
        // even if the turn is interrupted
        yield* updateSessionState(input.threadId, (current) => ({
          ...current,
          messages: [...current.messages, { role: "user" as const, content: userContent }],
          session: {
            ...current.session,
            status: "running",
            activeTurnId: turnId,
            model,
            updatedAt: nowIso(),
          },
        }));

        // Create an AbortController so interruptTurn can cancel the fetch
        const abortController = new AbortController();
        yield* updateSessionState(input.threadId, (current) => {
          const nextControllers = new Map(current.abortControllers);
          nextControllers.set(turnId, abortController);
          return { ...current, abortControllers: nextControllers };
        });

        yield* emitEvent(makeThreadEvent("turn.started", input.threadId, { model }, turnId));

        // Read baseUrl fresh from settings on every turn so runtime config changes apply immediately.
        // orDie converts the infra-level ServerSettingsError into a defect — provider adapters
        // are not expected to surface settings errors as typed channel errors.
        const serverSettings = yield* settings.getSettings.pipe(Effect.orDie);
        const baseUrl = serverSettings.providers.ollama.baseUrl.replace(/\/$/, "");

        // Snapshot the current messages for this request (already includes the user message above)
        const messagesSnapshot = yield* Ref.get(sessionsRef).pipe(
          Effect.map((sessions) => sessions.get(input.threadId)?.messages ?? []),
        );

        // Perform the SSE fetch inside Effect.promise (no typed error channel).
        // On connection failure (Ollama not running) ensureOllamaRunning is called;
        // it serialises the spawn attempt via a module-level promise so concurrent
        // turns don't each launch their own `ollama serve` process.
        const streamResult = yield* Effect.promise(
          async (): Promise<{
            assistantContent: string;
            aborted: boolean;
            httpError: string | null;
          }> => {
            // First attempt with the configured baseUrl
            const firstResult = await fetchOllamaCompletions(
              baseUrl,
              model,
              messagesSnapshot,
              abortController.signal,
            );

            // Succeeded, was intentionally aborted, or returned an HTTP status
            // error (4xx/5xx) — no point retrying with auto-start in any of those cases.
            if (
              firstResult.httpError === null ||
              firstResult.aborted ||
              abortController.signal.aborted ||
              isOllamaHttpStatusError(firstResult.httpError)
            ) {
              return firstResult;
            }

            // Connection-level failure: Ollama may not be running or localhost resolves
            // to IPv6 while Ollama is on 127.0.0.1. Ensure Ollama is reachable (auto-spawn
            // if needed, serialised via module-level lock) and retry once with the
            // confirmed-reachable URL so the turn succeeds without user intervention.
            const effectiveUrl = await ensureOllamaRunning(baseUrl);
            if (effectiveUrl === null) {
              // Could not reach or start Ollama — surface the original error
              return firstResult;
            }

            // Retry with the URL that Ollama is actually listening on
            return fetchOllamaCompletions(
              effectiveUrl,
              model,
              messagesSnapshot,
              abortController.signal,
            );
          },
        );

        // Clean up the abort controller now that the fetch has resolved
        yield* updateSessionState(input.threadId, (current) => {
          const nextControllers = new Map(current.abortControllers);
          nextControllers.delete(turnId);
          return { ...current, abortControllers: nextControllers };
        });

        const { assistantContent, aborted, httpError } = streamResult;

        // Check if interruptTurn was called concurrently (sets interruptedTurns)
        const markedInterrupted = yield* Ref.get(sessionsRef).pipe(
          Effect.map(
            (sessions) => sessions.get(input.threadId)?.interruptedTurns.has(turnId) ?? false,
          ),
        );

        const turnState: OllamaTurnState =
          aborted || markedInterrupted ? "interrupted" : httpError ? "failed" : "completed";

        // Emit events AFTER the promise resolves (cannot yield* Effect inside Promise)
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
          // Emit accumulated content as a single delta (consistent with other adapters)
          if (assistantContent.length > 0) {
            yield* emitEvent(
              makeThreadEvent(
                "content.delta",
                input.threadId,
                { streamKind: "assistant_text", delta: assistantContent },
                turnId,
              ),
            );
          }
          yield* emitEvent(
            makeThreadEvent(
              "turn.completed",
              input.threadId,
              {
                state: turnState,
                ...(httpError ? { errorMessage: httpError } : {}),
              },
              turnId,
            ),
          );
        }

        // Persist the turn record and append assistant message to history.
        // On interrupt we still append what we have so rollback works correctly.
        yield* updateSessionState(input.threadId, (current) => {
          const nextTurn: OllamaTurnRecord = {
            id: turnId,
            userContent,
            assistantContent,
            model,
            state: turnState,
          };
          // Only append assistant message if there is content to avoid empty slots
          const nextMessages: OllamaMessage[] =
            assistantContent.length > 0
              ? [...current.messages, { role: "assistant" as const, content: assistantContent }]
              : current.messages;

          return {
            ...current,
            messages: nextMessages,
            turns: [...current.turns, nextTurn],
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
            interruptedTurns: new Set(
              Array.from(current.interruptedTurns).filter((t) => t !== turnId),
            ),
          };
        });

        return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
      });

    // ── interruptTurn ─────────────────────────────────────────────────────────

    const interruptTurn: OllamaAdapterShape["interruptTurn"] = (threadId, turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        const targetTurnId = turnId ?? sessionState.session.activeTurnId;
        if (!targetTurnId) return;

        // Abort the in-flight fetch immediately
        const controller = sessionState.abortControllers.get(targetTurnId);
        if (controller) {
          controller.abort();
        }

        yield* updateSessionState(threadId, (current) => ({
          ...current,
          interruptedTurns: new Set([...current.interruptedTurns, targetTurnId]),
          session: {
            ...current.session,
            status: "ready",
            activeTurnId: undefined,
            updatedAt: nowIso(),
          },
        }));
      });

    // ── respondToRequest / respondToUserInput ─────────────────────────────────

    const respondToRequest: OllamaAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Ollama adapter does not implement request responses (${String(requestId)} -> ${decision}).`,
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
          message: `Ollama adapter does not implement structured user input responses (${String(requestId)}).`,
          detail: null,
        }),
      );

    // ── stopSession ───────────────────────────────────────────────────────────

    const stopSession: OllamaAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        // Abort any in-flight turns before removing the session
        for (const controller of sessionState.abortControllers.values()) {
          controller.abort();
        }

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

    // ── listSessions / hasSession ─────────────────────────────────────────────

    const listSessions: OllamaAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: OllamaAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    // ── readThread ────────────────────────────────────────────────────────────

    const readThread: OllamaAdapterShape["readThread"] = (threadId) =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => {
          const sessionState = sessions.get(threadId);
          return {
            threadId,
            turns: sessionState
              ? sessionState.turns.map((turn) => ({
                  id: turn.id,
                  items:
                    turn.assistantContent.length > 0
                      ? [{ role: "assistant", text: turn.assistantContent }]
                      : [],
                }))
              : [],
          };
        }),
      );

    // ── rollbackThread ────────────────────────────────────────────────────────

    const rollbackThread: OllamaAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return { threadId, turns: [] };
        }

        const nextTurns = sessionState.turns.slice(
          0,
          Math.max(0, sessionState.turns.length - numTurns),
        );

        // Calculate messages to remove based on turn state:
        // - Completed turns: 2 messages (user + assistant, since both were appended to messages[])
        // - Failed/interrupted turns: 1 message (user only, assistant not appended on non-success)
        const removedTurns = sessionState.turns.slice(nextTurns.length);
        const messagesToRemove = removedTurns.reduce(
          (acc, t) => acc + (t.state === "completed" ? 2 : 1),
          0,
        );
        const nextMessages = sessionState.messages.slice(
          0,
          Math.max(0, sessionState.messages.length - messagesToRemove),
        );

        yield* updateSessionState(threadId, (current) => ({
          ...current,
          turns: nextTurns,
          messages: nextMessages,
          session: { ...current.session, updatedAt: nowIso() },
        }));

        return {
          threadId,
          turns: nextTurns.map((turn) => ({
            id: turn.id,
            items:
              turn.assistantContent.length > 0
                ? [{ role: "assistant", text: turn.assistantContent }]
                : [],
          })),
        };
      });

    // ── stopAll ───────────────────────────────────────────────────────────────

    const stopAll: OllamaAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const entry of sessions.values()) {
          // Abort any in-flight turns
          for (const controller of entry.abortControllers.values()) {
            controller.abort();
          }
          yield* emitEvent(
            makeThreadEvent("session.exited", entry.session.threadId, {
              reason: `All sessions stopped from ${APP_NAME}.`,
              recoverable: false,
              exitKind: "graceful",
            }),
          );
        }
        yield* Ref.set(sessionsRef, new Map());
      });

    return {
      provider: PROVIDER,
      capabilities: {
        // Model is passed per-request; no session restart needed for model changes
        sessionModelSwitch: "in-session",
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
      // Ollama does not expose a pull rate-limit API; no-op.
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies OllamaAdapterShape;
  }),
);
