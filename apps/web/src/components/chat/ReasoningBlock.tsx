/**
 * ReasoningBlock
 *
 * Renders a group of consecutive reasoning WorkLogEntry items as a single
 * collapsible block. Used inside the work-log card to replace flat reasoning
 * rows with a more compact, scannable UI.
 *
 * Auto-open / auto-collapse behaviour:
 *  - When `isActivelyWorking && isLastSection` (shouldAutoOpen), the block
 *    opens automatically so the user can watch live reasoning.
 *  - When that condition becomes false (agent finishes), the block collapses
 *    unless the user has manually toggled it open.
 *  - Any manual click resets the "manualOverride" flag when shouldAutoOpen
 *    changes again, so auto behaviour can re-engage on the next active run.
 */

import { memo, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";
import { computeReasoningDuration } from "./workLogHelpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReasoningBlockProps {
  entries: ReadonlyArray<WorkLogEntry>;
  isActivelyWorking: boolean;
  isLastSection: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Prefix stripped from each reasoning entry label before display. */
const REASONING_PREFIX = "Reasoning update - ";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ReasoningBlock = memo(function ReasoningBlock({
  entries,
  isActivelyWorking,
  isLastSection,
}: ReasoningBlockProps) {
  // shouldAutoOpen drives automatic open/close behaviour.
  const shouldAutoOpen = isActivelyWorking && isLastSection;

  // isOpen is the rendered open state, seeded from shouldAutoOpen.
  const [isOpen, setIsOpen] = useState(shouldAutoOpen);

  // manualOverride is true when the user has explicitly clicked the toggle.
  // It prevents auto-collapse from overriding a deliberate user action.
  const [manualOverride, setManualOverride] = useState(false);

  // Track the previous value of shouldAutoOpen so we can detect transitions.
  const prevShouldAutoOpen = useRef(shouldAutoOpen);

  useEffect(() => {
    const prev = prevShouldAutoOpen.current;
    prevShouldAutoOpen.current = shouldAutoOpen;

    if (prev === shouldAutoOpen) return;

    if (shouldAutoOpen) {
      // Agent started reasoning on this (last) section — open automatically
      // and reset the manual override flag so auto-collapse can work later.
      setManualOverride(false);
      setIsOpen(true);
    } else {
      // Agent finished reasoning — collapse unless the user manually opened it.
      if (!manualOverride) {
        setIsOpen(false);
      }
    }
  }, [shouldAutoOpen, manualOverride]);

  // When the user clicks, toggle and mark as manually overridden.
  const handleToggle = () => {
    setManualOverride(true);
    setIsOpen((prev) => !prev);
  };

  // Duration string ("12s", "1m 4s") or null for single-entry blocks.
  // We cast to mutable array because computeReasoningDuration accepts WorkLogEntry[].
  const duration = computeReasoningDuration(entries as WorkLogEntry[]);

  // Build the summary label shown in the collapsed/header row.
  const summaryLabel = shouldAutoOpen
    ? "Thinking…"
    : duration
      ? `Thought for ${duration}`
      : "Thought";

  return (
    <div className="flex flex-col">
      {/* Summary / toggle button */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1 text-left",
          "text-[11px] text-muted-foreground/50 italic",
          "hover:text-muted-foreground/70 transition-colors",
          "cursor-pointer select-none",
        )}
      >
        {/* Pulsing dot shown while actively reasoning */}
        {shouldAutoOpen && (
          <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/40 shrink-0" />
        )}

        {/* Chevron — rotates 90° when the block is open */}
        <ChevronRightIcon
          className={cn(
            "size-3 text-muted-foreground/40 shrink-0 transition-transform duration-150",
            isOpen && "rotate-90",
          )}
        />

        <span>{summaryLabel}</span>
      </button>

      {/* Expanded reasoning content */}
      {isOpen && (
        <div className="mt-1 ml-4 border-l border-muted-foreground/15 pl-2 flex flex-col gap-0.5">
          {entries.map((entry) => {
            // Strip the "Reasoning update - " prefix so only the useful
            // content is shown to the user.
            const text = entry.label.startsWith(REASONING_PREFIX)
              ? entry.label.slice(REASONING_PREFIX.length)
              : entry.label;

            return (
              <p
                key={entry.id}
                className="text-[10px] text-muted-foreground/40 truncate"
                title={text}
              >
                {text}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
});
