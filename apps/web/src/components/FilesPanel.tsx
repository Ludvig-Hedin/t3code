/**
 * FilesPanel — VS Code–style files browser that lives side-by-side with chat.
 *
 * Layout (VS Code inspired):
 *  - Single-row drag-region header: title + search input + close
 *  - Compact scope toolbar below header: Names | Contents + filter options
 *  - File tree / search results filling the remaining height
 *  - When a file is active:
 *      * sidebar mode → horizontal split, [tabs + editor | tree], inside this
 *        same sidebar (keeps the layout to a single right-docked `fixed`
 *        container so sidebars don't overlap).
 *      * sheet / inline mode → classic stacked layout (tree on top, editor
 *        below) for narrow viewports.
 */
import { useCallback, useEffect, useState } from "react";

import { CaseSensitiveIcon, RegexIcon, SearchIcon, XIcon } from "lucide-react";
import { useParams } from "@tanstack/react-router";

import { ThreadId } from "@t3tools/contracts";

import { useComposerDraftStore } from "~/composerDraftStore";
import { useFilesPanelStore } from "~/filesPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { showFileContextMenu } from "~/lib/fileContextMenu";
import { cn } from "~/lib/utils";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { useStore } from "~/store";

import { Input } from "./ui/input";

import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";
import { FileEditorPane } from "./files/FileEditorPane";
import { FileTabs } from "./files/FileTabs";
import { FilesPanelResults } from "./files/FilesPanelResults";
import { FilesPanelTree } from "./files/FilesPanelTree";

export interface FilesPanelProps {
  mode: DiffPanelMode;
}

const SEARCH_DEBOUNCE_MS = 200;

