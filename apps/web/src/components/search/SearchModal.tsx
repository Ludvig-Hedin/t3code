import {
  FileIcon,
  FolderIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  SearchIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";
import { useQueries } from "@tanstack/react-query";
import { useStore } from "../../store";
import { projectSearchEntriesQueryOptions } from "../../lib/projectReactQuery";
import { openInPreferredEditor } from "../../editorPreferences";
import { readNativeApi } from "../../nativeApi";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn } from "../../lib/utils";
import { CommandDialog, CommandDialogPopup, CommandFooter, CommandShortcut } from "../ui/command";
import { toastManager } from "../ui/toast";
import { ProjectId } from "@t3tools/contracts";
import type { Project, SidebarThreadSummary } from "../../types";

// ── Types ─────────────────────────────────────────────────────────────

type FilterType = "all" | "threads" | "projects" | "files";
type SortOrder = "recent" | "az";

interface ThreadResult {
  type: "thread";
  id: string;
  title: string;
  projectName: string;
  projectId: string;
  timestamp: string | null;
}

interface ProjectResult {
  type: "project";
  id: string;
  title: string;
  subtitle: string;
  timestamp: string | null;
}

interface FileResult {
  type: "file";
  id: string;
  title: string;
  subtitle: string;
  /** Project that owns this file */
  projectId: string;
  projectName: string;
  /** Thread that most recently changed this file, if known */
  threadId: string | null;
  timestamp: string | null;
}

type SearchResult = ThreadResult | ProjectResult | FileResult;

// ── Props ─────────────────────────────────────────────────────────────

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
}

// ── Helpers ───────────────────────────────────────────────────────────

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.toLowerCase().includes(query.toLowerCase());
}

function matchScore(title: string, query: string): number {
  if (!query) return 0;
  const lower = title.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 3;
  if (lower.startsWith(q)) return 2;
  if (lower.includes(q)) return 1;
  return 0;
}

function sortByRecency(a: SearchResult, b: SearchResult): number {
  const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
  const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
  return tb - ta;
}

function sortByAz(a: SearchResult, b: SearchResult): number {
  return a.title.localeCompare(b.title);
}

