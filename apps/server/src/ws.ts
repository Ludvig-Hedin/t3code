import { Cause, Effect, Layer, Option, Queue, Ref, Schema, Stream } from "effect";
import {
  CommandId,
  EventId,
  type OrchestrationCommand,
  type GitActionProgressEvent,
  type GitManagerServiceError,
  OrchestrationDispatchCommandError,
  type OrchestrationEvent,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  ORCHESTRATION_WS_METHODS,
  ProjectSearchEntriesError,
  ProjectReadFileError,
  ProjectWriteFileError,
  OrchestrationReplayEventsError,
  ThreadId,
  type TerminalEvent,
  WS_METHODS,
  WsRpcGroup,
  PreviewError,
} from "@t3tools/contracts";
import { clamp } from "effect/Number";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { CheckpointDiffQuery } from "./checkpointing/Services/CheckpointDiffQuery";
import { ServerConfig } from "./config";
import { GitCore } from "./git/Services/GitCore";
import { GitManager } from "./git/Services/GitManager";
import { Keybindings } from "./keybindings";
import { Open, resolveAvailableEditors } from "./open";
import { normalizeDispatchCommand } from "./orchestration/Normalizer";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "./orchestration/Services/OrchestrationEngine";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";
import {
  observeRpcEffect,
  observeRpcStream,
  observeRpcStreamEffect,
} from "./observability/RpcInstrumentation";
import { ProviderRegistry } from "./provider/Services/ProviderRegistry";
import { ProviderService } from "./provider/Services/ProviderService";
import { fetchAllRateLimits } from "./provider/RateLimitFetcher";
import { ServerLifecycleEvents } from "./serverLifecycleEvents";
import { ServerRuntimeStartup } from "./serverRuntimeStartup";
import { ServerSettingsService } from "./serverSettings";
import { TerminalManager } from "./terminal/Services/Manager";
import { WorkspaceEntries } from "./workspace/Services/WorkspaceEntries";
import { WorkspaceFileSystem } from "./workspace/Services/WorkspaceFileSystem";
import { WorkspacePathOutsideRootError } from "./workspace/Services/WorkspacePaths";
import { ProjectSetupScriptRunner } from "./project/Services/ProjectSetupScriptRunner";
import { SkillService } from "./skills";
import { Mem0Service, type Mem0Memory, type Mem0ServiceShape } from "./memory/Services/Mem0Service";
import { PreviewServerManager } from "./preview/Services/PreviewServerManager";
import { McpService } from "./mcp";
import { PluginService } from "./plugins";
import { A2aAgentCardService, A2aTaskService, A2aClientService } from "./a2a";
import { TranscriptionService } from "./transcription/TranscriptionService";

// ---------------------------------------------------------------------------
// Memory helpers — used in the dispatchCommand handler to enrich user messages
// with relevant past context from Mem0 before they reach the orchestration engine.
// ---------------------------------------------------------------------------

/**
 * Resolve the ProjectId for a thread.turn.start command.
 * For new threads the projectId is on the bootstrap object; for existing
 * threads it is looked up from the orchestration read model.
 */
const resolveProjectIdForTurnStart = (
  command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
  orchestrationEngine: OrchestrationEngineShape,
): Effect.Effect<string | undefined> => {
  const bootstrapProjectId = command.bootstrap?.createThread?.projectId;
  if (bootstrapProjectId !== undefined) {
    return Effect.succeed(bootstrapProjectId);
  }
  return orchestrationEngine
    .getReadModel()
    .pipe(Effect.map((rm) => rm.threads.find((t) => t.id === command.threadId)?.projectId));
};

/**
 * Format a list of memories as an XML-like prefix block that AI providers
 * understand as injected context separate from the user's actual query.
 */
const formatMemoryBlock = (memories: ReadonlyArray<Mem0Memory>): string => {
  const lines = memories.map((m) => `- ${m.memory}`).join("\n");
  return `<memory>\nRelevant context from past interactions:\n${lines}\n</memory>`;
};

/**
 * Deduplicate memory entries by their Mem0 id.
 * Global and project-scoped searches can return the same memory.
 */
const deduplicateMemories = (items: ReadonlyArray<Mem0Memory>): ReadonlyArray<Mem0Memory> => {
  const seen = new Set<string>();
  return items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
};

/**
 * Enrich a thread.turn.start command with relevant memories retrieved from Mem0.
 *
 * Searches both global and project-scoped memory in parallel (2-second cap).
 * If Mem0 is unavailable, times out, or returns no results the original command
 * is returned unchanged. This operation never fails.
 */
const enrichTurnStartWithMemories = (
  command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
  mem0: Mem0ServiceShape,
  orchestrationEngine: OrchestrationEngineShape,
): Effect.Effect<Extract<OrchestrationCommand, { type: "thread.turn.start" }>> =>
  Effect.gen(function* () {
    const query = command.message.text.trim();
    // Skip empty messages — nothing meaningful to search for
    if (!query) return command;

    const projectId = yield* resolveProjectIdForTurnStart(command, orchestrationEngine);
    const userId = mem0.defaultUserId;

    // Run global and project-scoped searches in parallel
    const resultOpt = yield* Effect.all(
      [
        mem0.search(query, { userId }),
        projectId
          ? mem0.search(query, { userId, projectId })
          : Effect.succeed([] as ReadonlyArray<Mem0Memory>),
      ],
      { concurrency: 2 },
    ).pipe(Effect.timeoutOption(2000));

    if (Option.isNone(resultOpt)) {
      // Timed out overall — proceed without memories
      return command;
    }

    const [globalMemories, projectMemories] = resultOpt.value;
    const allMemories = deduplicateMemories([...globalMemories, ...projectMemories]);
    if (allMemories.length === 0) return command;

    const memoryPrefix = formatMemoryBlock(allMemories);
    return {
      ...command,
      message: {
        ...command.message,
        text: `${memoryPrefix}\n\n${command.message.text}`,
      },
    };
  }).pipe(
    // Never let memory errors surface to the caller
    Effect.orElseSucceed(() => command),
  );

