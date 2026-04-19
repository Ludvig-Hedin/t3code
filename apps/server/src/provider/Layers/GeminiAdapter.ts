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

interface GeminiStreamState {
  buffer: string;
  assistantResponse: string;
  sawStructuredOutput: boolean;
  errorMessage?: string;
  usage?: Record<string, unknown>;
  modelUsage?: Record<string, unknown>;
  toolNames: Map<string, string>;
}

interface GeminiStreamConsumeContext {
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly emitEvent: (event: ProviderRuntimeEvent) => void;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function summarizeGeminiDetail(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 400 ? `${json.slice(0, 397)}...` : json;
  } catch {
    return undefined;
  }
}

function buildGeminiUsageSnapshot(
  stats: Record<string, unknown>,
): { usage: Record<string, unknown>; modelUsage?: Record<string, unknown> } | undefined {
  const usedTokens = asNonNegativeInt(stats.total_tokens);
  if (usedTokens === undefined) {
    return undefined;
  }

  const inputTokens = asNonNegativeInt(stats.input_tokens);
  const cachedInputTokens = asNonNegativeInt(stats.cached);
  const outputTokens = asNonNegativeInt(stats.output_tokens);
  const toolUses = asNonNegativeInt(stats.tool_calls);
  const durationMs = asNonNegativeInt(stats.duration_ms);
  const modelUsage = asRecord(stats.models);

  return {
    usage: {
      usedTokens,
      totalProcessedTokens: usedTokens,
      ...(inputTokens !== undefined ? { inputTokens, lastInputTokens: inputTokens } : {}),
      ...(cachedInputTokens !== undefined
        ? { cachedInputTokens, lastCachedInputTokens: cachedInputTokens }
        : {}),
      ...(outputTokens !== undefined ? { outputTokens, lastOutputTokens: outputTokens } : {}),
      lastUsedTokens: usedTokens,
      ...(toolUses !== undefined ? { toolUses } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    },
    ...(modelUsage ? { modelUsage } : {}),
  };
}

export function createGeminiStreamState(): GeminiStreamState {
  return {
    buffer: "",
    assistantResponse: "",
    sawStructuredOutput: false,
    toolNames: new Map(),
  };
}

function processGeminiStreamLine(
  line: string,
  state: GeminiStreamState,
  context: GeminiStreamConsumeContext,
): void {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return;
  }

  const payload = asRecord(parsed);
  if (!payload) {
    return;
  }
  state.sawStructuredOutput = true;

  const eventType = asString(payload.type);
  if (!eventType) {
    return;
  }

  switch (eventType) {
    case "message": {
      if (payload.role !== "assistant") {
        return;
      }
      const content = asString(payload.content) ?? "";
      if (content.length === 0) {
        return;
      }
      const delta =
        payload.delta === true
          ? content
          : content.startsWith(state.assistantResponse)
            ? content.slice(state.assistantResponse.length)
            : content;
      if (delta.length === 0) {
        return;
      }
      state.assistantResponse += delta;
      context.emitEvent(
        makeThreadEvent(
          "content.delta",
          context.threadId,
          {
            streamKind: "assistant_text",
            delta,
          },
          context.turnId,
        ),
      );
      return;
    }

    case "tool_use": {
      const toolId = asString(payload.tool_id);
      const toolName = asString(payload.tool_name) ?? "Gemini tool";
      if (!toolId) {
        return;
      }
      state.toolNames.set(toolId, toolName);
      context.emitEvent(
        makeThreadEvent(
          "item.started",
          context.threadId,
          {
            itemType: "dynamic_tool_call",
            status: "inProgress",
            title: toolName,
            ...(summarizeGeminiDetail(payload.parameters)
              ? { detail: summarizeGeminiDetail(payload.parameters) }
              : {}),
            data: payload,
          },
          context.turnId,
        ),
      );
      return;
    }

    case "tool_result": {
      const toolId = asString(payload.tool_id);
      if (!toolId) {
        return;
      }
      const status = asString(payload.status);
      context.emitEvent(
        makeThreadEvent(
          "item.completed",
          context.threadId,
          {
            itemType: "dynamic_tool_call",
            status: status === "success" ? "completed" : "failed",
            title: state.toolNames.get(toolId) ?? "Gemini tool",
            ...(status && status !== "success" ? { detail: status } : {}),
            data: payload,
          },
          context.turnId,
        ),
      );
      return;
    }

    case "result": {
      const stats = asRecord(payload.stats);
      if (stats) {
        const usageSnapshot = buildGeminiUsageSnapshot(stats);
        if (usageSnapshot) {
          state.usage = usageSnapshot.usage;
          state.modelUsage = usageSnapshot.modelUsage;
          context.emitEvent(
            makeThreadEvent("thread.token-usage.updated", context.threadId, {
              usage: usageSnapshot.usage,
            }),
          );
        }
      }
      if (payload.status !== "success") {
        state.errorMessage = asString(payload.status) ?? "Gemini CLI reported a failed result.";
      }
      return;
    }

    case "error": {
      const message =
        asString(payload.message) ??
        summarizeGeminiDetail(payload.error) ??
        "Gemini CLI reported an error.";
      state.errorMessage = message;
      context.emitEvent(
        makeThreadEvent("runtime.error", context.threadId, {
          message,
          class: "provider_error",
          detail: payload,
        }),
      );
      return;
    }

    default:
      return;
  }
}

