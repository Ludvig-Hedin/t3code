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
  SparklesIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";
import {
  categorizeWorkEntry,
  formatSubagentType,
  parseSkillName,
  parseSubAgentDescription,
  parseSubAgentPrompt,
  parseSubAgentType,
  type WorkEntryCategory,
} from "./workLogHelpers";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";
import {
  formatSkillSlug,
  humanizeShellCommand,
  humanizeToolDetail,
  relativizePath,
} from "./humanizeToolDetail";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface WorkEntryRowProps {
  entry: WorkLogEntry;
  workspaceRoot?: string | undefined;
  displayStyle?: "clean" | "verbose" | undefined;
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
    iconClass: "text-foreground/65",
    textClass: "text-muted-foreground/70",
  },
  command: {
    icon: TerminalIcon,
    iconClass: "text-foreground/80",
    textClass: "text-muted-foreground/90",
  },
  "file-read": {
    icon: EyeIcon,
    iconClass: "text-foreground/60",
    textClass: "text-muted-foreground/65",
  },
  "file-write": {
    icon: SquarePenIcon,
    iconClass: "text-foreground/75",
    textClass: "text-muted-foreground/85",
  },
  "web-search": {
    icon: GlobeIcon,
    iconClass: "text-foreground/70",
    textClass: "text-muted-foreground/80",
  },
  "sub-agent": {
    icon: GitBranchIcon,
    // Neutral foreground — the bright cyan looked like a blue vertical border
    // on the row because the GitBranch icon is tall and line-like. Keep the
    // visual weight in line with other tool categories.
    iconClass: "text-foreground/70",
    textClass: "text-muted-foreground/90",
  },
  skill: {
    icon: SparklesIcon,
    // Amber/gold accent — distinct from sub-agents (blue) and regular tools (muted)
    iconClass: "text-amber-400/85 dark:text-amber-400/85",
    textClass: "text-muted-foreground/90",
  },
  "tool-call": {
    icon: WrenchIcon,
    iconClass: "text-foreground/65",
    textClass: "text-muted-foreground/70",
  },
};

// Error tone overrides applied on top of the per-category config.
const ERROR_ICON_CLASS = "text-rose-400/80";
const ERROR_TEXT_CLASS = "text-rose-300/70";

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

function deriveFileWritePrimary(input: {
  entry: WorkLogEntry;
  workspaceRoot?: string | undefined;
}): string {
  const { entry, workspaceRoot } = input;
  const humanizedDetail = entry.detail ? humanizeToolDetail(entry.detail, workspaceRoot) : null;
  if (humanizedDetail) {
    return humanizedDetail;
  }

  const firstChangedFile = entry.changedFiles?.[0];
  if (firstChangedFile) {
    return `Edited ${relativizePath(firstChangedFile, workspaceRoot)}`;
  }

  const filepath = relativizePath(stripLabelPrefixes(entry.label), workspaceRoot);
  if (/^file change$/i.test(filepath)) {
    return "Edited file";
  }
  return `Wrote ${filepath}`;
}

/**
 * Derives the primary display label and an optional secondary detail line
 * for each category.
 */
