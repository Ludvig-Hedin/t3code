import { useEffect, type ReactNode } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail, useSidebar } from "./ui/sidebar";
import { isElectron, isMobileWebView } from "../env";
import { useMobileHeartbeat } from "../hooks/useMobileHeartbeat";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { isTerminalFocused } from "../lib/terminalFocus";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { resolveSidebarNewThreadEnvMode } from "./Sidebar.logic";
import { useSettings } from "../hooks/useSettings";
import { useServerKeybindings } from "../rpc/serverState";
import { ThreadId } from "@t3tools/contracts";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // Keeps the mobile device's lastSeenAt alive so the desktop shows "Live now".
  useMobileHeartbeat();

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "open-settings") return;
      void navigate({ to: "/settings" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <SidebarCollapseEffect />
      {/*
       * GlobalShortcutsHandler is mounted here (not inside _chat.tsx) so that
       * chat.new / chat.newLocal shortcuts work from every page — settings,
       * automations, skills, plugins, etc. — not just the thread view.
       */}
      <GlobalShortcutsHandler />
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
        resizable={{
          minWidth: THREAD_SIDEBAR_MIN_WIDTH,
          shouldAcceptWidth: ({ nextWidth, wrapper }) =>
            wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
          storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}

/**
 * Registers window-level keyboard shortcuts that must be available from any page
 * (chat, settings, automations, skills, plugins, etc.).
 *
 * Previously lived in `_chat.tsx` as `ChatRouteGlobalShortcuts`, which meant the
 * shortcuts silently stopped working whenever the user navigated away from a
 * thread route. Lifted here so it is always mounted.
 */
function GlobalShortcutsHandler() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadIdsSize = useThreadSelectionStore((state) => state.selectedThreadIds.size);
  const { activeDraftThread, activeThread, defaultProjectId, handleNewThread, routeThreadId } =
    useHandleNewThread();
  const keybindings = useServerKeybindings();
  // routeThreadId is null on non-thread pages; selectThreadTerminalState handles null gracefully.
  const routeThreadIdForTerminal = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadIdForTerminal
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadIdForTerminal)
          .terminalOpen
      : false,
  );
  const appSettings = useSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && selectedThreadIdsSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      // When not on a thread page activeThread/activeDraftThread are null; fall
      // back to defaultProjectId so the shortcut still opens a new thread.
      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? defaultProjectId;
      if (!projectId) return;

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          envMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
        });
        return;
      }

      if (command === "chat.new") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId, {
          branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
          worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
          envMode:
            activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
        });
        return;
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    appSettings.defaultThreadEnvMode,
    clearSelection,
    defaultProjectId,
    handleNewThread,
    keybindings,
    selectedThreadIdsSize,
    terminalOpen,
  ]);

  return null;
}

/**
 * Toggles `data-sidebar-collapsed` on <body> while the sidebar is collapsed
 * in the Electron app so that CSS can push all drag-region headers clear of
 * the macOS traffic-light buttons (~90 px) without touching every route file.
 */
function SidebarCollapseEffect() {
  const { open, openMobile } = useSidebar();
  // On Electron we track the desktop open state (sidebar panel visible/hidden).
  // On iOS WKWebView we track openMobile (the Sheet drawer open/closed), because
  // the desktop `open` state stays true (defaultOpen) while the Sheet is visually closed.
  const collapsed = isElectron ? !open : isMobileWebView ? !openMobile : false;

  useEffect(() => {
    if (collapsed) {
      document.body.setAttribute("data-sidebar-collapsed", "");
    } else {
      document.body.removeAttribute("data-sidebar-collapsed");
    }
    return () => {
      document.body.removeAttribute("data-sidebar-collapsed");
    };
  }, [collapsed]);

  return null;
}
