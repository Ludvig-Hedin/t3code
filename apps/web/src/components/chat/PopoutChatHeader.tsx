/**
 * PopoutChatHeader — header for a thread popout window.
 *
 * Layout:
 *   [New Thread]  ——  [Thread Title (centred)]  ——  [Controls]  [⋯]  [×]
 *
 * When the header container is narrow (< 560 px) the secondary controls
 * (Scripts · Open-in · Git · Code-review) are hidden and a "⋯" overflow
 * popover button appears so nothing is permanently unreachable.
 *
 * The primary toggles (Preview · Terminal · Diff) and the Close button are
 * always visible regardless of container width.
 */
import {
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@t3tools/contracts";
import { memo, useCallback } from "react";
import {
  DiffIcon,
  EllipsisIcon,
  MonitorPlayIcon,
  SquareIcon,
  SquarePenIcon,
  TerminalSquareIcon,
  XIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import GitActionsControl from "../GitActionsControl";
import { CodeReviewControl } from "../CodeReviewControl";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Toggle } from "../ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { OpenInPicker } from "./OpenInPicker";

export interface PopoutChatHeaderProps {
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
  previewAvailable: boolean;
  previewOpen: boolean;
  hasRunningPreviewApp: boolean;
  executionStatusLabel: string | null;
  executionStatusDetail: string | null;
  executionStatusTone: "neutral" | "warning" | "danger";
  canStopExecution: boolean;
  onTogglePreview: () => void;
  onStopExecution: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleTerminal: () => void;
  onToggleDiff: () => void;
  /** Close this popout window. */
  onClose: () => void;
}

/**
 * Renders the secondary project controls (Scripts, Open-in, Git, CodeReview).
 * Extracted to avoid duplicating JSX between the inline and overflow sections.
 */
function SecondaryControls({
  activeThreadId,
  activeProjectName,
  activeProjectCwd,
  isGitRepo,
  openInCwd,
  activeProjectScripts,
  preferredScriptId,
  keybindings,
  availableEditors,
  gitCwd,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
}: Omit<
  PopoutChatHeaderProps,
  | "activeThreadTitle"
  | "terminalAvailable"
  | "terminalOpen"
  | "terminalToggleShortcutLabel"
  | "diffToggleShortcutLabel"
  | "diffOpen"
  | "previewAvailable"
  | "previewOpen"
  | "hasRunningPreviewApp"
  | "executionStatusLabel"
  | "executionStatusDetail"
  | "executionStatusTone"
  | "canStopExecution"
  | "onTogglePreview"
  | "onStopExecution"
  | "onToggleTerminal"
  | "onToggleDiff"
  | "onClose"
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

export const PopoutChatHeader = memo(function PopoutChatHeader({
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
  previewAvailable,
  previewOpen,
  hasRunningPreviewApp,
  executionStatusLabel,
  executionStatusDetail,
  executionStatusTone,
  canStopExecution,
  onTogglePreview,
  onStopExecution,
  onRunProjectScript,
  onAddProjectScript,
  onUpdateProjectScript,
  onDeleteProjectScript,
  onToggleTerminal,
  onToggleDiff,
  onClose,
}: PopoutChatHeaderProps) {
  const navigate = useNavigate();

  // Open a new thread in the main window (opener) if possible; otherwise
  // navigate within the popout itself, falling back to the thread index.
  // Accessing window.opener properties can throw a SecurityError when the opener
  // is cross-origin, so we guard with try/catch and fall back to navigate().
  const handleNewThread = useCallback(() => {
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      try {
        window.opener.location.href = "/";
        window.opener.focus();
      } catch {
        // Cross-origin security error — fall back to navigating within this window.
        void navigate({ to: "/" });
      }
    } else {
      void navigate({ to: "/" });
    }
  }, [navigate]);

  // Shared secondary-control props, passed to both the inline and overflow slots.
  const secondaryProps = {
    activeThreadId,
    activeProjectName,
    activeProjectCwd,
    isGitRepo,
    openInCwd,
    activeProjectScripts,
    preferredScriptId,
    keybindings,
    availableEditors,
    gitCwd,
    onRunProjectScript,
    onAddProjectScript,
    onUpdateProjectScript,
    onDeleteProjectScript,
  } satisfies Parameters<typeof SecondaryControls>[0];

  // Whether any secondary controls exist (avoids rendering the overflow button
  // when there are no project controls to overflow into).
  const hasSecondaryControls = !!activeProjectScripts || !!activeProjectName;

  return (
    // Named container so child classes can use @[px]/popout-header: variants.
    <div className="@container/popout-header flex min-w-0 items-center gap-2">
      {/* ── Left: new-thread button ─────────────────────────────────────── */}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="New thread"
              className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              onClick={handleNewThread}
            />
          }
        >
          <SquarePenIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom" sideOffset={4}>
          New thread
        </TooltipPopup>
      </Tooltip>

      {/* ── Centre: thread title ─────────────────────────────────────────── */}
      <h2
        className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground"
        title={activeThreadTitle}
      >
        {activeThreadTitle}
      </h2>

      {/* ── Right: controls + close ──────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1">
        {executionStatusLabel ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <div
                  className={
                    executionStatusTone === "danger"
                      ? "max-w-[10rem] truncate rounded-md border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700"
                      : executionStatusTone === "warning"
                        ? "max-w-[10rem] truncate rounded-md border border-sky-500/60 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-700"
                        : "max-w-[10rem] truncate rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground"
                  }
                />
              }
            >
              {executionStatusLabel}
            </TooltipTrigger>
            {executionStatusDetail ? (
              <TooltipPopup side="bottom">{executionStatusDetail}</TooltipPopup>
            ) : null}
          </Tooltip>
        ) : null}
        {canStopExecution ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  aria-label="Stop active turn"
                  className="shrink-0 border-rose-500/40 px-2 text-rose-600 hover:border-rose-500 hover:bg-rose-500/10 hover:text-rose-700"
                  onClick={onStopExecution}
                >
                  <SquareIcon className="size-3 fill-current" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Interrupt the active turn</TooltipPopup>
          </Tooltip>
        ) : null}
        {/*
         * Secondary controls — shown inline when the container is ≥ 560 px.
         * display:contents makes the wrapper invisible to layout while still
         * rendering its children into the parent flex context.
         */}
        {hasSecondaryControls && (
          <div className="hidden @[560px]/popout-header:contents">
            <SecondaryControls {...secondaryProps} />
          </div>
        )}

        {/* Preview toggle — always visible */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="relative shrink-0"
                pressed={previewOpen}
                onPressedChange={onTogglePreview}
                aria-label="Toggle preview panel"
                variant="outline"
                size="xs"
                disabled={!previewAvailable}
              />
            }
          >
            <MonitorPlayIcon className="size-3" />
            {hasRunningPreviewApp && (
              <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-green-500" />
            )}
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {!previewAvailable
              ? "Preview unavailable — no active project."
              : previewOpen
                ? "Close preview panel"
                : "Open preview panel"}
          </TooltipPopup>
        </Tooltip>

        {/* Terminal toggle — always visible */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={terminalOpen}
                onPressedChange={onToggleTerminal}
                aria-label="Toggle terminal drawer"
                variant="outline"
                size="xs"
                disabled={!terminalAvailable}
              />
            }
          >
            <TerminalSquareIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {!terminalAvailable
              ? "Terminal unavailable — no active project."
              : terminalToggleShortcutLabel
                ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                : "Toggle terminal drawer"}
          </TooltipPopup>
        </Tooltip>

        {/* Diff toggle — always visible */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Toggle
                className="shrink-0"
                pressed={diffOpen}
                onPressedChange={onToggleDiff}
                aria-label="Toggle diff panel"
                variant="outline"
                size="xs"
                disabled={!isGitRepo}
              />
            }
          >
            <DiffIcon className="size-3" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {!isGitRepo
              ? "Diff unavailable — not a git repository."
              : diffToggleShortcutLabel
                ? `Toggle diff panel (${diffToggleShortcutLabel})`
                : "Toggle diff panel"}
          </TooltipPopup>
        </Tooltip>

        {/*
         * Overflow popover — visible when the container is < 560 px and there
         * are secondary controls to overflow into. Clicking it opens a panel
         * containing the secondary controls so they're never unreachable.
         */}
        {hasSecondaryControls && (
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-label="More controls"
                        className="flex shrink-0 @[560px]/popout-header:hidden"
                      />
                    }
                  >
                    <EllipsisIcon className="size-3" />
                  </PopoverTrigger>
                }
              />
              <TooltipPopup side="bottom">More controls</TooltipPopup>
            </Tooltip>
            <PopoverPopup side="bottom" align="end" sideOffset={6} className="min-w-48">
              <div className="flex flex-wrap items-center gap-1">
                <SecondaryControls {...secondaryProps} />
              </div>
            </PopoverPopup>
          </Popover>
        )}

        {/* Close popout — always visible, always at the far right */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Close popout window"
                className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                onClick={onClose}
              />
            }
          >
            <XIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="bottom" sideOffset={4}>
            Close popout
          </TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
});
