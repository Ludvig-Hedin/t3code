import {
  type A2aAgentCard,
  type A2aAgentCardId,
  type A2aCancelTaskInput,
  type A2aGetTaskInput,
  type A2aMessageSendInput,
  type A2aMessageSendResult,
  type A2aRegisterAgentInput,
  type A2aRemoveAgentInput,
  type A2aTask,
  type GitActionProgressEvent,
  type GitRunStackedActionInput,
  type GitRunStackedActionResult,
  type McpServer,
  type McpServerInput,
  type NativeApi,
  ORCHESTRATION_WS_METHODS,
  type PluginInfo,
  type PreviewApp,
  type PreviewEvent,
  type PreviewSession,
  type PromptImprovementResult,
  type ProjectId,
  type ProviderKind,
  type ServerSettingsPatch,
  type ServerTranscribeAudioInput,
  type ServerTranscribeAudioResult,
  WS_METHODS,
} from "@t3tools/contracts";
import { Effect, Stream } from "effect";

import { type WsRpcProtocolClient } from "./rpc/protocol";
import { WsTransport } from "./wsTransport";

type RpcTag = keyof WsRpcProtocolClient & string;
type RpcMethod<TTag extends RpcTag> = WsRpcProtocolClient[TTag];
type RpcInput<TTag extends RpcTag> = Parameters<RpcMethod<TTag>>[0];

type RpcUnaryMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<infer TSuccess, any, any>
    ? (input: RpcInput<TTag>) => Promise<TSuccess>
    : never;

type RpcUnaryNoArgMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<infer TSuccess, any, any>
    ? () => Promise<TSuccess>
    : never;

type RpcStreamMethod<TTag extends RpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Stream.Stream<infer TEvent, any, any>
    ? (listener: (event: TEvent) => void) => () => void
    : never;

interface GitRunStackedActionOptions {
  readonly onProgress?: (event: GitActionProgressEvent) => void;
}

