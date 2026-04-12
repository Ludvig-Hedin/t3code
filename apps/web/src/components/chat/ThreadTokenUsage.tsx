/**
 * ThreadTokenUsage — displays cumulative input/output token counts for the current thread.
 * Shown inline near the context window meter when enabled via settings.
 *
 * Data comes from the same context-window.updated activity payload that feeds the
 * ContextWindowMeter, so it is only visible when the provider emits token data.
 */
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

export function ThreadTokenUsage({ usage }: { usage: ContextWindowSnapshot }) {
  const inputTokens = usage.inputTokens ?? null;
  const outputTokens = usage.outputTokens ?? null;

  // Don't render if no cumulative token data is available
  if (inputTokens === null && outputTokens === null) {
    return null;
  }

  const totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/40"
            aria-label={`Thread token usage: ${formatContextWindowTokens(inputTokens)} in, ${formatContextWindowTokens(outputTokens)} out`}
          >
            <span>{formatContextWindowTokens(totalTokens)}</span>
            <span className="text-muted-foreground/50">tok</span>
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-max max-w-none px-3 py-2">
        <div className="space-y-1.5 leading-tight">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Thread token usage
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">Input</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatContextWindowTokens(inputTokens)}
            </span>
            <span className="text-muted-foreground">Output</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatContextWindowTokens(outputTokens)}
            </span>
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium tabular-nums text-foreground">
              {formatContextWindowTokens(totalTokens)}
            </span>
          </div>
          {/* Show last-turn breakdown if available */}
          {((usage.lastInputTokens ?? null) !== null ||
            (usage.lastOutputTokens ?? null) !== null) && (
            <>
              <div className="border-t border-border/60 pt-1.5 mt-1">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground mb-1">
                  Last turn
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-muted-foreground">Input</span>
                  <span className="tabular-nums text-foreground/80">
                    {formatContextWindowTokens(usage.lastInputTokens ?? null)}
                  </span>
                  <span className="text-muted-foreground">Output</span>
                  <span className="tabular-nums text-foreground/80">
                    {formatContextWindowTokens(usage.lastOutputTokens ?? null)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
