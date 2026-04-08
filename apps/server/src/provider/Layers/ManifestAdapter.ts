/**
 * ManifestAdapterLive — "Auto" provider adapter.
 *
 * When selected, Auto routes each request to the first connected provider the
 * user already has set up — no extra config or API keys required. The waterfall
 * order is:
 *
 *   1. Ollama  — local HTTP, no auth (fastest, free)
 *   2. Codex   — OpenAI Codex CLI one-shot mode
 *   3. Claude Code — `claude -p "..."` non-interactive
 *   4. Gemini  — `gemini -p "..." --yolo` non-interactive
 *   5. OpenCode — `opencode` (if reachable)
 *
 * If `settings.providers.manifest.baseUrl` is non-empty the adapter skips
 * auto-detection and calls that URL as an OpenAI-compatible endpoint instead
 * (allows using a custom router like Manifest or LiteLLM).
 *
 * All events are emitted with `provider: "manifest"` so the orchestration
 * correctly attributes them to the Auto session.  We must NOT delegate to
 * other adapters — they emit events with their own provider name which would
 * corrupt the event stream for this thread.
 *
 * @module ManifestAdapterLive
 */
import { spawn } from "node:child_process";

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
  ServerSettings,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import { ProviderAdapterSessionNotFoundError } from "../Errors.ts";
import { ManifestAdapter, type ManifestAdapterShape } from "../Services/ManifestAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

// ── Internal session types ──────────────────────────────────────────────────

type ManifestTurnState = "completed" | "failed" | "interrupted";

interface ManifestTurnRecord {
  readonly id: TurnId;
  readonly userContent: string;
  readonly assistantContent: string;
  readonly state: ManifestTurnState;
}

interface ManifestSessionState {
  readonly session: ProviderSession;
  readonly modelSelection?: ModelSelection;
  /** Ordered turn history used to build context for each request */
  readonly turns: Array<ManifestTurnRecord>;
  readonly interruptedTurns: Set<TurnId>;
}

// ── Message types ────────────────────────────────────────────────────────────

interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

// ── Routing result ───────────────────────────────────────────────────────────

type RouterResult =
  | { readonly kind: "success"; readonly content: string; readonly routedVia: string }
  | { readonly kind: "error"; readonly message: string };

// ── Constants ────────────────────────────────────────────────────────────────

const PROVIDER = "manifest" as const satisfies ProviderKind;

/** Per-provider attempt timeout (2 min). Keeps the waterfall snappy when one
 *  provider is installed but misbehaving. */
const PER_PROVIDER_TIMEOUT_MS = 2 * 60_000;

// ── Plain-async helpers ─────────────────────────────────────────────────────
// All helpers are outside Effect.gen so we can freely use await.
// They always return a discriminated result — no exceptions escape.

/**
 * Convert a messages array to a single text prompt for CLI providers that
 * don't accept a structured messages array.  Multi-turn history is formatted
 * as a dialogue so the model has context.
 */
function buildCliPrompt(messages: ReadonlyArray<ChatMessage>): string {
  if (messages.length === 1 && messages[0]!.role === "user") {
    return messages[0]!.content;
  }
  const lines: string[] = [];
  for (const msg of messages.slice(0, -1)) {
    lines.push(`${msg.role === "user" ? "Human" : "Assistant"}: ${msg.content}`);
  }
  const last = messages.at(-1);
  if (last?.role === "user") {
    if (lines.length > 0) lines.push("");
    lines.push(last.content);
  }
  return lines.join("\n");
}

/**
 * Call an OpenAI-compatible /v1/chat/completions endpoint.
 * Used for Ollama (and for the custom-endpoint override).
 */
async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  messages: ReadonlyArray<ChatMessage>,
  model: string,
  routedVia: string,
): Promise<RouterResult> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages }),
      signal: AbortSignal.timeout(PER_PROVIDER_TIMEOUT_MS),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        if (body?.error?.message) detail += `: ${body.error.message}`;
      } catch {
        // JSON parse failed — use status only
      }
      return { kind: "error", message: `${routedVia} returned ${detail}` };
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return { kind: "success", content, routedVia };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { kind: "error", message: `${routedVia} unreachable: ${msg}` };
  }
}

/**
 * Ask the Ollama tag list API for the first available model name.
 * Returns null if Ollama is unreachable or has no models installed.
 */
async function detectOllamaModel(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: Array<{ name?: string }> };
    return json.models?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Spawn a CLI binary in one-shot mode and capture its stdout.
 * Returns an error result on spawn failure, non-zero exit, or timeout.
 */
