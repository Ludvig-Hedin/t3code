import { type ProjectId } from "@t3tools/contracts";
import { memo } from "react";
import {
  BugIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderPlusIcon,
  LayersIcon,
  ListChecksIcon,
  MessageSquareIcon,
  SearchCodeIcon,
  SearchIcon,
  ShieldIcon,
  SparklesIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Prompt suggestion cards shown inside an empty/draft thread.
 * Clicking a card pre-fills the composer; prompts ending with `: ` leave the
 * cursor at the spot the user needs to fill in. */
const CHAT_VIEW_PROMPT_SUGGESTIONS = [
  {
    title: "Code review",
    description: "Audit recent changes by severity",
    icon: SearchCodeIcon,
    prompt:
      "Review my recent changes. Cite file + line, classify (bug / security / perf / style), explain impact, and show fix snippets. Order by severity.",
  },
  {
    title: "New feature",
    description: "Plan first, then build",
    icon: SparklesIcon,
    prompt:
      "Plan a new feature before writing any code: list the files to touch, risks, dependencies, then a numbered implementation plan. I'll describe it: ",
  },
  {
    title: "Fix a bug",
    description: "Root-cause first, then fix",
    icon: BugIcon,
    prompt:
      "Diagnose this bug step-by-step (root cause first), pinpoint the location, then propose a targeted fix. Here's what's happening: ",
  },
  {
    title: "Refactor",
    description: "Prioritize by impact vs effort",
    icon: WrenchIcon,
    prompt:
      "Find refactoring opportunities — duplicated logic, bloated files, unclear naming, missing abstractions. Rate each by impact vs effort, then start with the highest-impact, lowest-effort item.",
  },
  {
    title: "Write tests",
    description: "Cover the untested paths",
    icon: ListChecksIcon,
    prompt:
      "Find untested or undertested code paths and write tests for happy paths, edges, and failures using the existing framework.",
  },
  {
    title: "Explain code",
    description: "Understand what's happening",
    icon: MessageSquareIcon,
    prompt:
      "Explain what this does, how it works step-by-step, design choices, and gotchas. Assume I'm new to it: ",
  },
  {
    title: "Performance audit",
    description: "Find and fix bottlenecks",
    icon: ZapIcon,
    prompt:
      "Find performance bottlenecks (N+1 queries, unnecessary re-renders, missing memoization, hot-path work). For each, estimate user-visible impact and propose a concrete fix.",
  },
  {
    title: "Security audit",
    description: "Find vulnerabilities",
    icon: ShieldIcon,
    prompt:
      "Run a security audit — injection, broken auth, exposed secrets, CSRF/XSS, insecure deps. Rate each finding (critical / high / medium / low) with remediation steps.",
  },
  {
    title: "Architecture review",
    description: "Evaluate the big picture",
    icon: LayersIcon,
    prompt:
      "Review the overall architecture. Flag tight coupling, unclear module boundaries, missing abstractions, and scalability risks. Prioritize changes that most reduce future friction.",
  },
] as const;

interface EmptyDraftThreadViewProps {
  activeProject: { name: string } | null | undefined;
  filteredProjects: ReadonlyArray<{ id: ProjectId; name: string }>;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  onSelectProject: (projectId: ProjectId) => void;
  onAddProject: () => void;
  onSelectSuggestion: (prompt: string) => void;
}

/** Empty/draft-thread landing UI: project switcher heading + prompt suggestion cards.
 * Pure presentational shell — all state and side effects live in the parent ChatView. */
export const EmptyDraftThreadView = memo(function EmptyDraftThreadView({
  activeProject,
  filteredProjects,
  projectSearch,
  setProjectSearch,
  onSelectProject,
  onAddProject,
  onSelectSuggestion,
}: EmptyDraftThreadViewProps) {
  return (
    /* Empty/draft thread — show prompt suggestion cards + project switcher
       above the real composer so the user can kick off a conversation quickly. */
    <div className="flex min-h-full flex-col items-center justify-center gap-10 px-2 py-8">
      {/* "New thread in [Project]" heading with project switcher */}
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-semibold text-foreground">New thread in</h1>
        {/* onOpenChange resets search when the dropdown closes */}
        <Menu
          onOpenChange={(open) => {
            if (!open) setProjectSearch("");
          }}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <button
                      type="button"
                      className="group flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-3xl font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <span className="border-b border-dashed border-muted-foreground/30">
                        {activeProject?.name ?? "Select project"}
                      </span>
                      <ChevronRightIcon className="size-6 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  }
                />
              }
            />
            <TooltipPopup side="bottom">Switch project</TooltipPopup>
          </Tooltip>
          {/*
            contentClassName overrides the inner wrapper so we can split it into
            three non-homogeneous zones:
              1. Search input  (not scrollable)
              2. Project list  (scrollable, max-height)
              3. Add-project   (not scrollable, separated by a border)
          */}
          <MenuPopup
            align="start"
            side="bottom"
            sideOffset={6}
            contentClassName="overflow-hidden flex flex-col p-0"
          >
            {/* ── Search input ── */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <SearchIcon className="size-4 shrink-0 text-muted-foreground opacity-70" />
              <input
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                placeholder="Search projects"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                // Let the menu handle navigation keys (ArrowUp/Down/Enter) so the
                // highlighted MenuItem still works, but stop other keys (typed
                // characters) from triggering the menu's built-in keyboard search.
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter") {
                    return;
                  }
                  if (e.key !== "Escape") e.stopPropagation();
                }}
              />
            </div>

            {/* ── Project list (scrollable) ── */}
            <div className="max-h-52 overflow-y-auto p-1 pt-0">
              {filteredProjects.map((project) => (
                <MenuItem key={project.id} onClick={() => onSelectProject(project.id)}>
                  <FolderIcon />
                  {project.name}
                </MenuItem>
              ))}
            </div>

            {/* ── Add new project ── */}
            <div className="border-t border-border p-1">
              <MenuItem onClick={onAddProject}>
                <FolderPlusIcon />
                Add new project
              </MenuItem>
            </div>
          </MenuPopup>
        </Menu>
      </div>

      {/* Prompt suggestion cards — clicking pre-fills the real composer below */}
      <div className="flex w-full max-w-lg flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {CHAT_VIEW_PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-xs/5 transition-colors hover:bg-accent"
              onClick={() => onSelectSuggestion(suggestion.prompt)}
            >
              <suggestion.icon className="size-5 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{suggestion.title}</span>
                <span className="text-xs text-muted-foreground">{suggestion.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
