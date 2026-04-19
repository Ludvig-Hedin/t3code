/**
 * FilesPanel — VS Code–style files browser that lives side-by-side with chat.
 *
 * Phase 2 renders only the panel chrome (header + empty body) so the toggle
 * and mount path can ship independently. The tree (phase 3), editor (phase 4),
 * search (phase 5), and context menu (phase 6) slot into the marked regions
 * below.
 */
import { XIcon } from "lucide-react";

import { useFilesPanelStore } from "~/filesPanelStore";

import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";

export interface FilesPanelProps {
  mode: DiffPanelMode;
}

export default function FilesPanel({ mode }: FilesPanelProps) {
  const setOpen = useFilesPanelStore((s) => s.setOpen);

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="text-sm font-medium text-foreground">Files</span>
            {/* Placeholder — phase 5 replaces this slot with the name/content search input. */}
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
      {/*
        Phase 3 mounts the lazy FilesPanelTree here; phase 5 swaps between the
        tree view and the search-results view based on `searchQuery`.
      */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
        Files tree coming soon.
      </div>
    </DiffPanelShell>
  );
}
