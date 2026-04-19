/**
 * FilesPanel — VS Code–style files browser that lives side-by-side with chat.
 *
 * Phase 5 adds the search header: a debounced query input, a scope toggle
 * (Names / Contents), and a filter popover (case sensitive + regex). When a
 * query is non-empty the file tree is swapped for `FilesPanelResults`; the
 * editor pane below it is unaffected so users can keep editing while
 * searching.
 */
import { useCallback, useEffect, useState } from "react";

import { CaseSensitiveIcon, RegexIcon, SearchIcon, XIcon } from "lucide-react";
import { useParams } from "@tanstack/react-router";

import { ThreadId } from "@t3tools/contracts";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useFilesPanelStore } from "~/filesPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { useStore } from "~/store";

import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "./ui/popover";
import { Toggle, ToggleGroup } from "./ui/toggle-group";

import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { FileEditorPane } from "./files/FileEditorPane";
import { FilesPanelResults } from "./files/FilesPanelResults";
import { FilesPanelTree } from "./files/FilesPanelTree";

export interface FilesPanelProps {
  mode: DiffPanelMode;
}

const SEARCH_DEBOUNCE_MS = 200;

export default function FilesPanel({ mode }: FilesPanelProps) {
  const setOpen = useFilesPanelStore((s) => s.setOpen);
  const openFileAt = useFilesPanelStore((s) => s.openFileAt);
  const activeRelativePath = useFilesPanelStore((s) => s.activeRelativePath);
  const searchQuery = useFilesPanelStore((s) => s.searchQuery);
  const setSearchQuery = useFilesPanelStore((s) => s.setSearchQuery);
  const searchScope = useFilesPanelStore((s) => s.searchScope);
  const setSearchScope = useFilesPanelStore((s) => s.setSearchScope);
  const filters = useFilesPanelStore((s) => s.filters);
  const setFilters = useFilesPanelStore((s) => s.setFilters);

  // Local mirror so typing into the input doesn't cause immediate debounced
  // query churn; we flush to the store after `SEARCH_DEBOUNCE_MS`.
  const [draftQuery, setDraftQuery] = useState(searchQuery);
  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);
  useEffect(() => {
    if (draftQuery === searchQuery) return;
    const timer = window.setTimeout(() => {
      setSearchQuery(draftQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftQuery, searchQuery, setSearchQuery]);

  // Resolve the active cwd via the same thread → worktree / project.cwd chain
  // that DiffPanel uses so behaviour stays consistent when a thread has a
  // worktree attached.
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const activeThread = useStore((store) =>
    routeThreadId ? store.threads.find((thread) => thread.id === routeThreadId) : undefined,
  );
  const activeDraftThread = useComposerDraftStore((store) =>
    routeThreadId ? (store.draftThreadsByThreadId[routeThreadId] ?? null) : null,
  );
  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const activeProject = useStore((store) =>
    activeProjectId ? store.projects.find((project) => project.id === activeProjectId) : undefined,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;

  const { resolvedTheme } = useTheme();

  const handleOpenFile = useCallback(
    (
      relativePath: string,
      selection?: { line: number; column: number } | null,
    ) => {
      openFileAt(relativePath, selection ?? null);
    },
    [openFileAt],
  );

  const trimmedQuery = draftQuery.trim();
  const hasActiveSearch = trimmedQuery.length > 0;

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium text-foreground">
                Files
              </span>
              <div className="relative min-w-0 flex-1">
                <SearchIcon
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
                />
                <Input
                  type="search"
                  size="sm"
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  placeholder={
                    searchScope === "names" ? "Search file names…" : "Search file contents…"
                  }
                  className="pl-7"
                  aria-label="Search files"
                />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ToggleGroup
                className="shrink-0"
                variant="outline"
                size="xs"
                value={[searchScope]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "names" || next === "contents") {
                    setSearchScope(next);
                  }
                }}
              >
                <Toggle aria-label="Search names" value="names">
                  Names
                </Toggle>
                <Toggle aria-label="Search contents" value="contents">
                  Contents
                </Toggle>
              </ToggleGroup>
              <Popover>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Search filters"
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
                    />
                  }
                >
                  <CaseSensitiveIcon className="size-3.5" />
                </PopoverTrigger>
                <PopoverPopup align="end" side="bottom">
                  <div className="space-y-2 px-1">
                    <p className="text-xs font-medium text-foreground">Content filters</p>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground/80">
                      <Checkbox
                        checked={filters.caseSensitive}
                        onCheckedChange={(checked) =>
                          setFilters({ caseSensitive: checked === true })
                        }
                      />
                      <CaseSensitiveIcon className="size-3.5 text-muted-foreground/70" />
                      Match case
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground/80">
                      <Checkbox
                        checked={filters.useRegex}
                        onCheckedChange={(checked) =>
                          setFilters({ useRegex: checked === true })
                        }
                      />
                      <RegexIcon className="size-3.5 text-muted-foreground/70" />
                      Use regex
                    </label>
                    <p className="pt-1 text-[10px] text-muted-foreground/60">
                      Filters apply to content search.
                    </p>
                  </div>
                </PopoverPopup>
              </Popover>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <button
              type="button"
              aria-label="Close Files panel"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </>
      }
    >
      {activeCwd ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Upper pane: either the tree (default) or the search results
              when a query is active. Cap its height when a file is open so
              the editor has room to breathe. */}
          <div
            className={
              activeRelativePath
                ? "flex min-h-0 shrink-0 basis-[40%] flex-col overflow-hidden border-b border-border/60"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            {hasActiveSearch ? (
              <FilesPanelResults
                cwd={activeCwd}
                query={trimmedQuery}
                scope={searchScope}
                caseSensitive={filters.caseSensitive}
                useRegex={filters.useRegex}
                resolvedTheme={resolvedTheme}
                activeRelativePath={activeRelativePath}
                onOpenFile={handleOpenFile}
              />
            ) : (
              <FilesPanelTree
                cwd={activeCwd}
                activeRelativePath={activeRelativePath}
                resolvedTheme={resolvedTheme}
                onOpenFile={(path) => handleOpenFile(path)}
              />
            )}
          </div>
          {activeRelativePath ? (
            <FileEditorPane cwd={activeCwd} relativePath={activeRelativePath} />
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
          No active workspace.
        </div>
      )}
    </DiffPanelShell>
  );
}
