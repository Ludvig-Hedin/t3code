import { useState } from "react";
import { cn } from "~/lib/utils";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";

function formatPercentage(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  if (value < 10) {
    return `${value.toFixed(1).replace(/\.0$/, "")}%`;
  }
  return `${Math.round(value)}%`;
}

export function ContextWindowMeter(props: {
  usage: ContextWindowSnapshot;
  /** Called when the user confirms a manual compact request. May be async. */
  onCompact?: () => void | Promise<void>;
}) {
  const { usage, onCompact } = props;
  const [confirming, setConfirming] = useState(false);

  const usedPercentage = formatPercentage(usage.usedPercentage);
  const normalizedPercentage = Math.max(0, Math.min(100, usage.usedPercentage ?? 0));
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference;

  function handleCompactClick() {
    setConfirming(true);
  }

  function handleConfirm() {
    setConfirming(false);
    void onCompact?.();
  }

  function handleCancel() {
    setConfirming(false);
  }

  return (
    <Popover
      // Reset confirm state whenever the popover closes so it never lingers.
      onOpenChange={(open) => {
        if (!open) setConfirming(false);
      }}
    >
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="group inline-flex items-center justify-center rounded-full transition-opacity hover:opacity-85"
            aria-label={
              usage.maxTokens !== null && usedPercentage
                ? `Context window ${usedPercentage} used`
                : `Context window ${formatContextWindowTokens(usage.usedTokens)} tokens used`
            }
          >
            <span className="relative flex h-6 w-6 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 h-full w-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted) 70%, transparent)"
                  strokeWidth="3"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
              <span
                className={cn(
                  "relative flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background text-[8px] font-medium",
                  "text-muted-foreground",
                )}
              >
                {usage.usedPercentage !== null
                  ? Math.round(usage.usedPercentage)
                  : formatContextWindowTokens(usage.usedTokens)}
              </span>
            </span>
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-max max-w-none px-3 py-2">
        <div className="space-y-1.5 leading-tight">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Context window
          </div>
          {usage.maxTokens !== null && usedPercentage ? (
            <div className="whitespace-nowrap text-xs font-medium text-foreground">
              <span>{usedPercentage}</span>
              <span className="mx-1">⋅</span>
              <span>{formatContextWindowTokens(usage.usedTokens)}</span>
              <span>/</span>
              <span>{formatContextWindowTokens(usage.maxTokens ?? null)} context used</span>
            </div>
          ) : (
            <div className="text-sm text-foreground">
              {formatContextWindowTokens(usage.usedTokens)} tokens used so far
            </div>
          )}
          {(usage.totalProcessedTokens ?? null) !== null &&
          (usage.totalProcessedTokens ?? 0) > usage.usedTokens ? (
            <div className="text-xs text-muted-foreground">
              Total processed: {formatContextWindowTokens(usage.totalProcessedTokens ?? null)}{" "}
              tokens
            </div>
          ) : null}
          {usage.compactsAutomatically ? (
            <div className="text-xs text-muted-foreground">
              Automatically compacts its context when needed.
            </div>
          ) : null}

          {/* Manual compact section — only shown when a handler is wired up */}
          {onCompact ? (
            <div className="border-t border-border/60 pt-1.5 mt-1">
              {confirming ? (
                // Confirm state: ask the user to confirm before sending /compact
                <div className="space-y-2">
                  <p className="text-xs text-foreground">
                    Summarize &amp; compress conversation history?
                  </p>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 px-2 text-[11px]"
                      onClick={handleConfirm}
                    >
                      Compact
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Default state: single "Compact context" button
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  onClick={handleCompactClick}
                >
                  Compact context
                </button>
              )}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
