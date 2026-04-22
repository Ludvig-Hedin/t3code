/**
 * CodeReviewControl - Manual code review trigger in the chat header.
 *
 * Clicking the review button opens a popover where the user can adjust the fix
 * mode, then dispatches a specially-crafted agent turn that embeds the current
 * git diff as the review prompt. Each review runs in a brand-new thread so that
 * stale/broken active-session state never causes a "No conversation found" error.
 *
 * For "auto-fix" mode a follow-up fix turn is dispatched automatically once
 * the review turn completes.
 */
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type CodeReviewFixMode,
  type ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheckIcon, LoaderIcon } from "lucide-react";
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
import { useSettings } from "~/hooks/useSettings";
import { buildCodeReviewPrompt, runtimeModeForFixMode } from "~/lib/codeReview";
import { ensureNativeApi } from "~/nativeApi";
import { useStore } from "~/store";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";

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
  const navigate = useNavigate();

  // Local override inside the popover; resets to settings value each open
  const [localFixMode, setLocalFixMode] = useState<CodeReviewFixMode>(fixModeFromSettings);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Tracks the review turn ID so auto-fix can detect when it completes.
  // After navigating to the review thread, activeThreadId will equal the review
  // thread ID, so latestTurn below will track the correct thread automatically.
  const pendingAutoFixTurnId = useRef<string | null>(null);

  // Read the active thread to obtain project/model/branch metadata for new
  // thread creation, and to track latestTurn for the auto-fix sentinel logic.
  const activeThread = useStore((s) => s.threads.find((t) => t.id === activeThreadId));
  const latestTurn = activeThread?.latestTurn;

  // Sync local fix mode whenever the popover opens or settings change
  useEffect(() => {
    if (popoverOpen) {
      setLocalFixMode(fixModeFromSettings);
      setReviewError(null);
    }
  }, [popoverOpen, fixModeFromSettings]);

  // ── Auto-fix follow-up ────────────────────────────────────────────
  // After an "auto-fix" review turn completes, dispatch a second fix turn to
  // the same (now active) thread — which is the review thread after navigation.
  useEffect(() => {
    const sentinel = pendingAutoFixTurnId.current;
    if (!sentinel || sentinel === "__waiting__") return;
    if (latestTurn?.turnId === sentinel && latestTurn.state === "completed") {
      pendingAutoFixTurnId.current = null;

      const api = ensureNativeApi();
      void api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        // activeThreadId is now the review thread (updated after navigation).
        threadId: activeThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: "Please fix all the issues you just identified in the code review.",
          attachments: [],
        },
        // Full access is needed for the agent to actually edit files
        runtimeMode: "full-access",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
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
    if (!gitCwd || !activeThread) return;
    setPopoverOpen(false);
    setIsReviewing(true);
    setReviewError(null);

    try {
      const api = ensureNativeApi();

      // 1. Fetch diff context from the server
      const ctx = await api.git.prepareReviewContext({ cwd: gitCwd });

      // 2. Build the review prompt
      const prompt = buildCodeReviewPrompt(ctx, localFixMode);

      // 3. Dispatch the review agent turn into a BRAND-NEW thread.
      //    Using bootstrap.createThread avoids reusing any stale/broken session
      //    that could cause "No conversation found with session ID: ..." errors.
      const reviewThreadId = newThreadId();
      const createdAt = new Date().toISOString();
      const runtimeMode = runtimeModeForFixMode(localFixMode);

      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: reviewThreadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: prompt,
          attachments: [],
        },
        runtimeMode,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        createdAt,
        bootstrap: {
          createThread: {
            projectId: activeThread.projectId,
            title: "Code Review",
            // Inherit model from the current thread so the review uses the
            // same provider the user has already configured.
            modelSelection: activeThread.modelSelection,
            runtimeMode,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: activeThread.branch ?? null,
            worktreePath: activeThread.worktreePath ?? null,
            createdAt,
          },
        },
      });

      // 4. Navigate to the review thread so the user can watch results stream in.
      void navigate({ to: "/$threadId", params: { threadId: reviewThreadId } });

      // 5. For auto-fix, register "__waiting__" — after navigation activeThreadId
      //    becomes reviewThreadId, so the sentinel useEffect tracks the correct turn.
      if (localFixMode === "auto-fix") {
        pendingAutoFixTurnId.current = "__waiting__";
      }
    } catch (error) {
      console.error("[CodeReviewControl] Failed to dispatch review turn:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
      setReviewError(message);
    } finally {
      setIsReviewing(false);
    }
  }, [gitCwd, localFixMode, activeThread, navigate]);

  // Also require activeThread (provides project/model metadata for new thread creation)
  const disabled = !isGitRepo || !gitCwd || isReviewing || !activeThread;

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger
        render={
          <Button
            className="shrink-0 px-2"
            aria-label="Run code review"
            variant="outline"
            size="xs"
            disabled={disabled}
            title={
              !isGitRepo
                ? "Code review is unavailable because this project is not a git repository."
                : isReviewing
                  ? "Review in progress…"
                  : "Run code review"
            }
          />
        }
      >
        {isReviewing ? (
          <LoaderIcon className="size-3 animate-spin" />
        ) : (
          <ClipboardCheckIcon className="size-3" />
        )}
        <span className="text-[10px]">Review</span>
      </PopoverTrigger>

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
            <ClipboardCheckIcon className="mr-1.5 size-3.5" />
            Run Review
          </Button>

          {/* Show a clear error message if the last review dispatch failed */}
          {reviewError && (
            <p className="text-[11px] text-destructive leading-tight">⚠ {reviewError}</p>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
