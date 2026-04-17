import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { OpenError, OpenInEditorInput } from "./editor";
import {
  GitActionProgressEvent,
  GitCheckoutInput,
  GitCommandError,
  GitCreateBranchInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitGetWorkingDiffInput,
  GitGetWorkingDiffResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitManagerServiceError,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPrepareReviewContextInput,
  GitPrepareReviewContextResult,
  GitPullInput,
  GitPullRequestRefInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitStatusInput,
  GitStatusResult,
} from "./git";
import { KeybindingsConfigError } from "./keybindings";
import {
  ClientOrchestrationCommand,
  OrchestrationEvent,
  ORCHESTRATION_WS_METHODS,
  OrchestrationDispatchCommandError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetSnapshotError,
  OrchestrationGetSnapshotInput,
  OrchestrationGetTurnDiffError,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsError,
  OrchestrationReplayEventsInput,
  OrchestrationRpcSchemas,
  ProviderKind,
} from "./orchestration";
import {
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalError,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import {
  ServerConfigStreamEvent,
  ServerConfig,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
  ProviderRateLimitEntry,
} from "./server";
import { McpServer, McpServerInput, McpServerError } from "./mcp";
import { PluginInfo, PluginInstallInput, PluginError } from "./plugins";
import {
  A2A_WS_METHODS,
  A2aAgentCard,
  A2aCancelTaskInput,
  A2aClientError,
  A2aGetTaskInput,
  A2aMessageSendInput,
  A2aMessageSendResult,
  A2aRegisterAgentInput,
  A2aRemoveAgentInput,
  A2aServiceError,
  A2aSseEvent,
  A2aTask,
} from "./a2a";
import {
  PromptImprovementError,
  PromptImprovementInput,
  PromptImprovementResult,
} from "./promptImprovement";
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "./settings";
import {
  SkillDeleteInput,
  SkillDraft,
  SkillError,
  SkillGenerateInput,
  SkillGenerateResult,
  SkillInfo,
} from "./skills";
import {
  ServerTranscribeAudioInput,
  ServerTranscribeAudioResult,
  TranscriptionError,
} from "./transcription";
import {
  PreviewApp,
  PreviewDetectAppsInput,
  PreviewError,
  PreviewEvent,
  PreviewGetSessionsInput,
  PreviewSession,
  PreviewStartInput,
  PreviewStopInput,
  PreviewSubscribeInput,
  PreviewUpdateAppInput,
} from "./preview";

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsSearchEntries: "projects.searchEntries",
  projectsReadFile: "projects.readFile",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Git methods
  gitPull: "git.pull",
  gitStatus: "git.status",
  gitRunStackedAction: "git.runStackedAction",
  gitListBranches: "git.listBranches",
  gitCreateWorktree: "git.createWorktree",
  gitRemoveWorktree: "git.removeWorktree",
  gitCreateBranch: "git.createBranch",
  gitCheckout: "git.checkout",
  gitInit: "git.init",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",
  gitPrepareReviewContext: "git.prepareReviewContext",
  gitGetWorkingDiff: "git.getWorkingDiff",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverTranscribeAudio: "server.transcribeAudio",
  promptsImprove: "prompts.improve",

  // Skills methods
  skillsList: "skills.list",
  skillsSave: "skills.save",
  skillsDelete: "skills.delete",
  skillsGenerate: "skills.generate",

  // MCP server methods
  mcpListServers: "mcp.listServers",
  mcpAddServer: "mcp.addServer",
  mcpUpdateServer: "mcp.updateServer",
  mcpDeleteServer: "mcp.deleteServer",

  // Plugin methods
  pluginsList: "plugins.list",
  pluginsInstall: "plugins.install",
  pluginsRemove: "plugins.remove",

  // Ollama management methods
  ollamaPullModel: "ollama.pullModel",
  ollamaQuitServer: "ollama.quitServer",

  // Streaming subscriptions
  subscribeOrchestrationDomainEvents: "subscribeOrchestrationDomainEvents",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeProviderRateLimits: "subscribeProviderRateLimits",

  // A2A (Agent-to-Agent) protocol methods
  a2aListAgents: A2A_WS_METHODS.listAgents,
  a2aRegisterAgent: A2A_WS_METHODS.registerAgent,
  a2aRemoveAgent: A2A_WS_METHODS.removeAgent,
  a2aDiscoverAgent: A2A_WS_METHODS.discoverAgent,
  a2aSendMessage: A2A_WS_METHODS.sendMessage,
  a2aGetTask: A2A_WS_METHODS.getTask,
  a2aListTasks: A2A_WS_METHODS.listTasks,
  a2aCancelTask: A2A_WS_METHODS.cancelTask,
  subscribeA2aEvents: A2A_WS_METHODS.subscribeEvents,

  // Preview / dev-server methods
  previewDetectApps: "preview.detectApps",
  previewStart: "preview.start",
  previewStop: "preview.stop",
  previewGetSessions: "preview.getSessions",
  previewUpdateApp: "preview.updateApp",
  subscribePreviewEvents: "preview.subscribe",
} as const;

