// apps/web/src/components/PreviewFloatingWindow.tsx
/**
 * PreviewFloatingWindow — detached, draggable floating preview window.
 *
 * Rendered via React portal over the main UI. Reuses PreviewPanel content.
 * Position and size are persisted in uiStateStore (previewFloatingBounds).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { PreviewPanel } from "./PreviewPanel";
import { useUiStateStore } from "../uiStateStore";

interface PreviewFloatingWindowProps {
  projectId: string;
  /** Called when the user clicks "dock" — re-attaches panel inline. */
  onDock: () => void;
  /** Called when the user clicks "close" — hides the preview entirely. */
  onClose: () => void;
}

const DEFAULT_BOUNDS = { x: 80, y: 80, w: 720, h: 560 };
const MIN_W = 320;
const MIN_H = 240;

export function PreviewFloatingWindow({ projectId, onDock, onClose }: PreviewFloatingWindowProps) {
  const storedBounds = useUiStateStore((s) => s.previewFloatingBounds);
  const setFloatingBounds = useUiStateStore((s) => s.setPreviewFloatingBounds);

  const [bounds, setBoundsState] = useState(storedBounds ?? DEFAULT_BOUNDS);
  const boundsRef = useRef(bounds);

  // Keep boundsRef current so drag handlers can read latest without triggering re-renders
  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  // Persist bounds whenever they change
  useEffect(() => {
    setFloatingBounds(bounds);
  }, [bounds, setFloatingBounds]);

  const onMouseDownHeader = useCallback((e: React.MouseEvent) => {
    // Only handle primary mouse button drags
    if (e.button !== 0) return;
    e.preventDefault();

    const startMx = e.clientX;
    const startMy = e.clientY;
    const startX = boundsRef.current.x;
    const startY = boundsRef.current.y;

    const onMove = (me: MouseEvent) => {
      setBoundsState((b) => ({
        ...b,
        x: startX + me.clientX - startMx,
        y: startY + me.clientY - startMy,
      }));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const content = (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(bounds.w, MIN_W),
        height: Math.max(bounds.h, MIN_H),
      }}
    >
      {/* Drag handle / title bar */}
      <div
        className="flex cursor-grab select-none items-center gap-2 border-b border-border bg-card px-3 py-2 active:cursor-grabbing"
        onMouseDown={onMouseDownHeader}
      >
        <span className="flex-1 text-xs font-medium text-muted-foreground">Preview</span>
        {/* Dock button — returns the panel to its inline docked position */}
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0 text-xs"
          onClick={onDock}
          title="Dock preview back to side panel"
        >
          ⊟
        </Button>
        {/* Close button — hides preview entirely */}
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={onClose}
          title="Close preview"
        >
          <XIcon className="size-3" />
        </Button>
      </div>

      {/* Panel content — passes onDetach as onDock so the detach button re-docks instead */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewPanel projectId={projectId} onDetach={onDock} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
