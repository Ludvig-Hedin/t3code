import type { RuntimeMode, ThreadId } from "@t3tools/contracts";
import { FolderIcon, GitForkIcon, LockIcon, LockOpenIcon } from "lucide-react";
import { useCallback } from "react";

import { newCommandId } from "../lib/utils";
import { readNativeApi } from "../nativeApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import {
  EnvMode,
  resolveDraftEnvModeAfterBranchChange,
  resolveEffectiveEnvMode,
} from "./BranchToolbar.logic";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import { Button } from "./ui/button";
import { RateLimitsButton } from "./chat/RateLimitsButton";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const envModeItems = [
  { value: "local", label: "Local" },
  { value: "worktree", label: "New worktree" },
] as const;

interface BranchToolbarProps {
  threadId: ThreadId;
  isGitRepo: boolean;
  onEnvModeChange: (mode: EnvMode) => void;
  envLocked: boolean;
  runtimeMode: RuntimeMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
}

export default function BranchToolbar({
  threadId,
  isGitRepo,
  onEnvModeChange,
  envLocked,
  runtimeMode,
  onRuntimeModeChange,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
}: BranchToolbarProps) {
  const threads = useStore((store) => store.threads);
  const projects = useStore((store) => store.projects);
  const setThreadBranchAction = useStore((store) => store.setThreadBranch);
  const draftThread = useComposerDraftStore((store) => store.getDraftThread(threadId));
  const setDraftThreadContext = useComposerDraftStore((store) => store.setDraftThreadContext);

  const serverThread = threads.find((thread) => thread.id === threadId);
  const activeProjectId = serverThread?.projectId ?? draftThread?.projectId ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeThreadId = serverThread?.id ?? (draftThread ? threadId : undefined);
  const activeThreadBranch = serverThread?.branch ?? draftThread?.branch ?? null;
  const activeWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const branchCwd = activeWorktreePath ?? activeProject?.cwd ?? null;
  const hasServerThread = serverThread !== undefined;
  const effectiveEnvMode = resolveEffectiveEnvMode({
    activeWorktreePath,
    hasServerThread,
    draftThreadEnvMode: draftThread?.envMode,
  });

  const setThreadBranch = useCallback(
    (branch: string | null, worktreePath: string | null) => {
      if (!activeThreadId) return;
      const api = readNativeApi();
      // If the effective cwd is about to change, stop the running session so the
      // next message creates a new one with the correct cwd.
      if (serverThread?.session && worktreePath !== activeWorktreePath && api) {
        void api.orchestration
          .dispatchCommand({
            type: "thread.session.stop",
            commandId: newCommandId(),
            threadId: activeThreadId,
            createdAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }
      if (api && hasServerThread) {
        void api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: activeThreadId,
          branch,
          worktreePath,
        });
      }
      if (hasServerThread) {
        setThreadBranchAction(activeThreadId, branch, worktreePath);
        return;
      }
      const nextDraftEnvMode = resolveDraftEnvModeAfterBranchChange({
        nextWorktreePath: worktreePath,
        currentWorktreePath: activeWorktreePath,
        effectiveEnvMode,
      });
      setDraftThreadContext(threadId, {
        branch,
        worktreePath,
        envMode: nextDraftEnvMode,
      });
    },
    [
      activeThreadId,
      serverThread?.session,
      activeWorktreePath,
      hasServerThread,
      setThreadBranchAction,
      setDraftThreadContext,
      threadId,
      effectiveEnvMode,
    ],
  );

  if (!activeThreadId || !activeProject) return null;

  return (
    // data-branch-toolbar: targeted by CSS for iOS safe-area-inset-bottom clearance
    <div
      data-branch-toolbar="true"
      className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pb-3 pt-1"
    >
      <div className="flex items-center gap-0.5">
        {/* Env-mode selector (Local / Worktree) — only relevant when in a git repo */}
        {isGitRepo && (
          <>
            {envLocked || activeWorktreePath ? (
              <span className="inline-flex items-center gap-1 border border-transparent px-[calc(--spacing(3)-1px)] text-sm font-medium text-muted-foreground/70 sm:text-xs">
                {activeWorktreePath ? (
                  <>
                    <GitForkIcon className="size-3" />
                    Worktree
                  </>
                ) : (
                  <>
                    <FolderIcon className="size-3" />
                    Local
                  </>
                )}
              </span>
            ) : (
              <Select
                value={effectiveEnvMode}
                onValueChange={(value) => onEnvModeChange(value as EnvMode)}
                items={envModeItems}
              >
                <SelectTrigger variant="ghost" size="xs" className="font-medium">
                  {effectiveEnvMode === "worktree" ? (
                    <GitForkIcon className="size-3" />
                  ) : (
                    <FolderIcon className="size-3" />
                  )}
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="local">
                    <span className="inline-flex items-center gap-1.5">
                      <FolderIcon className="size-3" />
                      Local
                    </span>
                  </SelectItem>
                  <SelectItem value="worktree">
                    <span className="inline-flex items-center gap-1.5">
                      <GitForkIcon className="size-3" />
                      New worktree
                    </span>
                  </SelectItem>
                </SelectPopup>
              </Select>
            )}
            <Separator orientation="vertical" className="mx-0.5 h-3.5" />
          </>
        )}
        <RateLimitsButton />
        <Separator orientation="vertical" className="mx-0.5 h-3.5" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="h-auto shrink-0 gap-1 px-2 py-0.5 text-xs font-medium text-muted-foreground/70 hover:text-foreground/80"
                type="button"
                onClick={() =>
                  // Toolbar button toggles between full-access and approval-required;
                  // for "custom" mode, clicking goes back to full-access
                  onRuntimeModeChange(
                    runtimeMode === "full-access" ? "approval-required" : "full-access",
                  )
                }
              />
            }
          >
            {runtimeMode === "full-access" ? (
              <LockOpenIcon className="size-3" />
            ) : (
              <LockIcon className="size-3" />
            )}
            <span>
              {runtimeMode === "full-access"
                ? "Auto accept edits"
                : runtimeMode === "custom"
                  ? "Custom"
                  : "Ask permission"}
            </span>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {runtimeMode === "full-access"
              ? "Auto accept edits — click to require approvals"
              : runtimeMode === "custom"
                ? "Custom permissions — click for full access"
                : "Ask permission — click for full access"}
          </TooltipPopup>
        </Tooltip>
      </div>

      {/* Branch selector — hidden when not in a git repo */}
      {isGitRepo && (
        <BranchToolbarBranchSelector
          activeProjectCwd={activeProject.cwd}
          activeThreadBranch={activeThreadBranch}
          activeWorktreePath={activeWorktreePath}
          branchCwd={branchCwd}
          effectiveEnvMode={effectiveEnvMode}
          envLocked={envLocked}
          onSetThreadBranch={setThreadBranch}
          {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
          {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
        />
      )}
    </div>
  );
}