export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: KeybindingsConfigError,
});

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
});

export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({}),
  success: ServerProviderUpdatedPayload,
});

export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: Schema.Struct({ patch: ServerSettingsPatch }),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerTranscribeAudioRpc = Rpc.make(WS_METHODS.serverTranscribeAudio, {
  payload: ServerTranscribeAudioInput,
  success: ServerTranscribeAudioResult,
  error: TranscriptionError,
});

export const WsPromptImproveRpc = Rpc.make(WS_METHODS.promptsImprove, {
  payload: PromptImprovementInput,
  success: PromptImprovementResult,
  error: PromptImprovementError,
});

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: ProjectSearchEntriesError,
});

export const WsProjectsReadFileRpc = Rpc.make(WS_METHODS.projectsReadFile, {
  payload: ProjectReadFileInput,
  success: Schema.NullOr(ProjectReadFileResult),
  error: ProjectReadFileError,
});

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: ProjectWriteFileError,
});

export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: OpenInEditorInput,
  error: OpenError,
});

export const WsGitStatusRpc = Rpc.make(WS_METHODS.gitStatus, {
  payload: GitStatusInput,
  success: GitStatusResult,
  error: GitManagerServiceError,
});

export const WsGitPullRpc = Rpc.make(WS_METHODS.gitPull, {
  payload: GitPullInput,
  success: GitPullResult,
  error: GitCommandError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: GitManagerServiceError,
});

export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: GitManagerServiceError,
});

export const WsGitPrepareReviewContextRpc = Rpc.make(WS_METHODS.gitPrepareReviewContext, {
  payload: GitPrepareReviewContextInput,
  success: GitPrepareReviewContextResult,
  error: GitManagerServiceError,
});

export const WsGitGetWorkingDiffRpc = Rpc.make(WS_METHODS.gitGetWorkingDiff, {
  payload: GitGetWorkingDiffInput,
  success: GitGetWorkingDiffResult,
  error: GitManagerServiceError,
});

export const WsGitListBranchesRpc = Rpc.make(WS_METHODS.gitListBranches, {
  payload: GitListBranchesInput,
  success: GitListBranchesResult,
  error: GitCommandError,
});

export const WsGitCreateWorktreeRpc = Rpc.make(WS_METHODS.gitCreateWorktree, {
  payload: GitCreateWorktreeInput,
  success: GitCreateWorktreeResult,
  error: GitCommandError,
});

export const WsGitRemoveWorktreeRpc = Rpc.make(WS_METHODS.gitRemoveWorktree, {
  payload: GitRemoveWorktreeInput,
  error: GitCommandError,
});

export const WsGitCreateBranchRpc = Rpc.make(WS_METHODS.gitCreateBranch, {
  payload: GitCreateBranchInput,
  error: GitCommandError,
});

export const WsGitCheckoutRpc = Rpc.make(WS_METHODS.gitCheckout, {
  payload: GitCheckoutInput,
  error: GitCommandError,
});

export const WsGitInitRpc = Rpc.make(WS_METHODS.gitInit, {
  payload: GitInitInput,
  error: GitCommandError,
});

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  error: TerminalError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  error: TerminalError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  error: TerminalError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  error: TerminalError,
});

export const WsOrchestrationGetSnapshotRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getSnapshot, {
  payload: OrchestrationGetSnapshotInput,
  success: OrchestrationRpcSchemas.getSnapshot.output,
  error: OrchestrationGetSnapshotError,
});

export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: OrchestrationDispatchCommandError,
  },
);

export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationGetTurnDiffInput,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: OrchestrationGetTurnDiffError,
});

export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationGetFullThreadDiffInput,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: OrchestrationGetFullThreadDiffError,
  },
);

export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationReplayEventsInput,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: OrchestrationReplayEventsError,
});

export const WsSubscribeOrchestrationDomainEventsRpc = Rpc.make(
  WS_METHODS.subscribeOrchestrationDomainEvents,
  {
    payload: Schema.Struct({}),
    success: OrchestrationEvent,
    stream: true,
  },
);

export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
  stream: true,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  stream: true,
});