export interface WsRpcClient {
  readonly dispose: () => Promise<void>;
  readonly terminal: {
    readonly open: RpcUnaryMethod<typeof WS_METHODS.terminalOpen>;
    readonly write: RpcUnaryMethod<typeof WS_METHODS.terminalWrite>;
    readonly resize: RpcUnaryMethod<typeof WS_METHODS.terminalResize>;
    readonly clear: RpcUnaryMethod<typeof WS_METHODS.terminalClear>;
    readonly restart: RpcUnaryMethod<typeof WS_METHODS.terminalRestart>;
    readonly close: RpcUnaryMethod<typeof WS_METHODS.terminalClose>;
    readonly onEvent: RpcStreamMethod<typeof WS_METHODS.subscribeTerminalEvents>;
  };
  readonly projects: {
    readonly searchEntries: RpcUnaryMethod<typeof WS_METHODS.projectsSearchEntries>;
    readonly readFile: RpcUnaryMethod<typeof WS_METHODS.projectsReadFile>;
    readonly writeFile: RpcUnaryMethod<typeof WS_METHODS.projectsWriteFile>;
  };
  readonly shell: {
    readonly openInEditor: (input: {
      readonly cwd: Parameters<NativeApi["shell"]["openInEditor"]>[0];
      readonly editor: Parameters<NativeApi["shell"]["openInEditor"]>[1];
    }) => ReturnType<NativeApi["shell"]["openInEditor"]>;
  };
  readonly git: {
    readonly pull: RpcUnaryMethod<typeof WS_METHODS.gitPull>;
    readonly status: RpcUnaryMethod<typeof WS_METHODS.gitStatus>;
    readonly runStackedAction: (
      input: GitRunStackedActionInput,
      options?: GitRunStackedActionOptions,
    ) => Promise<GitRunStackedActionResult>;
    readonly listBranches: RpcUnaryMethod<typeof WS_METHODS.gitListBranches>;
    readonly createWorktree: RpcUnaryMethod<typeof WS_METHODS.gitCreateWorktree>;
    readonly removeWorktree: RpcUnaryMethod<typeof WS_METHODS.gitRemoveWorktree>;
    readonly createBranch: RpcUnaryMethod<typeof WS_METHODS.gitCreateBranch>;
    readonly checkout: RpcUnaryMethod<typeof WS_METHODS.gitCheckout>;
    readonly init: RpcUnaryMethod<typeof WS_METHODS.gitInit>;
    readonly resolvePullRequest: RpcUnaryMethod<typeof WS_METHODS.gitResolvePullRequest>;
    readonly preparePullRequestThread: RpcUnaryMethod<
      typeof WS_METHODS.gitPreparePullRequestThread
    >;
    readonly prepareReviewContext: RpcUnaryMethod<typeof WS_METHODS.gitPrepareReviewContext>;
    readonly getWorkingDiff: RpcUnaryMethod<typeof WS_METHODS.gitGetWorkingDiff>;
  };
  readonly server: {
    readonly getConfig: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetConfig>;
    readonly refreshProviders: RpcUnaryNoArgMethod<typeof WS_METHODS.serverRefreshProviders>;
    readonly upsertKeybinding: RpcUnaryMethod<typeof WS_METHODS.serverUpsertKeybinding>;
    readonly getSettings: RpcUnaryNoArgMethod<typeof WS_METHODS.serverGetSettings>;
    readonly updateSettings: (
      patch: ServerSettingsPatch,
    ) => ReturnType<RpcUnaryMethod<typeof WS_METHODS.serverUpdateSettings>>;
    readonly transcribeAudio: (
      input: ServerTranscribeAudioInput,
    ) => Promise<ServerTranscribeAudioResult>;
    readonly subscribeConfig: RpcStreamMethod<typeof WS_METHODS.subscribeServerConfig>;
    readonly subscribeLifecycle: RpcStreamMethod<typeof WS_METHODS.subscribeServerLifecycle>;
  };
  readonly prompts: {
    readonly improve: RpcUnaryMethod<typeof WS_METHODS.promptsImprove>;
  };
  readonly orchestration: {
    readonly getSnapshot: RpcUnaryNoArgMethod<typeof ORCHESTRATION_WS_METHODS.getSnapshot>;
    readonly dispatchCommand: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.dispatchCommand>;
    readonly getTurnDiff: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.getTurnDiff>;
    readonly getFullThreadDiff: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.getFullThreadDiff>;
    readonly replayEvents: RpcUnaryMethod<typeof ORCHESTRATION_WS_METHODS.replayEvents>;
    readonly onDomainEvent: RpcStreamMethod<typeof WS_METHODS.subscribeOrchestrationDomainEvents>;
  };
  readonly provider: {
    // Streams per-provider rate limit entries. Emits cached snapshot on
    // subscribe, then delivers live updates as providers report new limits.
    readonly onRateLimitUpdate: RpcStreamMethod<typeof WS_METHODS.subscribeProviderRateLimits>;
  };
  readonly skills: {
    readonly list: RpcUnaryNoArgMethod<typeof WS_METHODS.skillsList>;
    readonly save: RpcUnaryMethod<typeof WS_METHODS.skillsSave>;
    readonly delete: RpcUnaryMethod<typeof WS_METHODS.skillsDelete>;
    readonly generate: RpcUnaryMethod<typeof WS_METHODS.skillsGenerate>;
  };
  readonly mcp: {
    readonly listServers: (input: { provider: ProviderKind }) => Promise<readonly McpServer[]>;
    readonly addServer: (input: {
      provider: ProviderKind;
      name: string;
      server: McpServerInput;
    }) => Promise<McpServer>;
    readonly updateServer: (input: {
      provider: ProviderKind;
      name: string;
      patch: McpServerInput;
    }) => Promise<McpServer>;
    readonly deleteServer: (input: { provider: ProviderKind; name: string }) => Promise<void>;
  };
  readonly plugins: {
    readonly list: () => Promise<readonly PluginInfo[]>;
    readonly install: (input: { source: string }) => Promise<PluginInfo>;
    readonly remove: (input: { location: string }) => Promise<void>;
  };
  readonly ollama: {
    readonly pullModel: RpcUnaryMethod<typeof WS_METHODS.ollamaPullModel>;
    readonly quitServer: RpcUnaryNoArgMethod<typeof WS_METHODS.ollamaQuitServer>;
  };
  readonly preview: {
    readonly detectApps: (input: { projectId: ProjectId }) => Promise<PreviewApp[]>;
    readonly start: (input: { projectId: ProjectId; appId: string }) => Promise<PreviewSession>;
    readonly stop: (input: { projectId: ProjectId; appId: string }) => Promise<void>;
    readonly getSessions: (input: { projectId: ProjectId }) => Promise<PreviewSession[]>;
    readonly updateApp: (input: {
      projectId: ProjectId;
      appId: string;
      patch: { label?: string; command?: string; cwd?: string; type?: "browser" | "logs" };
    }) => Promise<PreviewApp>;
    readonly onEvent: (projectId: ProjectId, listener: (event: PreviewEvent) => void) => () => void;
  };
  readonly a2a: {
    readonly listAgents: () => Promise<readonly A2aAgentCard[]>;
    readonly registerAgent: (input: A2aRegisterAgentInput) => Promise<A2aAgentCard>;
    readonly removeAgent: (input: A2aRemoveAgentInput) => Promise<void>;
    readonly discoverAgent: (input: { url: string }) => Promise<A2aAgentCard>;
    readonly sendMessage: (input: A2aMessageSendInput) => Promise<A2aMessageSendResult>;
    readonly getTask: (input: A2aGetTaskInput) => Promise<A2aTask>;
    readonly listTasks: () => Promise<readonly A2aTask[]>;
    readonly cancelTask: (input: A2aCancelTaskInput) => Promise<A2aTask>;
  };
}

