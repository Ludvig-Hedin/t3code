import { ArrowLeftIcon, ArrowRightIcon, LoaderIcon, SparklesIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ComposerImproveButton(props: {
  canImprove: boolean;
  canShowNextVersion: boolean;
  canShowPreviousVersion: boolean;
  error: string | null;
  isImproving: boolean;
  onCancel: () => void;
  onImprove: () => void;
  onShowNextVersion: () => void;
  onShowPreviousVersion: () => void;
  versionLabel: string | null;
}) {
  const {
    canImprove,
    canShowNextVersion,
    canShowPreviousVersion,
    error,
    isImproving,
    onCancel,
    onImprove,
    onShowNextVersion,
    onShowPreviousVersion,
    versionLabel,
  } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const compactThresholdPx = versionLabel ? 152 : 104;
    const updateCompactState = () => {
      setIsCompact(root.clientWidth > 0 && root.clientWidth < compactThresholdPx);
    };

    updateCompactState();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateCompactState();
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, [versionLabel]);

  return (
    <div ref={rootRef} className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-8 shrink-0 text-muted-foreground/75 hover:text-foreground/85 ${isCompact ? "gap-0 px-2" : "gap-1.5 px-2.5"}`}
                disabled={!isImproving && !canImprove}
                onClick={isImproving ? onCancel : onImprove}
                aria-label={isImproving ? "Cancel prompt improvement" : "Improve prompt"}
              >
                {isImproving ? (
                  <>
                    <LoaderIcon className="size-3.5 animate-spin" />
                    {!isCompact ? <span>Cancel</span> : null}
                  </>
                ) : (
                  <>
                    <SparklesIcon className="size-3.5" />
                    {!isCompact ? <span>Improve</span> : null}
                  </>
                )}
              </Button>
            }
          />
          <TooltipPopup side="top">
            {isImproving ? "Cancel prompt improvement" : "Improve prompt"}
          </TooltipPopup>
        </Tooltip>

        {versionLabel ? (
          <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/70 px-1 py-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground/70 hover:text-foreground/80"
                    disabled={!canShowPreviousVersion || isImproving}
                    onClick={onShowPreviousVersion}
                    aria-label="Show previous improved prompt version"
                  >
                    <ArrowLeftIcon className="size-3.5" />
                  </Button>
                }
              />
              <TooltipPopup side="top">Previous improved version</TooltipPopup>
            </Tooltip>
            <span className="min-w-8 text-center text-[11px] text-muted-foreground">
              {versionLabel}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 shrink-0 text-muted-foreground/70 hover:text-foreground/80"
                    disabled={!canShowNextVersion || isImproving}
                    onClick={onShowNextVersion}
                    aria-label="Show next improved prompt version"
                  >
                    <ArrowRightIcon className="size-3.5" />
                  </Button>
                }
              />
              <TooltipPopup side="top">Next improved version</TooltipPopup>
            </Tooltip>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
          <XIcon className="size-3" />
          <span className="truncate">{error}</span>
        </div>
      ) : null}
    </div>
  );
}
