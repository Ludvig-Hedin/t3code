/**
 * FileTabs — horizontally-scrollable tab bar above the file editor.
 *
 * Behaviour:
 *  - Lists every open file from the files-panel store, in open order.
 *  - Clicking a tab activates it.
 *  - X on each tab closes it (activating the neighbour on close).
 *  - Dirty buffers are marked with a leading dot.
 *  - Mouse-wheel vertical scroll is translated to horizontal so trackpad users
 *    can flick through a long tab strip without shift-scrolling.
 */
import { FileTextIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { useFilesPanelStore } from "~/filesPanelStore";

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

export function FileTabs() {
  const openFiles = useFilesPanelStore((s) => s.openFiles);
  const activePath = useFilesPanelStore((s) => s.activeRelativePath);
  const dirtyByPath = useFilesPanelStore((s) => s.dirtyByPath);
  const setActivePath = useFilesPanelStore((s) => s.setActivePath);
  const closeFile = useFilesPanelStore((s) => s.closeFile);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view when it changes (e.g. Files list clicks).
  useEffect(() => {
    if (!activeTabRef.current) return;
    activeTabRef.current.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath]);

  if (openFiles.length === 0) return null;

  return (
    <div
      ref={scrollerRef}
      className="flex min-h-[34px] shrink-0 items-stretch overflow-x-auto border-b border-border/60 bg-card/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onWheel={(event) => {
        // Translate vertical wheel deltas into horizontal scroll so trackpad
        // users don't have to hold Shift. Only take over when vertical
        // movement dominates — otherwise a horizontal swipe should pass
        // through normally.
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.currentTarget.scrollLeft += event.deltaY;
        }
      }}
    >
      {openFiles.map((path) => {
        const isActive = path === activePath;
        const isDirty = Object.hasOwn(dirtyByPath, path);
        return (
          <button
            key={path}
            ref={isActive ? activeTabRef : undefined}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={path}
            onClick={() => setActivePath(path)}
            onMouseDown={(event) => {
              // Middle-click closes the tab — matches browser tab behaviour.
              if (event.button === 1) {
                event.preventDefault();
                closeFile(path);
              }
            }}
            className={[
              "group flex shrink-0 items-center gap-1.5 border-r border-border/60 px-3 text-xs transition-colors",
              isActive
                ? "bg-background text-foreground"
                : "text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground",
            ].join(" ")}
          >
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            <span className="max-w-[160px] truncate">
              {isDirty ? "● " : ""}
              {basename(path)}
            </span>
            <span
              role="button"
              aria-label={`Close ${basename(path)}`}
              tabIndex={-1}
              className={[
                "ml-0.5 flex size-4 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground",
                isActive || isDirty ? "opacity-70" : "opacity-0 group-hover:opacity-70",
              ].join(" ")}
              onClick={(event) => {
                event.stopPropagation();
                closeFile(path);
              }}
            >
              {isDirty && !isActive ? (
                <span className="size-1.5 rounded-full bg-current" />
              ) : (
                <XIcon className="size-3" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
