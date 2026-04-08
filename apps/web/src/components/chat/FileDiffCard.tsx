/**
 * FileDiffCard
 *
 * Renders a single-file diff inline in the conversation.
 *
 * ┌─────────────────────────────────────────────────┐
 * │ 🗋  Button.tsx          +12  -3   [chevron]      │  ← always visible header
 * │  ─ old line                                      │  ← shown when expanded
 * │  + new line                                      │
 * └─────────────────────────────────────────────────┘
 *
 * Design choices:
 * - Red/green line backgrounds are pure CSS — no library dependency.
 * - Syntax highlighting within lines is intentionally omitted for now
 *   (can be layered on with shiki later without touching this component).
 * - `defaultExpanded` is true for the most-recent completed turn so the user
 *   sees what just changed without clicking.  Historical turns start collapsed.
 * - The card is a controlled/uncontrolled hybrid: it defaults to
 *   `defaultExpanded` on mount but the user can toggle freely afterward.
 * - Diff lines are only fetched when the card is first opened (lazy via
 *   useFileDiff), so history is cheap.
 *
 * Fallback: if `parsedFile` is null (diff not fetched yet), the header still
 * shows the filename + stats from the checkpoint summary data, so the card
 * is always useful even before the raw diff loads.
 */

import { memo, useState } from "react";
import { ChevronRightIcon, Loader2Icon } from "lucide-react";
import { cn } from "~/lib/utils";
import { type DiffFile } from "../../hooks/useFileDiff";
import { type TurnDiffFileChange } from "../../types";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import { VscodeEntryIcon } from "./VscodeEntryIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileDiffCardProps {
  /** Summary data always available from checkpoint (path + add/del counts). */
  fileChange: TurnDiffFileChange;
  /**
   * The parsed diff for this specific file.  null while loading or if the
   * diff fetch hasn't been triggered yet.
   */
  parsedFile: DiffFile | null;
  isLoading: boolean;
  defaultExpanded: boolean;
  resolvedTheme: "light" | "dark";
  /** Navigate to the full-screen diff panel for this file. */
  onViewFullDiff: () => void;
}

// ---------------------------------------------------------------------------
// Line type helpers
// ---------------------------------------------------------------------------

function lineType(line: string): "added" | "removed" | "context" | "hunk" {
  if (line.startsWith("+")) return "added";
  if (line.startsWith("-")) return "removed";
  if (line.startsWith("@@")) return "hunk";
  return "context";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FileDiffCard = memo(function FileDiffCard({
  fileChange,
  parsedFile,
  isLoading,
  defaultExpanded,
  resolvedTheme,
  onViewFullDiff,
}: FileDiffCardProps) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  const fileName = fileChange.path.split("/").at(-1) ?? fileChange.path;
  const dirPath = fileChange.path.includes("/")
    ? fileChange.path.slice(0, fileChange.path.lastIndexOf("/"))
    : null;

  const additions = fileChange.additions ?? 0;
  const deletions = fileChange.deletions ?? 0;
  const hasStat = hasNonZeroStat({ additions, deletions });

  // Collect all lines from all hunks for rendering
  const allLines = parsedFile?.chunks.flatMap((chunk) => chunk.changes) ?? [];
  const hasContent = allLines.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card/40 font-mono text-[11px]">
      {/* ── Header ── */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-background/60 transition-colors"
        onClick={() => setIsOpen((v) => !v)}
      >
        <ChevronRightIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
            isOpen && "rotate-90",
          )}
        />

        <VscodeEntryIcon
          pathValue={fileChange.path}
          kind="file"
          theme={resolvedTheme}
          className="size-3.5 shrink-0"
        />

        {/* Filename (bold) + directory path (muted) */}
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="font-semibold text-foreground/90">{fileName}</span>
          {dirPath && <span className="ml-1 truncate text-muted-foreground/50"> {dirPath}</span>}
        </span>

        {/* +/- stat */}
        {hasStat && (
          <span className="shrink-0 tabular-nums">
            <DiffStatLabel additions={additions} deletions={deletions} />
          </span>
        )}

        {/* Loading spinner */}
        {isLoading && isOpen && (
          <Loader2Icon className="size-3 shrink-0 animate-spin text-muted-foreground/50" />
        )}
      </button>

      {/* ── Diff body ── */}
      {isOpen && (
        <div className="border-t border-border/40">
          {/* Content: diff lines */}
          {hasContent ? (
            <div className="max-h-[320px] overflow-y-auto">
              {allLines.map((change, index) => {
                const raw = "content" in change ? change.content : "";
                const type =
                  change.type === "add"
                    ? "added"
                    : change.type === "del"
                      ? "removed"
                      : lineType(raw);

                return (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    className={cn(
                      "flex gap-0 whitespace-pre leading-5 select-text",
                      type === "added" && "bg-emerald-950/60 text-emerald-300/90",
                      type === "removed" && "bg-rose-950/60 text-rose-300/90",
                      type === "hunk" && "bg-muted/30 text-muted-foreground/60 italic",
                      type === "context" && "text-muted-foreground/70",
                    )}
                  >
                    {/* Gutter: +/- sigil */}
                    <span
                      className={cn(
                        "w-5 shrink-0 select-none text-center",
                        type === "added" && "text-emerald-400/80",
                        type === "removed" && "text-rose-400/80",
                      )}
                    >
                      {type === "added" ? "+" : type === "removed" ? "-" : " "}
                    </span>
                    {/* Line content — strip the leading +/-/space sigil from parse-diff output */}
                    <span className="px-2 min-w-0 overflow-hidden">
                      {raw.length > 0 ? raw.slice(1) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : isLoading ? (
            /* Skeleton while loading */
            <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground/50">
              <Loader2Icon className="size-3 animate-spin" />
              <span>Loading diff…</span>
            </div>
          ) : (
            /* Fallback: diff unavailable — show file name and stat only */
            <div className="px-4 py-2 text-muted-foreground/50">
              {hasStat ? (
                <span>
                  <DiffStatLabel additions={additions} deletions={deletions} />
                  {" — "}
                </span>
              ) : null}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground/70 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewFullDiff();
                }}
              >
                View full diff
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
