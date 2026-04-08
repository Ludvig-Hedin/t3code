import { memo } from "react";
import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import type { EnterKeyBehavior } from "@t3tools/contracts/settings";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface PendingActionState {
  questionIndex: number;
  isLastQuestion: boolean;
  canAdvance: boolean;
  isResponding: boolean;
  isComplete: boolean;
}

interface ComposerPrimaryActionsProps {
  compact: boolean;
  pendingAction: PendingActionState | null;
  isRunning: boolean;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  isConnecting: boolean;
  isPreparingWorktree: boolean;
  hasSendableContent: boolean;
  enterKeyBehavior: EnterKeyBehavior;
  isMac: boolean;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
}

const formatPendingPrimaryActionLabel = (input: {
  compact: boolean;
  isLastQuestion: boolean;
  isResponding: boolean;
}) => {
  if (input.isResponding) {
    return "Submitting...";
  }
  if (input.compact) {
    return input.isLastQuestion ? "Submit" : "Next";
  }
  return input.isLastQuestion ? "Submit answers" : "Next question";
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
  compact,
  pendingAction,
  isRunning,
  showPlanFollowUpPrompt,
  promptHasText,
  isSendBusy,
  isConnecting,
  isPreparingWorktree,
  hasSendableContent,
  enterKeyBehavior,
  isMac,
  onPreviousPendingQuestion,
  onInterrupt,
  onImplementPlanInNewThread,
}: ComposerPrimaryActionsProps) {
  if (pendingAction) {
    return (
      <div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
        {pendingAction.questionIndex > 0 ? (
          compact ? (
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
              aria-label="Previous question"
            >
              <ChevronLeftIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={onPreviousPendingQuestion}
              disabled={pendingAction.isResponding}
            >
              Previous
            </Button>
          )
        ) : null}
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "px-3" : "px-4")}
          disabled={
            pendingAction.isResponding ||
            (pendingAction.isLastQuestion ? !pendingAction.isComplete : !pendingAction.canAdvance)
          }
        >
          {formatPendingPrimaryActionLabel({
            compact,
            isLastQuestion: pendingAction.isLastQuestion,
            isResponding: pendingAction.isResponding,
          })}
        </Button>
      </div>
    );
  }

  if (isRunning) {
    // Build the send shortcut label for the queue tooltip
    const queueShortcutLabel =
      enterKeyBehavior === "newline"
        ? isMac
          ? "Queue message (⌘↵)"
          : "Queue message (Ctrl+Enter)"
        : "Queue message (↵)";

    return (
      <div className="flex items-center gap-1.5">
        {/* Queue/send button — visible when composer has content, queues the message */}
        {hasSendableContent && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="submit"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-foreground/90 text-background transition-all duration-150 hover:bg-foreground hover:scale-105 sm:h-7 sm:w-7"
                  aria-label={queueShortcutLabel}
                />
              }
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </TooltipTrigger>
            <TooltipPopup side="top">{queueShortcutLabel}</TooltipPopup>
          </Tooltip>
        )}
        {/* Stop button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:bg-rose-500 hover:scale-105 sm:h-8 sm:w-8"
                onClick={onInterrupt}
                aria-label="Stop generation"
              />
            }
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="1.5" />
            </svg>
          </TooltipTrigger>
          <TooltipPopup side="top">Stop generation</TooltipPopup>
        </Tooltip>
      </div>
    );
  }

  if (showPlanFollowUpPrompt) {
    if (promptHasText) {
      return (
        <Button
          type="submit"
          size="sm"
          className={cn("rounded-full", compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8")}
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Refine"}
        </Button>
      );
    }

    return (
      <div data-chat-composer-implement-actions="true" className="flex items-center justify-end">
        <Button
          type="submit"
          size="sm"
          className={cn("h-9 rounded-l-full rounded-r-none sm:h-8", compact ? "px-3" : "px-4")}
          disabled={isSendBusy || isConnecting}
        >
          {isConnecting || isSendBusy ? "Sending..." : "Implement"}
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
                aria-label="Implementation actions"
                disabled={isSendBusy || isConnecting}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isSendBusy || isConnecting}
              onClick={() => void onImplementPlanInNewThread()}
            >
              Implement in a new thread
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    );
  }

  // Build dynamic tooltip label based on enter key behavior and platform
  const sendShortcutLabel =
    enterKeyBehavior === "newline"
      ? isMac
        ? "Send message (⌘↵)"
        : "Send message (Ctrl+Enter)"
      : "Send message (↵)";

  const statusLabel = isConnecting
    ? "Connecting"
    : isPreparingWorktree
      ? "Preparing worktree"
      : isSendBusy
        ? "Sending"
        : sendShortcutLabel;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="submit"
            className="flex h-9 w-9 enabled:cursor-pointer items-center justify-center rounded-full bg-foreground/90 text-background transition-all duration-150 hover:bg-foreground hover:scale-105 disabled:pointer-events-none disabled:opacity-30 disabled:hover:scale-100 sm:h-8 sm:w-8"
            disabled={isSendBusy || isConnecting || !hasSendableContent}
            aria-label={statusLabel}
          />
        }
      >
        {isConnecting || isSendBusy ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className="animate-spin"
            aria-hidden="true"
          >
            <circle
              cx="7"
              cy="7"
              r="5.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="20 12"
            />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">{statusLabel}</TooltipPopup>
    </Tooltip>
  );
});