// Streams per-provider rate limit updates. On subscribe, emits the current cached
// snapshot for all providers that have already reported limits, then streams live updates.
export const WsSubscribeProviderRateLimitsRpc = Rpc.make(WS_METHODS.subscribeProviderRateLimits, {
  payload: Schema.Struct({}),
  success: ProviderRateLimitEntry,
  stream: true,
});

// --- Skills RPCs ---

export const WsSkillsListRpc = Rpc.make(WS_METHODS.skillsList, {
  payload: Schema.Struct({}),
  success: Schema.Array(SkillInfo),
  error: SkillError,
});

export const WsSkillsSaveRpc = Rpc.make(WS_METHODS.skillsSave, {
  payload: SkillDraft,
  success: SkillInfo,
  error: SkillError,
});

export const WsSkillsDeleteRpc = Rpc.make(WS_METHODS.skillsDelete, {
  payload: SkillDeleteInput,
  error: SkillError,
});

export const WsSkillsGenerateRpc = Rpc.make(WS_METHODS.skillsGenerate, {
  payload: SkillGenerateInput,
  success: SkillGenerateResult,
  error: SkillError,
});

// --- Preview RPCs ---

export const WsPreviewDetectAppsRpc = Rpc.make(WS_METHODS.previewDetectApps, {
  payload: PreviewDetectAppsInput,
  success: Schema.Array(PreviewApp),
  error: PreviewError,
});

export const WsPreviewStartRpc = Rpc.make(WS_METHODS.previewStart, {
  payload: PreviewStartInput,
  success: PreviewSession,
  error: PreviewError,
});

export const WsPreviewStopRpc = Rpc.make(WS_METHODS.previewStop, {
  payload: PreviewStopInput,
  error: PreviewError,
});

export const WsPreviewGetSessionsRpc = Rpc.make(WS_METHODS.previewGetSessions, {
  payload: PreviewGetSessionsInput,
  success: Schema.Array(PreviewSession),
  error: PreviewError,
});

export const WsPreviewUpdateAppRpc = Rpc.make(WS_METHODS.previewUpdateApp, {
  payload: PreviewUpdateAppInput,
  success: PreviewApp,
  error: PreviewError,
});

export const WsSubscribePreviewEventsRpc = Rpc.make(WS_METHODS.subscribePreviewEvents, {
  payload: PreviewSubscribeInput,
  success: PreviewEvent,
  stream: true,
});

// ── MCP Server RPCs ─────────────────────────────────────────────────────

export const WsMcpListServersRpc = Rpc.make(WS_METHODS.mcpListServers, {
  payload: Schema.Struct({ provider: ProviderKind }),
  success: Schema.Array(McpServer),
  error: McpServerError,
});

export const WsMcpAddServerRpc = Rpc.make(WS_METHODS.mcpAddServer, {
  payload: Schema.Struct({ provider: ProviderKind, name: Schema.String, server: McpServerInput }),
  success: McpServer,
  error: McpServerError,
});

export const WsMcpUpdateServerRpc = Rpc.make(WS_METHODS.mcpUpdateServer, {
  payload: Schema.Struct({ provider: ProviderKind, name: Schema.String, patch: McpServerInput }),
  success: McpServer,
  error: McpServerError,
});

export const WsMcpDeleteServerRpc = Rpc.make(WS_METHODS.mcpDeleteServer, {
  payload: Schema.Struct({ provider: ProviderKind, name: Schema.String }),
  error: McpServerError,
});

// ── Plugin RPCs ─────────────────────────────────────────────────────────

export const WsPluginsListRpc = Rpc.make(WS_METHODS.pluginsList, {
  payload: Schema.Struct({}),
  success: Schema.Array(PluginInfo),
  error: PluginError,
});

export const WsPluginsInstallRpc = Rpc.make(WS_METHODS.pluginsInstall, {
  payload: PluginInstallInput,
  success: PluginInfo,
  error: PluginError,
});

export const WsPluginsRemoveRpc = Rpc.make(WS_METHODS.pluginsRemove, {
  // changed from `name` to `location` (absolute path from PluginInfo.location).
  // This makes the contract unambiguous — package.json name ≠ directory name.
  payload: Schema.Struct({ location: Schema.String }),
  error: PluginError,
});

// ── Ollama RPCs ─────────────────────────────────────────────────────────

export const WsOllamaPullModelRpc = Rpc.make(WS_METHODS.ollamaPullModel, {
  payload: Schema.Struct({ model: Schema.String }),
  success: Schema.Struct({ success: Schema.Boolean, error: Schema.optional(Schema.String) }),
});

