import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail, useSidebar } from "./ui/sidebar";
import { isElectron, isMobileWebView } from "../env";
import { useMobileHeartbeat } from "../hooks/useMobileHeartbeat";

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
 * Toggles `data-sidebar-collapsed` on <body> while the sidebar is collapsed
 * in the Electron app so that CSS can push all drag-region headers clear of
 * the macOS traffic-light buttons (~90 px) without touching every route file.
 */
function SidebarCollapseEffect() {
  const { open } = useSidebar();
  const collapsed = (isElectron || isMobileWebView) && !open;

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