const WsRpcLayer = WsRpcGroup.toLayer(
  Effect.gen(function* () {
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const checkpointDiffQuery = yield* CheckpointDiffQuery;
    const keybindings = yield* Keybindings;
    const open = yield* Open;
    const gitManager = yield* GitManager;
    const git = yield* GitCore;
    const terminalManager = yield* TerminalManager;
    const providerRegistry = yield* ProviderRegistry;
    const config = yield* ServerConfig;
    const lifecycleEvents = yield* ServerLifecycleEvents;
    const serverSettings = yield* ServerSettingsService;
    const startup = yield* ServerRuntimeStartup;
    const workspaceEntries = yield* WorkspaceEntries;
    const workspaceFileSystem = yield* WorkspaceFileSystem;
    const projectSetupScriptRunner = yield* ProjectSetupScriptRunner;
    const skillService = yield* SkillService;
    const mem0 = yield* Mem0Service;
    const previewManager = yield* PreviewServerManager;
    const mcpService = yield* McpService;
    const pluginService = yield* PluginService;
    const transcriptionService = yield* TranscriptionService;
    const a2aAgentCardService = yield* A2aAgentCardService;
    const a2aTaskService = yield* A2aTaskService;
    const a2aClientService = yield* A2aClientService;

    const serverCommandId = (tag: string) =>
      CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

    const appendSetupScriptActivity = (input: {
      readonly threadId: ThreadId;
      readonly kind: "setup-script.requested" | "setup-script.started" | "setup-script.failed";
      readonly summary: string;
      readonly createdAt: string;
      readonly payload: Record<string, unknown>;
      readonly tone: "info" | "error";
    }) =>
      orchestrationEngine.dispatch({
        type: "thread.activity.append",
        commandId: serverCommandId("setup-script-activity"),
        threadId: input.threadId,
        activity: {
          id: EventId.makeUnsafe(crypto.randomUUID()),
          tone: input.tone,
          kind: input.kind,
          summary: input.summary,
          payload: input.payload,
          turnId: null,
          createdAt: input.createdAt,
        },
        createdAt: input.createdAt,
      });

    const toDispatchCommandError = (cause: unknown, fallbackMessage: string) =>
      Schema.is(OrchestrationDispatchCommandError)(cause)
        ? cause
        : new OrchestrationDispatchCommandError({
            message: cause instanceof Error ? cause.message : fallbackMessage,
            cause,
          });

    const toBootstrapDispatchCommandCauseError = (cause: Cause.Cause<unknown>) => {
      const error = Cause.squash(cause);
      return Schema.is(OrchestrationDispatchCommandError)(error)
        ? error
        : new OrchestrationDispatchCommandError({
            message:
              error instanceof Error ? error.message : "Failed to bootstrap thread turn start.",
            cause,
          });
    };

    const dispatchBootstrapTurnStart = (
      command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
    ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> =>
      Effect.gen(function* () {
        const bootstrap = command.bootstrap;
        const { bootstrap: _bootstrap, ...finalTurnStartCommand } = command;
        let createdThread = false;
        let targetProjectId = bootstrap?.createThread?.projectId;
        let targetProjectCwd = bootstrap?.prepareWorktree?.projectCwd;
        let targetWorktreePath = bootstrap?.createThread?.worktreePath ?? null;

        const cleanupCreatedThread = () =>
          createdThread
            ? orchestrationEngine
                .dispatch({
                  type: "thread.delete",
                  commandId: serverCommandId("bootstrap-thread-delete"),
                  threadId: command.threadId,
                })
                .pipe(Effect.ignoreCause({ log: true }))
            : Effect.void;

        const recordSetupScriptLaunchFailure = (input: {
          readonly error: unknown;
          readonly requestedAt: string;
          readonly worktreePath: string;
        }) => {
          const detail =
            input.error instanceof Error ? input.error.message : "Unknown setup failure.";
          return appendSetupScriptActivity({
            threadId: command.threadId,
            kind: "setup-script.failed",
            summary: "Setup script failed to start",
            createdAt: input.requestedAt,
            payload: {
              detail,
              worktreePath: input.worktreePath,
            },
            tone: "error",
          }).pipe(
            Effect.ignoreCause({ log: false }),
            Effect.flatMap(() =>
              Effect.logWarning("bootstrap turn start failed to launch setup script", {
                threadId: command.threadId,
                worktreePath: input.worktreePath,
                detail,
              }),
            ),
          );
        };

        const recordSetupScriptStarted = (input: {
          readonly requestedAt: string;
          readonly worktreePath: string;
          readonly scriptId: string;
          readonly scriptName: string;
          readonly terminalId: string;
        }) => {
          const payload = {
            scriptId: input.scriptId,
            scriptName: input.scriptName,
            terminalId: input.terminalId,
            worktreePath: input.worktreePath,
          };
          return Effect.all([
            appendSetupScriptActivity({
              threadId: command.threadId,
              kind: "setup-script.requested",
              summary: "Starting setup script",
              createdAt: input.requestedAt,
              payload,
              tone: "info",
            }),
            appendSetupScriptActivity({
              threadId: command.threadId,
              kind: "setup-script.started",
              summary: "Setup script started",
              createdAt: new Date().toISOString(),
              payload,
              tone: "info",
            }),
          ]).pipe(
            Effect.asVoid,
            Effect.catch((error) =>
              Effect.logWarning(
                "bootstrap turn start launched setup script but failed to record setup activity",
                {
                  threadId: command.threadId,
                  worktreePath: input.worktreePath,
                  scriptId: input.scriptId,
                  terminalId: input.terminalId,
                  detail:
                    error instanceof Error
                      ? error.message
                      : "Unknown setup activity dispatch failure.",
                },
              ),
            ),
          );
        };

        const runSetupProgram = () =>
          bootstrap?.runSetupScript && targetWorktreePath
            ? (() => {
                const worktreePath = targetWorktreePath;
                const requestedAt = new Date().toISOString();
                return projectSetupScriptRunner
                  .runForThread({
                    threadId: command.threadId,
                    ...(targetProjectId ? { projectId: targetProjectId } : {}),
                    ...(targetProjectCwd ? { projectCwd: targetProjectCwd } : {}),
                    worktreePath,
                  })
                  .pipe(
                    Effect.matchEffect({
                      onFailure: (error) =>
                        recordSetupScriptLaunchFailure({
                          error,
                          requestedAt,
                          worktreePath,
                        }),
                      onSuccess: (setupResult) => {
                        if (setupResult.status !== "started") {
                          return Effect.void;
                        }
                        return recordSetupScriptStarted({
                          requestedAt,
                          worktreePath,
                          scriptId: setupResult.scriptId,
                          scriptName: setupResult.scriptName,
                          terminalId: setupResult.terminalId,
                        });
                      },
                    }),
                  );
              })()
            : Effect.void;

        const bootstrapProgram = Effect.gen(function* () {
          if (bootstrap?.createThread) {
            yield* orchestrationEngine.dispatch({
              type: "thread.create",
              commandId: serverCommandId("bootstrap-thread-create"),
              threadId: command.threadId,
              projectId: bootstrap.createThread.projectId,
              title: bootstrap.createThread.title,
              modelSelection: bootstrap.createThread.modelSelection,
              runtimeMode: bootstrap.createThread.runtimeMode,
              interactionMode: bootstrap.createThread.interactionMode,
              branch: bootstrap.createThread.branch,
              worktreePath: bootstrap.createThread.worktreePath,
              createdAt: bootstrap.createThread.createdAt,
            });
            createdThread = true;
          }

          if (bootstrap?.prepareWorktree) {
            const worktree = yield* git.createWorktree({
              cwd: bootstrap.prepareWorktree.projectCwd,
              branch: bootstrap.prepareWorktree.baseBranch,
              newBranch: bootstrap.prepareWorktree.branch,
              path: null,
            });
            targetWorktreePath = worktree.worktree.path;
            yield* orchestrationEngine.dispatch({
              type: "thread.meta.update",
              commandId: serverCommandId("bootstrap-thread-meta-update"),
              threadId: command.threadId,
              branch: worktree.worktree.branch,
              worktreePath: targetWorktreePath,
            });
          }

          yield* runSetupProgram();

          return yield* orchestrationEngine.dispatch(finalTurnStartCommand);
        });

        return yield* bootstrapProgram.pipe(
          Effect.catchCause((cause) => {
            const dispatchError = toBootstrapDispatchCommandCauseError(cause);
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.fail(dispatchError);
            }
            return cleanupCreatedThread().pipe(Effect.flatMap(() => Effect.fail(dispatchError)));
          }),
        );
      });

    const dispatchNormalizedCommand = (
      normalizedCommand: OrchestrationCommand,
    ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError> => {
      const dispatchEffect =
        normalizedCommand.type === "thread.turn.start" && normalizedCommand.bootstrap
          ? dispatchBootstrapTurnStart(normalizedCommand)
          : orchestrationEngine
              .dispatch(normalizedCommand)
              .pipe(
                Effect.mapError((cause) =>
                  toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
                ),
              );

      return startup
        .enqueueCommand(dispatchEffect)
        .pipe(
          Effect.mapError((cause) =>
            toDispatchCommandError(cause, "Failed to dispatch orchestration command"),
          ),
        );
    };

    const loadServerConfig = Effect.gen(function* () {
      const keybindingsConfig = yield* keybindings.loadConfigState;
      const providers = yield* providerRegistry.getProviders;
      const settings = yield* serverSettings.getSettings;

      return {
        cwd: config.cwd,
        keybindingsConfigPath: config.keybindingsConfigPath,
        keybindings: keybindingsConfig.keybindings,
        issues: keybindingsConfig.issues,
        providers,
        availableEditors: resolveAvailableEditors(),
        observability: {
          logsDirectoryPath: config.logsDir,
          localTracingEnabled: true,
          ...(config.otlpTracesUrl !== undefined ? { otlpTracesUrl: config.otlpTracesUrl } : {}),
          otlpTracesEnabled: config.otlpTracesUrl !== undefined,
          ...(config.otlpMetricsUrl !== undefined ? { otlpMetricsUrl: config.otlpMetricsUrl } : {}),
          otlpMetricsEnabled: config.otlpMetricsUrl !== undefined,
        },
        settings,
      };
    });

    return WsRpcGroup.of({
      [ORCHESTRATION_WS_METHODS.getSnapshot]: (_input) =>
        observeRpcEffect(
          ORCHESTRATION_WS_METHODS.getSnapshot,
          projectionSnapshotQuery.getSnapshot().pipe(
            Effect.mapError(
              (cause) =>
                new OrchestrationGetSnapshotError({
                  message: "Failed to load orchestration snapshot",
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "orchestration" },
        ),
      [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command) =>
        observeRpcEffect(
          ORCHESTRATION_WS_METHODS.dispatchCommand,
          Effect.gen(function* () {
            const normalizedCommand = yield* normalizeDispatchCommand(command);

            // Enrich thread.turn.start commands with relevant memories from Mem0.
            // This prepends a <memory> block to the user message so the AI provider
            // sees past context. The enrichment is best-effort and never blocks the turn.
            const commandToDispatch =
              normalizedCommand.type === "thread.turn.start"
                ? yield* enrichTurnStartWithMemories(normalizedCommand, mem0, orchestrationEngine)
                : normalizedCommand;

            const result = yield* dispatchNormalizedCommand(commandToDispatch);
            if (normalizedCommand.type === "thread.archive") {
              yield* terminalManager.close({ threadId: normalizedCommand.threadId }).pipe(
                Effect.catch((error) =>
                  Effect.logWarning("failed to close thread terminals after archive", {
                    threadId: normalizedCommand.threadId,
                    error: error.message,
                  }),
                ),
              );
            }
            return result;
          }).pipe(
            Effect.mapError((cause) =>
              Schema.is(OrchestrationDispatchCommandError)(cause)
                ? cause
                : new OrchestrationDispatchCommandError({
                    message: "Failed to dispatch orchestration command",
                    cause,
                  }),
            ),
          ),
          { "rpc.aggregate": "orchestration" },
        ),
      [ORCHESTRATION_WS_METHODS.getTurnDiff]: (input) =>
        observeRpcEffect(
          ORCHESTRATION_WS_METHODS.getTurnDiff,
          checkpointDiffQuery.getTurnDiff(input).pipe(
            Effect.mapError(
              (cause) =>
                new OrchestrationGetTurnDiffError({
                  message: "Failed to load turn diff",
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "orchestration" },
        ),
      [ORCHESTRATION_WS_METHODS.getFullThreadDiff]: (input) =>
        observeRpcEffect(
          ORCHESTRATION_WS_METHODS.getFullThreadDiff,
          checkpointDiffQuery.getFullThreadDiff(input).pipe(
            Effect.mapError(
              (cause) =>
                new OrchestrationGetFullThreadDiffError({
                  message: "Failed to load full thread diff",
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "orchestration" },
        ),
      [ORCHESTRATION_WS_METHODS.replayEvents]: (input) =>
        observeRpcEffect(
          ORCHESTRATION_WS_METHODS.replayEvents,
          Stream.runCollect(
            orchestrationEngine.readEvents(
              clamp(input.fromSequenceExclusive, { maximum: Number.MAX_SAFE_INTEGER, minimum: 0 }),
            ),
          ).pipe(
            Effect.map((events) => Array.from(events)),
            Effect.mapError(
              (cause) =>
                new OrchestrationReplayEventsError({
                  message: "Failed to replay orchestration events",
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "orchestration" },
        ),
      [WS_METHODS.subscribeOrchestrationDomainEvents]: (_input) =>
        observeRpcStreamEffect(
          WS_METHODS.subscribeOrchestrationDomainEvents,
          Effect.gen(function* () {
            const snapshot = yield* orchestrationEngine.getReadModel();
            const fromSequenceExclusive = snapshot.snapshotSequence;
            const replayEvents: Array<OrchestrationEvent> = yield* Stream.runCollect(
              orchestrationEngine.readEvents(fromSequenceExclusive),
            ).pipe(
              Effect.map((events) => Array.from(events)),
              Effect.catch(() => Effect.succeed([] as Array<OrchestrationEvent>)),
            );
            const replayStream = Stream.fromIterable(replayEvents);
            const source = Stream.merge(replayStream, orchestrationEngine.streamDomainEvents);
            type SequenceState = {
              readonly nextSequence: number;
              readonly pendingBySequence: Map<number, OrchestrationEvent>;
            };
            const state = yield* Ref.make<SequenceState>({
              nextSequence: fromSequenceExclusive + 1,
              pendingBySequence: new Map<number, OrchestrationEvent>(),
            });

            return source.pipe(
              Stream.mapEffect((event) =>
                Ref.modify(
                  state,
                  ({
                    nextSequence,
                    pendingBySequence,
                  }): [Array<OrchestrationEvent>, SequenceState] => {
                    if (event.sequence < nextSequence || pendingBySequence.has(event.sequence)) {
                      return [[], { nextSequence, pendingBySequence }];
                    }

                    const updatedPending = new Map(pendingBySequence);
                    updatedPending.set(event.sequence, event);

                    const emit: Array<OrchestrationEvent> = [];
                    let expected = nextSequence;
                    for (;;) {
                      const expectedEvent = updatedPending.get(expected);
                      if (!expectedEvent) {
                        break;
                      }
                      emit.push(expectedEvent);
                      updatedPending.delete(expected);
                      expected += 1;
                    }

                    return [emit, { nextSequence: expected, pendingBySequence: updatedPending }];
                  },
                ),
              ),
              Stream.flatMap((events) => Stream.fromIterable(events)),
            );
          }),
          { "rpc.aggregate": "orchestration" },
        ),
      [WS_METHODS.serverGetConfig]: (_input) =>
        observeRpcEffect(WS_METHODS.serverGetConfig, loadServerConfig, {
          "rpc.aggregate": "server",
        }),
      [WS_METHODS.serverRefreshProviders]: (_input) =>
        observeRpcEffect(
          WS_METHODS.serverRefreshProviders,
          providerRegistry.refresh().pipe(Effect.map((providers) => ({ providers }))),
          { "rpc.aggregate": "server" },
        ),
      // Pull a model from the Ollama registry. After pulling, refresh the
      // provider snapshot so the new model appears in the picker immediately.
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
            }).pipe(
              Effect.orElseSucceed(() => ({ success: false as const, error: "Unknown error" })),
            );
            // Refresh provider snapshot so new model appears in picker immediately
            yield* providerRegistry.refresh("ollama").pipe(Effect.orElseSucceed(() => []));
            return result;
          }).pipe(
            // ServerSettingsError is unrecoverable here — convert to a defect
            // so the error channel remains `never` as the RPC contract requires.
            Effect.orDie,
          ),
          { "rpc.aggregate": "ollama" },
        ),
      // Send a quit signal to the Ollama server. Older Ollama versions may not
      // support the /api/close endpoint — the response message reflects that.
      [WS_METHODS.ollamaQuitServer]: (_input) =>
        observeRpcEffect(
          WS_METHODS.ollamaQuitServer,
          Effect.gen(function* () {
            const settings = yield* serverSettings.getSettings;
            const baseUrl = settings.providers.ollama.baseUrl;
            return yield* Effect.tryPromise({
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
          }).pipe(
            // ServerSettingsError is unrecoverable here — convert to a defect
            // so the error channel remains `never` as the RPC contract requires.
            Effect.orDie,
          ),
          { "rpc.aggregate": "ollama" },
        ),
      [WS_METHODS.serverUpsertKeybinding]: (rule) =>
        observeRpcEffect(
          WS_METHODS.serverUpsertKeybinding,
          Effect.gen(function* () {
            const keybindingsConfig = yield* keybindings.upsertKeybindingRule(rule);
            return { keybindings: keybindingsConfig, issues: [] };
          }),
          { "rpc.aggregate": "server" },
        ),
      [WS_METHODS.serverGetSettings]: (_input) =>
        observeRpcEffect(WS_METHODS.serverGetSettings, serverSettings.getSettings, {
          "rpc.aggregate": "server",
        }),
      [WS_METHODS.serverUpdateSettings]: ({ patch }) =>
        observeRpcEffect(WS_METHODS.serverUpdateSettings, serverSettings.updateSettings(patch), {
          "rpc.aggregate": "server",
        }),
      [WS_METHODS.serverTranscribeAudio]: (input) =>
        observeRpcEffect(
          WS_METHODS.serverTranscribeAudio,
          transcriptionService.transcribeAudio(input),
          {
            "rpc.aggregate": "server",
          },
        ),
      [WS_METHODS.projectsSearchEntries]: (input) =>
        observeRpcEffect(
          WS_METHODS.projectsSearchEntries,
          workspaceEntries.search(input).pipe(
            Effect.mapError(
              (cause) =>
                new ProjectSearchEntriesError({
                  message: `Failed to search workspace entries: ${cause.detail}`,
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "workspace" },
        ),
      [WS_METHODS.projectsReadFile]: (input) =>
        observeRpcEffect(
          WS_METHODS.projectsReadFile,
          workspaceFileSystem.readFile(input).pipe(
            Effect.map((contents) =>
              contents === null
                ? null
                : {
                    relativePath: input.relativePath,
                    contents,
                  },
            ),
            Effect.mapError(
              (cause) =>
                new ProjectReadFileError({
                  message: `Failed to read workspace file: ${
                    cause instanceof Error ? cause.message : String(cause)
                  }`,
                  cause,
                }),
            ),
          ),
          { "rpc.aggregate": "workspace" },
        ),
      [WS_METHODS.projectsWriteFile]: (input) =>
        observeRpcEffect(
          WS_METHODS.projectsWriteFile,
          workspaceFileSystem.writeFile(input).pipe(
            Effect.mapError((cause) => {
              const message = Schema.is(WorkspacePathOutsideRootError)(cause)
                ? "Workspace file path must stay within the project root."
                : "Failed to write workspace file";
              return new ProjectWriteFileError({
                message,
                cause,
              });
            }),
          ),
          { "rpc.aggregate": "workspace" },
        ),
      [WS_METHODS.shellOpenInEditor]: (input) =>
        observeRpcEffect(WS_METHODS.shellOpenInEditor, open.openInEditor(input), {
          "rpc.aggregate": "workspace",
        }),
      [WS_METHODS.gitStatus]: (input) =>
        observeRpcEffect(WS_METHODS.gitStatus, gitManager.status(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitPull]: (input) =>
        observeRpcEffect(WS_METHODS.gitPull, git.pullCurrentBranch(input.cwd), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitRunStackedAction]: (input) =>
        observeRpcStream(
          WS_METHODS.gitRunStackedAction,
          Stream.callback<GitActionProgressEvent, GitManagerServiceError>((queue) =>
            gitManager
              .runStackedAction(input, {
                actionId: input.actionId,
                progressReporter: {
                  publish: (event) => Queue.offer(queue, event).pipe(Effect.asVoid),
                },
              })
              .pipe(
                Effect.matchCauseEffect({
                  onFailure: (cause) => Queue.failCause(queue, cause),
                  onSuccess: () => Queue.end(queue).pipe(Effect.asVoid),
                }),
              ),
          ),
          { "rpc.aggregate": "git" },
        ),
      [WS_METHODS.gitResolvePullRequest]: (input) =>
        observeRpcEffect(WS_METHODS.gitResolvePullRequest, gitManager.resolvePullRequest(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitPreparePullRequestThread]: (input) =>
        observeRpcEffect(
          WS_METHODS.gitPreparePullRequestThread,
          gitManager.preparePullRequestThread(input),
          { "rpc.aggregate": "git" },
        ),
      [WS_METHODS.gitPrepareReviewContext]: (input) =>
        observeRpcEffect(
          WS_METHODS.gitPrepareReviewContext,
          gitManager.prepareReviewContext(input),
          { "rpc.aggregate": "git" },
        ),
      [WS_METHODS.gitGetWorkingDiff]: (input) =>
        observeRpcEffect(WS_METHODS.gitGetWorkingDiff, gitManager.getWorkingDiff(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitListBranches]: (input) =>
        observeRpcEffect(WS_METHODS.gitListBranches, git.listBranches(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitCreateWorktree]: (input) =>
        observeRpcEffect(WS_METHODS.gitCreateWorktree, git.createWorktree(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitRemoveWorktree]: (input) =>
        observeRpcEffect(WS_METHODS.gitRemoveWorktree, git.removeWorktree(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitCreateBranch]: (input) =>
        observeRpcEffect(WS_METHODS.gitCreateBranch, git.createBranch(input), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitCheckout]: (input) =>
        observeRpcEffect(WS_METHODS.gitCheckout, Effect.scoped(git.checkoutBranch(input)), {
          "rpc.aggregate": "git",
        }),
      [WS_METHODS.gitInit]: (input) =>
        observeRpcEffect(WS_METHODS.gitInit, git.initRepo(input), { "rpc.aggregate": "git" }),
      [WS_METHODS.terminalOpen]: (input) =>
        observeRpcEffect(WS_METHODS.terminalOpen, terminalManager.open(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.terminalWrite]: (input) =>
        observeRpcEffect(WS_METHODS.terminalWrite, terminalManager.write(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.terminalResize]: (input) =>
        observeRpcEffect(WS_METHODS.terminalResize, terminalManager.resize(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.terminalClear]: (input) =>
        observeRpcEffect(WS_METHODS.terminalClear, terminalManager.clear(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.terminalRestart]: (input) =>
        observeRpcEffect(WS_METHODS.terminalRestart, terminalManager.restart(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.terminalClose]: (input) =>
        observeRpcEffect(WS_METHODS.terminalClose, terminalManager.close(input), {
          "rpc.aggregate": "terminal",
        }),
      [WS_METHODS.subscribeTerminalEvents]: (_input) =>
        observeRpcStream(
          WS_METHODS.subscribeTerminalEvents,
          Stream.callback<TerminalEvent>((queue) =>
            Effect.acquireRelease(
              terminalManager.subscribe((event) => Queue.offer(queue, event)),
              (unsubscribe) => Effect.sync(unsubscribe),
            ),
          ),
          { "rpc.aggregate": "terminal" },
        ),
      [WS_METHODS.subscribeServerConfig]: (_input) =>
        observeRpcStreamEffect(
          WS_METHODS.subscribeServerConfig,
          Effect.gen(function* () {
            const keybindingsUpdates = keybindings.streamChanges.pipe(
              Stream.map((event) => ({
                version: 1 as const,
                type: "keybindingsUpdated" as const,
                payload: {
                  issues: event.issues,
                },
              })),
            );
            const providerStatuses = providerRegistry.streamChanges.pipe(
              Stream.map((providers) => ({
                version: 1 as const,
                type: "providerStatuses" as const,
                payload: { providers },
              })),
            );
            const settingsUpdates = serverSettings.streamChanges.pipe(
              Stream.map((settings) => ({
                version: 1 as const,
                type: "settingsUpdated" as const,
                payload: { settings },
              })),
            );

            return Stream.concat(
              Stream.make({
                version: 1 as const,
                type: "snapshot" as const,
                config: yield* loadServerConfig,
              }),
              Stream.merge(keybindingsUpdates, Stream.merge(providerStatuses, settingsUpdates)),
            );
          }),
          { "rpc.aggregate": "server" },
        ),
      [WS_METHODS.subscribeServerLifecycle]: (_input) =>
        observeRpcStreamEffect(
          WS_METHODS.subscribeServerLifecycle,
          Effect.gen(function* () {
            const snapshot = yield* lifecycleEvents.snapshot;
            const snapshotEvents = Array.from(snapshot.events).toSorted(
              (left, right) => left.sequence - right.sequence,
            );
            const liveEvents = lifecycleEvents.stream.pipe(
              Stream.filter((event) => event.sequence > snapshot.sequence),
            );
            return Stream.concat(Stream.fromIterable(snapshotEvents), liveEvents);
          }),
          { "rpc.aggregate": "server" },
        ),

      // Rate-limit subscription:
      //  1. Emit cached snapshot (populated by session-start eager fetch, may be empty).
      //  2. Make a direct fetch from provider credential files / keychain — no active session
      //     needed. This is the primary path (same approach as codexbar).
      //  3. Fork session-based refresh for any active in-app sessions.
      //  4. Stream live push updates indefinitely.
      [WS_METHODS.subscribeProviderRateLimits]: (_input) =>
        observeRpcStreamEffect(
          WS_METHODS.subscribeProviderRateLimits,
          Effect.gen(function* () {
            const providerService = yield* ProviderService;

            // Live updates from session push events (Codex: account/rateLimits/updated,
            // Claude: rate_limit_event). This subscription must be set up BEFORE the
            // direct fetch fires so no events are missed.
            const liveStream = providerService.streamEvents.pipe(
              Stream.filter((e) => e.type === "account.rate-limits.updated"),
              Stream.map((e) => ({
                provider: e.provider,
                rateLimits: (e.payload as { rateLimits: unknown }).rateLimits,
                updatedAt: e.createdAt,
              })),
            );

            // Direct fetch from credential files/keychain — session-independent.
            // Errors are swallowed (catch returns empty array).
            const directFetchStream = Stream.fromIterableEffect(
              Effect.promise(() => fetchAllRateLimits().catch(() => [])),
            );

            // Session-based refresh for any active in-app Codex sessions (best-effort).
            yield* Effect.forkScoped(
              providerService.refreshRateLimits().pipe(Effect.orElseSucceed(() => {})),
            );

            // Cached entries first, then direct fetch results, then live push updates.
            const cached = yield* providerService.getRateLimits();
            return Stream.merge(
              Stream.concat(Stream.fromIterable(cached), directFetchStream),
              liveStream,
            );
          }),
          { "rpc.aggregate": "provider" },
        ),

      // --- Skills ---
      [WS_METHODS.skillsList]: (_input: {}) =>
        observeRpcEffect(WS_METHODS.skillsList, skillService.list, {
          "rpc.aggregate": "skills",
        }),
      [WS_METHODS.skillsSave]: (input: {
        readonly name: string;
        readonly description: string;
        readonly content: string;
      }) =>
        observeRpcEffect(WS_METHODS.skillsSave, skillService.save(input), {
          "rpc.aggregate": "skills",
        }),
      [WS_METHODS.skillsDelete]: ({ name }: { readonly name: string }) =>
        observeRpcEffect(WS_METHODS.skillsDelete, skillService.remove(name), {
          "rpc.aggregate": "skills",
        }),
      [WS_METHODS.skillsGenerate]: ({ description }: { readonly description: string }) =>
        observeRpcEffect(WS_METHODS.skillsGenerate, skillService.generate(description), {
          "rpc.aggregate": "skills",
        }),

      // --- Preview ---
      [WS_METHODS.previewDetectApps]: ({ projectId }) =>
        observeRpcEffect(
          WS_METHODS.previewDetectApps,
          Effect.gen(function* () {
            const snapshot = yield* projectionSnapshotQuery.getSnapshot();
            // OrchestrationProject uses `workspaceRoot` for the project's filesystem path
            const project = snapshot.projects?.find(
              (p: { id: string; workspaceRoot?: string }) => p.id === projectId,
            );
            const cwd = project?.workspaceRoot ?? "";
            return yield* previewManager.detectApps(projectId, cwd);
          }).pipe(
            Effect.mapError(
              (e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) }),
            ),
          ),
          { "rpc.aggregate": "preview" },
        ),

      [WS_METHODS.previewStart]: ({ projectId, appId }) =>
        observeRpcEffect(
          WS_METHODS.previewStart,
          previewManager
            .startApp(projectId, appId)
            .pipe(
              Effect.mapError(
                (e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) }),
              ),
            ),
          { "rpc.aggregate": "preview" },
        ),

      [WS_METHODS.previewStop]: ({ projectId, appId }) =>
        observeRpcEffect(
          WS_METHODS.previewStop,
          // stopApp declares Effect<void, Error> in the interface; map to PreviewError for the RPC contract
          previewManager.stopApp(projectId, appId).pipe(
            Effect.mapError(
              (e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) }),
            ),
            Effect.asVoid,
          ),
          { "rpc.aggregate": "preview" },
        ),

      [WS_METHODS.previewGetSessions]: ({ projectId }) =>
        observeRpcEffect(
          WS_METHODS.previewGetSessions,
          Effect.succeed(previewManager.getSessions(projectId)),
          { "rpc.aggregate": "preview" },
        ),

      [WS_METHODS.previewUpdateApp]: ({ projectId, appId, patch }) =>
        observeRpcEffect(
          WS_METHODS.previewUpdateApp,
          // Strip undefined values from the patch to bridge Schema.optional (adds |undefined)
          // and the service interface's plain optional fields (exactOptionalPropertyTypes compat)
          previewManager
            .updateApp(projectId, appId, {
              ...(patch.label !== undefined ? { label: patch.label } : {}),
              ...(patch.command !== undefined ? { command: patch.command } : {}),
              ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
              ...(patch.type !== undefined ? { type: patch.type } : {}),
            })
            .pipe(
              Effect.mapError(
                (e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) }),
              ),
            ),
          { "rpc.aggregate": "preview" },
        ),

      [WS_METHODS.subscribePreviewEvents]: ({ projectId }) =>
        observeRpcStream(
          WS_METHODS.subscribePreviewEvents,
          // streamEvents returns a Stream directly (not Effect<Stream>)
          previewManager.streamEvents(projectId),
          { "rpc.aggregate": "preview" },
        ),

      // ── MCP server handlers ────────────────────────────────────────────────
      [WS_METHODS.mcpListServers]: ({ provider }) =>
        observeRpcEffect(WS_METHODS.mcpListServers, mcpService.list(provider), {
          "rpc.aggregate": "mcp",
        }),
      [WS_METHODS.mcpAddServer]: ({ provider, name, server }) =>
        observeRpcEffect(WS_METHODS.mcpAddServer, mcpService.add(provider, name, server), {
          "rpc.aggregate": "mcp",
        }),
      [WS_METHODS.mcpUpdateServer]: ({ provider, name, patch }) =>
        observeRpcEffect(WS_METHODS.mcpUpdateServer, mcpService.update(provider, name, patch), {
          "rpc.aggregate": "mcp",
        }),
      [WS_METHODS.mcpDeleteServer]: ({ provider, name }) =>
        observeRpcEffect(WS_METHODS.mcpDeleteServer, mcpService.delete(provider, name), {
          "rpc.aggregate": "mcp",
        }),
      // ── Plugin handlers ────────────────────────────────────────────────────
      [WS_METHODS.pluginsList]: (_input) =>
        observeRpcEffect(WS_METHODS.pluginsList, pluginService.list(), {
          "rpc.aggregate": "plugins",
        }),
      [WS_METHODS.pluginsInstall]: ({ source }) =>
        observeRpcEffect(WS_METHODS.pluginsInstall, pluginService.install(source), {
          "rpc.aggregate": "plugins",
        }),
      [WS_METHODS.pluginsRemove]: ({ location }) =>
        observeRpcEffect(WS_METHODS.pluginsRemove, pluginService.remove(location), {
          "rpc.aggregate": "plugins",
        }),

      // ── A2A (Agent-to-Agent) handlers ──────────────────────────────────────
      [WS_METHODS.a2aListAgents]: () =>
        observeRpcEffect(WS_METHODS.a2aListAgents, a2aAgentCardService.list(), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.a2aRegisterAgent]: ({ url, name }) =>
        observeRpcEffect(
          WS_METHODS.a2aRegisterAgent,
          a2aAgentCardService.register({ url, ...(name != null ? { name } : {}) }),
          {
            "rpc.aggregate": "a2a",
          },
        ),
      [WS_METHODS.a2aRemoveAgent]: ({ agentCardId }) =>
        observeRpcEffect(WS_METHODS.a2aRemoveAgent, a2aAgentCardService.remove(agentCardId), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.a2aDiscoverAgent]: ({ url }) =>
        observeRpcEffect(WS_METHODS.a2aDiscoverAgent, a2aAgentCardService.discover(url), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.a2aSendMessage]: ({ agentCardId, message, taskId }) =>
        observeRpcEffect(
          WS_METHODS.a2aSendMessage,
          a2aClientService
            .sendMessage({
              agentCardId,
              message,
              ...(taskId != null ? { taskId } : {}),
            })
            .pipe(Effect.map((task) => ({ task }))),
          { "rpc.aggregate": "a2a" },
        ),
      [WS_METHODS.a2aGetTask]: ({ taskId }) =>
        observeRpcEffect(WS_METHODS.a2aGetTask, a2aTaskService.getTask(taskId), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.a2aListTasks]: () =>
        observeRpcEffect(WS_METHODS.a2aListTasks, a2aTaskService.listTasks(), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.a2aCancelTask]: ({ taskId }) =>
        observeRpcEffect(WS_METHODS.a2aCancelTask, a2aTaskService.cancelTask(taskId), {
          "rpc.aggregate": "a2a",
        }),
      [WS_METHODS.subscribeA2aEvents]: () =>
        observeRpcStream(WS_METHODS.subscribeA2aEvents, a2aTaskService.streamEvents, {
          "rpc.aggregate": "a2a",
        }),
    });
  }),
);

export const websocketRpcRouteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const rpcWebSocketHttpEffect = yield* RpcServer.toHttpEffectWebsocket(WsRpcGroup, {
      spanPrefix: "ws.rpc",
      spanAttributes: {
        "rpc.transport": "websocket",
        "rpc.system": "effect-rpc",
      },
    }).pipe(Effect.provide(Layer.mergeAll(WsRpcLayer, RpcSerialization.layerJson)));
    return HttpRouter.add(
      "GET",
      "/ws",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const config = yield* ServerConfig;
        if (config.authToken) {
          const url = HttpServerRequest.toURL(request);
          if (Option.isNone(url)) {
            return HttpServerResponse.text("Invalid WebSocket URL", { status: 400 });
          }
          const token = url.value.searchParams.get("token");
          if (token !== config.authToken) {
            return HttpServerResponse.text("Unauthorized WebSocket connection", { status: 401 });
          }
        }
        return yield* rpcWebSocketHttpEffect;
      }),
    );
  }),
);