export const WsOllamaQuitServerRpc = Rpc.make(WS_METHODS.ollamaQuitServer, {
  payload: Schema.Struct({}),
  success: Schema.Struct({ success: Schema.Boolean, message: Schema.optional(Schema.String) }),
});

// ── A2A RPCs ──────────────────────────────────────────────────────────────

export const WsA2aListAgentsRpc = Rpc.make(WS_METHODS.a2aListAgents, {
  payload: Schema.Struct({}),
  success: Schema.Array(A2aAgentCard),
  error: A2aServiceError,
});

export const WsA2aRegisterAgentRpc = Rpc.make(WS_METHODS.a2aRegisterAgent, {
  payload: A2aRegisterAgentInput,
  success: A2aAgentCard,
  error: Schema.Union([A2aServiceError, A2aClientError]),
});

export const WsA2aRemoveAgentRpc = Rpc.make(WS_METHODS.a2aRemoveAgent, {
  payload: A2aRemoveAgentInput,
  error: A2aServiceError,
});

export const WsA2aDiscoverAgentRpc = Rpc.make(WS_METHODS.a2aDiscoverAgent, {
  payload: Schema.Struct({ url: Schema.String }),
  success: A2aAgentCard,
  error: Schema.Union([A2aServiceError, A2aClientError]),
});

export const WsA2aSendMessageRpc = Rpc.make(WS_METHODS.a2aSendMessage, {
  payload: A2aMessageSendInput,
  success: A2aMessageSendResult,
  error: Schema.Union([A2aServiceError, A2aClientError]),
});

export const WsA2aGetTaskRpc = Rpc.make(WS_METHODS.a2aGetTask, {
  payload: A2aGetTaskInput,
  success: A2aTask,
  error: A2aServiceError,
});

export const WsA2aListTasksRpc = Rpc.make(WS_METHODS.a2aListTasks, {
  payload: Schema.Struct({}),
  success: Schema.Array(A2aTask),
  error: A2aServiceError,
});

export const WsA2aCancelTaskRpc = Rpc.make(WS_METHODS.a2aCancelTask, {
  payload: A2aCancelTaskInput,
  success: A2aTask,
  error: Schema.Union([A2aServiceError, A2aClientError]),
});

export const WsSubscribeA2aEventsRpc = Rpc.make(WS_METHODS.subscribeA2aEvents, {
  payload: Schema.Struct({}),
  success: A2aSseEvent,
  stream: true,
});

export const WsRpcGroup = RpcGroup.make(
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpsertKeybindingRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerTranscribeAudioRpc,
  WsPromptImproveRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsReadFileRpc,
  WsProjectsWriteFileRpc,
  WsShellOpenInEditorRpc,
  WsGitStatusRpc,
  WsGitPullRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsGitPrepareReviewContextRpc,
  WsGitGetWorkingDiffRpc,
  WsGitListBranchesRpc,
  WsGitCreateWorktreeRpc,
  WsGitRemoveWorktreeRpc,
  WsGitCreateBranchRpc,
  WsGitCheckoutRpc,
  WsGitInitRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsSubscribeOrchestrationDomainEventsRpc,
  WsSubscribeTerminalEventsRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeProviderRateLimitsRpc,
  WsOrchestrationGetSnapshotRpc,
  WsOrchestrationDispatchCommandRpc,
  WsOrchestrationGetTurnDiffRpc,
  WsOrchestrationGetFullThreadDiffRpc,
  WsOrchestrationReplayEventsRpc,
  WsSkillsListRpc,
  WsSkillsSaveRpc,
  WsSkillsDeleteRpc,
  WsSkillsGenerateRpc,
  WsPreviewDetectAppsRpc,
  WsPreviewStartRpc,
  WsPreviewStopRpc,
  WsPreviewGetSessionsRpc,
  WsPreviewUpdateAppRpc,
  WsSubscribePreviewEventsRpc,
  WsMcpListServersRpc,
  WsMcpAddServerRpc,
  WsMcpUpdateServerRpc,
  WsMcpDeleteServerRpc,
  WsPluginsListRpc,
  WsPluginsInstallRpc,
  WsPluginsRemoveRpc,
  WsOllamaPullModelRpc,
  WsOllamaQuitServerRpc,
  WsA2aListAgentsRpc,
  WsA2aRegisterAgentRpc,
  WsA2aRemoveAgentRpc,
  WsA2aDiscoverAgentRpc,
  WsA2aSendMessageRpc,
  WsA2aGetTaskRpc,
  WsA2aListTasksRpc,
  WsA2aCancelTaskRpc,
  WsSubscribeA2aEventsRpc,
);
