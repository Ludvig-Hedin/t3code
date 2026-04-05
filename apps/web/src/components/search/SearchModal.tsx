import { FileIcon, FolderIcon, MessageSquareIcon, SearchIcon } from "lucide-react";
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
import { useStore } from "../../store";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn } from "../../lib/utils";
import { CommandDialog, CommandDialogPopup, CommandFooter, CommandShortcut } from "../ui/command";
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
  threadId: string;
  threadTitle: string;
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

/** Score a result by how well the title matches the query (higher = better). */
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

// ── Standalone sub-components ─────────────────────────────────────────

/** Group header + items for the "All" grouped view. Lives outside the modal
 *  to avoid being recreated on each render (consistent-function-scoping). */
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
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setQuery("");
      setFilter("all");
      setSortOrder("recent");
      setSelectedIndex(0);
    }
  }, [open]);

  // ── Data sources ──────────────────────────────────────────────────

  const { sidebarThreadsById, threads } = useStore(
    useShallow((s) => ({
      sidebarThreadsById: s.sidebarThreadsById,
      threads: s.threads,
    })),
  );

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Build file results: unique paths across all threads, keyed by path
  const fileResults = useMemo<FileResult[]>(() => {
    // Map: path → most-recent occurrence (by turn completedAt)
    const byPath = new Map<
      string,
      { threadId: string; threadTitle: string; timestamp: string | null }
    >();

    for (const thread of threads) {
      for (const diffSummary of thread.turnDiffSummaries) {
        for (const file of diffSummary.files) {
          const existing = byPath.get(file.path);
          const ts = diffSummary.completedAt ?? null;
          const existingTs = existing?.timestamp ?? null;
          if (!existing || (ts && (!existingTs || ts > existingTs))) {
            byPath.set(file.path, {
              threadId: thread.id,
              threadTitle: thread.title || "Untitled thread",
              timestamp: ts,
            });
          }
        }
      }
    }

    return Array.from(byPath.entries()).map(([path, meta]) => ({
      type: "file" as const,
      id: `file:${path}`,
      title: path.split("/").pop() ?? path,
      subtitle: path,
      threadId: meta.threadId,
      threadTitle: meta.threadTitle,
      timestamp: meta.timestamp,
    }));
  }, [threads]);

  // ── Search & filter ───────────────────────────────────────────────

  const results = useMemo<SearchResult[]>(() => {
    const threadEntries = Object.values(sidebarThreadsById) as SidebarThreadSummary[];

    // Build results per type
    const threadResults: ThreadResult[] = threadEntries
      .filter((t) => !t.archivedAt)
      .filter((t) => matchesQuery(t.title || "Untitled", query))
      .map((t) => ({
        type: "thread" as const,
        id: t.id,
        title: t.title || "Untitled thread",
        projectName: projectsById.get(t.projectId)?.name ?? "",
        projectId: t.projectId,
        timestamp: t.latestUserMessageAt ?? t.createdAt,
      }));

    const projectResults: ProjectResult[] = projects
      .filter((p) => matchesQuery(p.name, query))
      .map((p) => ({
        type: "project" as const,
        id: p.id,
        title: p.name,
        subtitle: p.cwd,
        timestamp: p.updatedAt ?? p.createdAt ?? null,
      }));

    const matchedFiles: FileResult[] = fileResults.filter(
      (f) =>
        matchesQuery(f.title, query) ||
        matchesQuery(f.subtitle, query) ||
        matchesQuery(f.threadTitle, query),
    );

    // Apply type filter
    let combined: SearchResult[] = [];
    if (filter === "all") {
      combined = [...threadResults, ...projectResults, ...matchedFiles];
    } else if (filter === "threads") {
      combined = threadResults;
    } else if (filter === "projects") {
      combined = projectResults;
    } else {
      combined = matchedFiles;
    }

    // Sort (toSorted returns a new array without mutating the original)
    if (sortOrder === "recent") {
      if (query) {
        // When searching: rank by match quality first, then recency
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
  }, [sidebarThreadsById, projects, fileResults, query, filter, sortOrder, projectsById]);

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
        // Navigate to the first thread of this project, or root
        const firstThreadId = Object.values(sidebarThreadsById).find(
          (t) => t.projectId === result.id && !t.archivedAt,
        )?.id;
        if (firstThreadId) {
          void navigate({ to: "/$threadId", params: { threadId: firstThreadId } });
        } else {
          void navigate({ to: "/" });
        }
      } else {
        // Navigate to the thread that owns this file
        void navigate({ to: "/$threadId", params: { threadId: result.threadId } });
      }
    },
    [navigate, onOpenChange, sidebarThreadsById],
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

    const threads = results.filter((r): r is ThreadResult => r.type === "thread");
    const projs = results.filter((r): r is ProjectResult => r.type === "project");
    const files = results.filter((r): r is FileResult => r.type === "file");

    return { threads, projects: projs, files };
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

    const subtitle =
      result.type === "thread"
        ? result.projectName
        : result.type === "project"
          ? result.subtitle
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup className="max-h-[560px]">
        {/* Search input */}
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

        {/* Filter + Sort bar */}
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

        {/* Results */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto p-2"
          style={{ maxHeight: "380px" }}
        >
          {results.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {query ? `No results for "${query}"` : "No items found"}
            </div>
          ) : grouped ? (
            // Grouped "All" view
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
                label="Files"
                items={grouped.files}
                startIndex={grouped.threads.length + grouped.projects.length}
                renderItem={(item, idx) => <ResultItem key={item.id} result={item} index={idx} />}
              />
            </>
          ) : (
            // Flat filtered view
            results.map((result, i) => <ResultItem key={result.id} result={result} index={i} />)
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