export function consumeGeminiStreamText(
  chunk: string,
  state: GeminiStreamState,
  context: GeminiStreamConsumeContext,
): void {
  state.buffer += chunk;
  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? "";

  for (const line of lines) {
    processGeminiStreamLine(line, state, context);
  }
}

export function flushGeminiStreamText(
  state: GeminiStreamState,
  context: GeminiStreamConsumeContext,
): void {
  if (state.buffer.trim().length === 0) {
    state.buffer = "";
    return;
  }
  processGeminiStreamLine(state.buffer, state, context);
  state.buffer = "";
}

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

        const emitEventSync = (event: ProviderRuntimeEvent): void => {
          Effect.runSync(emitEvent(event));
        };
        const streamState = createGeminiStreamState();
        const execution = yield* Effect.promise(() =>
          runProcess(
            "gemini",
            [
              "-p",
              prompt,
              "--model",
              model,
              // Use Gemini's JSONL stream so Bird Code can surface live text and tool activity.
              "--output-format",
              "stream-json",
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
              onStdoutChunk: (chunk) => {
                consumeGeminiStreamText(chunk, streamState, {
                  threadId: input.threadId,
                  turnId,
                  emitEvent: emitEventSync,
                });
              },
            },
          ),
        );
        // Process has exited — remove the handle regardless of outcome
        activeProcessHandles.delete(turnId);
        flushGeminiStreamText(streamState, {
          threadId: input.threadId,
          turnId,
          emitEvent: emitEventSync,
        });

        const interrupted = yield* Ref.get(sessionsRef).pipe(
          Effect.map(
            (sessions) => sessions.get(input.threadId)?.interruptedTurns.has(turnId) ?? false,
          ),
        );
        const parsed = streamState.sawStructuredOutput
          ? { response: streamState.assistantResponse, error: streamState.errorMessage }
          : yield* Effect.promise(() => readCliResponse(execution.stdout));
        const response = parsed.response.trim();
        const stderrMessage = execution.stderr.trim();
        const errorMessage = parsed.error ?? (stderrMessage.length > 0 ? stderrMessage : undefined);
        const turnState: GeminiTurnState =
          interrupted || execution.signal !== null
            ? "interrupted"
            : execution.code === 0 && !errorMessage
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
          // content.delta is now emitted live via stdout stream
          yield* emitEvent(
            makeThreadEvent(
              "turn.completed",
              input.threadId,
              {
                state: turnState,
                ...(streamState.usage ? { usage: streamState.usage } : {}),
                ...(streamState.modelUsage ? { modelUsage: streamState.modelUsage } : {}),
                ...(turnState === "failed" && errorMessage ? { errorMessage } : {}),
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
