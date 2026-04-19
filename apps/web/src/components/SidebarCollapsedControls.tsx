/**
 * Renders the leading control strip inside every Electron page header:
 *
 *  - Sidebar toggle button — visible only when the sidebar is COLLAPSED,
 *    so it does not compete with the open sidebar.
 *  - New thread + Search — visible only when the sidebar is COLLAPSED,
 *    because when it is open those actions are already accessible in the
 *    sidebar panel.
 *
 * Returns null on non-Electron, non-mobile-webview builds.
 */
import { FolderIcon, PanelLeftIcon, SearchIcon, SquarePenIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { isElectron, isMobileWebView } from "../env";
import { isMacPlatform } from "../lib/utils";
import { useFilesPanelStore } from "../filesPanelStore";
import { useSearchModalStore } from "../searchModalStore";
import { useServerKeybindings } from "../rpc/serverState";
import { shortcutLabelForCommand } from "../keybindings";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useSidebar } from "./ui/sidebar";

/** Shared muted icon-button style — matches sidebar new-thread / search buttons. */
const btnClass =
  "flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

export function SidebarCollapsedControls() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const setSearchOpen = useSearchModalStore((s) => s.setOpen);
  const keybindings = useServerKeybindings();

  // Show on Electron desktop and in the iOS WKWebView (both need collapsed-sidebar controls).
  if (!isElectron && !isMobileWebView) return null;

  const isMac = isMacPlatform(navigator.platform);
  // On mobile the sidebar is a Sheet drawer controlled by openMobile, not the
  // desktop open state (which stays true). Read the correct state per platform.
  const sidebarCollapsed = isMobile ? !openMobile : !open;

  const newThreadLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", { platform: navigator.platform }) ??
    shortcutLabelForCommand(keybindings, "chat.new", { platform: navigator.platform });

  return (
    <div className="flex shrink-0 items-center gap-0.5 self-stretch">
      {/* Toggle + New thread + Search — only when the sidebar is collapsed. */}
      {sidebarCollapsed && (
        <>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Toggle sidebar"
                  className={btnClass}
                  onClick={toggleSidebar}
                >
                  <PanelLeftIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              Toggle sidebar ({isMac ? "⌘B" : "Ctrl+B"})
            </TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="New thread"
                  className={btnClass}
                  onClick={() => void navigate({ to: "/" })}
                >
                  <SquarePenIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              New thread{newThreadLabel ? ` (${newThreadLabel})` : ""}
            </TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Search"
                  className={btnClass}
                  onClick={() => setSearchOpen(true)}
                >
                  <SearchIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              Search ({isMac ? "⌘K" : "Ctrl+K"})
            </TooltipPopup>
          </Tooltip>

          {/* Files panel toggle — matches Cmd/Ctrl+Shift+E keybinding in Sidebar.tsx. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label="Toggle Files panel"
                  className={btnClass}
                  onClick={() => useFilesPanelStore.getState().toggle()}
                >
                  <FolderIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              Files ({isMac ? "⇧⌘E" : "Ctrl+Shift+E"})
            </TooltipPopup>
          </Tooltip>
        </>
      )}
    </div>
  );
}
