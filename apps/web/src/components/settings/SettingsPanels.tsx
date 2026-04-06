import {
  ArchiveIcon,
  ArchiveX,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  LoaderIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SaveIcon,
  SunIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type CodeReviewFixMode,
  EDITORS,
  PROVIDER_DISPLAY_NAMES,
  type ProviderKind,
  type ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { normalizeModelSlug } from "@t3tools/shared/model";
import { Equal } from "effect";
import { APP_BASE_NAME, APP_VERSION } from "../../branding";
import {
  canCheckForUpdate,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
} from "../../components/desktopUpdate.logic";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { getWsRpcClient } from "../../wsRpcClient";
import { resolveAndPersistPreferredEditor, usePreferredEditor } from "../../editorPreferences";
import { EDITOR_ICONS } from "../../editorIcons";
import { AutoIcon, ClaudeAI, Gemini, OpenAI, OpenCodeIcon, OllamaIcon } from "../Icons";
import {
  THEME_PRESETS,
  UI_FONT_OPTIONS,
  CODE_FONT_OPTIONS,
  type ThemePreset,
} from "../../hooks/useThemeCustomization";
import { isElectron } from "../../env";
import { useTheme } from "../../hooks/useTheme";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { useThreadActions } from "../../hooks/useThreadActions";
import {
  setDesktopUpdateStateQueryData,
  useDesktopUpdateState,
} from "../../lib/desktopUpdateReactQuery";
import {
  getCustomModelOptionsByProvider,
  resolveAppModelSelectionState,
} from "../../modelSelection";
import { ensureNativeApi, readNativeApi } from "../../nativeApi";
import { useStore } from "../../store";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import {
  SettingsPageContainer,
  SettingsRow as SettingsLayoutRow,
  SettingsSection,
} from "./SettingsLayout";
import { UsageStatsSection } from "./UsageStatsSection";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { ColorPickerField } from "../ui/color-picker";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProjectFavicon } from "../ProjectFavicon";
import { ImportChatsFlow } from "../onboarding/ImportChatsFlow";
import {
  useServerAvailableEditors,
  useServerKeybindingsConfigPath,
  useServerObservability,
  useServerProviders,
} from "../../rpc/serverState";

const THEME_OPTIONS = [
  { value: "system", label: "System", icon: MonitorIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
] as const;

// Provider icon map — same order as chat model picker
const PROVIDER_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
  manifest: AutoIcon,
};

const TIMESTAMP_FORMAT_LABELS = {
  // "locale" uses Intl.DateTimeFormat(undefined) — inherits the browser's locale,
  // timezone, and 12/24h preference automatically (e.g. 24h for Sweden, 12h for US)
  locale: "Auto (locale)",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
} as const;

type InstallProviderSettings = {
  provider: ProviderKind;
  title: string;
  binaryPlaceholder: string;
  binaryDescription: ReactNode;
  homePathKey?: "codexHomePath";
  homePlaceholder?: string;
  homeDescription?: ReactNode;
};

const PROVIDER_SETTINGS: readonly InstallProviderSettings[] = [
  {
    provider: "codex",
    title: "Codex",
    binaryPlaceholder: "Codex binary path",
    binaryDescription: "Path to the Codex binary",
    homePathKey: "codexHomePath",
    homePlaceholder: "CODEX_HOME",
    homeDescription: "Optional custom Codex home and config directory.",
  },
  {
    provider: "claudeAgent",
    title: "Claude",
    binaryPlaceholder: "Claude binary path",
    binaryDescription: "Path to the Claude binary",
  },
  {
    provider: "gemini",
    title: "Gemini",
    binaryPlaceholder: "Gemini binary path",
    binaryDescription: "Path to the Gemini CLI binary",
  },
] as const;

const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-amber-400",
  },
  error: {
    dot: "bg-destructive",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

function getProviderSummary(provider: ServerProvider | undefined) {
  if (!provider) {
    return {
      headline: "Checking provider status",
      detail: "Waiting for the server to report installation and authentication details.",
    };
  }
  if (!provider.enabled) {
    return {
      headline: "Disabled",
      detail:
        provider.message ??
        `This provider is installed but disabled for new sessions in ${APP_BASE_NAME}.`,
    };
  }
  if (!provider.installed) {
    return {
      headline: "Not found",
      detail: provider.message ?? "CLI not detected on PATH.",
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel ? `Authenticated · ${authLabel}` : "Authenticated",
      detail: provider.message ?? null,
    };
  }
  if (provider.auth.status === "unauthenticated") {
    return {
      headline: "Not authenticated",
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: "Needs attention",
      detail:
        provider.message ?? "The provider is installed, but the server could not fully verify it.",
    };
  }
  if (provider.status === "error") {
    return {
      headline: "Unavailable",
      detail: provider.message ?? "The provider failed its startup checks.",
    };
  }
  return {
    headline: "Available",
    detail: provider.message ?? "Installed and ready, but authentication could not be verified.",
  };
}

function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  return version.startsWith("v") ? version : `v${version}`;
}

// SettingsSection and SettingsPageContainer are imported from ./SettingsLayout above.