async function spawnOneShotCli(
  binaryPath: string,
  args: ReadonlyArray<string>,
  routedVia: string,
): Promise<RouterResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: RouterResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(binaryPath, [...args], {
        // Provide no stdin — the CLI must not wait for interactive input.
        // Never use shell:true — it concatenates args into a shell command string
        // on Windows and allows shell metacharacter injection from user prompts.
        // Pass args directly to the binary so each element is treated as a
        // separate argument regardless of its content.
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        shell: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ kind: "error", message: `Failed to start ${routedVia}: ${msg}` });
      return;
    }

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      settle({ kind: "error", message: `${routedVia} error: ${err.message}` });
    });

    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        settle({ kind: "success", content: stdout.trim(), routedVia });
      } else {
        settle({
          kind: "error",
          message:
            stderr.trim() || `${routedVia} exited with code ${String(code)} and produced no output`,
        });
      }
    });

    // Kill and fail after PER_PROVIDER_TIMEOUT_MS to avoid blocking the waterfall.
    const timer = setTimeout(() => {
      child.kill();
      settle({ kind: "error", message: `${routedVia} timed out` });
    }, PER_PROVIDER_TIMEOUT_MS);

    // Ensure timer does not prevent Node from exiting.
    if (typeof timer.unref === "function") timer.unref();
  });
}

/**
 * Route a request through the first available connected provider.
 *
 * Priority order:
 *  1. Custom endpoint (if baseUrl is set in manifest settings)
 *  2. Ollama (local HTTP, no auth)
 *  3. Codex CLI (`codex --full-auto "prompt"`)
 *  4. Claude Code CLI (`claude -p "prompt"`)
 *  5. Gemini CLI (`gemini -p "prompt" --yolo`)
 *
 * Each provider attempt is independent — failure moves to the next one.
 */
async function autoRouteRequest(
  providers: ServerSettings["providers"],
  messages: ReadonlyArray<ChatMessage>,
): Promise<RouterResult> {
  // ── 1. Custom endpoint override ──────────────────────────────────────────
  if (providers.manifest.baseUrl) {
    return callOpenAiCompatible(
      providers.manifest.baseUrl,
      providers.manifest.apiKey,
      messages,
      "auto",
      `custom endpoint (${providers.manifest.baseUrl})`,
    );
  }

  // ── 2. Ollama ────────────────────────────────────────────────────────────
  if (providers.ollama.enabled) {
    const ollamaModel = await detectOllamaModel(providers.ollama.baseUrl);
    if (ollamaModel !== null) {
      const result = await callOpenAiCompatible(
        providers.ollama.baseUrl,
        "",
        messages,
        ollamaModel,
        `Ollama (${ollamaModel})`,
      );
      if (result.kind === "success") return result;
    }
  }

  const prompt = buildCliPrompt(messages);

  // ── 3. Codex CLI ─────────────────────────────────────────────────────────
  // Codex accepts the task as the first positional argument; --full-auto
  // enables non-interactive approval so it doesn't hang waiting for input.
  if (providers.codex.enabled) {
    const result = await spawnOneShotCli(
      providers.codex.binaryPath,
      ["--full-auto", prompt],
      "Codex",
    );
    if (result.kind === "success") return result;
  }

  // ── 4. Claude Code CLI ───────────────────────────────────────────────────
  // `claude -p` / `claude --print` outputs the response to stdout and exits.
  if (providers.claudeAgent.enabled) {
    const result = await spawnOneShotCli(
      providers.claudeAgent.binaryPath,
      ["-p", prompt],
      "Claude Code",
    );
    if (result.kind === "success") return result;
  }

  // ── 5. Gemini CLI ────────────────────────────────────────────────────────
  // `gemini -p` sends a prompt; `--yolo` auto-approves so it doesn't block.
  if (providers.gemini.enabled) {
    const result = await spawnOneShotCli(
      providers.gemini.binaryPath,
      ["-p", prompt, "--yolo"],
      "Gemini",
    );
    if (result.kind === "success") return result;
  }

  // ── Nothing worked ───────────────────────────────────────────────────────
  return {
    kind: "error",
    message:
      "Auto routing failed — no connected provider is available. " +
      "Please install and authenticate at least one of: Ollama, Codex, Claude Code, or Gemini.",
  };
}

// ── Message builder ─────────────────────────────────────────────────────────

/**
 * Build the messages array for the current turn including conversation history.
 * Caps history at the last 20 completed turns to avoid excessive context.
 */
