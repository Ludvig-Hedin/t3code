/**
 * Skills route — Renders the skills management page at /skills.
 *
 * Layout follows the same pattern as settings.tsx: SidebarInset wrapper
 * with a header bar and scrollable content area.
 */
import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { SkillsManager } from "../components/SkillsManager";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

function SkillsPageLayout() {
  // Escape key navigates back to the main chat view
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        window.history.back();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Skills</span>
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Skills
            </span>
          </div>
        )}

        <div className="min-h-0 flex flex-1 flex-col">
          <SkillsManager />
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/skills")({
  component: SkillsPageLayout,
});
