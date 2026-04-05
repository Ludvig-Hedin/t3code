/**
 * AppPageHeader — the Electron drag-region header bar used on every page.
 *
 * Responsibilities:
 *  - Provides the h-[52px] drag region with correct traffic-light clearance.
 *  - Renders the sidebar toggle + new-thread + search buttons when the
 *    sidebar is collapsed (so the user always has access to them).
 *  - Optionally renders a ← Back button (for sub-pages like Settings / Skills).
 *  - Accepts children for page title / right-side actions.
 *
 * Usage (standalone page header):
 *   <AppPageHeader>
 *     <span className="text-xs font-medium text-muted-foreground/70">Settings</span>
 *     <div className="ms-auto …">…right actions…</div>
 *   </AppPageHeader>
 *
 *   <AppPageHeader showBack>
 *     <span>Settings</span>
 *   </AppPageHeader>
 *
 * Usage (embedding only the leading controls in a custom header):
 *   import { AppPageHeaderLeading } from "./AppPageHeader";
 *   <header …>
 *     <AppPageHeaderLeading />
 *     <ChatHeader … />
 *   </header>
 */
import { ArrowLeftIcon } from "lucide-react";
import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { isElectron } from "../env";
import { SidebarCollapsedControls } from "./SidebarCollapsedControls";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

interface AppPageHeaderProps {
  /** Renders a ← back button that navigates to "/" */
  showBack?: boolean;
  children?: ReactNode;
}

const btnClass =
  "flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

/** Back button — navigates to the root chat view. */
function BackButton() {
  const navigate = useNavigate();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Go back"
            className={btnClass}
            onClick={() => void navigate({ to: "/" })}
          >
            <ArrowLeftIcon className="size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom" sideOffset={4}>
        Back to threads
      </TooltipPopup>
    </Tooltip>
  );
}

/**
 * The leading controls strip for embedding in a custom header (e.g. ChatView).
 * Renders the collapsed-sidebar toggle + new-thread + search buttons,
 * plus an optional back button.
 */
export function AppPageHeaderLeading({ showBack = false }: { showBack?: boolean }) {
  return (
    <>
      <SidebarCollapsedControls />
      {showBack && <BackButton />}
    </>
  );
}

/**
 * Full drag-region header bar for Electron pages.
 * Returns null on non-Electron (web) builds.
 */
export function AppPageHeader({ showBack = false, children }: AppPageHeaderProps) {
  if (!isElectron) return null;

  return (
    <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
      <SidebarCollapsedControls />
      {showBack && <BackButton />}
      {children}
    </div>
  );
}