let sharedWsRpcClient: WsRpcClient | null = null;

export function getWsRpcClient(): WsRpcClient {
  if (sharedWsRpcClient) {
    return sharedWsRpcClient;
  }
  sharedWsRpcClient = createWsRpcClient();
  return sharedWsRpcClient;
}

export async function __resetWsRpcClientForTests() {
  await sharedWsRpcClient?.dispose();
  sharedWsRpcClient = null;
}

export function createWsRpcClient(transport = new WsTransport()): WsRpcClient {
  return {
    dispose: () => transport.dispose(),
    terminal: {
      open: (input) => transport.request((client) => client[WS_METHODS.terminalOpen](input)),
      write: (input) => transport.request((client) => client[WS_METHODS.terminalWrite](input)),
      resize: (input) => transport.request((client) => client[WS_METHODS.terminalResize](input)),
      clear: (input) => transport.request((client) => client[WS_METHODS.terminalClear](input)),
      restart: (input) => transport.request((client) => client[WS_METHODS.terminalRestart](input)),
      close: (input) => transport.request((client) => client[WS_METHODS.terminalClose](input)),
      onEvent: (listener) =>
        transport.subscribe((client) => client[WS_METHODS.subscribeTerminalEvents]({}), listener),
    },
    projects: {
      searchEntries: (input) =>
        transport.request((client) => client[WS_METHODS.projectsSearchEntries](input)),
      readFile: (input) =>
        transport.request((client) => client[WS_METHODS.projectsReadFile](input)),
      writeFile: (input) =>
        transport.request((client) => client[WS_METHODS.projectsWriteFile](input)),
    },
    shell: {
      openInEditor: (input) =>
        transport.request((client) => client[WS_METHODS.shellOpenInEditor](input)),
    },
    git: {
      pull: (input) => transport.request((client) => client[WS_METHODS.gitPull](input)),
      status: (input) => transport.request((client) => client[WS_METHODS.gitStatus](input)),
      runStackedAction: async (input, options) => {
        let result: GitRunStackedActionResult | null = null;

        await transport.requestStream(
          (client) => client[WS_METHODS.gitRunStackedAction](input),
          (event) => {
            options?.onProgress?.(event);
            if (event.kind === "action_finished") {
              result = event.result;
            }
          },
        );

        if (result) {
          return result;
        }

        throw new Error("Git action stream completed without a final result.");
      },
      listBranches: (input) =>
        transport.request((client) => client[WS_METHODS.gitListBranches](input)),
      createWorktree: (input) =>
        transport.request((client) => client[WS_METHODS.gitCreateWorktree](input)),
      removeWorktree: (input) =>
        transport.request((client) => client[WS_METHODS.gitRemoveWorktree](input)),
      createBranch: (input) =>
        transport.request((client) => client[WS_METHODS.gitCreateBranch](input)),
      checkout: (input) => transport.request((client) => client[WS_METHODS.gitCheckout](input)),
      init: (input) => transport.request((client) => client[WS_METHODS.gitInit](input)),
      resolvePullRequest: (input) =>
        transport.request((client) => client[WS_METHODS.gitResolvePullRequest](input)),
      preparePullRequestThread: (input) =>
        transport.request((client) => client[WS_METHODS.gitPreparePullRequestThread](input)),
      prepareReviewContext: (input) =>
        transport.request((client) => client[WS_METHODS.gitPrepareReviewContext](input)),
      getWorkingDiff: (input) =>
        transport.request((client) => client[WS_METHODS.gitGetWorkingDiff](input)),
    },
    server: {
      getConfig: () => transport.request((client) => client[WS_METHODS.serverGetConfig]({})),
      refreshProviders: () =>
        transport.request((client) => client[WS_METHODS.serverRefreshProviders]({})),
      upsertKeybinding: (input) =>
        transport.request((client) => client[WS_METHODS.serverUpsertKeybinding](input)),
      getSettings: () => transport.request((client) => client[WS_METHODS.serverGetSettings]({})),
      updateSettings: (patch) =>
        transport.request((client) => client[WS_METHODS.serverUpdateSettings]({ patch })),
      transcribeAudio: (input) =>
        transport.request((client) => client[WS_METHODS.serverTranscribeAudio](input)),
      subscribeConfig: (listener) =>
        transport.subscribe((client) => client[WS_METHODS.subscribeServerConfig]({}), listener),
      subscribeLifecycle: (listener) =>
        transport.subscribe((client) => client[WS_METHODS.subscribeServerLifecycle]({}), listener),
    },
    prompts: {
      improve: (input): Promise<PromptImprovementResult> =>
        transport.request((client) => client[WS_METHODS.promptsImprove](input)),
    },
    orchestration: {
      getSnapshot: () =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.getSnapshot]({})),
      dispatchCommand: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.dispatchCommand](input)),
      getTurnDiff: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.getTurnDiff](input)),
      getFullThreadDiff: (input) =>
        transport.request((client) => client[ORCHESTRATION_WS_METHODS.getFullThreadDiff](input)),
      replayEvents: (input) =>
        transport
          .request((client) => client[ORCHESTRATION_WS_METHODS.replayEvents](input))
          .then((events) => [...events]),
      onDomainEvent: (listener) =>
        transport.subscribe(
          (client) => client[WS_METHODS.subscribeOrchestrationDomainEvents]({}),
          listener,
        ),
    },
    provider: {
      onRateLimitUpdate: (listener) =>
        transport.subscribe(
          (client) => client[WS_METHODS.subscribeProviderRateLimits]({}),
          listener,
        ),
    },
    skills: {
      list: () => transport.request((client) => client[WS_METHODS.skillsList]({})),
      save: (input) => transport.request((client) => client[WS_METHODS.skillsSave](input)),
      delete: (input) => transport.request((client) => client[WS_METHODS.skillsDelete](input)),
      generate: (input) => transport.request((client) => client[WS_METHODS.skillsGenerate](input)),
    },
    mcp: {
      listServers: (input) =>
        transport
          .request((client) => client[WS_METHODS.mcpListServers](input))
          .then((servers) => [...servers]),
      addServer: (input) =>
        transport.request((client) =>
          client[WS_METHODS.mcpAddServer]({
            provider: input.provider,
            name: input.name,
            server: input.server,
          }),
        ),
      updateServer: (input) =>
        transport.request((client) =>
          client[WS_METHODS.mcpUpdateServer]({
            provider: input.provider,
            name: input.name,
            patch: input.patch,
          }),
        ),
      deleteServer: (input) =>
        transport.request((client) => client[WS_METHODS.mcpDeleteServer](input)),
    },
    plugins: {
      list: () =>
        transport
          .request((client) => client[WS_METHODS.pluginsList]({}))
          .then((plugins) => [...plugins]),
      install: (input) => transport.request((client) => client[WS_METHODS.pluginsInstall](input)),
      remove: (input) => transport.request((client) => client[WS_METHODS.pluginsRemove](input)),
    },
    ollama: {
      pullModel: (input) =>
        transport.request((client) => client[WS_METHODS.ollamaPullModel](input)),
      quitServer: () => transport.request((client) => client[WS_METHODS.ollamaQuitServer]({})),
    },
    preview: {
      // Spread readonly arrays to satisfy mutable PreviewApp[] / PreviewSession[] return types
      detectApps: (input) =>
        transport
          .request((client) => client[WS_METHODS.previewDetectApps](input))
          .then((apps) => [...apps]),
      start: (input) => transport.request((client) => client[WS_METHODS.previewStart](input)),
      stop: (input) => transport.request((client) => client[WS_METHODS.previewStop](input)),
      getSessions: (input) =>
        transport
          .request((client) => client[WS_METHODS.previewGetSessions](input))
          .then((sessions) => [...sessions]),
      updateApp: (input) =>
        transport.request((client) => client[WS_METHODS.previewUpdateApp](input)),
      onEvent: (projectId, listener) =>
        transport.subscribe(
          (client) => client[WS_METHODS.subscribePreviewEvents]({ projectId }),
          listener,
        ),
    },
    a2a: {
      listAgents: () =>
        transport
          .request((client) => client[WS_METHODS.a2aListAgents]({}))
          .then((agents) => [...agents]),
      registerAgent: (input) =>
        transport.request((client) => client[WS_METHODS.a2aRegisterAgent](input)),
      removeAgent: (input) =>
        transport.request((client) => client[WS_METHODS.a2aRemoveAgent](input)),
      discoverAgent: (input) =>
        transport.request((client) => client[WS_METHODS.a2aDiscoverAgent](input)),
      sendMessage: (input) =>
        transport.request((client) => client[WS_METHODS.a2aSendMessage](input)),
      getTask: (input) => transport.request((client) => client[WS_METHODS.a2aGetTask](input)),
      listTasks: () =>
        transport
          .request((client) => client[WS_METHODS.a2aListTasks]({}))
          .then((tasks) => [...tasks]),
      cancelTask: (input) => transport.request((client) => client[WS_METHODS.a2aCancelTask](input)),
    },
  };
}
