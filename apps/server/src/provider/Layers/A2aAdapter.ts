/**
 * A2aAdapterLive - A2A protocol adapter for the Bird Code provider system.
 *
 * Implements ProviderAdapterShape by bridging to A2aClientService for
 * outbound communication with A2A agents. Sessions map 1:1 to A2A tasks.
 *
 * @module A2aAdapterLive
 */
import type {
  A2aAgentCardId,
  A2aTaskId,
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

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
} from "../Errors.ts";
import { A2aAdapter, type A2aAdapterShape } from "../Services/A2aAdapter.ts";
import type { ProviderThreadSnapshot } from "../Services/ProviderAdapter.ts";
import { A2aClientService } from "../../a2a/Services/A2aClientService.ts";

const PROVIDER = "a2a" as const satisfies ProviderKind;

interface A2aSessionState {
  readonly session: ProviderSession;
  readonly modelSelection?: ModelSelection;
  readonly agentCardId: A2aAgentCardId;
  readonly activeTaskId?: A2aTaskId;
  readonly turns: Array<{ id: TurnId; input: string; response: string }>;
}

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

export const A2aAdapterLive = Layer.effect(
  A2aAdapter,
  Effect.gen(function* () {
    const sessionsRef = yield* Ref.make(new Map<ThreadId, A2aSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );
    const a2aClient = yield* A2aClientService;

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    // ── Adapter methods ──────────────────────────────────────────────────

    const startSession: A2aAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const now = nowIso();
        // Extract agentCardId from model selection
        const modelSel = input.modelSelection as
          | { provider: "a2a"; agentCardId: A2aAgentCardId }
          | undefined;
        const agentCardId = modelSel?.agentCardId;
        if (!agentCardId) {
          return yield* Effect.die(
            new Error("A2A adapter requires agentCardId in modelSelection"),
          );
        }

        const session: ProviderSession = {
          provider: PROVIDER,
          status: "ready",
          runtimeMode: input.runtimeMode,
          threadId: input.threadId,
          cwd: input.cwd,
          model: input.modelSelection?.model,
          resumeCursor: input.resumeCursor,
          createdAt: now,
          updatedAt: now,
        };

        const sessionState: A2aSessionState = {
          session,
          modelSelection: input.modelSelection,
          agentCardId,
          turns: [],
        };

        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
          return next;
        });

        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "A2A agent session started.",
          }),
        );

        return session;
      });

    const sendTurn: A2aAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const state = yield* getSessionState(input.threadId);
        if (!state) {
          return yield* Effect.fail(
            new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId: input.threadId,
            }),
          );
        }

        const turnId = globalThis.crypto.randomUUID() as TurnId;
        const userText =
          typeof input.input === "string" ? input.input : JSON.stringify(input.input);

        // Emit turn started
        yield* emitEvent(
          makeThreadEvent(
            "turn.started",
            input.threadId,
            { turnId, model: state.session.model || "a2a-agent" },
            turnId,
          ),
        );

        // Send message to remote A2A agent via client
        const task = yield* a2aClient
          .sendMessage({
            agentCardId: state.agentCardId,
            message: {
              role: "user",
              parts: [{ type: "text", text: userText }],
            },
            taskId: state.activeTaskId,
          })
          .pipe(
            Effect.catch((err) =>
              Effect.gen(function* () {
                yield* emitEvent(
                  makeThreadEvent(
                    "turn.error",
                    input.threadId,
                    { turnId, error: String(err) },
                    turnId,
                  ),
                );
                return yield* Effect.fail(
                  new ProviderAdapterRequestError({
                    provider: PROVIDER,
                    method: "a2a.sendMessage",
                    detail: String(err),
                    cause: err,
                  }),
                );
              }),
            ),
          );

        // Extract response text from task
        const responseText =
          task.history
            ?.filter((m) => m.role === "agent")
            .flatMap((m) => m.parts)
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("\n") || "";

        // Emit assistant message
        const messageId = globalThis.crypto.randomUUID();
        yield* emitEvent(
          makeThreadEvent(
            "item.created",
            input.threadId,
            {
              item: {
                id: messageId,
                type: "assistant_message",
                content: responseText,
              },
            },
            turnId,
          ),
        );

        // Update session state with the task ID for continuation
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(input.threadId);
          if (current) {
            next.set(input.threadId, {
              ...current,
              activeTaskId: task.id,
              turns: [...current.turns, { id: turnId, input: userText, response: responseText }],
            });
          }
          return next;
        });

        // Emit turn completed
        yield* emitEvent(
          makeThreadEvent("turn.completed", input.threadId, { turnId }, turnId),
        );

        return { turnId } as ProviderTurnStartResult;
      });

    const interruptTurn: A2aAdapterShape["interruptTurn"] = (threadId, _turnId) =>
      Effect.gen(function* () {
        const state = yield* getSessionState(threadId);
        if (!state) {
          return yield* Effect.fail(
            new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId,
            }),
          );
        }
        if (state.activeTaskId) {
          yield* a2aClient
            .cancelTask(state.agentCardId, state.activeTaskId)
            .pipe(Effect.catch(() => Effect.void));
        }
      });

    const respondToRequest: A2aAdapterShape["respondToRequest"] = (_threadId, _requestId, _decision) =>
      Effect.void;

    const respondToUserInput: A2aAdapterShape["respondToUserInput"] = (_threadId, _requestId, _answers) =>
      Effect.void;

    const stopSession: A2aAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const state = yield* getSessionState(threadId);
        if (state?.activeTaskId) {
          yield* a2aClient
            .cancelTask(state.agentCardId, state.activeTaskId)
            .pipe(Effect.catch(() => Effect.void));
        }
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.delete(threadId);
          return next;
        });
      });

    const listSessions: A2aAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values()).map((s) => s.session)),
      );

    const hasSession: A2aAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    const readThread: A2aAdapterShape["readThread"] = (threadId) =>
      Effect.gen(function* () {
        const state = yield* getSessionState(threadId);
        if (!state) {
          return yield* Effect.fail(
            new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId,
            }),
          );
        }
        return {
          threadId,
          turns: state.turns.map((t) => ({ id: t.id, items: [] })),
        } satisfies ProviderThreadSnapshot;
      });

    const rollbackThread: A2aAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const state = yield* getSessionState(threadId);
        if (!state) {
          return yield* Effect.fail(
            new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId,
            }),
          );
        }
        const remainingTurns = state.turns.slice(0, Math.max(0, state.turns.length - numTurns));
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(threadId, { ...state, turns: remainingTurns });
          return next;
        });
        return {
          threadId,
          turns: remainingTurns.map((t) => ({ id: t.id, items: [] })),
        } satisfies ProviderThreadSnapshot;
      });

    const stopAll: A2aAdapterShape["stopAll"] = () =>
      Ref.set(sessionsRef, new Map());

    const refreshRateLimits: A2aAdapterShape["refreshRateLimits"] = () => Effect.void;

    return {
      provider: PROVIDER,
      capabilities: { sessionModelSwitch: "restart-session" as const },
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
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies A2aAdapterShape;
  }),
);