export default function FilesPanel({ mode }: FilesPanelProps) {
  const setOpen = useFilesPanelStore((s) => s.setOpen);
  const setCwd = useFilesPanelStore((s) => s.setCwd);
  const openFileAt = useFilesPanelStore((s) => s.openFileAt);
  const closeFile = useFilesPanelStore((s) => s.closeFile);
  const activeRelativePath = useFilesPanelStore((s) => s.activeRelativePath);
  const searchQuery = useFilesPanelStore((s) => s.searchQuery);
  const setSearchQuery = useFilesPanelStore((s) => s.setSearchQuery);
  const searchScope = useFilesPanelStore((s) => s.searchScope);
  const setSearchScope = useFilesPanelStore((s) => s.setSearchScope);
  const filters = useFilesPanelStore((s) => s.filters);
  const setFilters = useFilesPanelStore((s) => s.setFilters);

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

  // Keep the store's activeCwd in sync so tabs / editor can read it.
  useEffect(() => {
    setCwd(activeCwd);
    return () => setCwd(null);
  }, [activeCwd, setCwd]);

  const { resolvedTheme } = useTheme();
  const availableEditors = useServerAvailableEditors();

  const handleOpenFile = useCallback(
    (relativePath: string, selection?: { line: number; column: number } | null) => {
      openFileAt(relativePath, selection ?? null);
    },
    [openFileAt],
  );

  const handleContextMenuFile = useCallback(
    (relativePath: string, position: { x: number; y: number }) => {
      if (!activeCwd) return;
      void showFileContextMenu({
        cwd: activeCwd,
        relativePath,
        availableEditors,
        position,
        onOpen: () => openFileAt(relativePath, null),
      });
    },
    [activeCwd, availableEditors, openFileAt],
  );

  const trimmedQuery = draftQuery.trim();
  const hasActiveSearch = trimmedQuery.length > 0;

  // Editor renders inline whenever a file is active.
  //  - sidebar mode: horizontal split [editor | tree] within the Files sidebar.
  //    This replaces the old FileEditorInlineSidebar, which caused two
  //    right-docked `fixed` sidebars to overlap and leave a dead gap.
  //  - sheet / inline modes: classic stacked layout (tree on top, editor below)
  //    stays for space efficiency on narrow viewports.
  const showInlineEditor = Boolean(activeRelativePath);
  const useHorizontalSplit = mode === "sidebar" && showInlineEditor;

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          {/* Left: title + search — search fills the available space */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Files
            </span>
            <div className="relative min-w-0 flex-1">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground/50"
              />
              <Input
                type="search"
                size="sm"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder={
                  searchScope === "names" ? "Search file names…" : "Search file contents…"
                }
                className="pl-7 pr-7"
                aria-label="Search files"
              />
              {draftQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
                  onClick={() => setDraftQuery("")}
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          </div>
          {/* Right: close button */}
          <button
            type="button"
            aria-label="Close Files panel"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => setOpen(false)}
          >
            <XIcon className="size-4" />
          </button>
        </>
      }
    >
      {/* Scope + filter toolbar — sits below the drag-region header */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border/60 px-2 py-1.5">
        <button
          type="button"
          aria-label="Search names"
          aria-pressed={searchScope === "names"}
          onClick={() => setSearchScope("names")}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            searchScope === "names"
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:bg-accent/40 hover:text-muted-foreground",
          )}
        >
          Names
        </button>
        <button
          type="button"
          aria-label="Search contents"
          aria-pressed={searchScope === "contents"}
          onClick={() => setSearchScope("contents")}
          className={cn(
            "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
            searchScope === "contents"
              ? "bg-accent text-foreground"
              : "text-muted-foreground/60 hover:bg-accent/40 hover:text-muted-foreground",
          )}
        >
          Contents
        </button>
        {searchScope === "contents" && (
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              title="Match case"
              aria-label="Match case"
              aria-pressed={filters.caseSensitive}
              onClick={() => setFilters({ caseSensitive: !filters.caseSensitive })}
              className={cn(
                "flex size-6 items-center justify-center rounded transition-colors",
                filters.caseSensitive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:bg-accent/40 hover:text-muted-foreground",
              )}
            >
              <CaseSensitiveIcon className="size-4" />
            </button>
            <button
              type="button"
              title="Use regular expression"
              aria-label="Use regular expression"
              aria-pressed={filters.useRegex}
              onClick={() => setFilters({ useRegex: !filters.useRegex })}
              className={cn(
                "flex size-6 items-center justify-center rounded transition-colors",
                filters.useRegex
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground/40 hover:bg-accent/40 hover:text-muted-foreground",
              )}
            >
              <RegexIcon className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {activeCwd ? (
        useHorizontalSplit ? (
          // Sidebar mode + active file: editor on the left (flex-1), tree on the
          // right at a fixed-ish width. A single Sidebar hosts both panes so we
          // no longer stack two `fixed right-0` sidebars on top of each other.
          // overflow-hidden at each level prevents CodeMirror's long lines and
          // tree rows from bleeding past the sidebar edge during resize.
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <FileTabs />
              <FileEditorPane cwd={activeCwd} relativePath={activeRelativePath!} />
            </div>
            <div className="flex min-h-0 w-[220px] shrink-0 flex-col overflow-hidden border-l border-border/60">
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
                  onContextMenuFile={handleContextMenuFile}
                />
              ) : (
                <FilesPanelTree
                  cwd={activeCwd}
                  activeRelativePath={activeRelativePath}
                  resolvedTheme={resolvedTheme}
                  onOpenFile={(path) => handleOpenFile(path)}
                  onContextMenuFile={handleContextMenuFile}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Tree / search results — shrinks when inline editor is visible (sheet/inline mode). */}
            <div
              className={
                showInlineEditor
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
                  onContextMenuFile={handleContextMenuFile}
                />
              ) : (
                <FilesPanelTree
                  cwd={activeCwd}
                  activeRelativePath={activeRelativePath}
                  resolvedTheme={resolvedTheme}
                  onOpenFile={(path) => handleOpenFile(path)}
                  onContextMenuFile={handleContextMenuFile}
                />
              )}
            </div>
            {/* Inline editor — sheet/inline modes only; sidebar mode uses the horizontal split above. */}
            {showInlineEditor ? (
              <FileEditorPane
                cwd={activeCwd}
                relativePath={activeRelativePath!}
                onClose={() => closeFile(activeRelativePath!)}
              />
            ) : null}
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
          No active workspace.
        </div>
      )}
    </DiffPanelShell>
  );
}
