/**
 * Renders the sidebar toggle + new-thread + search icon buttons as INLINE
 * flex children inside each page's drag-region header row when the sidebar is
 * collapsed on the Electron desktop app.
 *
 * Being inline (not fixed/portal) means the buttons take up real horizontal
 * space and naturally push the page title to the right — no CSS hacks needed.
 *
 * Returns null when the sidebar is open or when running in the browser.
 */
import { PanelLeftIcon, SearchIcon, SquarePenIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { isMacPlatform } from "../lib/utils";
import { useSearchModalStore } from "../searchModalStore";
import { useServerKeybindings } from "../rpc/serverState";
import { shortcutLabelForCommand } from "../keybindings";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { useSidebar } from "./ui/sidebar";

/** Shared icon-button style — matches the new-thread/search buttons in the sidebar. */
const btnClass =
  "flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

export function SidebarCollapsedControls() {
  const { open, toggleSidebar } = useSidebar();
  const navigate = useNavigate();
  const setSearchOpen = useSearchModalStore((s) => s.setOpen);
  const keybindings = useServerKeybindings();

  // Only render in the Electron app when the sidebar is collapsed
  if (!isElectron || open) return null;

  const isMac = isMacPlatform(navigator.platform);

  const newThreadLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", { platform: navigator.platform }) ??
    shortcutLabelForCommand(keybindings, "chat.new", { platform: navigator.platform });

  return (
    <div className="flex shrink-0 items-center gap-0.5 self-stretch">
      {/* Toggle sidebar */}
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

      {/* New thread */}
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

      {/* Search */}
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
    </div>
  );
}