function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
}: {
  title: ReactNode;
  description: string;
  status?: ReactNode;
  resetAction?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-t border-border px-4 py-4 first:border-t-0 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {resetAction}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
          {status ? <div className="pt-1 text-[11px] text-muted-foreground">{status}</div> : null}
        </div>
        {control ? (
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SettingResetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Reset ${label} to default`}
            className="size-5 rounded-sm p-0 text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
          </Button>
        }
      />
      <TooltipPopup side="top">Reset to default</TooltipPopup>
    </Tooltip>
  );
}

function AboutVersionTitle() {
  return (
    <span className="inline-flex items-center gap-2">
      <span>Version</span>
      <code className="text-[11px] font-medium text-muted-foreground">{APP_VERSION}</code>
    </span>
  );
}

function AboutVersionSection() {
  const queryClient = useQueryClient();
  const updateStateQuery = useDesktopUpdateState();

  const updateState = updateStateQuery.data ?? null;

  const handleButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge) return;

    const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";

    if (action === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          setDesktopUpdateStateQueryData(queryClient, result.state);
        })
        .catch((error: unknown) => {
          toastManager.add({
            type: "error",
            title: "Could not download update",
            description: error instanceof Error ? error.message : "Download failed.",
          });
        });
      return;
    }

    if (action === "install") {
      const confirmed = window.confirm(
        getDesktopUpdateInstallConfirmationMessage(
          updateState ?? { availableVersion: null, downloadedVersion: null },
        ),
      );
      if (!confirmed) return;
      void bridge
        .installUpdate()
        .then((result) => {
          setDesktopUpdateStateQueryData(queryClient, result.state);
        })
        .catch((error: unknown) => {
          toastManager.add({
            type: "error",
            title: "Could not install update",
            description: error instanceof Error ? error.message : "Install failed.",
          });
        });
      return;
    }

    if (typeof bridge.checkForUpdate !== "function") return;
    void bridge
      .checkForUpdate()
      .then((result) => {
        setDesktopUpdateStateQueryData(queryClient, result.state);
        if (!result.checked) {
          toastManager.add({
            type: "error",
            title: "Could not check for updates",
            description:
              result.state.message ?? "Automatic updates are not available in this build.",
          });
        }
      })
      .catch((error: unknown) => {
        toastManager.add({
          type: "error",
          title: "Could not check for updates",
          description: error instanceof Error ? error.message : "Update check failed.",
        });
      });
  }, [queryClient, updateState]);

  const action = updateState ? resolveDesktopUpdateButtonAction(updateState) : "none";
  const buttonTooltip = updateState ? getDesktopUpdateButtonTooltip(updateState) : null;
  const buttonDisabled =
    action === "none"
      ? !canCheckForUpdate(updateState)
      : isDesktopUpdateButtonDisabled(updateState);

  const actionLabel: Record<string, string> = { download: "Download", install: "Install" };
  const statusLabel: Record<string, string> = {
    checking: "Checking…",
    downloading: "Downloading…",
    "up-to-date": "Up to Date",
  };
  const buttonLabel =
    actionLabel[action] ?? statusLabel[updateState?.status ?? ""] ?? "Check for Updates";
  const description =
    action === "download" || action === "install"
      ? "Update available."
      : "Current version of the application.";

  return (
    <SettingsRow
      title={<AboutVersionTitle />}
      description={description}
      control={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant={action === "install" ? "default" : "outline"}
                disabled={buttonDisabled}
                onClick={handleButtonClick}
              >
                {buttonLabel}
              </Button>
            }
          />
          {buttonTooltip ? <TooltipPopup>{buttonTooltip}</TooltipPopup> : null}
        </Tooltip>
      }
    />
  );
}

export function useSettingsRestore(onRestored?: () => void) {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const { resetSettings } = useUpdateSettings();

  const isGitWritingModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const areProviderSettingsDirty = PROVIDER_SETTINGS.some((providerSettings) => {
    const currentSettings = settings.providers[providerSettings.provider];
    const defaultSettings = DEFAULT_UNIFIED_SETTINGS.providers[providerSettings.provider];
    return !Equal.equals(currentSettings, defaultSettings);
  });

  const changedSettingLabels = useMemo(
    () => [
      ...(theme !== "system" ? ["Theme"] : []),
      ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat
        ? ["Time format"]
        : []),
      ...(settings.diffWordWrap !== DEFAULT_UNIFIED_SETTINGS.diffWordWrap
        ? ["Diff line wrapping"]
        : []),
      ...(settings.enableAssistantStreaming !== DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming
        ? ["Assistant output"]
        : []),
      ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
        ? ["New thread mode"]
        : []),
      ...(settings.enterKeyBehavior !== DEFAULT_UNIFIED_SETTINGS.enterKeyBehavior
        ? ["Enter key behavior"]
        : []),
      ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
        ? ["Archive confirmation"]
        : []),
      ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
        ? ["Delete confirmation"]
        : []),
      ...(settings.defaultProvider !== DEFAULT_UNIFIED_SETTINGS.defaultProvider
        ? ["Default provider"]
        : []),
      ...(isGitWritingModelDirty ? ["Git writing model"] : []),
      ...(areProviderSettingsDirty ? ["Providers"] : []),
    ],
    [
      areProviderSettingsDirty,
      isGitWritingModelDirty,
      settings.confirmThreadArchive,
      settings.confirmThreadDelete,
      settings.defaultProvider,
      settings.defaultThreadEnvMode,
      settings.diffWordWrap,
      settings.enableAssistantStreaming,
      settings.enterKeyBehavior,
      settings.timestampFormat,
      theme,
    ],
  );

  const restoreDefaults = useCallback(async () => {
    if (changedSettingLabels.length === 0) return;
    const api = readNativeApi();
    const confirmed = await (api ?? ensureNativeApi()).dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
    );
    if (!confirmed) return;

    setTheme("system");
    resetSettings();
    onRestored?.();
  }, [changedSettingLabels, onRestored, resetSettings, setTheme]);

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

export function GeneralSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const [openingPathByTarget, setOpeningPathByTarget] = useState({
    keybindings: false,
    logsDirectory: false,
  });
  const [openPathErrorByTarget, setOpenPathErrorByTarget] = useState<
    Partial<Record<"keybindings" | "logsDirectory", string | null>>
  >({});

  const keybindingsConfigPath = useServerKeybindingsConfigPath();
  const availableEditors = useServerAvailableEditors();
  const observability = useServerObservability();
  const serverProviders = useServerProviders();
  const logsDirectoryPath = observability?.logsDirectoryPath ?? null;
  const diagnosticsDescription = (() => {
    const exports: string[] = [];
    if (observability?.otlpTracesEnabled && observability.otlpTracesUrl) {
      exports.push(`traces to ${observability.otlpTracesUrl}`);
    }
    if (observability?.otlpMetricsEnabled && observability.otlpMetricsUrl) {
      exports.push(`metrics to ${observability.otlpMetricsUrl}`);
    }
    const mode = observability?.localTracingEnabled ? "Local trace file" : "Terminal logs only";
    return exports.length > 0 ? `${mode}. OTLP exporting ${exports.join(" and ")}.` : `${mode}.`;
  })();

  // Editor picker for "Default open destination"
  // (also used by openInPreferredEditor below for keybindings/logs)
  const [effectiveEditor, setLastEditor] = usePreferredEditor(availableEditors ?? []);

  const openInPreferredEditor = useCallback(
    (target: "keybindings" | "logsDirectory", path: string | null, failureMessage: string) => {
      if (!path) return;
      setOpenPathErrorByTarget((existing) => ({ ...existing, [target]: null }));
      setOpeningPathByTarget((existing) => ({ ...existing, [target]: true }));

      const editor = resolveAndPersistPreferredEditor(availableEditors ?? []);
      if (!editor) {
        setOpenPathErrorByTarget((existing) => ({
          ...existing,
          [target]: "No available editors found.",
        }));
        setOpeningPathByTarget((existing) => ({ ...existing, [target]: false }));
        return;
      }

      void ensureNativeApi()
        .shell.openInEditor(path, editor)
        .catch((error) => {
          setOpenPathErrorByTarget((existing) => ({
            ...existing,
            [target]: error instanceof Error ? error.message : failureMessage,
          }));
        })
        .finally(() => {
          setOpeningPathByTarget((existing) => ({ ...existing, [target]: false }));
        });
    },
    [availableEditors],
  );

  const openKeybindingsFile = useCallback(() => {
    openInPreferredEditor("keybindings", keybindingsConfigPath, "Unable to open keybindings file.");
  }, [keybindingsConfigPath, openInPreferredEditor]);

  const openLogsDirectory = useCallback(() => {
    openInPreferredEditor("logsDirectory", logsDirectoryPath, "Unable to open logs folder.");
  }, [logsDirectoryPath, openInPreferredEditor]);

  const openKeybindingsError = openPathErrorByTarget.keybindings ?? null;
  const openDiagnosticsError = openPathErrorByTarget.logsDirectory ?? null;
  const isOpeningKeybindings = openingPathByTarget.keybindings;
  const isOpeningLogsDirectory = openingPathByTarget.logsDirectory;

  return (
    <SettingsPageContainer>
      {/* Defaults — most-visited, pinned at top */}
      <SettingsSection title="Defaults">
        <SettingsRow
          title="Default open destination"
          description="Where files and folders open by default when you click to open in an editor."
          control={
            <Select
              value={effectiveEditor ?? ""}
              onValueChange={(value) => {
                const valid = EDITORS.find((e) => e.id === value);
                if (valid) setLastEditor(valid.id);
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Default editor">
                <SelectValue>
                  {/* Show the editor logo alongside the label, matching the header picker */}
                  {(() => {
                    const def = EDITORS.find((e) => e.id === effectiveEditor);
                    const EditorIcon = effectiveEditor ? EDITOR_ICONS[effectiveEditor] : undefined;
                    return (
                      <span className="flex items-center gap-1.5">
                        {EditorIcon && (
                          <EditorIcon className="size-3.5 shrink-0" aria-hidden="true" />
                        )}
                        {def?.label ?? "Auto-detect"}
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {(availableEditors ?? []).map((editorId) => {
                  const def = EDITORS.find((e) => e.id === editorId);
                  const EditorIcon = EDITOR_ICONS[editorId];
                  return def ? (
                    <SelectItem hideIndicator key={editorId} value={editorId}>
                      {/* Mirror the icon+label layout from the header picker dropdown */}
                      <span className="flex items-center gap-2">
                        {EditorIcon && (
                          <EditorIcon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        {def.label}
                      </span>
                    </SelectItem>
                  ) : null;
                })}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Default provider"
          description="Provider used automatically when starting a new chat."
          resetAction={
            settings.defaultProvider !== DEFAULT_UNIFIED_SETTINGS.defaultProvider ? (
              <SettingResetButton
                label="default provider"
                onClick={() =>
                  updateSettings({ defaultProvider: DEFAULT_UNIFIED_SETTINGS.defaultProvider })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.defaultProvider}
              onValueChange={(value) => {
                if (
                  value === "use-latest" ||
                  value === "codex" ||
                  value === "claudeAgent" ||
                  value === "gemini"
                ) {
                  updateSettings({ defaultProvider: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="Default provider">
                <SelectValue>
                  {(() => {
                    if (settings.defaultProvider === "use-latest") {
                      return <span className="text-muted-foreground">Last used</span>;
                    }
                    const Icon = PROVIDER_ICON_MAP[settings.defaultProvider];
                    const label =
                      PROVIDER_DISPLAY_NAMES[settings.defaultProvider as ProviderKind] ??
                      settings.defaultProvider;
                    return (
                      <span className="flex items-center gap-1.5">
                        {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
                        {label}
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="use-latest">
                  Last used
                </SelectItem>
                {/* Show providers in same order as chat picker */}
                {(["codex", "claudeAgent", "gemini", "opencode", "ollama"] as ProviderKind[])
                  .filter((kind) => serverProviders.some((p) => p.provider === kind))
                  .map((kind) => {
                    const Icon = PROVIDER_ICON_MAP[kind];
                    return (
                      <SelectItem hideIndicator key={kind} value={kind}>
                        <span className="flex items-center gap-2">
                          {Icon ? (
                            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                          {PROVIDER_DISPLAY_NAMES[kind] ?? kind}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      {/* Chat behavior */}
      {/* Chat behavior */}
      <SettingsSection title="Chat">
        <SettingsRow
          title="Enter key behavior"
          description="Choose what pressing Enter does in the message composer."
          resetAction={
            settings.enterKeyBehavior !== DEFAULT_UNIFIED_SETTINGS.enterKeyBehavior ? (
              <SettingResetButton
                label="enter key behavior"
                onClick={() =>
                  updateSettings({
                    enterKeyBehavior: DEFAULT_UNIFIED_SETTINGS.enterKeyBehavior,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.enterKeyBehavior}
              onValueChange={(value) => {
                if (value === "send" || value === "newline") {
                  updateSettings({ enterKeyBehavior: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Enter key behavior">
                <SelectValue>
                  {settings.enterKeyBehavior === "newline" ? "New line" : "Send message"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="newline">
                  New line
                </SelectItem>
                <SelectItem hideIndicator value="send">
                  Send message
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Assistant output"
          description="Show token-by-token output while a response is in progress."
          resetAction={
            settings.enableAssistantStreaming !==
            DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming ? (
              <SettingResetButton
                label="assistant output"
                onClick={() =>
                  updateSettings({
                    enableAssistantStreaming: DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.enableAssistantStreaming}
              onCheckedChange={(checked) =>
                updateSettings({ enableAssistantStreaming: Boolean(checked) })
              }
              aria-label="Stream assistant messages"
            />
          }
        />

        <SettingsRow
          title="New threads"
          description="Pick the default workspace mode for newly created draft threads."
          resetAction={
            settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode ? (
              <SettingResetButton
                label="new threads"
                onClick={() =>
                  updateSettings({
                    defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.defaultThreadEnvMode}
              onValueChange={(value) => {
                if (value === "local" || value === "worktree") {
                  updateSettings({ defaultThreadEnvMode: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Default thread mode">
                <SelectValue>
                  {settings.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="local">
                  Local
                </SelectItem>
                <SelectItem hideIndicator value="worktree">
                  New worktree
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        {/* Text gen model, providers, code review moved to dedicated tabs */}
      </SettingsSection>

      {/* Display preferences */}
      <SettingsSection title="Display">
        <SettingsRow
          title="Time format"
          description="Auto uses your browser locale's timezone and 12/24h preference. Override if needed."
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label="time format"
                onClick={() =>
                  updateSettings({ timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Timestamp format">
                <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="locale">
                  {TIMESTAMP_FORMAT_LABELS.locale}
                </SelectItem>
                <SelectItem hideIndicator value="12-hour">
                  {TIMESTAMP_FORMAT_LABELS["12-hour"]}
                </SelectItem>
                <SelectItem hideIndicator value="24-hour">
                  {TIMESTAMP_FORMAT_LABELS["24-hour"]}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Diff line wrapping"
          description="Set the default wrap state when the diff panel opens."
          resetAction={
            settings.diffWordWrap !== DEFAULT_UNIFIED_SETTINGS.diffWordWrap ? (
              <SettingResetButton
                label="diff line wrapping"
                onClick={() =>
                  updateSettings({ diffWordWrap: DEFAULT_UNIFIED_SETTINGS.diffWordWrap })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffWordWrap}
              onCheckedChange={(checked) => updateSettings({ diffWordWrap: Boolean(checked) })}
              aria-label="Wrap diff lines by default"
            />
          }
        />
      </SettingsSection>

      {/* Confirmation dialogs */}
      <SettingsSection title="Confirmations">
        <SettingsRow
          title="Archive confirmation"
          description="Require a second click on the inline archive action before a thread is archived."
          resetAction={
            settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive ? (
              <SettingResetButton
                label="archive confirmation"
                onClick={() =>
                  updateSettings({
                    confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadArchive}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadArchive: Boolean(checked) })
              }
              aria-label="Confirm thread archiving"
            />
          }
        />

        <SettingsRow
          title="Delete confirmation"
          description="Ask before deleting a thread and its chat history."
          resetAction={
            settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete ? (
              <SettingResetButton
                label="delete confirmation"
                onClick={() =>
                  updateSettings({
                    confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.confirmThreadDelete}
              onCheckedChange={(checked) =>
                updateSettings({ confirmThreadDelete: Boolean(checked) })
              }
              aria-label="Confirm thread deletion"
            />
          }
        />
      </SettingsSection>

      {/* NOTE: Providers + Code Review + Text Gen Model sections removed.
          They now live in dedicated settings tabs (/settings/providers and /settings/git).
      */}
      {/* END_REMOVED_SECTIONS */}
      <SettingsSection title="Advanced">
        <SettingsRow
          title="Keybindings"
          description="Open the persisted `keybindings.json` file to edit advanced bindings directly."
          status={
            <>
              <span className="block break-all font-mono text-[11px] text-foreground">
                {keybindingsConfigPath ?? "Resolving keybindings path..."}
              </span>
              {openKeybindingsError ? (
                <span className="mt-1 block text-destructive">{openKeybindingsError}</span>
              ) : (
                <span className="mt-1 block">Opens in your preferred editor.</span>
              )}
            </>
          }
          control={
            <Button
              size="xs"
              variant="outline"
              disabled={!keybindingsConfigPath || isOpeningKeybindings}
              onClick={openKeybindingsFile}
            >
              {isOpeningKeybindings ? "Opening..." : "Open file"}
            </Button>
          }
        />
      </SettingsSection>

      <SettingsSection title="About">
        {isElectron ? (
          <AboutVersionSection />
        ) : (
          <SettingsRow
            title={<AboutVersionTitle />}
            description="Current version of the application."
          />
        )}
        <SettingsRow
          title="Diagnostics"
          description={diagnosticsDescription}
          status={
            <>
              <span className="block break-all font-mono text-[11px] text-foreground">
                {logsDirectoryPath ?? "Resolving logs directory..."}
              </span>
              {openDiagnosticsError ? (
                <span className="mt-1 block text-destructive">{openDiagnosticsError}</span>
              ) : null}
            </>
          }
          control={
            <Button
              size="xs"
              variant="outline"
              disabled={!logsDirectoryPath || isOpeningLogsDirectory}
              onClick={openLogsDirectory}
            >
              {isOpeningLogsDirectory ? "Opening..." : "Open logs folder"}
            </Button>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function ArchivedThreadsPanel() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const { unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const archivedGroups = useMemo(() => {
    const projectById = new Map(projects.map((project) => [project.id, project] as const));
    return [...projectById.values()]
      .map((project) => ({
        project,
        threads: threads
          .filter((thread) => thread.projectId === project.id && thread.archivedAt !== null)
          .toSorted((left, right) => {
            const leftKey = left.archivedAt ?? left.createdAt;
            const rightKey = right.archivedAt ?? right.createdAt;
            return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
          }),
      }))
      .filter((group) => group.threads.length > 0);
  }, [projects, threads]);

  const handleArchivedThreadContextMenu = useCallback(
    async (threadId: ThreadId, position: { x: number; y: number }) => {
      const api = readNativeApi();
      if (!api) return;
      const clicked = await api.contextMenu.show(
        [
          { id: "unarchive", label: "Unarchive" },
          { id: "delete", label: "Delete", destructive: true },
        ],
        position,
      );

      if (clicked === "unarchive") {
        try {
          await unarchiveThread(threadId);
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to unarchive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return;
      }

      if (clicked === "delete") {
        await confirmAndDeleteThread(threadId);
      }
    },
    [confirmAndDeleteThread, unarchiveThread],
  );

  return (
    <SettingsPageContainer>
      {archivedGroups.length === 0 ? (
        <SettingsSection title="Archived threads">
          <Empty className="min-h-88">
            <EmptyMedia variant="icon">
              <ArchiveIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No archived threads</EmptyTitle>
              <EmptyDescription>Archived threads will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </SettingsSection>
      ) : (
        archivedGroups.map(({ project, threads: projectThreads }) => (
          <SettingsSection
            key={project.id}
            title={project.name}
            icon={<ProjectFavicon cwd={project.cwd} />}
          >
            {projectThreads.map((thread) => (
              <div
                key={thread.id}
                className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 first:border-t-0 sm:px-5"
                onContextMenu={(event) => {
                  event.preventDefault();
                  void handleArchivedThreadContextMenu(thread.id, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-foreground">{thread.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Archived {formatRelativeTimeLabel(thread.archivedAt ?? thread.createdAt)}
                    {" \u00b7 Created "}
                    {formatRelativeTimeLabel(thread.createdAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 cursor-pointer gap-1.5 px-2.5"
                  onClick={() =>
                    void unarchiveThread(thread.id).catch((error) => {
                      toastManager.add({
                        type: "error",
                        title: "Failed to unarchive thread",
                        description: error instanceof Error ? error.message : "An error occurred.",
                      });
                    })
                  }
                >
                  <ArchiveX className="size-3.5" />
                  <span>Unarchive</span>
                </Button>
              </div>
            ))}
          </SettingsSection>
        ))
      )}
    </SettingsPageContainer>
  );
}

// ── Notifications Settings ─────────────────────────────────────────────────────

const TURN_COMPLETION_LABELS: Record<string, string> = {
  always: "Always",
  never: "Never",
  unfocused: "When unfocused",
};

export function NotificationsSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Notifications">
        <SettingsRow
          title="Turn completion"
          description="Show a desktop notification when an agent finishes its turn."
          control={
            <Select
              value={settings.turnCompletionNotifications}
              onValueChange={(value) => {
                if (value === "always" || value === "never" || value === "unfocused") {
                  updateSettings({ turnCompletionNotifications: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Turn completion notifications">
                <SelectValue>
                  {TURN_COMPLETION_LABELS[settings.turnCompletionNotifications] ?? "When unfocused"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="always">
                  Always
                </SelectItem>
                <SelectItem hideIndicator value="unfocused">
                  When unfocused
                </SelectItem>
                <SelectItem hideIndicator value="never">
                  Never
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Permission notifications"
          description="Notify when an agent is waiting for permission to run a command."
          control={
            <Switch
              checked={settings.enablePermissionNotifications}
              onCheckedChange={(checked) =>
                updateSettings({ enablePermissionNotifications: Boolean(checked) })
              }
              aria-label="Permission notifications"
            />
          }
        />

        <SettingsRow
          title="Question notifications"
          description="Notify when an agent asks a question that requires your input."
          control={
            <Switch
              checked={settings.enableQuestionNotifications}
              onCheckedChange={(checked) =>
                updateSettings({ enableQuestionNotifications: Boolean(checked) })
              }
              aria-label="Question notifications"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

// ── Providers Settings ─────────────────────────────────────────────────────────

type AnyProviderConfig = {
  enabled: boolean;
  binaryPath: string | null;
  customModels: ReadonlyArray<string>;
  [key: string]: unknown;
};

function ProviderCard({
  providerSettings,
  liveProvider,
  providerConfig,
  defaultProviderConfig,
  customModelOptions,
  onUpdateProviderConfig,
}: {
  providerSettings: InstallProviderSettings;
  liveProvider: ServerProvider | undefined;
  providerConfig: AnyProviderConfig;
  defaultProviderConfig: AnyProviderConfig;
  customModelOptions: ReadonlyArray<string>;
  onUpdateProviderConfig: (provider: ProviderKind, patch: Partial<AnyProviderConfig>) => void;
}) {
  const [customModelInput, setCustomModelInput] = useState("");
  const [customModelError, setCustomModelError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const modelListRef = useRef<HTMLDivElement>(null);

  const statusKey = liveProvider?.status ?? (providerConfig.enabled ? "warning" : "disabled");
  const summary = getProviderSummary(liveProvider);
  const versionLabel = getProviderVersionLabel(liveProvider?.version);
  const statusStyle = PROVIDER_STATUS_STYLES[statusKey];
  const isDirty = !Equal.equals(providerConfig, defaultProviderConfig);

  const addModel = useCallback(() => {
    const normalized = normalizeModelSlug(customModelInput, providerSettings.provider);
    if (!normalized) {
      setCustomModelError("Enter a model slug.");
      return;
    }
    if (customModelOptions.includes(normalized)) {
      setCustomModelError("That custom model is already saved.");
      return;
    }
    onUpdateProviderConfig(providerSettings.provider, {
      customModels: [...providerConfig.customModels, normalized],
    });
    setCustomModelInput("");
    setCustomModelError(null);
    // Scroll to end after render
    requestAnimationFrame(() => {
      modelListRef.current?.scrollTo({
        top: modelListRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [
    customModelInput,
    customModelOptions,
    onUpdateProviderConfig,
    providerConfig.customModels,
    providerSettings.provider,
  ]);

  const removeModel = useCallback(
    (slug: string) => {
      onUpdateProviderConfig(providerSettings.provider, {
        customModels: providerConfig.customModels.filter((m) => m !== slug),
      });
      setCustomModelError(null);
    },
    [onUpdateProviderConfig, providerConfig.customModels, providerSettings.provider],
  );

  return (
    <div className="border-t border-border first:border-t-0">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        {/* Header row */}
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-accent/50 sm:px-5"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`size-2 shrink-0 rounded-full ${statusStyle.dot}`}
              aria-label={`Status: ${statusKey}`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {providerSettings.title}
                </span>
                {versionLabel && (
                  <code className="text-[11px] text-muted-foreground">{versionLabel}</code>
                )}
                {isDirty && (
                  <span className="text-[10px] text-muted-foreground/60">(modified)</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{summary.headline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={providerConfig.enabled}
              onCheckedChange={(checked) => {
                onUpdateProviderConfig(providerSettings.provider, { enabled: Boolean(checked) });
              }}
              aria-label={`Enable ${providerSettings.title}`}
              onClick={(e) => e.stopPropagation()}
            />
            <ChevronDownIcon
              className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </button>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border/50 px-4 py-4 sm:px-5">
            {summary.detail ? (
              <p className="text-xs text-muted-foreground">{summary.detail}</p>
            ) : null}

            {/* Binary path */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {providerSettings.binaryPlaceholder}
              </label>
              <p className="text-xs text-muted-foreground">{providerSettings.binaryDescription}</p>
              <Input
                value={providerConfig.binaryPath ?? ""}
                onChange={(e) =>
                  onUpdateProviderConfig(providerSettings.provider, {
                    binaryPath: e.target.value || null,
                  })
                }
                placeholder="Auto-detect from PATH"
                className="font-mono text-xs"
              />
            </div>

            {/* Home path (Codex only) */}
            {providerSettings.homePathKey && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  {providerSettings.homePlaceholder}
                </label>
                <p className="text-xs text-muted-foreground">{providerSettings.homeDescription}</p>
                <Input
                  value={(providerConfig as { homePath?: string | null }).homePath ?? ""}
                  onChange={(e) =>
                    onUpdateProviderConfig(providerSettings.provider, {
                      [providerSettings.homePathKey as string]: e.target.value || null,
                    })
                  }
                  placeholder="Optional"
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* Custom models */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Custom models</label>
              <p className="text-xs text-muted-foreground">
                Add custom model slugs not in the built-in list.
              </p>
              {providerConfig.customModels.length > 0 && (
                <div
                  ref={modelListRef}
                  className="max-h-32 overflow-y-auto rounded-md border border-border"
                >
                  {providerConfig.customModels.map((slug) => (
                    <div
                      key={slug}
                      className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-1.5 first:border-t-0"
                    >
                      <code className="text-xs text-foreground">{slug}</code>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="size-5 text-muted-foreground hover:text-destructive"
                        onClick={() => removeModel(slug)}
                        aria-label={`Remove ${slug}`}
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={customModelInput}
                  onChange={(e) => {
                    setCustomModelInput(e.target.value);
                    setCustomModelError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addModel();
                  }}
                  placeholder="e.g. o3-mini"
                  className="font-mono text-xs"
                />
                <Button size="xs" variant="outline" onClick={addModel}>
                  <PlusIcon className="size-3" />
                  Add
                </Button>
              </div>
              {customModelError ? (
                <p className="text-xs text-destructive">{customModelError}</p>
              ) : null}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function ProvidersSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const serverProviders = useServerProviders();

  const handleUpdateProviderConfig = useCallback(
    (provider: ProviderKind, patch: Partial<AnyProviderConfig>) => {
      updateSettings({
        providers: {
          ...settings.providers,
          [provider]: { ...settings.providers[provider], ...patch },
        },
      });
    },
    [settings.providers, updateSettings],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Providers">
        {PROVIDER_SETTINGS.map((providerSettings) => {
          const liveProvider = serverProviders.find(
            (p) => p.provider === providerSettings.provider,
          );
          const providerConfig = settings.providers[providerSettings.provider];
          const defaultProviderConfig =
            DEFAULT_UNIFIED_SETTINGS.providers[providerSettings.provider];
          // OllamaSettings does not have customModels — fall back to empty array
          const customModelOptions =
            (providerConfig as { customModels?: readonly string[] }).customModels ?? [];

          return (
            <ProviderCard
              key={providerSettings.provider}
              providerSettings={providerSettings}
              liveProvider={liveProvider}
              providerConfig={providerConfig as AnyProviderConfig}
              defaultProviderConfig={defaultProviderConfig as AnyProviderConfig}
              customModelOptions={customModelOptions}
              onUpdateProviderConfig={handleUpdateProviderConfig}
            />
          );
        })}
      </SettingsSection>

      {/* Usage statistics derived from all Bird Code sessions */}
      <SettingsSection title="Usage Stats">
        <UsageStatsSection />
      </SettingsSection>

      {/* Import conversations from provider history directories */}
      <SettingsSection title="Import Conversations" icon={<DownloadIcon className="size-3.5" />}>
        <SettingsLayoutRow>
          <p className="text-xs text-muted-foreground mb-4">
            Import existing conversations from your AI provider history. Imported projects and
            threads will appear in your sidebar and can be continued in Bird Code.
          </p>
          <ImportChatsFlow />
        </SettingsLayoutRow>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

// ── Git & Code Review Settings ─────────────────────────────────────────────────

const CODE_REVIEW_FIX_MODE_LABELS: Record<string, string> = {
  "review-only": "Review only",
  "auto-fix": "Auto-fix",
  "agent-decides": "Agent decides",
};

export function GitSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const serverProviders = useServerProviders();

  const resolvedSelection = useMemo(
    () => resolveAppModelSelectionState(settings, serverProviders),
    [settings, serverProviders],
  );

  const modelOptionsByProvider = useMemo(
    () =>
      getCustomModelOptionsByProvider(
        settings,
        serverProviders,
        resolvedSelection.provider,
        resolvedSelection.model,
      ),
    [settings, serverProviders, resolvedSelection.provider, resolvedSelection.model],
  );

  const handleModelChange = useCallback(
    (provider: ProviderKind, model: string) => {
      updateSettings({ textGenerationModelSelection: { provider, model } });
    },
    [updateSettings],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Text generation">
        <SettingsRow
          title="Model"
          description="Model used for generating commit messages and code review summaries."
          resetAction={
            settings.textGenerationModelSelection !==
            DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ? (
              <SettingResetButton
                label="text generation model"
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            <ProviderModelPicker
              provider={resolvedSelection.provider}
              model={resolvedSelection.model}
              lockedProvider={null}
              providers={serverProviders}
              modelOptionsByProvider={modelOptionsByProvider}
              onProviderModelChange={handleModelChange}
              compact
              // Wire Ollama pull/quit through the shared WS RPC client.
              // Cast result to mutable type to satisfy the prop signature (RPC returns readonly).
              onOllamaPullModel={async (model) => {
                try {
                  const result = await getWsRpcClient().ollama.pullModel({ model });
                  return {
                    success: result.success,
                    ...(result.error !== undefined ? { error: result.error } : {}),
                  };
                } catch (err) {
                  return { success: false, error: String(err) };
                }
              }}
              onOllamaQuitServer={() => {
                void getWsRpcClient().ollama.quitServer().catch(console.error);
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Commit messages">
        <div className="px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-foreground">Commit instructions</h3>
              {settings.commitInstructions !== DEFAULT_UNIFIED_SETTINGS.commitInstructions && (
                <SettingResetButton
                  label="commit instructions"
                  onClick={() =>
                    updateSettings({
                      commitInstructions: DEFAULT_UNIFIED_SETTINGS.commitInstructions,
                    })
                  }
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Custom instructions prepended to every commit message generation prompt.
            </p>
            <Textarea
              value={settings.commitInstructions}
              onChange={(e) => updateSettings({ commitInstructions: e.target.value })}
              placeholder="e.g. Always use conventional commit format. Reference ticket numbers when present."
              rows={4}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Code review">
        <SettingsRow
          title="Fix mode"
          description="How the agent should handle issues found during code review."
          resetAction={
            settings.codeReview.fixMode !== DEFAULT_UNIFIED_SETTINGS.codeReview.fixMode ? (
              <SettingResetButton
                label="code review fix mode"
                onClick={() =>
                  updateSettings({
                    codeReview: {
                      ...settings.codeReview,
                      fixMode: DEFAULT_UNIFIED_SETTINGS.codeReview.fixMode,
                    },
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeReview.fixMode}
              onValueChange={(value) => {
                if (value === "review-only" || value === "auto-fix" || value === "agent-decides") {
                  updateSettings({
                    codeReview: { ...settings.codeReview, fixMode: value as CodeReviewFixMode },
                  });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Code review fix mode">
                <SelectValue>
                  {CODE_REVIEW_FIX_MODE_LABELS[settings.codeReview.fixMode] ?? "Review only"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="review-only">
                  Review only
                </SelectItem>
                <SelectItem hideIndicator value="auto-fix">
                  Auto-fix
                </SelectItem>
                <SelectItem hideIndicator value="agent-decides">
                  Agent decides
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

// ── Appearance Settings ────────────────────────────────────────────────────────

export function AppearanceSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const { theme, setTheme } = useTheme();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const applyPreset = useCallback(
    (preset: ThemePreset) => {
      updateSettings({
        themeAccentColor: preset.accentLight,
        themeAccentColorDark: preset.accentDark,
        themeBackgroundColor: preset.bgLight ?? "",
        themeBackgroundColorDark: preset.bgDark ?? "",
        themeForegroundColor: preset.fgLight ?? "",
        themeForegroundColorDark: preset.fgDark ?? "",
      });
    },
    [updateSettings],
  );

  return (
    <SettingsPageContainer>
      {/* Theme */}
      <SettingsSection title="Theme">
        <SettingsRow
          title="Color scheme"
          description="Choose between light, dark, or system-based theme."
          control={
            <Select
              value={theme}
              onValueChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") {
                  setTheme(value);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-36" aria-label="Color scheme">
                <SelectValue>
                  {(() => {
                    const opt = THEME_OPTIONS.find((o) => o.value === theme);
                    if (!opt) return "System";
                    const Icon = opt.icon;
                    return (
                      <span className="flex items-center gap-1.5">
                        <Icon className="size-3.5 shrink-0" />
                        {opt.label}
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <SelectItem hideIndicator key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        {option.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Pointer cursors"
          description="Show pointer cursor on interactive elements (buttons, links)."
          control={
            <Switch
              checked={settings.usePointerCursors}
              onCheckedChange={(checked) => updateSettings({ usePointerCursors: Boolean(checked) })}
              aria-label="Pointer cursors"
            />
          }
        />
      </SettingsSection>

      {/* Typography */}
      <SettingsSection title="Typography">
        <SettingsRow
          title="UI font size"
          description="Base font size for the interface (default: 14px)."
          resetAction={
            settings.uiFontSize !== 14 ? (
              <SettingResetButton
                label="UI font size"
                onClick={() => updateSettings({ uiFontSize: 14 })}
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={24}
                value={settings.uiFontSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 10 && val <= 24) {
                    updateSettings({ uiFontSize: val });
                  }
                }}
                className="w-16 text-center"
                aria-label="UI font size in pixels"
              />
              <span className="text-xs text-muted-foreground">px</span>
            </div>
          }
        />

        <SettingsRow
          title="Code font size"
          description="Font size used in code blocks and diffs (default: 13px)."
          resetAction={
            settings.codeFontSize !== 13 ? (
              <SettingResetButton
                label="code font size"
                onClick={() => updateSettings({ codeFontSize: 13 })}
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={10}
                max={24}
                value={settings.codeFontSize}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 10 && val <= 24) {
                    updateSettings({ codeFontSize: val });
                  }
                }}
                className="w-16 text-center"
                aria-label="Code font size in pixels"
              />
              <span className="text-xs text-muted-foreground">px</span>
            </div>
          }
        />

        <SettingsRow
          title="UI font"
          description="Font family used for the interface."
          resetAction={
            settings.uiFont !== "" ? (
              <SettingResetButton label="UI font" onClick={() => updateSettings({ uiFont: "" })} />
            ) : null
          }
          control={
            <Select
              value={settings.uiFont}
              onValueChange={(value) => updateSettings({ uiFont: value ?? "" })}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="UI font">
                <SelectValue>
                  {UI_FONT_OPTIONS.find((o) => o.value === settings.uiFont)?.label ??
                    "System default"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {UI_FONT_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Code font"
          description="Monospace font family used in code blocks and diffs."
          resetAction={
            settings.codeFont !== "" ? (
              <SettingResetButton
                label="code font"
                onClick={() => updateSettings({ codeFont: "" })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeFont}
              onValueChange={(value) => updateSettings({ codeFont: value ?? "" })}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Code font">
                <SelectValue>
                  {CODE_FONT_OPTIONS.find((o) => o.value === settings.codeFont)?.label ??
                    "System default"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CODE_FONT_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>

      {/* Color customization */}
      <SettingsSection title="Colors">
        {/* Presets */}
        <div className="border-t border-border px-4 py-4 first:border-t-0 sm:px-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Presets</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Quick-apply accent color presets. Customize further below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                  title={preset.label}
                >
                  {preset.accentLight || preset.accentDark ? (
                    <span
                      className="size-3 rounded-full border border-border/50 shrink-0"
                      style={{
                        background: isDark
                          ? preset.accentDark || preset.accentLight
                          : preset.accentLight || preset.accentDark,
                      }}
                    />
                  ) : null}
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Per-color rows — accent, background, foreground, each with light/dark picker */}
        {(
          [
            {
              label: "Accent",
              description: "Primary interactive color (buttons, focus rings).",
              lightKey: "themeAccentColor",
              darkKey: "themeAccentColorDark",
            },
            {
              label: "Background",
              description: "Main app background surface color.",
              lightKey: "themeBackgroundColor",
              darkKey: "themeBackgroundColorDark",
            },
            {
              label: "Foreground",
              description: "Primary text and icon color.",
              lightKey: "themeForegroundColor",
              darkKey: "themeForegroundColorDark",
            },
          ] as const
        ).map(({ label, description, lightKey, darkKey }) => (
          <SettingsRow key={label} title={label} description={description}>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Light</p>
                <div className="flex items-center gap-1.5">
                  <ColorPickerField
                    value={settings[lightKey]}
                    onChange={(v) => updateSettings({ [lightKey]: v })}
                    placeholder="Theme default"
                    label={`${label} (light)`}
                    className="flex-1"
                  />
                  {settings[lightKey] !== "" && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-6 shrink-0 text-muted-foreground"
                      onClick={() => updateSettings({ [lightKey]: "" })}
                      aria-label={`Reset ${label} light`}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Dark</p>
                <div className="flex items-center gap-1.5">
                  <ColorPickerField
                    value={settings[darkKey]}
                    onChange={(v) => updateSettings({ [darkKey]: v })}
                    placeholder="Theme default"
                    label={`${label} (dark)`}
                    className="flex-1"
                  />
                  {settings[darkKey] !== "" && (
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="size-6 shrink-0 text-muted-foreground"
                      onClick={() => updateSettings({ [darkKey]: "" })}
                      aria-label={`Reset ${label} dark`}
                    >
                      <XIcon className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </SettingsRow>
        ))}

        {/* Reset all colors */}
        {settings.themeAccentColor ||
        settings.themeAccentColorDark ||
        settings.themeBackgroundColor ||
        settings.themeBackgroundColorDark ||
        settings.themeForegroundColor ||
        settings.themeForegroundColorDark ? (
          <div className="border-t border-border px-4 py-3 sm:px-5">
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                updateSettings({
                  themeAccentColor: "",
                  themeAccentColorDark: "",
                  themeBackgroundColor: "",
                  themeBackgroundColorDark: "",
                  themeForegroundColor: "",
                  themeForegroundColorDark: "",
                })
              }
            >
              Reset all colors
            </Button>
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

// ── Personalization Settings ───────────────────────────────────────────────────

/**
 * Editor for instruction files (AGENTS.md, CLAUDE.md, GEMINI.md) within a project.
 * Reads the file on mount, lets the user edit in a textarea, and saves on demand.
 */
function InstructionFileEditor({ cwd, fileName }: { cwd: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = content !== null && content !== savedContent;

  useEffect(() => {
    setLoading(true);
    setError(null);
    void ensureNativeApi()
      .projects.readFile({ cwd, relativePath: fileName })
      .then((result) => {
        const text = result?.contents ?? "";
        setContent(text);
        setSavedContent(text);
      })
      .catch((err: unknown) => {
        // File not found is fine — user can create it
        setContent("");
        setSavedContent("");
        if (err instanceof Error && !err.message.includes("not found")) {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [cwd, fileName]);

  const handleSave = useCallback(() => {
    if (content === null) return;
    setSaving(true);
    setError(null);
    void ensureNativeApi()
      .projects.writeFile({ cwd, relativePath: fileName, contents: content })
      .then(() => {
        setSavedContent(content);
        toastManager.add({ type: "success", title: `${fileName} saved` });
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to save file.");
      })
      .finally(() => setSaving(false));
  }, [content, cwd, fileName]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileTextIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground font-mono">{fileName}</span>
          {isDirty && <span className="text-[10px] text-muted-foreground">(unsaved)</span>}
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={!isDirty || saving || loading}
          onClick={handleSave}
        >
          <SaveIcon className="size-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <LoaderIcon className="size-3 animate-spin" />
          Loading…
        </div>
      ) : (
        <Textarea
          value={content ?? ""}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`# ${fileName}\n\nAdd instructions for AI agents here.`}
          rows={8}
          className="font-mono text-xs"
        />
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function PersonalizationSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const projects = useStore((store) => store.projects);

  // The first (most recent) project is used for instruction file editing
  const activeProject = projects[0] ?? null;

  return (
    <SettingsPageContainer>
      {/* Custom instructions */}
      <SettingsSection title="Custom instructions">
        <div className="px-4 py-4 sm:px-5">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-foreground">Always include</h3>
              {settings.customInstructions !== "" && (
                <SettingResetButton
                  label="custom instructions"
                  onClick={() => updateSettings({ customInstructions: "" })}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Instructions appended to every agent prompt. Use for persistent preferences, coding
              style, or project context.
            </p>
            <Textarea
              value={settings.customInstructions}
              onChange={(e) => updateSettings({ customInstructions: e.target.value })}
              placeholder="e.g. Always use TypeScript strict mode. Prefer functional programming patterns."
              rows={6}
            />
          </div>
        </div>
      </SettingsSection>

      {/* Per-project instruction files */}
      {activeProject ? (
        <SettingsSection title="Instruction files">
          <div className="space-y-6 px-4 py-4 sm:px-5">
            <div>
              <p className="text-xs text-muted-foreground">
                These files are read automatically by agents. Edit them here or in your editor.
              </p>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/60">
                {activeProject.cwd}
              </p>
            </div>
            <InstructionFileEditor cwd={activeProject.cwd} fileName="AGENTS.md" />
            <InstructionFileEditor cwd={activeProject.cwd} fileName="CLAUDE.md" />
            <InstructionFileEditor cwd={activeProject.cwd} fileName="GEMINI.md" />
          </div>
        </SettingsSection>
      ) : (
        <SettingsSection title="Instruction files">
          <div className="px-4 py-4 sm:px-5">
            <p className="text-xs text-muted-foreground">
              Open a project to edit its instruction files (AGENTS.md, CLAUDE.md, GEMINI.md).
            </p>
          </div>
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
