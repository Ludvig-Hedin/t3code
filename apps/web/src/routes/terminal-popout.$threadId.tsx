/**
 * /terminal-popout/:threadId — renders a full-screen terminal for a thread in
 * a dedicated popout window. Terminal state (tabs, splits) is managed locally
 * and isolated from the main window to avoid cross-window state collisions.
 *
 * Opened by the popout button (ExternalLink icon) inside ThreadTerminalDrawer.
 */
import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ThreadTerminalDrawer from "../components/ThreadTerminalDrawer";
import { readNativeApi } from "../nativeApi";
import { useProjectById, useThreadById } from "../storeSelectors";
import { useStore } from "../store";
import {
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
} from "../types";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { randomUUID } from "~/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Local terminal state (isolated from main-window useTerminalStateStore)
// ──────────────────────────────────────────────────────────────────────────────

interface LocalTerminalState {
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
}

function makeInitialLocalTerminalState(): LocalTerminalState {
  const id = DEFAULT_THREAD_TERMINAL_ID;
  const groupId = `group-${id}`;
  return {
    terminalIds: [id],
    activeTerminalId: id,
    terminalGroups: [{ id: groupId, terminalIds: [id] }],
    activeTerminalGroupId: groupId,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Route component
// ──────────────────────────────────────────────────────────────────────────────

function TerminalPopoutRouteView() {
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const navigate = useNavigate();

  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const serverThread = useThreadById(threadId);
  const project = useProjectById(serverThread?.projectId);

  const cwd = useMemo(
    () =>
      project
        ? projectScriptCwd({
            project: { cwd: project.cwd },
            worktreePath: serverThread?.worktreePath ?? null,
          })
        : null,
    [project, serverThread?.worktreePath],
  );

  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({
            project: { cwd: project.cwd },
            worktreePath: serverThread?.worktreePath ?? null,
          })
        : {},
    [project, serverThread?.worktreePath],
  );

  // Local terminal state — not shared with the main window.
  const [localState, setLocalState] = useState<LocalTerminalState>(makeInitialLocalTerminalState);
  const localStateRef = useRef(localState);
  useEffect(() => {
    localStateRef.current = localState;
  }, [localState]);

  // Full-screen height tracking — update when the popout window is resized.
  const [windowHeight, setWindowHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 640,
  );
  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Redirect if the thread no longer exists after bootstrap.
  useEffect(() => {
    if (!bootstrapComplete) return;
    if (!serverThread) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, serverThread]);

  // ── Terminal management callbacks ────────────────────────────────────────

  const splitTerminal = useCallback(() => {
    setLocalState((prev) => {
      const activeGroupIndex = prev.terminalGroups.findIndex((g) =>
        g.terminalIds.includes(prev.activeTerminalId),
      );
      if (activeGroupIndex === -1) return prev;
      const activeGroup = prev.terminalGroups[activeGroupIndex]!;
      if (activeGroup.terminalIds.length >= MAX_TERMINALS_PER_GROUP) return prev;
      const newId = `terminal-${randomUUID()}`;
      const updatedGroup: ThreadTerminalGroup = {
        ...activeGroup,
        terminalIds: [...activeGroup.terminalIds, newId],
      };
      const nextGroups = [...prev.terminalGroups];
      nextGroups[activeGroupIndex] = updatedGroup;
      return {
        ...prev,
        terminalIds: [...prev.terminalIds, newId],
        activeTerminalId: newId,
        terminalGroups: nextGroups,
      };
    });
  }, []);

  const createNewTerminal = useCallback(() => {
    const newId = `terminal-${randomUUID()}`;
    const groupId = `group-${newId}`;
    setLocalState((prev) => ({
      ...prev,
      terminalIds: [...prev.terminalIds, newId],
      activeTerminalId: newId,
      terminalGroups: [...prev.terminalGroups, { id: groupId, terminalIds: [newId] }],
      activeTerminalGroupId: groupId,
    }));
  }, []);

  const activateTerminal = useCallback((terminalId: string) => {
    setLocalState((prev) => {
      const group = prev.terminalGroups.find((g) => g.terminalIds.includes(terminalId));
      return {
        ...prev,
        activeTerminalId: terminalId,
        ...(group ? { activeTerminalGroupId: group.id } : {}),
      };
    });
  }, []);

  const closeTerminal = useCallback(
    (terminalId: string) => {
      const api = readNativeApi();
      if (api) {
        const isFinalTerminal = localStateRef.current.terminalIds.length <= 1;
        const fallbackExitWrite = () =>
          api.terminal.write({ threadId, terminalId, data: "exit\n" }).catch(() => undefined);

        if ("close" in api.terminal && typeof api.terminal.close === "function") {
          void (async () => {
            if (isFinalTerminal) {
              await api.terminal.clear({ threadId, terminalId }).catch(() => undefined);
            }
            await api.terminal.close({ threadId, terminalId, deleteHistory: true });
          })().catch(() => fallbackExitWrite());
        } else {
          void fallbackExitWrite();
        }

        // Close the popout window when the last terminal is gone.
        if (isFinalTerminal) {
          window.close();
          return;
        }
      }

      setLocalState((prev) => {
        const remainingIds = prev.terminalIds.filter((id) => id !== terminalId);
        if (remainingIds.length === 0) return prev;
        const nextActive =
          prev.activeTerminalId === terminalId
            ? (remainingIds[remainingIds.length - 1] ?? prev.activeTerminalId)
            : prev.activeTerminalId;
        const nextGroups = prev.terminalGroups
          .map((g) => ({ ...g, terminalIds: g.terminalIds.filter((id) => id !== terminalId) }))
          .filter((g) => g.terminalIds.length > 0);
        const activeGroup = nextGroups.find((g) => g.terminalIds.includes(nextActive));
        return {
          ...prev,
          terminalIds: remainingIds,
          activeTerminalId: nextActive,
          terminalGroups: nextGroups,
          activeTerminalGroupId: activeGroup?.id ?? nextGroups[0]?.id ?? prev.activeTerminalGroupId,
        };
      });
    },
    [threadId],
  );

  if (!bootstrapComplete || !cwd) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground text-sm">
        Connecting…
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <ThreadTerminalDrawer
        threadId={threadId}
        cwd={cwd}
        worktreePath={serverThread?.worktreePath ?? null}
        runtimeEnv={runtimeEnv}
        visible
        height={windowHeight}
        terminalIds={localState.terminalIds}
        activeTerminalId={localState.activeTerminalId}
        terminalGroups={localState.terminalGroups}
        activeTerminalGroupId={localState.activeTerminalGroupId}
        focusRequestId={0}
        onSplitTerminal={splitTerminal}
        onNewTerminal={createNewTerminal}
        onActiveTerminalChange={activateTerminal}
        onCloseTerminal={closeTerminal}
        onHeightChange={() => {
          // No-op in the popout — height is always the full window.
        }}
        onAddTerminalContext={() => {
          // No-op — there is no composer to add context to in a popout window.
        }}
        unconstrained
      />
    </div>
  );
}

export const Route = createFileRoute("/terminal-popout/$threadId")({
  component: TerminalPopoutRouteView,
});
