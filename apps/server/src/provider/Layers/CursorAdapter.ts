/**
 * CursorAdapterLive - Subprocess implementation of ProviderAdapterShape for Cursor.
 *
 * Spawns `cursor-agent --print "<prompt>" --output-format stream-json
 * --stream-partial-output --force` per turn and parses NDJSON from stdout.
 * Session continuity is tracked via the session_id captured from the output
 * and replayed with `--resume=<id>` on subsequent turns.
 *
 * @module CursorAdapterLive
 */
import type { ChildProcess as NodeChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

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

import {
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { CursorAdapter, type CursorAdapterShape } from "../Services/CursorAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const PROVIDER = "cursor" as const satisfies ProviderKind;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) ? v : undefined;
}

// ---------------------------------------------------------------------------
// NDJSON event mapper
// ---------------------------------------------------------------------------

/**
 * Maps a single parsed NDJSON line from cursor-agent into canonical events.
 *
 * cursor-agent uses the same `--output-format stream-json` flag as the Claude
 * Code CLI (both are coding-agent CLIs with NDJSON streaming):
 *   {"type":"system","subtype":"init","session_id":"...","cwd":"...","model":"..."}
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]},...}
 *   {"type":"assistant",...,"partial":true}  — streaming delta (--stream-partial-output)
 *   {"type":"result","subtype":"success","session_id":"...","is_error":false,...}
 *   {"type":"result","subtype":"error_during_execution","is_error":true,...}
 *
 * We also handle a simple generic fallback:
 *   {"type":"text","content":"..."}
 *   {"type":"done"}  /  {"type":"error","message":"..."}
 */
function mapCursorLine(
  parsed: Record<string, unknown>,
  threadId: ThreadId,
  turnId: TurnId,
  emitEvent: (event: ProviderRuntimeEvent) => void,
  onSessionId: (id: string) => void,
): void {
  const sessionId = asString(parsed.session_id);
  if (sessionId) onSessionId(sessionId);

  const type = asString(parsed.type);

  switch (type) {
    case "system": {
      // Init message — session_id already captured above.
      break;
    }

    case "assistant": {
      const message = asObject(parsed.message);
      if (!message) break;
      const content = asArray(message.content);
      if (!content) break;

      for (const block of content) {
        const b = asObject(block);
        if (!b) continue;
        const blockType = asString(b.type);

        if (blockType === "text") {
          const text = asString(b.text);
          if (text) {
            emitEvent(
              makeThreadEvent(
                "content.delta",
                threadId,
                { streamKind: "assistant_text", delta: text },
                turnId,
              ),
            );
          }
        } else if (blockType === "thinking") {
          const thinking = asString(b.thinking);
          if (thinking) {
            emitEvent(
              makeThreadEvent(
                "content.delta",
                threadId,
                { streamKind: "reasoning_text", delta: thinking },
                turnId,
              ),
            );
          }
        }
      }
      break;
    }

    case "result": {
      const isError = parsed.is_error === true;
      const subtype = asString(parsed.subtype);

      if (isError || subtype === "error_during_execution" || subtype === "error") {
        const errors = asArray(parsed.errors);
        const errorText =
          errors?.filter((e): e is string => typeof e === "string").join(" ") ??
          asString(parsed.error) ??
          asString(parsed.result) ??
          "Cursor agent encountered an error.";

        emitEvent(
          makeThreadEvent("runtime.error", threadId, { message: errorText, detail: null }, turnId),
        );
        emitEvent(makeThreadEvent("turn.completed", threadId, { state: "failed" }, turnId));
      } else {
        emitEvent(makeThreadEvent("turn.completed", threadId, { state: "completed" }, turnId));
      }
      break;
    }

    // Generic / fallback format
    case "text": {
      const content = asString(parsed.content) ?? asString(parsed.text) ?? asString(parsed.delta);
      if (content) {
        emitEvent(
          makeThreadEvent(
            "content.delta",
            threadId,
            { streamKind: "assistant_text", delta: content },
            turnId,
          ),
        );
      }
      break;
    }

    case "done":
    case "completed":
    case "finish": {
      emitEvent(makeThreadEvent("turn.completed", threadId, { state: "completed" }, turnId));
      break;
    }

    case "error": {
      const message = asString(parsed.message) ?? asString(parsed.error) ?? "Cursor agent error.";
      emitEvent(makeThreadEvent("runtime.error", threadId, { message, detail: null }, turnId));
      emitEvent(makeThreadEvent("turn.completed", threadId, { state: "failed" }, turnId));
      break;
    }

    default:
      break;
  }
}

/** Returns true if this NDJSON type signals turn completion. */
function isCompletionType(type: string): boolean {
  return ["result", "done", "completed", "finish", "error"].includes(type);
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface CursorSessionState {
  session: ProviderSession;
  /** cursor-agent's internal session ID, captured from the first "system" line. */
  cursorSessionId: string | null;
  /** Active subprocess for the current turn, if any. */
  activeProcess: NodeChildProcess | null;
  /** Active turn ID, used when interrupting. */
  activeTurnId: TurnId | null;
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

export const CursorAdapterLive = Layer.effect(
  CursorAdapter,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

    const sessionsRef = yield* Ref.make(new Map<ThreadId, CursorSessionState>());
    const eventsPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ProviderRuntimeEvent>(),
      PubSub.shutdown,
    );

    const emitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid);

    const getSessionState = (threadId: ThreadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.get(threadId)));

    // -----------------------------------------------------------------------
    // Adapter methods
    // -----------------------------------------------------------------------

    const startSession: CursorAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const now = nowIso();
        const model = input.modelSelection?.model ?? "auto";
        const providerSession: ProviderSession = {
          provider: PROVIDER,
          status: "ready",
          runtimeMode: input.runtimeMode,
          threadId: input.threadId,
          cwd: input.cwd,
          model,
          resumeCursor: input.resumeCursor,
          createdAt: now,
          updatedAt: now,
        };

        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, {
            session: providerSession,
            cursorSessionId: null,
            activeProcess: null,
            activeTurnId: null,
          });
          return next;
        });

        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "Cursor session started.",
            ...(input.resumeCursor !== undefined ? { resume: input.resumeCursor } : {}),
          }),
        );

        return providerSession;
      });

    const sendTurn: CursorAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(input.threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        const settings = yield* serverSettings.getSettings.pipe(
          Effect.mapError(
            (err) =>
              new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "sendTurn",
                detail: `Failed to read server settings: ${err instanceof Error ? err.message : String(err)}`,
              }),
          ),
        );
        const binaryPath = settings.providers.cursor.binaryPath;
        const model = input.modelSelection?.model ?? sessionState.session.model ?? "auto";
        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const prompt = input.input ?? "";

        // Capture services so we can emit events from Node.js callbacks.
        const services = yield* Effect.services();
        const runFork = Effect.runForkWith(services);

        // Build cursor-agent args.
        // --print: non-interactive / headless mode
        // --output-format stream-json + --stream-partial-output: NDJSON streaming
        // --force: skip file-change confirmation prompts
        const args: string[] = [
          "--print",
          prompt,
          "--output-format",
          "stream-json",
          "--stream-partial-output",
          "--force",
          "--model",
          model,
        ];

        // Session continuity: --resume=<id> if we have a prior session ID.
        const resumeId = sessionState.cursorSessionId ?? sessionState.session.resumeCursor;
        if (resumeId) {
          args.push(`--resume=${resumeId}`);
        }

        // Update session to running.
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(input.threadId);
          if (!current) return sessions;
          next.set(input.threadId, {
            ...current,
            activeTurnId: turnId,
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

        // Spawn cursor-agent and read NDJSON output in the background.
        // Returns immediately (fire-and-forget), events flow via PubSub.
        const proc = yield* Effect.try({
          try: () =>
            spawn(binaryPath, args, {
              cwd: sessionState.session.cwd ?? process.cwd(),
              shell: process.platform === "win32",
              env: { ...process.env },
              stdio: ["ignore", "pipe", "pipe"],
            }),
          catch: (err) =>
            new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "sendTurn",
              detail: `Failed to spawn cursor-agent: ${err instanceof Error ? err.message : String(err)}`,
            }),
        });

        // Register the subprocess for interruption support.
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(input.threadId);
          if (!current) return sessions;
          next.set(input.threadId, { ...current, activeProcess: proc });
          return next;
        });

        const emitEventSync = (event: ProviderRuntimeEvent): void => {
          runFork(PubSub.publish(eventsPubSub, event).pipe(Effect.asVoid));
        };

        const updateSessionRef = (
          updater: (current: CursorSessionState) => CursorSessionState,
        ): void => {
          runFork(
            Ref.update(sessionsRef, (sessions) => {
              const next = new Map(sessions);
              const current = next.get(input.threadId);
              if (!current) return sessions;
              next.set(input.threadId, updater(current));
              return next;
            }),
          );
        };

        let stdoutBuffer = "";
        let completionEmitted = false;

        proc.stdout?.setEncoding("utf8");

        proc.stdout?.on("data", (chunk: string) => {
          stdoutBuffer += chunk;
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(trimmed) as Record<string, unknown>;
            } catch {
              continue;
            }

            mapCursorLine(parsed, input.threadId, turnId, emitEventSync, (id) => {
              updateSessionRef((current) => ({ ...current, cursorSessionId: id }));
            });

            const type = typeof parsed.type === "string" ? parsed.type : "";
            if (isCompletionType(type)) {
              completionEmitted = true;
            }
          }
        });

        proc.on("error", (err) => {
          emitEventSync(
            makeThreadEvent(
              "runtime.error",
              input.threadId,
              {
                message: `Cursor agent process error: ${err.message}`,
                detail: null,
              },
              turnId,
            ),
          );
          if (!completionEmitted) {
            completionEmitted = true;
            emitEventSync(
              makeThreadEvent("turn.completed", input.threadId, { state: "failed" }, turnId),
            );
          }
          updateSessionRef((current) => ({
            ...current,
            activeProcess: null,
            activeTurnId: null,
            session: {
              ...current.session,
              status: "error",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
          }));
        });

        proc.on("close", (code) => {
          // Flush any remaining buffered output.
          if (stdoutBuffer.trim()) {
            let parsed: Record<string, unknown> | undefined;
            try {
              parsed = JSON.parse(stdoutBuffer.trim()) as Record<string, unknown>;
            } catch {
              /* ignore */
            }
            if (parsed) {
              mapCursorLine(parsed, input.threadId, turnId, emitEventSync, (id) => {
                updateSessionRef((current) => ({ ...current, cursorSessionId: id }));
              });
            }
          }

          if (!completionEmitted) {
            completionEmitted = true;
            emitEventSync(
              makeThreadEvent(
                "turn.completed",
                input.threadId,
                { state: code === 0 || code === null ? "completed" : "failed" },
                turnId,
              ),
            );
          }

          updateSessionRef((current) => ({
            ...current,
            activeProcess: null,
            activeTurnId: null,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
          }));
        });

        return {
          threadId: input.threadId,
          turnId,
        } satisfies ProviderTurnStartResult;
      });

    const interruptTurn: CursorAdapterShape["interruptTurn"] = (threadId, _turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        const proc = sessionState.activeProcess;
        if (proc) {
          yield* Effect.try({
            try: () => proc.kill("SIGTERM"),
            catch: () => undefined,
          }).pipe(Effect.ignore);
        }

        const targetTurnId =
          _turnId ?? sessionState.activeTurnId ?? sessionState.session.activeTurnId;

        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(threadId);
          if (!current) return sessions;
          next.set(threadId, {
            ...current,
            activeProcess: null,
            activeTurnId: null,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
          });
          return next;
        });

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

    const respondToRequest: CursorAdapterShape["respondToRequest"] = (threadId) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Cursor adapter does not support interactive approval requests (--force is enabled).`,
          detail: null,
        }),
      );

    const respondToUserInput: CursorAdapterShape["respondToUserInput"] = (
      threadId,
      _requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Cursor adapter does not implement structured user-input responses.`,
          detail: null,
        }),
      );

    const stopSession: CursorAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

        const proc = sessionState.activeProcess;
        if (proc) {
          yield* Effect.try({
            try: () => proc.kill("SIGTERM"),
            catch: () => undefined,
          }).pipe(Effect.ignore);
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

    const listSessions: CursorAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: CursorAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    const readThread: CursorAdapterShape["readThread"] = (threadId) =>
      Effect.succeed({ threadId, turns: [] });

    const rollbackThread: CursorAdapterShape["rollbackThread"] = (threadId, _numTurns) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId,
          });
        }
        // Cursor has no rollback API — clear the captured session ID so the
        // next turn starts a fresh context.
        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          const current = next.get(threadId);
          if (!current) return sessions;
          next.set(threadId, { ...current, cursorSessionId: null });
          return next;
        });
        return { threadId, turns: [] };
      });

    const stopAll: CursorAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const [threadId, state] of sessions.entries()) {
          const proc = state.activeProcess;
          if (proc) {
            yield* Effect.try({
              try: () => proc.kill("SIGTERM"),
              catch: () => undefined,
            }).pipe(Effect.ignore);
          }
          yield* emitEvent(
            makeThreadEvent("session.exited", threadId, {
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
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies CursorAdapterShape;
  }),
);
