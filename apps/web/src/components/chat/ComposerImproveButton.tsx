import { ArrowLeftIcon, ArrowRightIcon, LoaderIcon, SparklesIcon, XIcon } from "lucide-react";

import { Button } from "../ui/button";

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

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1.5 px-2.5 text-muted-foreground/75 hover:text-foreground/85"
          disabled={!isImproving && !canImprove}
          onClick={isImproving ? onCancel : onImprove}
        >
          {isImproving ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              <span>Cancel</span>
            </>
          ) : (
            <>
              <SparklesIcon className="size-3.5" />
              <span>Improve</span>
            </>
          )}
        </Button>

        {versionLabel ? (
          <div className="flex items-center gap-0.5 rounded-full border border-border/70 bg-background/70 px-1 py-0.5">
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
            <span className="min-w-8 text-center text-[11px] text-muted-foreground">
              {versionLabel}
            </span>
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
