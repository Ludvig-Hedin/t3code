import { APP_NAME } from "@t3tools/shared/branding";
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
import { type ChildProcess as NodeChildProcess } from "node:child_process";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import { ProviderAdapterSessionNotFoundError } from "../Errors.ts";
import { GeminiAdapter, type GeminiAdapterShape } from "../Services/GeminiAdapter.ts";
import { runProcess } from "../../processRunner.ts";

type GeminiTurnState = "completed" | "failed" | "interrupted";

interface GeminiTurnRecord {
  readonly id: TurnId;
  readonly input: string;
  readonly response: string;
  readonly model: string;
  readonly state: GeminiTurnState;
  readonly items: ReadonlyArray<unknown>;
}

interface GeminiSessionState {
  readonly session: ProviderSession;
  readonly modelSelection?: ModelSelection;
  readonly turns: Array<GeminiTurnRecord>;
  readonly interruptedTurns: Set<TurnId>;
}

const PROVIDER = "gemini" as const satisfies ProviderKind;
const GEMINI_AUTO_ACCEPT_PROMPT_INPUT = `${"y\n".repeat(32)}`;

/**
 * SIGTERM a child process handle, silently ignoring errors in case it has
 * already exited. Defined as a plain function (not inside an Effect.gen) to
 * avoid the no-try/catch-in-generator lint rule.
 */
function safeKillProcess(handle: NodeChildProcess): void {
  try {
    handle.kill("SIGTERM");
  } catch {
    // Process may have already exited
  }
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

function promptFromSession(
  sessionState: GeminiSessionState | undefined,
  input: ProviderSendTurnInput,
): string {
  const parts: string[] = [];
  if (sessionState && sessionState.turns.length > 0) {
    parts.push("Conversation history:");
    for (const turn of sessionState.turns) {
      parts.push(`User: ${turn.input}`);
      parts.push(`Assistant: ${turn.response}`);
    }
  }
  if (typeof input.input === "string" && input.input.trim().length > 0) {
    parts.push(`User: ${input.input.trim()}`);
  }
  if (input.attachments && input.attachments.length > 0) {
    parts.push("Attachments provided for this turn:");
    for (const attachment of input.attachments) {
      parts.push(`- ${attachment.name} (${attachment.mimeType}, ${attachment.sizeBytes} bytes)`);
    }
  }
  parts.push("Respond helpfully and keep the answer focused on the user's request.");
  return parts.join("\n");
}

/**
 * Gemini CLI can surface interactive confirmation prompts for skills or other
 * workspace actions even in headless mode. Feed a stream of affirmative
 * responses so those prompts do not stall the turn.
 */
export function buildGeminiAutoAcceptStdin(): string {
  return GEMINI_AUTO_ACCEPT_PROMPT_INPUT;
}

/**
 * Parse Gemini CLI stdout into a { response, error? } envelope.
 *
 * Supports both --output-format text (plain text, returned as-is) and
 * --output-format json (structured JSON, extracts `.response` field).
 * Falls back to returning raw text if JSON parsing fails.
 */
async function readCliResponse(stdout: string): Promise<{ response: string; error?: string }> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { response: "" };
  }
  try {
    const parsed = JSON.parse(trimmed) as { response?: unknown; error?: { message?: unknown } };
    return {
      response: typeof parsed.response === "string" ? parsed.response : trimmed,
      ...(parsed.error?.message && typeof parsed.error.message === "string"
        ? { error: parsed.error.message }
        : {}),
    };
  } catch {
    // Plain text output — return as-is
    return { response: trimmed };
  }
}