function buildMessages(
  sessionState: ManifestSessionState,
  input: ProviderSendTurnInput,
): ChatMessage[] {
  const MAX_HISTORY_TURNS = 20;
  const history = sessionState.turns.slice(-MAX_HISTORY_TURNS);

  const messages: ChatMessage[] = [];

  for (const turn of history) {
    if (turn.state !== "completed") continue;
    messages.push({ role: "user", content: turn.userContent });
    if (turn.assistantContent) {
      messages.push({ role: "assistant", content: turn.assistantContent });
    }
  }

  const parts = [input.input ?? ""];
  if (input.attachments && input.attachments.length > 0) {
    parts.push("Attachments provided:");
    for (const a of input.attachments) {
      parts.push(`- ${a.name} (${a.mimeType}, ${a.sizeBytes} bytes)`);
    }
  }
  const userContent = parts.filter(Boolean).join("\n");
  if (userContent) {
    messages.push({ role: "user", content: userContent });
  }

  return messages;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Layer implementation ────────────────────────────────────────────────────

export const ManifestAdapterLive = Layer.effect(
  ManifestAdapter,
  Effect.gen(function* () {
    const serverSettings = yield* ServerSettingsService;

    const sessionsRef = yield* Ref.make(new Map<ThreadId, ManifestSessionState>());
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
      updater: (current: ManifestSessionState) => ManifestSessionState,
    ) =>
      Ref.update(sessionsRef, (sessions) => {
        const next = new Map(sessions);
        const current = next.get(threadId);
        if (!current) return sessions;
        next.set(threadId, updater(current));
        return next;
      });

    // ── startSession ─────────────────────────────────────────────────────────

    const startSession: ManifestAdapterShape["startSession"] = (input) =>
      Effect.gen(function* () {
        const now = nowIso();
        const sessionState: ManifestSessionState = {
          session: {
            provider: PROVIDER,
            status: "ready",
            runtimeMode: input.runtimeMode,
            threadId: input.threadId,
            cwd: input.cwd,
            model: input.modelSelection?.model ?? "auto",
            resumeCursor: input.resumeCursor,
            createdAt: now,
            updatedAt: now,
          },
          ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
          turns: [],
          interruptedTurns: new Set(),
        };

        yield* Ref.update(sessionsRef, (sessions) => {
          const next = new Map(sessions);
          next.set(input.threadId, sessionState);
          return next;
        });

        yield* emitEvent(
          makeThreadEvent("session.started", input.threadId, {
            message: "Auto router session started.",
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

    const sendTurn: ManifestAdapterShape["sendTurn"] = (input) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(input.threadId);
        if (!sessionState) {
          return yield* new ProviderAdapterSessionNotFoundError({
            provider: PROVIDER,
            threadId: input.threadId,
          });
        }

        const turnId = `turn-${globalThis.crypto.randomUUID()}` as TurnId;
        const model = "auto";

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

        yield* emitEvent(makeThreadEvent("turn.started", input.threadId, { model }, turnId));

        // Read all provider settings so autoRouteRequest can try each provider.
        // orDie converts ServerSettingsError to a defect — keeps error channel typed.
        const allProviderSettings = yield* serverSettings.getSettings.pipe(
          Effect.map((s) => s.providers),
          Effect.orDie,
        );

        const messages = buildMessages(sessionState, input);
        const userContent =
          messages.findLast((m) => m.role === "user")?.content ?? input.input ?? "";

        // autoRouteRequest is a plain async function — no typed errors escape.
        const result = yield* Effect.promise(() => autoRouteRequest(allProviderSettings, messages));

        // Check if the turn was interrupted while the request was in flight.
        const interrupted = yield* Ref.get(sessionsRef).pipe(
          Effect.map(
            (sessions) => sessions.get(input.threadId)?.interruptedTurns.has(turnId) ?? false,
          ),
        );

        if (interrupted) {
          yield* emitEvent(
            makeThreadEvent(
              "turn.aborted",
              input.threadId,
              { reason: "Interrupted by user." },
              turnId,
            ),
          );
          yield* updateSessionState(input.threadId, (current) => ({
            ...current,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
            turns: [
              ...current.turns,
              { id: turnId, userContent, assistantContent: "", state: "interrupted" },
            ],
          }));
          return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
        }

        if (result.kind === "error") {
          yield* emitEvent(
            makeThreadEvent(
              "turn.completed",
              input.threadId,
              { state: "failed", errorMessage: result.message },
              turnId,
            ),
          );
          yield* updateSessionState(input.threadId, (current) => ({
            ...current,
            session: {
              ...current.session,
              status: "ready",
              activeTurnId: undefined,
              updatedAt: nowIso(),
            },
            turns: [
              ...current.turns,
              { id: turnId, userContent, assistantContent: "", state: "failed" },
            ],
          }));
          return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
        }

        // ── success ──────────────────────────────────────────────────────────

        const assistantContent = result.content;
        if (assistantContent.trim().length > 0) {
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
          makeThreadEvent("turn.completed", input.threadId, { state: "completed" }, turnId),
        );

        yield* updateSessionState(input.threadId, (current) => ({
          ...current,
          session: {
            ...current.session,
            status: "ready",
            activeTurnId: undefined,
            updatedAt: nowIso(),
          },
          turns: [
            ...current.turns,
            { id: turnId, userContent, assistantContent, state: "completed" },
          ],
        }));

        return { threadId: input.threadId, turnId } satisfies ProviderTurnStartResult;
      });

    // ── interruptTurn ─────────────────────────────────────────────────────────

    const interruptTurn: ManifestAdapterShape["interruptTurn"] = (threadId, turnId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;
        const targetTurnId = turnId ?? sessionState.session.activeTurnId;
        if (!targetTurnId) return;

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

    const respondToRequest: ManifestAdapterShape["respondToRequest"] = (
      threadId,
      requestId,
      decision,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Auto adapter does not support interactive approval responses (${String(requestId)} → ${decision}).`,
          detail: null,
        }),
      );

    const respondToUserInput: ManifestAdapterShape["respondToUserInput"] = (
      threadId,
      requestId,
      _answers: ProviderUserInputAnswers,
    ) =>
      emitEvent(
        makeThreadEvent("runtime.warning", threadId, {
          message: `Auto adapter does not support structured user input (${String(requestId)}).`,
          detail: null,
        }),
      );

    // ── stopSession ───────────────────────────────────────────────────────────

    const stopSession: ManifestAdapterShape["stopSession"] = (threadId) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return;

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

    const listSessions: ManifestAdapterShape["listSessions"] = () =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => Array.from(sessions.values(), (entry) => entry.session)),
      );

    const hasSession: ManifestAdapterShape["hasSession"] = (threadId) =>
      Ref.get(sessionsRef).pipe(Effect.map((sessions) => sessions.has(threadId)));

    // ── readThread / rollbackThread ───────────────────────────────────────────

    const readThread: ManifestAdapterShape["readThread"] = (threadId) =>
      Ref.get(sessionsRef).pipe(
        Effect.map((sessions) => {
          const sessionState = sessions.get(threadId);
          return {
            threadId,
            turns: sessionState
              ? sessionState.turns.map((turn) => ({
                  id: turn.id,
                  items: [
                    { role: "user", text: turn.userContent },
                    ...(turn.assistantContent
                      ? [{ role: "assistant", text: turn.assistantContent }]
                      : []),
                  ],
                }))
              : [],
          };
        }),
      );

    const rollbackThread: ManifestAdapterShape["rollbackThread"] = (threadId, numTurns) =>
      Effect.gen(function* () {
        const sessionState = yield* getSessionState(threadId);
        if (!sessionState) return { threadId, turns: [] };

        const nextTurns = sessionState.turns.slice(
          0,
          Math.max(0, sessionState.turns.length - numTurns),
        );
        yield* updateSessionState(threadId, (current) => ({
          ...current,
          turns: nextTurns,
          session: { ...current.session, updatedAt: nowIso() },
        }));
        return {
          threadId,
          turns: nextTurns.map((turn) => ({
            id: turn.id,
            items: [
              { role: "user", text: turn.userContent },
              ...(turn.assistantContent
                ? [{ role: "assistant", text: turn.assistantContent }]
                : []),
            ],
          })),
        };
      });

    // ── stopAll ───────────────────────────────────────────────────────────────

    const stopAll: ManifestAdapterShape["stopAll"] = () =>
      Effect.gen(function* () {
        const sessions = yield* Ref.get(sessionsRef);
        for (const entry of sessions.values()) {
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

    // ── Return shape ──────────────────────────────────────────────────────────

    return {
      provider: PROVIDER,
      capabilities: {
        // Auto routes to a new provider per turn internally — no restart needed.
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
      refreshRateLimits: () => Effect.void,
      streamEvents: Stream.fromPubSub(eventsPubSub),
    } satisfies ManifestAdapterShape;
  }),
);
