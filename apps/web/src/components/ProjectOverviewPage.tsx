/**
 * ProjectOverviewPage — full-page overview surfaced when a sidebar project
 * row is clicked.
 *
 * Content:
 *   - Project header (favicon, name, cwd, "Open editor", "Files", "New thread")
 *   - Latest threads with live status pills, grouped into user-defined groups
 *   - Docs section (README, AGENTS.md, CLAUDE.md, etc.)
 *   - Simple project todo list
 *   - Markdown notes with live preview + edit
 *
 * State lives in:
 *   - `useStore` (projects, threads, sidebar summaries) — real server state
 *   - `useProjectOverviewStore` — client-only groups / todos / notes
 *   - `useFilesPanelStore`  — shared files panel (activated by FilesExplorerModal)
 */
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  FileIcon,
  FilesIcon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SquarePenIcon,
  StickyNoteIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";

import { AppPageHeader } from "./AppPageHeader";
import ChatMarkdown from "./ChatMarkdown";
import { FileEditorPane } from "./files/FileEditorPane";
import { FilesPanelTree } from "./files/FilesPanelTree";
import { ProjectFavicon } from "./ProjectFavicon";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Menu, MenuGroup, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { Dialog, DialogBackdrop, DialogPortal, DialogViewport } from "./ui/dialog";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { openInPreferredEditor } from "../editorPreferences";
import { isElectron } from "../env";
import { useFilesPanelStore } from "../filesPanelStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useSettings } from "../hooks/useSettings";
import { useThreadActions } from "../hooks/useThreadActions";
import { useTheme } from "../hooks/useTheme";
import { projectListDirectoryQueryOptions, projectQueryKeys } from "../lib/projectReactQuery";
import { readNativeApi } from "../nativeApi";
import {
  type ProjectGroupId,
  type ProjectNoteId,
  type ProjectOverviewBucket,
  type ProjectTodoId,
  selectProjectBucket,
  useProjectOverviewStore,
} from "../projectOverviewStore";
import {
  resolveSidebarNewThreadEnvMode,
  resolveSidebarNewThreadSeedContext,
  resolveThreadStatusPill,
  sortThreadsForSidebar,
  type ThreadStatusPill,
} from "./Sidebar.logic";
import { useStore } from "../store";
import { useProjectById } from "../storeSelectors";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { toastManager } from "./ui/toast";
import type { SidebarThreadSummary } from "../types";
import { useUiStateStore } from "../uiStateStore";

const THREADS_PER_PAGE = 10;

const TOP_STATUS_ORDER: ThreadStatusPill["label"][] = [
  "Pending Approval",
  "Awaiting Input",
  "Plan Ready",
  "Working",
  "Connecting",
  "Completed",
];

/** .md files that are treated as "docs" even if not called README */
const DOC_FILE_NAMES = new Set([
  "readme.md",
  "agents.md",
  "claude.md",
  "gemini.md",
  "plan.md",
  "planning.md",
  "spec.md",
  "specs.md",
  "contributing.md",
  "changelog.md",
  "roadmap.md",
  "architecture.md",
  "design.md",
]);

interface ProjectOverviewPageProps {
  projectId: ProjectId;
}

