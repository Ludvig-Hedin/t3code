/**
 * WorkEntryRow
 *
 * Per-type styled row for a single WorkLogEntry in the work-log panel.
 * Each semantic category (command, file-read, file-write, web-search,
 * sub-agent, tool-call) gets its own icon, color treatment, and label
 * formatting so the UI clearly communicates what the agent is doing.
 *
 * This replaces SimpleWorkEntryRow for non-reasoning entries.
 */

import { memo } from "react";
import {
  EyeIcon,
  GitBranchIcon,
  GlobeIcon,
  HammerIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";
import {
  categorizeWorkEntry,
  parseSubAgentDescription,
  type WorkEntryCategory,
} from "./workLogHelpers";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface WorkEntryRowProps {
  entry: WorkLogEntry;
}

// ---------------------------------------------------------------------------
// Per-category config
// ---------------------------------------------------------------------------

interface CategoryConfig {
  /** Lucide icon component to render. */
  icon: LucideIcon;
  /** Tailwind class(es) for the icon wrapper / icon color. */
  iconClass: string;
  /** Tailwind class(es) for the primary label text. */
  textClass: string;
}

const CATEGORY_CONFIG: Record<WorkEntryCategory, CategoryConfig> = {
  reasoning: {
    // Reasoning entries are handled by a separate ReasoningBlock component;
    // this fallback is here for completeness but should rarely be rendered.
    icon: WrenchIcon,
    iconClass: "text-foreground/55",
    textClass: "text-muted-foreground/60",
  },
  command: {
    icon: TerminalIcon,
    iconClass: "text-foreground/70",
    textClass: "text-muted-foreground/80",
  },
  "file-read": {
    icon: EyeIcon,
    iconClass: "text-foreground/50",
    textClass: "text-muted-foreground/55",
  },
  "file-write": {
    icon: SquarePenIcon,
    iconClass: "text-foreground/65",
    textClass: "text-muted-foreground/75",
  },
  "web-search": {
    icon: GlobeIcon,
    iconClass: "text-foreground/60",
    textClass: "text-muted-foreground/70",
  },
  "sub-agent": {
    icon: GitBranchIcon,
    // Blue accent to visually distinguish sub-agent activity
    iconClass: "text-blue-400/70 dark:text-blue-400/70",
    textClass: "text-muted-foreground/80",
  },
  "tool-call": {
    icon: WrenchIcon,
    iconClass: "text-foreground/55",
    textClass: "text-muted-foreground/60",
  },
};

// Error tone overrides applied on top of the per-category config.
const ERROR_ICON_CLASS = "text-rose-400/70";
const ERROR_TEXT_CLASS = "text-rose-300/60";

// ---------------------------------------------------------------------------
// Label derivation helpers
// ---------------------------------------------------------------------------

/**
 * Strips common "Reading " / "Writing " / "Reasoning update - " prefixes
 * that the server attaches to label strings before displaying them.
 */
function stripLabelPrefixes(label: string): string {
  return label
    .replace(/^Reasoning update\s*-\s*/i, "")
    .replace(/^Reading\s+/i, "")
    .replace(/^Writing\s+/i, "")
    .trim();
}

/**
 * Derives the primary display label and an optional secondary detail line
 * for each category.
 */
function deriveLabels(
  entry: WorkLogEntry,
  category: WorkEntryCategory,
): { primary: string; secondary: string | null } {
  switch (category) {
    case "command": {
      // Show the raw command in mono; surface the AI rationale as secondary
      const primary = entry.command ?? normalizeCompactToolLabel(entry.label);
      const secondary = entry.detail && entry.detail !== primary ? entry.detail : null;
      return { primary, secondary };
    }

    case "file-read": {
      // "Read {filepath}" — strip server-added prefixes from the label
      const filepath = stripLabelPrefixes(entry.label);
      return { primary: `Read ${filepath}`, secondary: null };
    }

    case "file-write": {
      // "Wrote {filepath}" — strip server-added prefixes from the label
      const filepath = stripLabelPrefixes(entry.label);
      return { primary: `Wrote ${filepath}`, secondary: null };
    }

    case "web-search": {
      // Prefer the query from detail/command; fall back to cleaned label
      const query = entry.detail ?? entry.command;
      if (query) {
        return { primary: `Searched for ${query}`, secondary: null };
      }
      return { primary: normalizeCompactToolLabel(entry.label), secondary: null };
    }

    case "sub-agent": {
      const description = parseSubAgentDescription(entry.label, entry.detail);
      return { primary: `Sub-agent: ${description}`, secondary: null };
    }

    case "tool-call":
    case "reasoning":
    default: {
      // Normalize label (strip trailing "complete/completed") and show optional preview
      const primary = normalizeCompactToolLabel(entry.toolTitle ?? entry.label);
      const secondary = entry.detail ?? null;
      return { primary, secondary };
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const WorkEntryRow = memo(function WorkEntryRow({ entry }: WorkEntryRowProps) {
  const category = categorizeWorkEntry(entry);
  const config = CATEGORY_CONFIG[category];

  // Error tone overrides icon and text colors to rose tones
  const isError = entry.tone === "error";
  const resolvedIconClass = isError ? ERROR_ICON_CLASS : config.iconClass;
  const resolvedTextClass = isError ? ERROR_TEXT_CLASS : config.textClass;

  const { primary, secondary } = deriveLabels(entry, category);

  // Use HammerIcon for dynamic_tool_call instead of the default WrenchIcon
  const Icon: LucideIcon =
    category === "tool-call" && entry.itemType === "dynamic_tool_call" ? HammerIcon : config.icon;

  // For file-write, show extra changed file badges when more than one file changed
  const extraChangedFiles =
    category === "file-write" && (entry.changedFiles?.length ?? 0) > 1
      ? (entry.changedFiles?.slice(1) ?? [])
      : [];

  return (
    <div
      className={cn(
        "rounded-lg px-1 py-1",
        // Sub-agent entries get a subtle left border accent for visual hierarchy
        category === "sub-agent" && "border-l-2 border-blue-400/30 pl-2",
      )}
    >
      <div className="flex items-center gap-2 transition-[opacity,translate] duration-200">
        {/* Icon container — fixed size so text aligns consistently */}
        <span className={cn("flex size-5 shrink-0 items-center justify-center", resolvedIconClass)}>
          <Icon className="size-3" />
        </span>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn("truncate text-[11px] leading-5", resolvedTextClass)}
            title={secondary ? `${primary} — ${secondary}` : primary}
          >
            {/* Command entries use mono font for the command text itself */}
            <span className={cn(resolvedTextClass, category === "command" && "font-mono")}>
              {primary}
            </span>
            {/* Secondary line (rationale / detail) in a softer muted tone */}
            {secondary && <span className="text-muted-foreground/45"> — {secondary}</span>}
          </p>
        </div>
      </div>

      {/* Extra changed file badges for file-write entries with multiple files */}
      {extraChangedFiles.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-6">
          {extraChangedFiles.slice(0, 3).map((filePath) => (
            <span
              key={`${entry.id}:${filePath}`}
              className="rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {extraChangedFiles.length > 3 && (
            <span className="px-1 text-[10px] text-muted-foreground/55">
              +{extraChangedFiles.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