/** Deduplicate file results by subtitle (full path + projectId) keeping most recent. */
function deduplicateFiles(files: FileResult[]): FileResult[] {
  const seen = new Map<string, FileResult>();
  for (const f of files) {
    const key = `${f.projectId}:${f.subtitle}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, f);
    } else if (f.timestamp && (!existing.timestamp || f.timestamp > existing.timestamp)) {
      seen.set(key, f);
    }
  }
  return Array.from(seen.values());
}

// ── Standalone sub-components ─────────────────────────────────────────

/** Group header + items for the "All" grouped view. */
function GroupSection({
  label,
  items,
  startIndex,
  renderItem,
}: {
  label: string;
  items: SearchResult[];
  startIndex: number;
  renderItem: (item: SearchResult, index: number) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-1">
      <div className="mb-0.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </div>
      {items.map((item, i) => renderItem(item, startIndex + i))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function SearchModal({ open, onOpenChange, projects }: SearchModalProps) {
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("recent");
  // Project filter pill — only active on "threads" and "files" tabs
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Debounced query sent to the filesystem search API (300 ms delay)
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setFilter("all");
      setSortOrder("recent");
      setSelectedProjectId(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounce query for the file search API
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Clear project filter when switching away from tabs that show it
  useEffect(() => {
    if (filter === "all" || filter === "projects") {
      setSelectedProjectId(null);
    }
  }, [filter]);

  // ── Data sources ──────────────────────────────────────────────────

  const { sidebarThreadsById, threads } = useStore(
    useShallow((s) => ({
      sidebarThreadsById: s.sidebarThreadsById,
      threads: s.threads,
    })),
  );

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Build "file path → most-recent thread" index from turnDiffSummaries.
  // This may be sparse/empty if the server hasn't sent checkpoint data yet —
  // it's used only as a best-effort thread-link for filesystem search results.
  const fileThreadIndex = useMemo(() => {
    const index = new Map<
      string, // "projectId:path"
      { threadId: string; timestamp: string | null }
    >();
    for (const thread of threads) {
      for (const diff of thread.turnDiffSummaries) {
        for (const file of diff.files) {
          const key = `${thread.projectId}:${file.path}`;
          const existing = index.get(key);
          const ts = diff.completedAt ?? null;
          if (!existing || (ts && (!existing.timestamp || ts > existing.timestamp))) {
            index.set(key, { threadId: thread.id, timestamp: ts });
          }
        }
      }
    }
    return index;
  }, [threads]);

  // Recently-changed files built from the thread diff index (used in "All" tab).
  const recentlyChangedFiles = useMemo<FileResult[]>(() => {
    const results: FileResult[] = [];
    for (const [key, meta] of fileThreadIndex.entries()) {
      const colonIdx = key.indexOf(":");
      const projectId = key.slice(0, colonIdx);
      const path = key.slice(colonIdx + 1);
      const project = projectsById.get(ProjectId.makeUnsafe(projectId));
      results.push({
        type: "file",
        id: `diff:${key}`,
        title: path.split("/").pop() ?? path,
        subtitle: path,
        projectId,
        projectName: project?.name ?? projectId,
        threadId: meta.threadId,
        timestamp: meta.timestamp,
      });
    }
    return results;
  }, [fileThreadIndex, projectsById]);

  // ── Filesystem file search via React Query ────────────────────────
  //
  // "Files" tab uses api.projects.searchEntries (same as the composer's "/" command).
  // We run one query per project (or one per selected project) so each project's
  // filesystem is searched independently. Queries are disabled unless the user has
  // typed something and is on the "files" tab.

  const fileSearchProjects = useMemo(
    () => (selectedProjectId ? projects.filter((p) => p.id === selectedProjectId) : projects),
    [projects, selectedProjectId],
  );

  const fileSearchQueries = useQueries({
    queries: fileSearchProjects.map((project) => ({
      ...projectSearchEntriesQueryOptions({
        cwd: project.cwd,
        query: debouncedQuery,
        enabled: filter === "files" && debouncedQuery.length > 0,
      }),
    })),
  });

  const isFileSearchLoading =
    filter === "files" && debouncedQuery.length > 0 && fileSearchQueries.some((q) => q.isFetching);

  const fsFileResults = useMemo<FileResult[]>(() => {
    if (filter !== "files" || debouncedQuery.length === 0) return [];
    const results: FileResult[] = [];
    for (let i = 0; i < fileSearchProjects.length; i++) {
      const project = fileSearchProjects[i];
      const data = fileSearchQueries[i]?.data;
      if (!project || !data) continue;
      for (const entry of data.entries) {
        if (entry.kind !== "file") continue;
        // Cross-reference with thread diff index for a best-effort thread link
        const meta = fileThreadIndex.get(`${project.id}:${entry.path}`);
        results.push({
          type: "file",
          id: `fs:${project.id}:${entry.path}`,
          title: entry.path.split("/").pop() ?? entry.path,
          subtitle: entry.path,
          projectId: project.id,
          projectName: project.name,
          threadId: meta?.threadId ?? null,
          timestamp: meta?.timestamp ?? null,
        });
      }
    }
    return deduplicateFiles(results);
  }, [filter, debouncedQuery, fileSearchProjects, fileSearchQueries, fileThreadIndex]);

  // ── Search & filter ───────────────────────────────────────────────

  const results = useMemo<SearchResult[]>(() => {
    const threadEntries = Object.values(sidebarThreadsById) as SidebarThreadSummary[];

    // Threads
    const threadResults: ThreadResult[] = threadEntries
      .filter((t) => !t.archivedAt)
      .filter((t) => !selectedProjectId || t.projectId === selectedProjectId)
      .filter((t) => matchesQuery(t.title || "Untitled", query))
      .map((t) => ({
        type: "thread" as const,
        id: t.id,
        title: t.title || "Untitled thread",
        projectName: projectsById.get(t.projectId)?.name ?? "",
        projectId: t.projectId,
        timestamp: t.latestUserMessageAt ?? t.createdAt,
      }));

    // Projects
    const projectResults: ProjectResult[] = projects
      .filter((p) => matchesQuery(p.name, query))
      .map((p) => ({
        type: "project" as const,
        id: p.id,
        title: p.name,
        subtitle: p.cwd,
        timestamp: p.updatedAt ?? p.createdAt ?? null,
      }));

    // Files — "files" tab uses filesystem search results; "all" tab uses
    // the thread-diff index as a best-effort "recently changed" list.
    const fileResults: FileResult[] =
      filter === "files"
        ? fsFileResults
        : recentlyChangedFiles
            .filter((f) => matchesQuery(f.title, query) || matchesQuery(f.subtitle, query))
            .filter((f) => !selectedProjectId || f.projectId === selectedProjectId);

    // Apply tab filter
    let combined: SearchResult[];
    if (filter === "all") {
      combined = [...threadResults, ...projectResults, ...fileResults];
    } else if (filter === "threads") {
      combined = threadResults;
    } else if (filter === "projects") {
      combined = projectResults;
    } else {
      // "files" tab — already filtered above
      combined = fileResults;
    }

    // Sort
    if (sortOrder === "recent") {
      if (query) {
        combined = combined.toSorted((a, b) => {
          const scoreDiff = matchScore(b.title, query) - matchScore(a.title, query);
          if (scoreDiff !== 0) return scoreDiff;
          return sortByRecency(a, b);
        });
      } else {
        combined = combined.toSorted(sortByRecency);
      }
    } else {
      combined = combined.toSorted(sortByAz);
    }

    return combined;
  }, [
    sidebarThreadsById,
    projects,
    fsFileResults,
    recentlyChangedFiles,
    query,
    filter,
    sortOrder,
    selectedProjectId,
    projectsById,
  ]);

  // Keep selectedIndex in bounds
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, results.length - 1)));
  }, [results.length]);

  // ── Navigation ────────────────────────────────────────────────────

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);
      if (result.type === "thread") {
        void navigate({ to: "/$threadId", params: { threadId: result.id } });
      } else if (result.type === "project") {
        // Navigate to the project's most recent active thread, or root
        const firstThreadId = Object.values(sidebarThreadsById).find(
          (t) => t.projectId === result.id && !t.archivedAt,
        )?.id;
        if (firstThreadId) {
          void navigate({ to: "/$threadId", params: { threadId: firstThreadId } });
        } else {
          void navigate({ to: "/" });
        }
      } else {
        // File result — open in the user's preferred code editor.
        // Build the absolute path from the project's cwd + the relative file path.
        const project = projectsById.get(ProjectId.makeUnsafe(result.projectId));
        const cwd = project?.cwd ?? "";
        const absolutePath = cwd ? `${cwd.replace(/\/$/, "")}/${result.subtitle}` : result.subtitle;

        const api = readNativeApi();
        if (!api) return;

        void openInPreferredEditor(api, absolutePath).catch(async (editorErr: unknown) => {
          // No preferred editor configured — fall back to OS default (opens Finder/Explorer)
          try {
            await api.shell.openExternal(`file://${absolutePath}`);
          } catch {
            toastManager.add({
              type: "error",
              title: "Could not open file",
              description:
                editorErr instanceof Error
                  ? editorErr.message
                  : "No editor or file manager available.",
            });
          }
        });
      }
    },
    [navigate, onOpenChange, sidebarThreadsById, projectsById],
  );

  // ── Keyboard navigation ───────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const result = results[selectedIndex];
        if (result) handleSelect(result);
      }
    },
    [results, selectedIndex, handleSelect],
  );

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(`[data-selected="true"]`);
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Grouped rendering ─────────────────────────────────────────────

  const grouped = useMemo(() => {
    if (filter !== "all") return null;
    const threadItems = results.filter((r): r is ThreadResult => r.type === "thread");
    const projectItems = results.filter((r): r is ProjectResult => r.type === "project");
    const fileItems = results.filter((r): r is FileResult => r.type === "file");
    return { threads: threadItems, projects: projectItems, files: fileItems };
  }, [results, filter]);

  // ── Render helpers ────────────────────────────────────────────────

  function ResultItem({ result, index }: { result: SearchResult; index: number }) {
    const isSelected = index === selectedIndex;

    const icon =
      result.type === "thread" ? (
        <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : result.type === "project" ? (
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
      );

    // For files on the Files tab, show project name; otherwise show path
    const subtitle =
      result.type === "thread"
        ? result.projectName
        : result.type === "project"
          ? result.subtitle
          : filter === "files" && projects.length > 1
            ? `${result.projectName} · ${result.subtitle}`
            : result.subtitle;

    return (
      <button
        type="button"
        data-selected={isSelected}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
          isSelected
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-accent/60 hover:text-accent-foreground",
        )}
        onMouseEnter={() => setSelectedIndex(index)}
        onClick={() => handleSelect(result)}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm leading-tight">{result.title}</div>
          {subtitle && (
            <div className="truncate text-muted-foreground text-xs leading-tight">{subtitle}</div>
          )}
        </div>
        {result.timestamp && (
          <span className="shrink-0 text-muted-foreground/60 text-xs">
            {formatRelativeTimeLabel(result.timestamp)}
          </span>
        )}
      </button>
    );
  }

  const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const shortcutLabel = isMac ? "⌘K" : "Ctrl+K";

  // Whether to show the project filter pill row
  const showProjectPills = (filter === "threads" || filter === "files") && projects.length > 1;

  // Determine the empty state message for the Files tab
  const filesEmptyMessage =
    filter === "files"
      ? debouncedQuery.length === 0
        ? "Type to search files in your projects…"
        : isFileSearchLoading
          ? null // loading spinner shown instead
          : `No files matching "${debouncedQuery}"`
      : query
        ? `No results for "${query}"`
        : "No items found";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup className="max-h-[580px]">
        {/* ── Search input ── */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground/60" />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Search threads, projects, files…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              className="text-muted-foreground/60 text-xs transition-colors hover:text-foreground"
              onClick={() => {
                setQuery("");
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
            >
              Clear
            </button>
          )}
        </div>

        {/* ── Filter tabs + sort ── */}
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <div className="flex items-center gap-0.5">
            {(["all", "threads", "projects", "files"] as FilterType[]).map((f) => (
              <button
                key={f}
                type="button"
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors",
                  filter === f
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                onClick={() => {
                  setFilter(f);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {(["recent", "az"] as SortOrder[]).map((s) => (
              <button
                key={s}
                type="button"
                className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  sortOrder === s
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                onClick={() => {
                  setSortOrder(s);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                {s === "recent" ? "Recent" : "A–Z"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Project filter pills — visible on Threads and Files tabs ── */}
        {showProjectPills && (
          <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-1.5 scrollbar-none">
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                selectedProjectId === null
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
              onClick={() => {
                setSelectedProjectId(null);
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
            >
              All projects
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={cn(
                  "shrink-0 max-w-[140px] truncate rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                  selectedProjectId === project.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
                title={project.name}
                onClick={() => {
                  setSelectedProjectId(selectedProjectId === project.id ? null : project.id);
                  setSelectedIndex(0);
                  inputRef.current?.focus();
                }}
              >
                {project.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Results ── */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto p-2"
          style={{ maxHeight: "380px" }}
        >
          {/* Loading spinner for filesystem file search */}
          {isFileSearchLoading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Searching files…
            </div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {filesEmptyMessage}
            </div>
          ) : grouped ? (
            // ── Grouped "All" view ──
            <>
              <GroupSection
                label="Threads"
                items={grouped.threads}
                startIndex={0}
                renderItem={(item, idx) => <ResultItem key={item.id} result={item} index={idx} />}
              />
              <GroupSection
                label="Projects"
                items={grouped.projects}
                startIndex={grouped.threads.length}
                renderItem={(item, idx) => <ResultItem key={item.id} result={item} index={idx} />}
              />
              <GroupSection
                label="Recently changed files"
                items={grouped.files}
                startIndex={grouped.threads.length + grouped.projects.length}
                renderItem={(item, idx) => <ResultItem key={item.id} result={item} index={idx} />}
              />
            </>
          ) : (
            // ── Flat filtered view ──
            results.map((result, i) => <ResultItem key={result.id} result={result} index={i} />)
          )}
          {/* Inline loading indicator when search is in progress but we already have stale results */}
          {isFileSearchLoading && results.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 pb-2 pt-1 text-muted-foreground/60 text-xs">
              <LoaderCircleIcon className="size-3 animate-spin" />
              Searching…
            </div>
          )}
        </div>

        <CommandFooter>
          <span>
            <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">↑↓</kbd>
            {" navigate · "}
            <kbd className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">↵</kbd>
            {" open"}
          </span>
          <CommandShortcut>{shortcutLabel}</CommandShortcut>
        </CommandFooter>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
