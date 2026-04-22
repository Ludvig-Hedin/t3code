import {
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { memo } from "react";
import GitActionsControl from "../GitActionsControl";
import { CodeReviewControl } from "../CodeReviewControl";
import {
  DiffIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  MonitorPlayIcon,
  TerminalSquareIcon,
} from "lucide-react";
import { useFilesPanelStore } from "~/filesPanelStore";
import { isMacPlatform } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";

interface ChatHeaderProps {
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  activeProjectCwd: string | null;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  diffOpen: boolean;
  /** Current working-tree insertions/deletions from git status — shown inline on the Diff toggle */
  diffInsertions: number;
  diffDeletions: number;
  previewAvailable: boolean;
  previewOpen: boolean;
  hasRunningPreviewApp: boolean;
  onTogglePreview: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  /** Opens this thread in a detached popout window (or focuses the existing one). */
  onPopout: () => void;
}

function SecondaryControls({
  activeThreadId,
  activeProjectName,
  activeProjectCwd,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  gitCwd,
  isGitRepo,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: Pick<
  ChatHeaderProps,
  | "activeThreadId"
  | "activeProjectName"
  | "activeProjectCwd"
  | "openInCwd"
  | "activeProjectScripts"
  | "preferredScriptId"
  | "keybindings"
  | "availableEditors"
  | "gitCwd"
  | "isGitRepo"
  | "onRunProjectScript"
  | "onAddProjectScript"
  | "onUpdateProjectScript"
  | "onDeleteProjectScript"
>) {
  return (
    <>
      {activeProjectScripts && (
        <ProjectScriptsControl
          scripts={activeProjectScripts}
          keybindings={keybindings}
          projectCwd={activeProjectCwd}
          preferredScriptId={preferredScriptId}
          onRunScript={onRunProjectScript}
          onAddScript={onAddProjectScript}
          onUpdateScript={onUpdateProjectScript}
          onDeleteScript={onDeleteProjectScript}
        />
      )}
      {activeProjectName && (
        <OpenInPicker
          keybindings={keybindings}
          availableEditors={availableEditors}
          openInCwd={openInCwd}
        />
      )}
      {activeProjectName && <GitActionsControl gitCwd={gitCwd} activeThreadId={activeThreadId} />}
      {activeProjectName && (
        <CodeReviewControl gitCwd={gitCwd} activeThreadId={activeThreadId} isGitRepo={isGitRepo} />
      )}
    </>
  );
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadId,
  activeThreadTitle,
  activeProjectName,
  activeProjectCwd,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  diffToggleShortcutLabel,
  gitCwd,
  diffOpen,
  diffInsertions,
  diffDeletions,
  previewAvailable,
  previewOpen,
  hasRunningPreviewApp,
  onTogglePreview,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
  onPopout,
}: ChatHeaderProps) {
  const filesOpen = useFilesPanelStore((s) => s.open);
  const toggleFiles = useFilesPanelStore((s) => s.toggle);
  const isMac = typeof navigator !== "undefined" ? isMacPlatform(navigator.platform) : false;
  const secondaryControlsProps = {
    activeThreadId,
    activeProjectName,
    activeProjectCwd,
    openInCwd,
    activeProjectScripts,
    preferredScriptId,
    keybindings,
    availableEditors,
    gitCwd,
    isGitRepo,
    onRunProjectScript,
    onAddProjectScript,
    onUpdateProjectScript,
    onDeleteProjectScript,
  } satisfies Parameters<typeof SecondaryControls>[0];

  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <h2
          className="hidden min-w-0 shrink truncate text-sm font-medium text-foreground @[760px]/header-actions:block"
          title={activeThreadTitle}
        >
          {activeThreadTitle}
        </h2>
        {activeProjectName && (
          <Badge
            variant="outline"
            className="min-w-0 max-w-[9rem] shrink overflow-hidden @[640px]/header-actions:max-w-[11rem] @[900px]/header-actions:max-w-[14rem]"
          >
            <span className="min-w-0 truncate">{activeProjectName}</span>
          </Badge>
        )}
        {activeProjectName && !isGitRepo && (
          <Badge
            variant="outline"
            className="hidden shrink-0 text-[10px] text-amber-700 @[560px]/header-actions:inline-flex"
          >
            No Git
          </Badge>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1">
        <div className="hidden md:contents">
          <SecondaryControls {...secondaryControlsProps} />
        </div>
        <div className="hidden md:contents">
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  className="shrink-0 px-1.5 @[1180px]/header-actions:px-2"
                  pressed={filesOpen}
                  onPressedChange={toggleFiles}
                  aria-label="Toggle Files panel"
                  variant="outline"
                  size="xs"
                >
                  <FolderOpenIcon className="size-3" />
                  <span className="hidden text-[10px] @[1180px]/header-actions:inline">Files</span>
                </Toggle>
              }
            />
            <TooltipPopup side="bottom">
              {filesOpen ? "Close Files panel" : "Open Files panel"} (
              {isMac ? "⇧⌘E" : "Ctrl+Shift+E"})
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  className="relative shrink-0 px-1.5 @[1180px]/header-actions:px-2"
                  pressed={previewOpen}
                  onPressedChange={onTogglePreview}
                  aria-label="Toggle preview panel"
                  variant="outline"
                  size="xs"
                  disabled={!previewAvailable}
                >
                  <MonitorPlayIcon className="size-3" />
                  <span className="hidden text-[10px] @[1180px]/header-actions:inline">
                    Preview
                  </span>
                  {hasRunningPreviewApp && (
                    <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-green-500" />
                  )}
                </Toggle>
              }
            />
            <TooltipPopup side="bottom">
              {!previewAvailable
                ? "Preview is unavailable until this thread has an active project."
                : previewOpen
                  ? "Close preview panel"
                  : "Open preview panel"}
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  className="shrink-0 px-1.5 @[1180px]/header-actions:px-2"
                  pressed={terminalOpen}
                  onPressedChange={onToggleTerminal}
                  aria-label="Toggle terminal drawer"
                  variant="outline"
                  size="xs"
                  disabled={!terminalAvailable}
                >
                  <TerminalSquareIcon className="size-3" />
                  <span className="hidden text-[10px] @[1180px]/header-actions:inline">
                    Terminal
                  </span>
                </Toggle>
              }
            />
            <TooltipPopup side="bottom">
              {!terminalAvailable
                ? "Terminal unavailable — open a project first"
                : terminalToggleShortcutLabel
                  ? `Toggle terminal (${terminalToggleShortcutLabel})`
                  : "Toggle terminal"}
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Toggle
                  className="shrink-0 px-1.5 @[1180px]/header-actions:px-2"
                  pressed={diffOpen}
                  onPressedChange={onToggleDiff}
                  aria-label="Toggle diff panel"
                  variant="outline"
                  size="xs"
                  disabled={!isGitRepo}
                >
                  <DiffIcon className="size-3" />
                  {isGitRepo &&
                  hasNonZeroStat({ additions: diffInsertions, deletions: diffDeletions }) ? (
                    <span className="hidden items-center gap-0.5 text-[10px] font-medium tabular-nums @[1180px]/header-actions:flex">
                      <DiffStatLabel additions={diffInsertions} deletions={diffDeletions} />
                    </span>
                  ) : null}
                </Toggle>
              }
            />
            <TooltipPopup side="bottom">
              {!isGitRepo
                ? "Diff panel unavailable — project must be a git repository"
                : diffToggleShortcutLabel
                  ? `Toggle diff panel (${diffToggleShortcutLabel})`
                  : "Toggle diff panel"}
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label="Pop out thread to new window"
                  className="shrink-0 px-1.5 @[1180px]/header-actions:px-2"
                  onClick={onPopout}
                >
                  <ExternalLinkIcon className="size-3" />
                  <span className="hidden text-[10px] @[1180px]/header-actions:inline">
                    Pop out
                  </span>
                </Button>
              }
            />
            <TooltipPopup side="bottom">Pop out to new window</TooltipPopup>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});
