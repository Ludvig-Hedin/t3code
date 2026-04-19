/**
 * FilesPanel — VS Code–style files browser that lives side-by-side with chat.
 *
 * Phase 3 wires the lazy-loaded tree. Phase 4 adds the editor pane; phase 5
 * adds name/contents search. Phase 6 layers in the context menu.
 */
import { XIcon } from "lucide-react";
import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";

import { ThreadId } from "@t3tools/contracts";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useFilesPanelStore } from "~/filesPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { useStore } from "~/store";

import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { FilesPanelTree } from "./files/FilesPanelTree";

export interface FilesPanelProps {
  mode: DiffPanelMode;
}

export default function FilesPanel({ mode }: FilesPanelProps) {
  const setOpen = useFilesPanelStore((s) => s.setOpen);
  const setActivePath = useFilesPanelStore((s) => s.setActivePath);
  const activeRelativePath = useFilesPanelStore((s) => s.activeRelativePath);

  // Resolve the active cwd via the same thread → worktree / project.cwd chain
  // that DiffPanel uses so behaviour stays consistent when a thread has a
  // worktree attached.
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const activeThread = useStore((store) =>
    routeThreadId ? store.threads.find((thread) => thread.id === routeThreadId) : undefined,
  );
  const activeDraftThread = useComposerDraftStore((store) =>
    routeThreadId ? (store.draftThreadsByThreadId[routeThreadId] ?? null) : null,
  );
  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const activeProject = useStore((store) =>
    activeProjectId ? store.projects.find((project) => project.id === activeProjectId) : undefined,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;

  const { resolvedTheme } = useTheme();

  const handleOpenFile = useCallback(
    (relativePath: string) => {
      setActivePath(relativePath);
      // Phase 4 will load the file contents into the editor pane; for now we
      // only update the selection so the highlight moves.
    },
    [setActivePath],
  );

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-sm font-medium text-foreground">Files</span>
            {/* Phase 5 replaces this slot with the name/content search input. */}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Close Files panel"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </>
      }
    >
      {activeCwd ? (
        <FilesPanelTree
          cwd={activeCwd}
          activeRelativePath={activeRelativePath}
          resolvedTheme={resolvedTheme}
          onOpenFile={handleOpenFile}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
          No active workspace.
        </div>
      )}
    </DiffPanelShell>
  );
}
