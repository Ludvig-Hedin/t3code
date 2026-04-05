/**
 * CodeReviewControl - Manual code review trigger in the chat header.
 *
 * Clicking the review button opens a popover where the user can adjust the fix
 * mode, then dispatches a specially-crafted agent turn that embeds the current
 * git diff as the review prompt. Results stream into the active thread naturally.
 *
 * For "auto-fix" mode a follow-up fix turn is dispatched automatically once
 * the review turn completes.
 */
import { type CodeReviewFixMode, type ThreadId } from "@t3tools/contracts";
import { LoaderIcon, ScanSearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Toggle } from "~/components/ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useSettings } from "~/hooks/useSettings";
import { buildCodeReviewPrompt, runtimeModeForFixMode } from "~/lib/codeReview";
import { ensureNativeApi } from "~/nativeApi";
import { useStore } from "~/store";
import { newCommandId, newMessageId } from "~/lib/utils";

interface CodeReviewControlProps {
  gitCwd: string | null;
  activeThreadId: ThreadId;
  isGitRepo: boolean;
}

const FIX_MODE_LABELS: Record<CodeReviewFixMode, string> = {
  "review-only": "Review only",
  "auto-fix": "Auto-fix",
  "agent-decides": "Agent decides",
};

// ── Component ─────────────────────────────────────────────────────────

export function CodeReviewControl({ gitCwd, activeThreadId, isGitRepo }: CodeReviewControlProps) {
  const settings = useSettings();
  const fixModeFromSettings = settings.codeReview.fixMode;

  // Local override inside the popover; resets to settings value each open
  const [localFixMode, setLocalFixMode] = useState<CodeReviewFixMode>(fixModeFromSettings);
  const [isReviewing, setIsReviewing] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Tracks the review turn ID so auto-fix can detect when it completes
  const pendingAutoFixTurnId = useRef<string | null>(null);

  // Read the active thread from store so we can watch latestTurn state
  const latestTurn = useStore((s) => s.threads.find((t) => t.id === activeThreadId)?.latestTurn);

  // Sync local fix mode whenever the popover opens or settings change
  useEffect(() => {
    if (popoverOpen) {
      setLocalFixMode(fixModeFromSettings);
    }
  }, [popoverOpen, fixModeFromSettings]);

  // ── Auto-fix follow-up ────────────────────────────────────────────
  // After an "auto-fix" review turn completes, dispatch a second fix turn.
  useEffect(() => {
    const sentinel = pendingAutoFixTurnId.current;
    if (!sentinel || sentinel === "__waiting__") return;
    if (latestTurn?.turnId === sentinel && latestTurn.state === "completed") {
      pendingAutoFixTurnId.current = null;

      const api = ensureNativeApi();
      void api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: activeThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: "Please fix all the issues you just identified in the code review.",
          attachments: [],
        },
        // Full access is needed for the agent to actually edit files
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      });
    }
  }, [latestTurn, activeThreadId]);

  // Once the new review turn starts, replace the "__waiting__" sentinel with its real ID
  useEffect(() => {
    if (pendingAutoFixTurnId.current !== "__waiting__") return;
    if (latestTurn?.turnId) {
      pendingAutoFixTurnId.current = latestTurn.turnId;
    }
  }, [latestTurn?.turnId]);

  // ── Trigger review ────────────────────────────────────────────────
  const handleRunReview = useCallback(async () => {
    if (!gitCwd) return;
    setPopoverOpen(false);
    setIsReviewing(true);

    try {
      const api = ensureNativeApi();

      // 1. Fetch diff context from the server
      const ctx = await api.git.prepareReviewContext({ cwd: gitCwd });

      // 2. Build the review prompt
      const prompt = buildCodeReviewPrompt(ctx, localFixMode);

      // 3. Dispatch the review agent turn
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: activeThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
          attachments: [],
        },
        runtimeMode: runtimeModeForFixMode(localFixMode),
        interactionMode: "default",
        createdAt: new Date().toISOString(),
      });

      // 4. For auto-fix, register "__waiting__" — the sentinel useEffect above
      //    replaces this with the real turn ID once it appears in latestTurn.
      if (localFixMode === "auto-fix") {
        pendingAutoFixTurnId.current = "__waiting__";
      }
    } catch (error) {
      console.error("[CodeReviewControl] Failed to dispatch review turn:", error);
    } finally {
      setIsReviewing(false);
    }
  }, [gitCwd, localFixMode, activeThreadId]);

  const disabled = !isGitRepo || !gitCwd || isReviewing;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Toggle
                  className="shrink-0"
                  pressed={popoverOpen}
                  aria-label="Run code review"
                  variant="outline"
                  size="xs"
                  disabled={disabled}
                />
              }
            />
          }
        >
          {isReviewing ? (
            <LoaderIcon className="size-3 animate-spin" />
          ) : (
            <ScanSearchIcon className="size-3" />
          )}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          {!isGitRepo
            ? "Code review is unavailable because this project is not a git repository."
            : isReviewing
              ? "Review in progress…"
              : "Run code review"}
        </TooltipPopup>
      </Tooltip>

      <PopoverPopup side="bottom" align="end">
        <div className="space-y-3 px-1">
          <div>
            <p className="text-xs font-medium text-foreground">Code Review</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Choose how the agent handles issues it finds.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Fix mode
            </label>
            <Select
              value={localFixMode}
              onValueChange={(v) => setLocalFixMode(v as CodeReviewFixMode)}
            >
              <SelectTrigger className="w-full text-xs" size="sm">
                <SelectValue>{FIX_MODE_LABELS[localFixMode]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="review-only">Review only</SelectItem>
                <SelectItem value="auto-fix">Auto-fix</SelectItem>
                <SelectItem value="agent-decides">Agent decides</SelectItem>
              </SelectPopup>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {localFixMode === "review-only" && "List findings in chat. You decide what to fix."}
              {localFixMode === "auto-fix" && "Review findings first, then auto-start a fix turn."}
              {localFixMode === "agent-decides" && "Review and fix everything in one turn."}
            </p>
          </div>

          <Button size="sm" className="w-full" onClick={handleRunReview} disabled={disabled}>
            <ScanSearchIcon className="mr-1.5 size-3.5" />
            Run Review
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