function deriveLabels(
  entry: WorkLogEntry,
  category: WorkEntryCategory,
  options?: {
    workspaceRoot?: string | undefined;
    displayStyle?: "clean" | "verbose" | undefined;
  },
): { primary: string; secondary: string | null } {
  const workspaceRoot = options?.workspaceRoot;
  const displayStyle = options?.displayStyle ?? "clean";

  switch (category) {
    case "command": {
      const rawCommand = entry.command ?? normalizeCompactToolLabel(entry.label);
      if (displayStyle !== "verbose") {
        const humanized =
          humanizeShellCommand(rawCommand, workspaceRoot) ??
          (entry.detail ? humanizeToolDetail(entry.detail, workspaceRoot) : null);
        if (humanized) {
          return { primary: humanized, secondary: null };
        }
      }

      const secondary = entry.detail && entry.detail !== rawCommand ? entry.detail : null;
      const primary = rawCommand;
      return { primary, secondary };
    }

    case "file-read": {
      // "Read {filepath}" — strip server-added prefixes from the label
      const filepath = relativizePath(stripLabelPrefixes(entry.label), workspaceRoot);
      return { primary: `Read ${filepath}`, secondary: null };
    }

    case "file-write": {
      return {
        primary: deriveFileWritePrimary({ entry, workspaceRoot }),
        secondary: null,
      };
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
      const typeSlug = parseSubAgentType(entry.label, entry.detail);
      const agentType = typeSlug ? formatSubagentType(typeSlug) : null;

      // Prefer "Sub-agent (Type): description" so the reader sees which flavor of
      // sub-agent was dispatched (e.g. Explore, General Purpose, Plan) and the
      // concrete task in the same line.
      const primary = agentType
        ? `Sub-agent (${agentType}): ${description}`
        : `Sub-agent: ${description}`;

      // Verbose mode exposes the prompt/instructions actually sent to the
      // sub-agent so the user can see the full brief, not just the headline.
      if (displayStyle === "verbose") {
        const prompt = parseSubAgentPrompt(entry.label, entry.detail);
        const secondary = prompt ?? entry.detail ?? null;
        return { primary, secondary };
      }

      return { primary, secondary: null };
    }

    case "skill": {
      // If the detail field contains the full Skill tool JSON, use the humanizer
      // so we get the namespace-preserving "Superpowers – Systematic Debugging"
      // format. Fall back to parseSkillName (label-based) when detail is absent.
      if (entry.detail) {
        const humanized = humanizeToolDetail(entry.detail, workspaceRoot);
        if (humanized) {
          return { primary: humanized, secondary: null };
        }
      }
      const slug = parseSkillName(entry.label);
      return { primary: `Used skill: ${formatSkillSlug(slug)}`, secondary: null };
    }

    case "tool-call":
    case "reasoning":
    default: {
      if (category === "tool-call" && displayStyle !== "verbose" && entry.detail) {
        const humanizedDetail = humanizeToolDetail(entry.detail, workspaceRoot);
        if (humanizedDetail) {
          return { primary: humanizedDetail, secondary: null };
        }
      }

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

export const WorkEntryRow = memo(function WorkEntryRow({
  entry,
  workspaceRoot,
  displayStyle,
}: WorkEntryRowProps) {
  const category = categorizeWorkEntry(entry);
  const config = CATEGORY_CONFIG[category];

  // Error tone overrides icon and text colors to rose tones
  const isError = entry.tone === "error";
  const resolvedIconClass = isError ? ERROR_ICON_CLASS : config.iconClass;
  const resolvedTextClass = isError ? ERROR_TEXT_CLASS : config.textClass;

  const { primary, secondary } = deriveLabels(entry, category, { workspaceRoot, displayStyle });
  const shouldWrapPrimary =
    displayStyle !== "verbose" && (category === "command" || category === "tool-call");

  // Use HammerIcon for dynamic_tool_call instead of the default WrenchIcon
  const Icon: LucideIcon =
    category === "tool-call" && entry.itemType === "dynamic_tool_call" ? HammerIcon : config.icon;

  // For file-write, show extra changed file badges when more than one file changed
  const extraChangedFiles =
    category === "file-write" && (entry.changedFiles?.length ?? 0) > 1
      ? (entry.changedFiles?.slice(1).map((file) => relativizePath(file, workspaceRoot)) ?? [])
      : [];

  return (
    <div
      className={cn(
        "rounded-lg px-1 py-1",
        // Skill entries get a subtle amber left border to distinguish from other work
        category === "skill" && "border-l-2 border-amber-400/45 pl-2",
      )}
    >
      <div className="flex items-center gap-2 transition-[opacity,translate] duration-200">
        {/* Icon container — fixed size so text aligns consistently */}
        <span className={cn("flex size-5 shrink-0 items-center justify-center", resolvedIconClass)}>
          <Icon className="size-3" />
        </span>

        <div className="min-w-0 flex-1 overflow-hidden">
          <p
            className={cn(
              "text-xs leading-5",
              shouldWrapPrimary ? "whitespace-normal break-words" : "truncate",
              resolvedTextClass,
            )}
            title={secondary ? `${primary} — ${secondary}` : primary}
          >
            {/* Command entries use mono font for the command text itself */}
            <span
              className={cn(
                resolvedTextClass,
                category === "command" && displayStyle === "verbose" && "font-mono",
              )}
            >
              {primary}
            </span>
            {/* Secondary line (rationale / detail) in a softer muted tone */}
            {secondary && <span className="text-muted-foreground/55"> — {secondary}</span>}
          </p>
        </div>
      </div>

      {/* Extra changed file badges for file-write entries with multiple files */}
      {extraChangedFiles.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-6">
          {extraChangedFiles.slice(0, 3).map((filePath) => (
            <span
              key={`${entry.id}:${filePath}`}
              className="rounded-md border border-border/65 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/85"
              title={filePath}
            >
              {filePath}
            </span>
          ))}
          {extraChangedFiles.length > 3 && (
            <span className="px-1 text-[10px] text-muted-foreground/65">
              +{extraChangedFiles.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