export const GeminiAdapterLive = Layer.effect(
  GeminiAdapter,
  Effect.gen(function* () {
    const sessionsRef = yield* Ref.make(new Map<ThreadId, GeminiSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    // Plain Map (not Effect-managed) of active child processes keyed by turnId.
    // Populated via onSpawn callback in runProcess; used by interruptTurn to actually kill
    // the subprocess rather than just setting a flag.
    const activeProcessHandles = new Map<TurnId, NodeChildProcess>();

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    const updateSessionState = (
      threadId: ThreadId,
      updater: (current: GeminiSessionState) => GeminiSessionState,
    ) =>
      Ref.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        const current = next.get(threadId);
        if (!current) {
          return sessions;
        }
        next.set(threadId, updater(current));
        return next;
      });

    const createSession = (input: ProviderSessionStartInput): GeminiSessionState => {
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
        turns: [],
        interruptedTurns: new Set(),
      };
    };

    const startSession: GeminiAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const sessionState = createSession(input);
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
          return next;
        });
        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "Gemini CLI session started.",
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

    const sendTurn: GeminiAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(input.threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        if (input.attachments && input.attachments.length > 0) {
          // The first Gemini provider pass is text-only; keep attachments visible
          // in the prompt rather than silently dropping them.
        }

        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const prompt = promptFromSession(sessionState, input);
        const modelSelection = input.modelSelection ?? sessionState.modelSelection;
        const model = modelSelection?.model ?? sessionState.session.model ?? "gemini-2.5-pro";

        yield* updateSessionState(input.threadId, (current) => ({
          ...current,
          session: {
            ...current.session,
            status: "running",
            activeTurnId: turnId,
            model,
            updatedAt: nowIso(),
          },
          interruptedTurns: new Set(current.interruptedTurns),
        }));

        yield* emitEvent(
          makeThreadEvent(
            "turn.started",
            input.threadId,
            {
              model,
            },
            turnId,
          ),
        );

        const execution = yield* Effect.promise(() =>
          runProcess(
            "gemini",
            [
              "-p",
              prompt,
              "--model",
              model,
              // Use text format: simpler to parse, avoids JSON schema drift between CLI versions
              "--output-format",
              "text",
              // Auto-approve all tool actions — without this the CLI hangs waiting for
              // interactive approval that can never arrive (stdin is closed by processRunner)
              "--yolo",
            ],
            {
              cwd: sessionState.session.cwd,
              env: process.env,
              stdin: buildGeminiAutoAcceptStdin(),
              timeoutMs: 10 * 60_000,
              allowNonZeroExit: true,
              outputMode: "truncate",
              // Capture the child process handle so interruptTurn can actually kill it
              onSpawn: (child) => {
                activeProcessHandles.set(turnId, child);
              },
            },
          ),
        );
        // Process has exited — remove the handle regardless of outcome
        activeProcessHandles.delete(turnId);

        const interrupted = yield* Ref.get(sessionsRef).pipe(
          Effect.map(
            (sessions) => sessions.get(input.threadId)?.interruptedTurns.has(turnId) ?? false,
          ),
        );
        const parsed = yield* Effect.promise(() => readCliResponse(execution.stdout));
        const response = parsed.response.trim();
        const turnState: GeminiTurnState =
          interrupted || execution.signal !== null
            ? "interrupted"
            : execution.code === 0 && !parsed.error
              ? "completed"
              : "failed";

        if (turnState === "interrupted") {
          yield* emitEvent(
            makeThreadEvent(
              "turn.aborted",
              input.threadId,
              {
                reason: "Interrupted by user.",
              },
              turnId,
            ),
          );
        } else {
          if (response.length > 0) {
            yield* emitEvent(
              makeThreadEvent(
                "content.delta",
                input.threadId,
                {
                  streamKind: "assistant_text",
                  delta: response,
                },
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
                ...(execution.code !== 0
                  ? { errorMessage: parsed.error ?? execution.stderr.trim() }
                  : {}),
              },
              turnId,
            ),
          );
        }

        yield* updateSessionState(input.threadId, (current) => {
          const nextTurn: GeminiTurnRecord = {
            id: turnId,
            input: prompt,
            response,
            model,
            state: turnState,
            items: response.length > 0 ? [{ role: "assistant", text: response }] : [],
          };
          return {
            ...current,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
            turns: [...current.turns, nextTurn],
            interruptedTurns: new Set(
              Array.from(current.interruptedTurns).filter((candidate) => candidate !== turnId),
            ),
          };
        });

        return {
          threadId: input.threadId,
          turnId,
        } satisfies ProviderTurnStartResult;
      });

    const interruptTurn: GeminiAdapterShape["interruptTurn"] = (threadId, turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return;
        }
        const targetTurnId = turnId ?? sessionState.session.activeTurnId;
        if (!targetTurnId) {
          return;
        }

        // Kill the actual child process — without this the stop button was a no-op.
        // The process handle was registered via onSpawn in sendTurn.
        const processHandle = activeProcessHandles.get(targetTurnId);
        if (processHandle) {
          safeKillProcess(processHandle);
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

    const respondToRequest: GeminiAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Gemini adapter does not yet implement request responses (${String(requestId)} -> ${decision}).`,
          detail: null,
        }),
      );

    const respondToUserInput: GeminiAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Gemini adapter does not yet implement structured user input responses (${String(requestId)}).`,
          detail: null,
        }),
      );

    const stopSession: GeminiAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return;
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

    const listSessions: GeminiAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: GeminiAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    const readThread: GeminiAdapterShape["readThread"] = (threadId) =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => {
          const sessionState = sessions.get(threadId);
          return {
            threadId,
            turns: sessionState
              ? sessionState.turns.map((turn) => ({
                  id: turn.id,
                  items: turn.items,
                }))
              : [],
          };
        }),
      );

    const rollbackThread: GeminiAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return {
            threadId,
            turns: [],
          };
        }
        const nextTurns = sessionState.turns.slice(
          0,
          Math.max(0, sessionState.turns.length - numTurns),
        );
        yield* updateSessionState(threadId, (current) => ({
          ...current,
          turns: nextTurns,
          session: {
            ...current.session,
            updatedAt: nowIso(),
          },
        }));
        return {
          threadId,
          turns: nextTurns.map((turn) => ({ id: turn.id, items: turn.items })),
        };
      });

    const stopAll: GeminiAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const session of sessions.values()) {
          yield* emitEvent(
            makeThreadEvent("session.exited", session.session.threadId, {
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
      // Gemini does not expose a rate-limit read API; no-op.
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies GeminiAdapterShape;
  }),
);