export function ProjectOverviewPage({ projectId }: ProjectOverviewPageProps) {
  const navigate = useNavigate();
  const project = useProjectById(projectId);
  const { handleNewThread, activeThread, activeDraftThread } = useHandleNewThread();
  const appSettings = useSettings();
  const threadIds = useStore(useShallow((state) => state.threadIdsByProjectId[projectId] ?? []));
  const summariesById = useStore((state) => state.sidebarThreadsById);

  const summaries = useMemo<SidebarThreadSummary[]>(() => {
    const out: SidebarThreadSummary[] = [];
    for (const threadId of threadIds) {
      const summary = summariesById[threadId];
      if (summary && summary.archivedAt === null) out.push(summary);
    }
    return sortThreadsForSidebar(out, "updated_at");
  }, [threadIds, summariesById]);

  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);

  const bucket = useProjectOverviewStore(selectProjectBucket(projectId));

  const [filesModalOpen, setFilesModalOpen] = useState(false);

  const handleOpenNewThread = useCallback(() => {
    const seedContext = resolveSidebarNewThreadSeedContext({
      projectId,
      defaultEnvMode: resolveSidebarNewThreadEnvMode({
        defaultEnvMode: appSettings.defaultThreadEnvMode,
      }),
      activeThread:
        activeThread && activeThread.projectId === projectId
          ? {
              projectId: activeThread.projectId,
              branch: activeThread.branch,
              worktreePath: activeThread.worktreePath,
            }
          : null,
      activeDraftThread:
        activeDraftThread && activeDraftThread.projectId === projectId
          ? {
              projectId: activeDraftThread.projectId,
              branch: activeDraftThread.branch,
              worktreePath: activeDraftThread.worktreePath,
              envMode: activeDraftThread.envMode,
            }
          : null,
    });
    void handleNewThread(projectId, {
      ...(seedContext.branch !== undefined ? { branch: seedContext.branch } : {}),
      ...(seedContext.worktreePath !== undefined ? { worktreePath: seedContext.worktreePath } : {}),
      envMode: seedContext.envMode,
    });
  }, [
    activeDraftThread,
    activeThread,
    appSettings.defaultThreadEnvMode,
    handleNewThread,
    projectId,
  ]);

  const handleOpenThread = useCallback(
    (threadId: ThreadId) => {
      void navigate({ to: "/$threadId", params: { threadId } });
    },
    [navigate],
  );

  const handleOpenEditor = useCallback(async () => {
    const api = readNativeApi();
    if (!api || !project) return;
    try {
      await openInPreferredEditor(api, project.cwd);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to open project in editor",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  }, [project]);

  if (!project) {
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
        {!isElectron && <MobileHeader title="Project" />}
        <AppPageHeader>
          <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
            Project
          </span>
        </AppPageHeader>
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
              <FolderOpenIcon className="size-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-base font-semibold">Project not found</h1>
              <p className="text-sm text-muted-foreground">
                This project may have been deleted or is still loading.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/" })}>
              Back to threads
            </Button>
          </div>
        </div>
      </SidebarInset>
    );
  }

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground isolate">
      {!isElectron && <MobileHeader title={project.name} />}

      <AppPageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <ProjectFavicon cwd={project.cwd} />
          <span className="truncate text-xs font-medium text-foreground">{project.name}</span>
          <span className="hidden truncate text-[11px] text-muted-foreground/70 sm:inline">
            · {project.cwd}
          </span>
        </div>
        <div className="ms-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="outline" size="xs" onClick={() => void handleOpenEditor()}>
                  <FolderOpenIcon className="size-3.5" />
                  Open
                </Button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              Open in editor
            </TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="outline" size="xs" onClick={() => setFilesModalOpen(true)}>
                  <FilesIcon className="size-3.5" />
                  Files
                </Button>
              }
            />
            <TooltipPopup side="bottom" sideOffset={4}>
              Browse project files
            </TooltipPopup>
          </Tooltip>
          <Button size="xs" onClick={handleOpenNewThread}>
            <SquarePenIcon className="size-3.5" />
            New thread
          </Button>
        </div>
      </AppPageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
          <ProjectSummaryBanner
            name={project.name}
            cwd={project.cwd}
            summaries={summaries}
            bucket={bucket}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-5">
              <ThreadsSection
                projectId={projectId}
                summaries={summaries}
                bucket={bucket}
                threadLastVisitedAtById={threadLastVisitedAtById}
                onOpenThread={handleOpenThread}
                onNewThread={handleOpenNewThread}
              />
              <NotesSection projectId={projectId} bucket={bucket} cwd={project.cwd} />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <DocsSection cwd={project.cwd} />
              <TodosSection projectId={projectId} bucket={bucket} />
            </div>
          </div>
        </div>
      </div>

      <FilesExplorerModal
        open={filesModalOpen}
        onClose={() => setFilesModalOpen(false)}
        cwd={project.cwd}
        projectName={project.name}
      />
    </SidebarInset>
  );
}

