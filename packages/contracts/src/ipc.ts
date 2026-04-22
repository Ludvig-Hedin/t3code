import type {
  GitCheckoutInput,
  GitCreateBranchInput,
  GitGetWorkingDiffInput,
  GitGetWorkingDiffResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPrepareReviewContextInput,
  GitPrepareReviewContextResult,
  GitPullRequestRefInput,
  GitCreateWorktreeInput,
  GitCreateWorktreeResult,
  GitInitInput,
  GitListBranchesInput,
  GitListBranchesResult,
  GitPullInput,
  GitPullResult,
  GitRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitStatusInput,
  GitStatusResult,
} from "./git";
import type {
  ProjectListDirectoryInput,
  ProjectListDirectoryResult,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectSearchFileContentsInput,
  ProjectSearchFileContentsResult,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project";
import type {
  ServerConfig,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingResult,
} from "./server";
import type {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal";
import type { ServerUpsertKeybindingInput } from "./server";
import type {
  ClientOrchestrationCommand,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetFullThreadDiffResult,
  OrchestrationGetTurnDiffInput,
  OrchestrationGetTurnDiffResult,
  OrchestrationEvent,
  OrchestrationReadModel,
} from "./orchestration";
import { EditorId } from "./editor";
import { ServerSettings, ServerSettingsPatch } from "./settings";
import { ServerTranscribeAudioInput, ServerTranscribeAudioResult } from "./transcription";

export type ContextMenuIcon =
  | "archive"
  | "copy"
  | "delete"
  | "folder"
  | "mail"
  | "pencil"
  | "pin"
  | "search"
  | "settings"
  | "trash";

export interface ContextMenuItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ContextMenuIcon;
  destructive?: boolean;
  disabled?: boolean;
}

export type DesktopUpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export type DesktopRuntimeArch = "arm64" | "x64" | "other";
export type DesktopTheme = "light" | "dark" | "system";

export interface DesktopRuntimeInfo {
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
}

export interface DesktopUpdateState {
  enabled: boolean;
  status: DesktopUpdateStatus;
  currentVersion: string;
  hostArch: DesktopRuntimeArch;
  appArch: DesktopRuntimeArch;
  runningUnderArm64Translation: boolean;
  availableVersion: string | null;
  downloadedVersion: string | null;
  downloadPercent: number | null;
  checkedAt: string | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
  canRetry: boolean;
}

export interface DesktopUpdateActionResult {
  accepted: boolean;
  completed: boolean;
  state: DesktopUpdateState;
}

export interface DesktopMobileDevice {
  deviceId: string;
  deviceName: string;
  pairCode: string;
  pairCodeExpiresAt: string;
  pairedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface DesktopMobileDevicesResult {
  devices: DesktopMobileDevice[];
}

export type TunnelStatus =
  | { status: "idle" }
  | { status: "downloading"; progress: number }
  | { status: "authenticating" }
  | { status: "connecting" }
  | { status: "active"; url: string }
  | { status: "error"; message: string };

export interface RemoteSettings {
  remoteAccessEnabled: boolean;
  keepAwakeEnabled: boolean;
  tunnelName: string | null;
  tunnelUrl: string | null;
}

export interface DesktopUpdateCheckResult {
  checked: boolean;
  state: DesktopUpdateState;
}

export interface DesktopBridge {
  getWsUrl: () => string | null;
  getPairingUrl?: () => string | null;
  getPairingCode?: () => string | null;
  getDesktopAuthToken?: () => string | null;
  getMobileDevices?: () => DesktopMobileDevicesResult | null;
  revokeMobileDevice?: (input: { deviceId: string }) => Promise<DesktopMobileDevicesResult | null>;
  getRemoteSettings?: () => RemoteSettings | null;
  getTunnelStatus?: () => TunnelStatus;
  enableRemoteAccess?: () => Promise<{ ok: boolean; error?: string }>;
  disableRemoteAccess?: () => Promise<void>;
  setKeepAwake?: (enabled: boolean) => Promise<void>;
  onTunnelStatus?: (listener: (status: TunnelStatus) => void) => () => void;
  pickFolder: () => Promise<string | null>;
  confirm: (message: string) => Promise<boolean>;
  setTheme: (theme: DesktopTheme) => Promise<void>;
  showContextMenu: <T extends string>(
    items: readonly ContextMenuItem<T>[],
    position?: { x: number; y: number },
  ) => Promise<T | null>;
  openExternal: (url: string) => Promise<boolean>;
  openInFinder: (path: string) => Promise<boolean>;
  onMenuAction: (listener: (action: string) => void) => () => void;
  getUpdateState: () => Promise<DesktopUpdateState>;
  checkForUpdate: () => Promise<DesktopUpdateCheckResult>;
  downloadUpdate: () => Promise<DesktopUpdateActionResult>;
  installUpdate: () => Promise<DesktopUpdateActionResult>;
  onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
  /** Triggers the native OS save-file dialog to download a URL (bypasses renderer CORS). */
  downloadUrl?: (url: string) => Promise<void>;
  /** Fetches a URL via the main process (no CORS) and writes it to the system clipboard. */
  writeImageToClipboard?: (url: string) => Promise<{ ok: boolean; error?: string }>;
}

export interface NativeApi {
  dialogs: {
    pickFolder: () => Promise<string | null>;
    confirm: (message: string) => Promise<boolean>;
  };
  terminal: {
    open: (input: typeof TerminalOpenInput.Encoded) => Promise<TerminalSessionSnapshot>;
    write: (input: typeof TerminalWriteInput.Encoded) => Promise<void>;
    resize: (input: typeof TerminalResizeInput.Encoded) => Promise<void>;
    clear: (input: typeof TerminalClearInput.Encoded) => Promise<void>;
    restart: (input: typeof TerminalRestartInput.Encoded) => Promise<TerminalSessionSnapshot>;
    close: (input: typeof TerminalCloseInput.Encoded) => Promise<void>;
    onEvent: (callback: (event: TerminalEvent) => void) => () => void;
  };
  projects: {
    searchEntries: (input: ProjectSearchEntriesInput) => Promise<ProjectSearchEntriesResult>;
    // Shallow-list the children of a workspace-relative directory for the
    // Files panel tree. Respects gitignore and hidden-file rules the same way
    // as `searchEntries` so the tree never surfaces files the search index
    // already hides.
    listDirectory: (input: ProjectListDirectoryInput) => Promise<ProjectListDirectoryResult>;
    readFile: (input: ProjectReadFileInput) => Promise<ProjectReadFileResult | null>;
    writeFile: (input: ProjectWriteFileInput) => Promise<ProjectWriteFileResult>;
    // Full-text content search (ripgrep when available, JS grep fallback).
    searchFileContents: (
      input: ProjectSearchFileContentsInput,
    ) => Promise<ProjectSearchFileContentsResult>;
  };
  shell: {
    openInEditor: (cwd: string, editor: EditorId) => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    openInFinder: (path: string) => Promise<void>;
  };
  git: {
    // Existing branch/worktree API
    listBranches: (input: GitListBranchesInput) => Promise<GitListBranchesResult>;
    createWorktree: (input: GitCreateWorktreeInput) => Promise<GitCreateWorktreeResult>;
    removeWorktree: (input: GitRemoveWorktreeInput) => Promise<void>;
    createBranch: (input: GitCreateBranchInput) => Promise<void>;
    checkout: (input: GitCheckoutInput) => Promise<void>;
    init: (input: GitInitInput) => Promise<void>;
    resolvePullRequest: (input: GitPullRequestRefInput) => Promise<GitResolvePullRequestResult>;
    preparePullRequestThread: (
      input: GitPreparePullRequestThreadInput,
    ) => Promise<GitPreparePullRequestThreadResult>;
    prepareReviewContext: (
      input: GitPrepareReviewContextInput,
    ) => Promise<GitPrepareReviewContextResult>;
    /** Fetch the raw unified-diff patch for all working-tree changes (staged + unstaged vs HEAD). */
    getWorkingDiff: (input: GitGetWorkingDiffInput) => Promise<GitGetWorkingDiffResult>;
    // Stacked action API
    pull: (input: GitPullInput) => Promise<GitPullResult>;
    status: (input: GitStatusInput) => Promise<GitStatusResult>;
  };
  contextMenu: {
    show: <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>;
  };
  server: {
    getConfig: () => Promise<ServerConfig>;
    refreshProviders: () => Promise<ServerProviderUpdatedPayload>;
    upsertKeybinding: (input: ServerUpsertKeybindingInput) => Promise<ServerUpsertKeybindingResult>;
    getSettings: () => Promise<ServerSettings>;
    updateSettings: (patch: ServerSettingsPatch) => Promise<ServerSettings>;
    transcribeAudio: (input: ServerTranscribeAudioInput) => Promise<ServerTranscribeAudioResult>;
  };
  orchestration: {
    getSnapshot: () => Promise<OrchestrationReadModel>;
    dispatchCommand: (command: ClientOrchestrationCommand) => Promise<{ sequence: number }>;
    getTurnDiff: (input: OrchestrationGetTurnDiffInput) => Promise<OrchestrationGetTurnDiffResult>;
    getFullThreadDiff: (
      input: OrchestrationGetFullThreadDiffInput,
    ) => Promise<OrchestrationGetFullThreadDiffResult>;
    replayEvents: (fromSequenceExclusive: number) => Promise<OrchestrationEvent[]>;
    onDomainEvent: (callback: (event: OrchestrationEvent) => void) => () => void;
  };
}