function MobileHeader({ title }: { title: string }) {
  return (
    <header className="border-b border-border px-3 py-2 md:hidden">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="size-7 shrink-0" />
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Summary banner
// ---------------------------------------------------------------------------

interface ProjectSummaryBannerProps {
  name: string;
  cwd: string;
  summaries: SidebarThreadSummary[];
  bucket: ProjectOverviewBucket;
}

function ProjectSummaryBanner({ name, cwd, summaries, bucket }: ProjectSummaryBannerProps) {
  const statusCounts = useMemo(() => {
    const counts: Record<ThreadStatusPill["label"], number> = {
      "Pending Approval": 0,
      "Awaiting Input": 0,
      Working: 0,
      Connecting: 0,
      "Plan Ready": 0,
      Completed: 0,
    };
    for (const summary of summaries) {
      const pill = resolveThreadStatusPill({ thread: summary });
      if (!pill) continue;
      counts[pill.label] += 1;
    }
    return counts;
  }, [summaries]);

  const openTodos = bucket.todos.filter((todo) => !todo.done).length;
  const totalThreads = summaries.length;
  const activeStatuses = TOP_STATUS_ORDER.flatMap((label) => {
    const count = statusCounts[label];
    if (count === 0) return [];
    const pill = exemplarStatusPill(label);
    return [{ label, count, pill }];
  });

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
            <span className="uppercase tracking-[0.16em]">Project</span>
          </div>
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{name}</h1>
          <p className="truncate text-xs text-muted-foreground">{cwd}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryStat label="Threads" value={totalThreads} />
          <SummaryStat label="Groups" value={bucket.groups.length} />
          <SummaryStat label="Open todos" value={openTodos} />
          <SummaryStat label="Notes" value={bucket.notes.length} />
        </div>
      </div>
      {activeStatuses.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeStatuses.map(({ label, count, pill }) => (
            <StatusBadge key={label} pill={pill} count={count} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-[68px] flex-col items-start rounded-lg border border-border/70 bg-card px-2.5 py-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function exemplarStatusPill(label: ThreadStatusPill["label"]): ThreadStatusPill {
  switch (label) {
    case "Pending Approval":
      return {
        label,
        colorClass: "text-amber-600 dark:text-amber-300/90",
        dotClass: "bg-amber-500 dark:bg-amber-300/90",
        pulse: false,
      };
    case "Awaiting Input":
      return {
        label,
        colorClass: "text-indigo-600 dark:text-indigo-300/90",
        dotClass: "bg-indigo-500 dark:bg-indigo-300/90",
        pulse: false,
      };
    case "Working":
      return {
        label,
        colorClass: "text-muted-foreground",
        dotClass: "bg-muted-foreground/60",
        pulse: true,
      };
    case "Connecting":
      return {
        label,
        colorClass: "text-sky-600 dark:text-sky-300/80",
        dotClass: "bg-sky-500 dark:bg-sky-300/80",
        pulse: true,
      };
    case "Plan Ready":
      return {
        label,
        colorClass: "text-violet-600 dark:text-violet-300/90",
        dotClass: "bg-violet-500 dark:bg-violet-300/90",
        pulse: false,
      };
    case "Completed":
    default:
      return {
        label: "Completed",
        colorClass: "text-emerald-600 dark:text-emerald-300/90",
        dotClass: "bg-emerald-500 dark:bg-emerald-300/90",
        pulse: false,
      };
  }
}

function StatusBadge({ pill, count }: { pill: ThreadStatusPill; count: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] font-medium ${pill.colorClass}`}
    >
      <span
        className={`size-1.5 rounded-full ${pill.dotClass} ${pill.pulse ? "animate-pulse" : ""}`}
      />
      {pill.label}
      <span className="text-muted-foreground/70">· {count}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Threads section
// ---------------------------------------------------------------------------

interface ThreadsSectionProps {
  projectId: ProjectId;
  summaries: SidebarThreadSummary[];
  bucket: ProjectOverviewBucket;
  threadLastVisitedAtById: Record<string, string>;
  onOpenThread: (threadId: ThreadId) => void;
  onNewThread: () => void;
}

function ThreadsSection({
  projectId,
  summaries,
  bucket,
  threadLastVisitedAtById,
  onOpenThread,
  onNewThread,
}: ThreadsSectionProps) {
  const addGroup = useProjectOverviewStore((state) => state.addGroup);
  const renameGroup = useProjectOverviewStore((state) => state.renameGroup);
  const deleteGroup = useProjectOverviewStore((state) => state.deleteGroup);
  const setThreadGroup = useProjectOverviewStore((state) => state.setThreadGroup);
  const { archiveThread, deleteThread } = useThreadActions();

  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<ProjectGroupId | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState("");
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<ThreadId>>(() => new Set());
  const [bulkGroupPickerOpen, setBulkGroupPickerOpen] = useState(false);

  // Per-group show-more state; "ungrouped" uses key ""
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const groupedThreadIds = useMemo(() => {
    const assigned = new Set<string>();
    for (const group of bucket.groups) {
      for (const id of group.threadIds) assigned.add(id);
    }
    return assigned;
  }, [bucket.groups]);

  const ungroupedThreads = useMemo(
    () => summaries.filter((summary) => !groupedThreadIds.has(summary.id)),
    [groupedThreadIds, summaries],
  );

  const threadById = useMemo(() => {
    const map = new Map<ThreadId, SidebarThreadSummary>();
    for (const summary of summaries) map.set(summary.id, summary);
    return map;
  }, [summaries]);

  const toggleCollapsed = (groupId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCommitNewGroup = () => {
    const trimmed = newGroupName.trim();
    if (trimmed.length === 0) {
      setCreatingGroup(false);
      setNewGroupName("");
      return;
    }
    addGroup(projectId, trimmed);
    setNewGroupName("");
    setCreatingGroup(false);
  };

  const handleCommitRenameGroup = () => {
    if (renamingGroupId === null) return;
    const trimmed = renamingGroupName.trim();
    if (trimmed.length > 0) {
      renameGroup(projectId, renamingGroupId, trimmed);
    }
    setRenamingGroupId(null);
    setRenamingGroupName("");
  };

  const toggleSelect = (id: ThreadId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBulkArchive = async () => {
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await archiveThread(id);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      toastManager.add({ type: "error", title: `${failed} thread(s) could not be archived` });
    }
    exitSelectionMode();
  };

  const handleBulkDelete = async () => {
    const ok = await window.confirm(`Delete ${selectedIds.size} thread(s)? This cannot be undone.`);
    if (!ok) return;
    let failed = 0;
    for (const id of selectedIds) {
      try {
        await deleteThread(id);
      } catch {
        failed++;
      }
    }
    if (failed > 0) {
      toastManager.add({ type: "error", title: `${failed} thread(s) could not be deleted` });
    }
    exitSelectionMode();
  };

  const handleBulkMoveToGroup = (groupId: ProjectGroupId | null) => {
    for (const id of selectedIds) {
      setThreadGroup(projectId, id, groupId);
    }
    setBulkGroupPickerOpen(false);
    exitSelectionMode();
  };

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Threads</h2>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {summaries.length}
        </span>
        <div className="ms-auto flex items-center gap-1.5">
          {selectionMode ? (
            <Button variant="ghost" size="xs" onClick={exitSelectionMode}>
              <XIcon className="size-3.5" />
              Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setCreatingGroup(true);
                  setNewGroupName("");
                }}
              >
                <PlusIcon className="size-3.5" />
                New group
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setSelectionMode(true);
                  setSelectedIds(new Set());
                }}
              >
                Select
              </Button>
              <Button variant="outline" size="xs" onClick={onNewThread}>
                <SquarePenIcon className="size-3.5" />
                New thread
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-col gap-1 px-2 py-2">
        {creatingGroup ? (
          <div className="mx-2 my-1 flex items-center gap-2 rounded-lg border border-border/70 bg-background/60 p-2">
            <Input
              nativeInput
              size="sm"
              placeholder="Group name"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleCommitNewGroup();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setCreatingGroup(false);
                  setNewGroupName("");
                }
              }}
              autoFocus
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button size="xs" onClick={handleCommitNewGroup}>
              Add
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setCreatingGroup(false);
                setNewGroupName("");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}

        {bucket.groups.map((group) => {
          const collapsed = collapsedGroupIds.has(group.id);
          const groupThreads = group.threadIds.flatMap((id) => {
            const thread = threadById.get(id);
            return thread ? [thread] : [];
          });
          const isRenaming = renamingGroupId === group.id;
          const showAll = expandedGroups.has(group.id);
          const visibleGroupThreads = showAll
            ? groupThreads
            : groupThreads.slice(0, THREADS_PER_PAGE);
          const hiddenGroupCount = groupThreads.length - visibleGroupThreads.length;
          return (
            <div key={group.id} className="rounded-lg">
              <div className="group flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  aria-label={collapsed ? "Expand group" : "Collapse group"}
                  className="flex size-5 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                  onClick={() => toggleCollapsed(group.id)}
                >
                  {collapsed ? (
                    <ChevronRightIcon className="size-3.5" />
                  ) : (
                    <ChevronDownIcon className="size-3.5" />
                  )}
                </button>
                {isRenaming ? (
                  <Input
                    nativeInput
                    size="sm"
                    value={renamingGroupName}
                    onChange={(event) => setRenamingGroupName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleCommitRenameGroup();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setRenamingGroupId(null);
                        setRenamingGroupName("");
                      }
                    }}
                    onBlur={handleCommitRenameGroup}
                    autoFocus
                    className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                ) : (
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-semibold text-foreground/90"
                    onClick={() => toggleCollapsed(group.id)}
                  >
                    <span className="truncate">{group.name}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground">
                      {groupThreads.length}
                    </span>
                  </button>
                )}
                <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Rename group"
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                          onClick={() => {
                            setRenamingGroupId(group.id);
                            setRenamingGroupName(group.name);
                          }}
                        >
                          <PencilIcon className="size-3" />
                        </button>
                      }
                    />
                    <TooltipPopup side="top">Rename</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label="Delete group"
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteGroup(projectId, group.id)}
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      }
                    />
                    <TooltipPopup side="top">Delete group</TooltipPopup>
                  </Tooltip>
                </div>
              </div>
              {!collapsed ? (
                <div className="flex flex-col gap-0.5 pb-1 pl-7 pr-2">
                  {groupThreads.length === 0 ? (
                    <p className="px-2 py-2 text-[11px] text-muted-foreground/60">
                      No threads in this group yet. Use the menu on a thread to add it here.
                    </p>
                  ) : (
                    <>
                      {visibleGroupThreads.map((summary) => (
                        <ThreadRow
                          key={summary.id}
                          summary={summary}
                          lastVisitedAt={threadLastVisitedAtById[summary.id]}
                          groups={bucket.groups}
                          currentGroupId={group.id}
                          selectionMode={selectionMode}
                          selected={selectedIds.has(summary.id)}
                          onSelect={() => toggleSelect(summary.id)}
                          onOpen={() => onOpenThread(summary.id)}
                          onAssignGroup={(nextGroupId) =>
                            setThreadGroup(projectId, summary.id, nextGroupId)
                          }
                        />
                      ))}
                      {hiddenGroupCount > 0 && (
                        <button
                          type="button"
                          className="mx-2 mt-0.5 text-left text-[11px] text-muted-foreground/70 hover:text-foreground"
                          onClick={() => toggleGroupExpanded(group.id)}
                        >
                          Show {hiddenGroupCount} more
                        </button>
                      )}
                      {showAll && groupThreads.length > THREADS_PER_PAGE && (
                        <button
                          type="button"
                          className="mx-2 mt-0.5 text-left text-[11px] text-muted-foreground/70 hover:text-foreground"
                          onClick={() => toggleGroupExpanded(group.id)}
                        >
                          Show less
                        </button>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="mt-1">
          <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            <span>All threads</span>
            <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground normal-case tracking-normal">
              {ungroupedThreads.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {ungroupedThreads.length === 0 ? (
              <button
                type="button"
                onClick={onNewThread}
                className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground/70 transition-colors hover:border-border hover:bg-accent/50 hover:text-foreground"
              >
                <SquarePenIcon className="size-3.5" />
                Start your first thread in this project
              </button>
            ) : (
              <>
                {(expandedGroups.has("")
                  ? ungroupedThreads
                  : ungroupedThreads.slice(0, THREADS_PER_PAGE)
                ).map((summary) => (
                  <ThreadRow
                    key={summary.id}
                    summary={summary}
                    lastVisitedAt={threadLastVisitedAtById[summary.id]}
                    groups={bucket.groups}
                    currentGroupId={null}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(summary.id)}
                    onSelect={() => toggleSelect(summary.id)}
                    onOpen={() => onOpenThread(summary.id)}
                    onAssignGroup={(nextGroupId) =>
                      setThreadGroup(projectId, summary.id, nextGroupId)
                    }
                  />
                ))}
                {!expandedGroups.has("") && ungroupedThreads.length > THREADS_PER_PAGE && (
                  <button
                    type="button"
                    className="mx-2 mt-1 text-left text-[11px] text-muted-foreground/70 hover:text-foreground"
                    onClick={() => toggleGroupExpanded("")}
                  >
                    Show {ungroupedThreads.length - THREADS_PER_PAGE} more
                  </button>
                )}
                {expandedGroups.has("") && ungroupedThreads.length > THREADS_PER_PAGE && (
                  <button
                    type="button"
                    className="mx-2 mt-1 text-left text-[11px] text-muted-foreground/70 hover:text-foreground"
                    onClick={() => toggleGroupExpanded("")}
                  >
                    Show less
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 border-t border-border/60 bg-muted/40 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{selectedIds.size} selected</span>
          <div className="ms-auto flex items-center gap-1.5">
            <Menu open={bulkGroupPickerOpen} onOpenChange={setBulkGroupPickerOpen}>
              <MenuTrigger
                render={
                  <Button size="xs" variant="outline">
                    Move to group
                  </Button>
                }
              />
              <MenuPopup align="end" className="min-w-40">
                <MenuGroup>
                  <MenuItem onClick={() => handleBulkMoveToGroup(null)}>Remove from group</MenuItem>
                </MenuGroup>
                {bucket.groups.length > 0 && (
                  <>
                    <MenuSeparator />
                    <MenuGroup>
                      {bucket.groups.map((g) => (
                        <MenuItem key={g.id} onClick={() => handleBulkMoveToGroup(g.id)}>
                          {g.name}
                        </MenuItem>
                      ))}
                    </MenuGroup>
                  </>
                )}
              </MenuPopup>
            </Menu>
            <Button size="xs" variant="outline" onClick={() => void handleBulkArchive()}>
              Archive
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleBulkDelete()}
            >
              <Trash2Icon className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

interface ThreadRowProps {
  summary: SidebarThreadSummary;
  lastVisitedAt: string | undefined;
  groups: ProjectOverviewBucket["groups"];
  currentGroupId: ProjectGroupId | null;
  selectionMode: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onAssignGroup: (groupId: ProjectGroupId | null) => void;
}

function ThreadRow({
  summary,
  lastVisitedAt,
  groups,
  currentGroupId,
  selectionMode,
  selected,
  onSelect,
  onOpen,
  onAssignGroup,
}: ThreadRowProps) {
  const pill = useMemo(
    () =>
      resolveThreadStatusPill({
        thread: {
          ...summary,
          lastVisitedAt,
        },
      }),
    [summary, lastVisitedAt],
  );
  const relativeTime = useMemo(() => {
    const iso = summary.latestUserMessageAt ?? summary.updatedAt ?? summary.createdAt;
    if (!iso) return null;
    return formatRelativeTimeLabel(iso);
  }, [summary]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (selectionMode) onSelect();
      else onOpen();
    }
  };

  return (
    <div className="group flex items-center gap-1">
      {selectionMode ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          onClick={onSelect}
          className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:border-foreground/40"
          }`}
        >
          {selected && <CheckIcon className="size-2.5" />}
        </button>
      ) : null}
      <button
        type="button"
        onClick={selectionMode ? onSelect : onOpen}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-1 flex-col rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="flex w-full items-center gap-2">
          {pill ? (
            <span
              className={`inline-flex size-2.5 shrink-0 items-center justify-center ${pill.pulse ? "animate-pulse" : ""}`}
              title={pill.label}
            >
              <span className={`size-1.5 rounded-full ${pill.dotClass}`} />
            </span>
          ) : (
            <span className="inline-flex size-2.5 shrink-0 items-center justify-center">
              <span className="size-1 rounded-full bg-muted-foreground/30" />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
            {summary.title || "Untitled thread"}
          </span>
          {relativeTime ? (
            <span className="shrink-0 text-[10px] text-muted-foreground/60">{relativeTime}</span>
          ) : null}
        </div>
        {pill ? (
          <span className={`ml-4 text-[10px] font-medium ${pill.colorClass}`}>{pill.label}</span>
        ) : null}
      </button>
      {!selectionMode && (
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label="Thread actions"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 data-[popup-open]:opacity-100"
                onClick={(event: MouseEvent<HTMLButtonElement>) => event.stopPropagation()}
              >
                <MoreHorizontalIcon className="size-3.5" />
              </button>
            }
          />
          <MenuPopup align="end" className="min-w-44">
            <MenuGroup>
              <MenuItem onClick={() => onOpen()}>Open thread</MenuItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuItem disabled={currentGroupId === null} onClick={() => onAssignGroup(null)}>
                {currentGroupId === null ? (
                  <span className="flex items-center gap-2">
                    <CheckIcon className="size-3.5" /> No group
                  </span>
                ) : (
                  "Remove from group"
                )}
              </MenuItem>
              {groups.length === 0 ? (
                <MenuItem disabled>No groups yet</MenuItem>
              ) : (
                groups.map((group) => (
                  <MenuItem key={group.id} onClick={() => onAssignGroup(group.id)}>
                    <span className="flex items-center gap-2">
                      {currentGroupId === group.id ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <span className="size-3.5" />
                      )}
                      <span className="truncate">{group.name}</span>
                    </span>
                  </MenuItem>
                ))
              )}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Docs section
// ---------------------------------------------------------------------------

interface DocsSectionProps {
  cwd: string;
}

function DocsSection({ cwd }: DocsSectionProps) {
  const rootQuery = useQuery(
    projectListDirectoryQueryOptions({ cwd, relativePath: "", staleTime: 30_000 }),
  );

  const docFiles = useMemo(() => {
    const entries = rootQuery.data?.entries ?? [];
    return entries.filter(
      (entry) =>
        entry.kind === "file" &&
        (DOC_FILE_NAMES.has(entry.path.toLowerCase()) || entry.path.toLowerCase().endsWith(".md")),
    );
  }, [rootQuery.data]);

  const [viewingDoc, setViewingDoc] = useState<string | null>(null);

  if (!rootQuery.data && rootQuery.isPending) return null;
  if (docFiles.length === 0) return null;

  return (
    <>
      <Card className="overflow-hidden">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <FileIcon className="size-3.5 text-muted-foreground/80" />
          <h2 className="text-sm font-semibold">Docs</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {docFiles.length}
          </span>
        </header>
        <ul className="flex flex-col divide-y divide-border/40">
          {docFiles.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                onClick={() => setViewingDoc(entry.path)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs transition-colors hover:bg-accent/60"
              >
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground/90">
                  {entry.path}
                </span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
              </button>
            </li>
          ))}
        </ul>
      </Card>

      {viewingDoc !== null && (
        <DocViewerDialog cwd={cwd} relativePath={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
    </>
  );
}

interface DocViewerDialogProps {
  cwd: string;
  relativePath: string;
  onClose: () => void;
}

function DocViewerDialog({ cwd, relativePath, onClose }: DocViewerDialogProps) {
  const api = readNativeApi();
  const fileQuery = useQuery({
    queryKey: ["doc-viewer", cwd, relativePath],
    queryFn: async () => {
      if (!api) throw new Error("No API");
      return api.projects.readFile({ cwd, relativePath });
    },
    enabled: Boolean(api),
  });

  const handleOpenEditor = async () => {
    if (!api) return;
    try {
      await openInPreferredEditor(api, cwd);
    } catch (err) {
      console.error("Failed to open preferred editor", { cwd, err });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="p-4">
          <DialogPrimitive.Popup className="relative row-start-2 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lg transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3">
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{relativePath}</span>
              <Button size="xs" variant="ghost" onClick={() => void handleOpenEditor()}>
                <FolderOpenIcon className="size-3.5" />
                Open
              </Button>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {fileQuery.isPending ? (
                <div className="text-xs text-muted-foreground">Loading…</div>
              ) : fileQuery.isError ? (
                <div className="text-xs text-destructive">Failed to load file.</div>
              ) : fileQuery.data ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ChatMarkdown text={fileQuery.data.contents} cwd={cwd} />
                </div>
              ) : null}
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Files explorer modal
// ---------------------------------------------------------------------------

interface FilesExplorerModalProps {
  open: boolean;
  onClose: () => void;
  cwd: string;
  projectName: string;
}

function FilesExplorerModal({ open, onClose, cwd, projectName }: FilesExplorerModalProps) {
  const setCwd = useFilesPanelStore((s) => s.setCwd);
  const openFileAt = useFilesPanelStore((s) => s.openFileAt);
  const closeFile = useFilesPanelStore((s) => s.closeFile);
  const activeRelativePath = useFilesPanelStore((s) => s.activeRelativePath);
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  // Sync cwd while modal is open; restore null on close.
  useEffect(() => {
    if (!open) return;
    setCwd(cwd);
    return () => setCwd(null);
  }, [open, cwd, setCwd]);

  // New-file form state
  const [newFilePath, setNewFilePath] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [createFileBusy, setCreateFileBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateFile = async () => {
    const trimmed = newFilePath.trim();
    if (!trimmed) return;
    const api = readNativeApi();
    if (!api) return;
    if (createFileBusy) return;
    setCreateError(null);
    setCreateFileBusy(true);
    try {
      await api.projects.writeFile({ cwd, relativePath: trimmed, contents: "" });
      // Invalidate the directory listing so the tree re-fetches.
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
      openFileAt(trimmed, null);
      setNewFilePath("");
      setCreatingFile(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create file");
    } finally {
      setCreateFileBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport className="p-0">
          <DialogPrimitive.Popup className="relative row-start-2 flex h-[92dvh] w-[92vw] max-w-[1200px] flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-xl transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
              <FilesIcon className="size-4 shrink-0 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {projectName}
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground/60">
                  · Files
                </span>
              </span>
              <div className="flex items-center gap-1.5">
                {creatingFile ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      nativeInput
                      size="sm"
                      placeholder="path/to/new-file.ts"
                      value={newFilePath}
                      onChange={(e) => {
                        setNewFilePath(e.target.value);
                        setCreateError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleCreateFile();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setCreatingFile(false);
                          setNewFilePath("");
                          setCreateError(null);
                        }
                      }}
                      autoFocus
                      className="w-56"
                    />
                    {createError && (
                      <span className="text-[11px] text-destructive">{createError}</span>
                    )}
                    <Button
                      size="xs"
                      onClick={() => void handleCreateFile()}
                      disabled={!newFilePath.trim() || createFileBusy}
                    >
                      Create
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setCreatingFile(false);
                        setNewFilePath("");
                        setCreateError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="xs" variant="outline" onClick={() => setCreatingFile(true)}>
                    <PlusIcon className="size-3.5" />
                    New file
                  </Button>
                )}
                <button
                  type="button"
                  aria-label="Close files browser"
                  onClick={onClose}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            </div>

            {/* Body: tree + editor */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {/* File tree */}
              <div className="flex min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-r border-border/60">
                <FilesPanelTree
                  cwd={cwd}
                  activeRelativePath={activeRelativePath}
                  resolvedTheme={resolvedTheme}
                  onOpenFile={(path) => openFileAt(path, null)}
                />
              </div>

              {/* Editor / placeholder */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {activeRelativePath ? (
                  <FileEditorPane
                    cwd={cwd}
                    relativePath={activeRelativePath}
                    onClose={() => closeFile(activeRelativePath)}
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/60">
                    Select a file to view or edit
                  </div>
                )}
              </div>
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Todos section
// ---------------------------------------------------------------------------

interface TodosSectionProps {
  projectId: ProjectId;
  bucket: ProjectOverviewBucket;
}

function TodosSection({ projectId, bucket }: TodosSectionProps) {
  const addTodo = useProjectOverviewStore((state) => state.addTodo);
  const toggleTodo = useProjectOverviewStore((state) => state.toggleTodo);
  const editTodo = useProjectOverviewStore((state) => state.editTodo);
  const deleteTodo = useProjectOverviewStore((state) => state.deleteTodo);
  const clearCompletedTodos = useProjectOverviewStore((state) => state.clearCompletedTodos);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<ProjectTodoId | null>(null);
  const [editingText, setEditingText] = useState("");
  // Tracks pending single-click timers per todo to suppress toggle on double-click.
  const clickTimers = useRef(new Map<ProjectTodoId, ReturnType<typeof setTimeout>>());

  const handleAdd = () => {
    const added = addTodo(projectId, draft);
    if (added) setDraft("");
  };

  const handleCommitEdit = () => {
    if (editingId === null) return;
    const trimmed = editingText.trim();
    if (trimmed.length > 0) editTodo(projectId, editingId, trimmed);
    setEditingId(null);
    setEditingText("");
  };

  const openCount = bucket.todos.filter((todo) => !todo.done).length;
  const doneCount = bucket.todos.length - openCount;

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Todos</h2>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {openCount} open
        </span>
        {doneCount > 0 ? (
          <button
            type="button"
            onClick={() => clearCompletedTodos(projectId)}
            className="ms-auto text-[11px] text-muted-foreground/70 hover:text-foreground"
          >
            Clear completed
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            nativeInput
            size="sm"
            placeholder="Add a todo…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={draft.trim().length === 0}>
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        </div>

        {bucket.todos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground/70">
            No todos yet. Add the first one above.
          </p>
        ) : (
          <ul className="flex flex-col">
            {bucket.todos.map((todo) => {
              const isEditing = editingId === todo.id;
              return (
                <li
                  key={todo.id}
                  className="group flex items-start gap-2 border-b border-border/40 py-1.5 last:border-b-0"
                >
                  <button
                    type="button"
                    aria-label={todo.done ? "Mark as not done" : "Mark as done"}
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      todo.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border bg-background text-transparent hover:border-foreground/40"
                    }`}
                    onClick={() => toggleTodo(projectId, todo.id)}
                  >
                    <CheckIcon className="size-3" />
                  </button>
                  {isEditing ? (
                    <Input
                      nativeInput
                      size="sm"
                      value={editingText}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCommitEdit();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          setEditingId(null);
                          setEditingText("");
                        }
                      }}
                      onBlur={handleCommitEdit}
                      autoFocus
                      className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
                    />
                  ) : (
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate text-left text-xs ${
                        todo.done ? "text-muted-foreground/60 line-through" : "text-foreground/90"
                      }`}
                      onClick={() => {
                        const existing = clickTimers.current.get(todo.id);
                        if (existing) clearTimeout(existing);
                        const timer = setTimeout(() => {
                          clickTimers.current.delete(todo.id);
                          toggleTodo(projectId, todo.id);
                        }, 250);
                        clickTimers.current.set(todo.id, timer);
                      }}
                      onDoubleClick={() => {
                        const existing = clickTimers.current.get(todo.id);
                        if (existing) {
                          clearTimeout(existing);
                          clickTimers.current.delete(todo.id);
                        }
                        setEditingId(todo.id);
                        setEditingText(todo.text);
                      }}
                    >
                      {todo.text}
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {!isEditing ? (
                      <button
                        type="button"
                        aria-label="Edit todo"
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setEditingId(todo.id);
                          setEditingText(todo.text);
                        }}
                      >
                        <PencilIcon className="size-3" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Delete todo"
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => deleteTodo(projectId, todo.id)}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Notes section
// ---------------------------------------------------------------------------

interface NotesSectionProps {
  projectId: ProjectId;
  bucket: ProjectOverviewBucket;
  cwd: string;
}

function NotesSection({ projectId, bucket, cwd }: NotesSectionProps) {
  const addNote = useProjectOverviewStore((state) => state.addNote);
  const renameNote = useProjectOverviewStore((state) => state.renameNote);
  const updateNoteContent = useProjectOverviewStore((state) => state.updateNoteContent);
  const deleteNote = useProjectOverviewStore((state) => state.deleteNote);
  const setActiveNote = useProjectOverviewStore((state) => state.setActiveNote);

  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [renamingNoteId, setRenamingNoteId] = useState<ProjectNoteId | null>(null);
  const [renamingNoteName, setRenamingNoteName] = useState("");
  const [draft, setDraft] = useState<string>("");
  const draftNoteIdRef = useRef<ProjectNoteId | null>(null);

  const activeNote = useMemo(
    () => bucket.notes.find((note) => note.id === bucket.activeNoteId) ?? bucket.notes[0] ?? null,
    [bucket.activeNoteId, bucket.notes],
  );

  useEffect(() => {
    if (!activeNote) {
      draftNoteIdRef.current = null;
      setDraft("");
      return;
    }
    if (draftNoteIdRef.current !== activeNote.id) {
      draftNoteIdRef.current = activeNote.id;
      setDraft(activeNote.content);
    }
  }, [activeNote]);

  const handleAddNote = () => {
    const id = addNote(projectId, "Untitled note");
    setMode("edit");
    setRenamingNoteId(id);
    setRenamingNoteName("Untitled note");
  };

  const handleCommitNoteRename = () => {
    if (renamingNoteId === null) return;
    renameNote(projectId, renamingNoteId, renamingNoteName);
    setRenamingNoteId(null);
    setRenamingNoteName("");
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (activeNote) updateNoteContent(projectId, activeNote.id, value);
  };

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <StickyNoteIcon className="size-3.5 text-muted-foreground/80" />
        <h2 className="text-sm font-semibold">Notes</h2>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {bucket.notes.length}
        </span>
        <div className="ms-auto flex items-center gap-1.5">
          {activeNote ? (
            <div className="flex overflow-hidden rounded-md border border-border/60">
              <button
                type="button"
                className={`px-2 py-0.5 text-[11px] font-medium ${
                  mode === "preview"
                    ? "bg-accent text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("preview")}
              >
                <span className="flex items-center gap-1">
                  <EyeIcon className="size-3" />
                  Preview
                </span>
              </button>
              <button
                type="button"
                className={`px-2 py-0.5 text-[11px] font-medium ${
                  mode === "edit"
                    ? "bg-accent text-foreground"
                    : "bg-transparent text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMode("edit")}
              >
                <span className="flex items-center gap-1">
                  <PencilIcon className="size-3" />
                  Edit
                </span>
              </button>
            </div>
          ) : null}
          <Button variant="ghost" size="xs" onClick={handleAddNote}>
            <PlusIcon className="size-3.5" />
            New note
          </Button>
        </div>
      </header>

      {bucket.notes.length === 0 ? (
        <div className="px-4 py-6">
          <button
            type="button"
            onClick={handleAddNote}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 px-3 py-6 text-xs text-muted-foreground/70 transition-colors hover:border-border hover:bg-accent/40 hover:text-foreground"
          >
            <PlusIcon className="size-3.5" />
            Add your first note (markdown)
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="border-b border-border/60 md:border-b-0 md:border-r">
            <ul className="flex flex-col gap-0.5 p-1.5">
              {bucket.notes.map((note) => {
                const isActive = activeNote?.id === note.id;
                const isRenaming = renamingNoteId === note.id;
                return (
                  <li key={note.id} className="group">
                    {isRenaming ? (
                      <div className="flex items-center gap-1 px-1">
                        <Input
                          nativeInput
                          size="sm"
                          value={renamingNoteName}
                          onChange={(event) => setRenamingNoteName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleCommitNoteRename();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setRenamingNoteId(null);
                              setRenamingNoteName("");
                            }
                          }}
                          onBlur={handleCommitNoteRename}
                          autoFocus
                          className="h-7 border-0 bg-transparent shadow-none focus-visible:ring-0"
                        />
                      </div>
                    ) : (
                      <div
                        className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] ${
                          isActive
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        }`}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 truncate text-left"
                          onClick={() => {
                            setActiveNote(projectId, note.id);
                            setMode("preview");
                          }}
                          onDoubleClick={() => {
                            setRenamingNoteId(note.id);
                            setRenamingNoteName(note.name);
                          }}
                        >
                          {note.name}
                        </button>
                        <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label="Rename note"
                                  className="flex size-5 items-center justify-center rounded hover:bg-background/80"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRenamingNoteId(note.id);
                                    setRenamingNoteName(note.name);
                                  }}
                                >
                                  <PencilIcon className="size-3" />
                                </button>
                              }
                            />
                            <TooltipPopup side="top">Rename</TooltipPopup>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label="Delete note"
                                  className="flex size-5 items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    deleteNote(projectId, note.id);
                                  }}
                                >
                                  <XIcon className="size-3" />
                                </button>
                              }
                            />
                            <TooltipPopup side="top">Delete</TooltipPopup>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex min-h-[280px] flex-col">
            {activeNote ? (
              <NotePreviewOrEditor
                cwd={cwd}
                mode={mode}
                content={draft}
                onChange={handleDraftChange}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
                Select a note to preview, or create a new one.
              </div>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}

function NotePreviewOrEditor({
  cwd,
  mode,
  content,
  onChange,
}: {
  cwd: string;
  mode: "preview" | "edit";
  content: string;
  onChange: (value: string) => void;
}) {
  if (mode === "edit") {
    return (
      <div className="flex flex-1 flex-col p-3">
        <Textarea
          size="sm"
          className="min-h-[260px]"
          placeholder="Write markdown here…"
          value={content}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-[260px] flex-1 flex-col overflow-auto p-5">
      {content.trim().length === 0 ? (
        <EmptyPreviewHint />
      ) : (
        <ChatMarkdownPreview content={content} cwd={cwd} />
      )}
    </div>
  );
}

function EmptyPreviewHint() {
  return (
    <div className="flex flex-1 items-center justify-center text-center">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">This note is empty.</p>
        <p className="text-[11px] text-muted-foreground/70">
          Switch to Edit to start writing — Markdown is fully supported.
        </p>
      </div>
    </div>
  );
}

function ChatMarkdownPreview({ content, cwd }: { content: string; cwd: string }): ReactNode {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ChatMarkdown text={content} cwd={cwd} />
    </div>
  );
}
