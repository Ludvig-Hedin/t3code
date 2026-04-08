/**
 * AutomationsManager — Main UI for browsing, creating, editing, and running automations.
 *
 * Features:
 *  - Table with constrained name column (prompt preview truncated)
 *  - Hover-reveal checkboxes with select-all in header
 *  - Bulk action bar: Run selected / Delete selected
 *  - Project filter pill tabs
 *  - Sort menu (name, status, next run, last ran, created)
 *  - Group by project when "All" filter is active
 */
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  EditIcon,
  EllipsisIcon,
  FolderIcon,
  LoaderCircleIcon,
  PlayIcon,
  PlusIcon,
  TimerIcon,
  Trash2Icon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

import { AutomationDialog } from "~/components/AutomationDialog";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Dialog, DialogTrigger } from "~/components/ui/dialog";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { cn } from "~/lib/utils";
import { DEFAULT_RUNTIME_MODE, type ProviderKind, type ServerProvider } from "@t3tools/contracts";
import { buildAutomationRunTitle, resolveAutomationProject } from "~/automationsRunner";
import {
  type AutomItem,
  type CreateAutomationInput,
  FREQUENCY_LABELS,
  useAutomationsStore,
} from "~/automationsStore";
import { newCommandId, newMessageId, newThreadId } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { resolveAppModelSelection } from "~/modelSelection";
import { toastManager } from "~/components/ui/toast";
import { waitForStartedServerThread } from "./ChatView.logic";
import { useServerConfig } from "~/rpc/serverState";
import { useSettings } from "~/hooks/useSettings";
import { useStore } from "~/store";

// ── Types ─────────────────────────────────────────────────────────────

type SortKey = "name" | "status" | "nextRun" | "lastRan" | "createdAt";
type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  status: "Status",
  nextRun: "Next run",
  lastRan: "Last ran",
  createdAt: "Created",
};
const EMPTY_PROVIDER_STATUSES: readonly ServerProvider[] = [];

// ── Helpers ───────────────────────────────────────────────────────────

function formatRunTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  if (absMs < 60_000) return "just now";
  const minutes = Math.floor(absMs / 60_000);
  if (absMs < 3_600_000) return diffMs < 0 ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.floor(absMs / 3_600_000);
  if (absMs < 86_400_000) return diffMs < 0 ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.floor(absMs / 86_400_000);
  if (absMs < 7 * 86_400_000) return diffMs < 0 ? `${days}d ago` : `in ${days}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sortAutomations(items: AutomItem[], key: SortKey, dir: SortDir): AutomItem[] {
  return items.toSorted((a, b) => {
    let cmp = 0;
    switch (key) {
      case "name":
        cmp = a.name.localeCompare(b.name);
        break;
      case "status":
        cmp = a.status.localeCompare(b.status);
        break;
      case "nextRun":
        cmp = (a.nextRun ?? "").localeCompare(b.nextRun ?? "");
        break;
      case "lastRan":
        cmp = (a.lastRan ?? "").localeCompare(b.lastRan ?? "");
        break;
      case "createdAt":
        cmp = a.createdAt.localeCompare(b.createdAt);
        break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AutomItem["status"] }) {
  if (status === "running") {
    return (
      <Badge variant="outline" className="gap-1 border-blue-500/30 bg-blue-500/10 text-blue-500">
        <LoaderCircleIcon className="size-3 animate-spin" />
        Running
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      >
        <CircleCheckIcon className="size-3" />
        Active
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 border-muted-foreground/30 bg-muted/50 text-muted-foreground"
    >
      <CirclePauseIcon className="size-3" />
      Paused
    </Badge>
  );
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 w-full min-w-0 rounded-full border border-ring bg-background px-3 text-sm outline-none transition-colors"
    />
  );
}

// ── AutomationRow ─────────────────────────────────────────────────────

function AutomationRow({
  item,
  selected,
  anySelected,
  onToggle,
  onRunNow,
}: {
  item: AutomItem;
  selected: boolean;
  anySelected: boolean;
  onToggle: () => void;
  onRunNow: (automation: AutomItem) => void;
}) {
  const rename = useAutomationsStore((s) => s.renameAutomation);
  const deleteAuto = useAutomationsStore((s) => s.deleteAutomation);
  const toggle = useAutomationsStore((s) => s.toggleAutomationStatus);
  const update = useAutomationsStore((s) => s.updateAutomation);

  const [renaming, setRenaming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <AutomationDialog
          existing={item}
          onSave={(input: CreateAutomationInput) => {
            update(item.id, input);
            setEditOpen(false);
          }}
        />
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">&ldquo;{item.name}&rdquo;</span>? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter variant="bare">
            <AlertDialogClose
              render={
                <Button variant="outline" size="sm" className="rounded-full">
                  Cancel
                </Button>
              }
            />
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    deleteAuto(item.id);
                    setDeleteOpen(false);
                  }}
                >
                  Delete
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <tr
        className={cn(
          "group border-b border-border/50 transition-colors",
          selected ? "bg-accent/40" : "hover:bg-muted/30",
        )}
      >
        {/* Checkbox cell */}
        <td className="w-10 py-3 pl-4 pr-0">
          <div
            className={cn(
              "transition-opacity",
              anySelected || selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`Select ${item.name}`}
            />
          </div>
        </td>

        {/* Name + prompt preview — max-w-0 forces truncation within the colgroup width */}
        <td className="max-w-0 py-3 pr-3 pl-2">
          {renaming ? (
            <RenameInput
              initial={item.name}
              onCommit={(name) => {
                if (name.trim()) rename(item.id, name.trim());
                setRenaming(false);
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
              {item.prompt && (
                <span className="truncate text-xs text-muted-foreground/60">{item.prompt}</span>
              )}
            </div>
          )}
        </td>

        {/* Frequency */}
        <td className="whitespace-nowrap py-3 px-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <TimerIcon className="size-3.5 shrink-0 opacity-50" />
            <span>{FREQUENCY_LABELS[item.frequency]}</span>
            {item.frequencyTime && item.frequency !== "manual" && item.frequency !== "hourly" && (
              <span className="text-muted-foreground/40">· {item.frequencyTime}</span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="py-3 px-3">
          <StatusBadge status={item.status} />
        </td>

        {/* Next run */}
        <td className="whitespace-nowrap py-3 px-3 text-sm tabular-nums text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarClockIcon className="size-3.5 shrink-0 opacity-50" />
            {item.frequency === "manual"
              ? "Manual"
              : item.nextRun
                ? formatRunTime(item.nextRun)
                : "—"}
          </div>
        </td>

        {/* Last ran */}
        <td className="whitespace-nowrap py-3 px-3 text-sm tabular-nums text-muted-foreground">
          {formatRunTime(item.lastRan)}
        </td>

        {/* Row actions */}
        <td className="py-3 pl-2 pr-4">
          <div
            className={cn(
              "flex items-center justify-end gap-1 transition-opacity",
              anySelected ? "opacity-0" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
              disabled={item.status === "running"}
              onClick={() => onRunNow(item)}
            >
              <PlayIcon className="size-3" />
              Run now
            </Button>

            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    aria-label="More actions"
                  >
                    <EllipsisIcon className="size-4" />
                  </Button>
                }
              />
              <MenuPopup>
                <MenuItem onClick={() => setRenaming(true)}>
                  <EditIcon className="size-3.5 opacity-70" />
                  Rename
                </MenuItem>
                <MenuItem onClick={() => setEditOpen(true)}>
                  <ZapIcon className="size-3.5 opacity-70" />
                  Edit prompt &amp; settings
                </MenuItem>
                <MenuItem onClick={() => toggle(item.id)}>
                  {item.status === "active" ? (
                    <>
                      <CirclePauseIcon className="size-3.5 opacity-70" />
                      Pause
                    </>
                  ) : (
                    <>
                      <CircleCheckIcon className="size-3.5 opacity-70" />
                      Resume
                    </>
                  )}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon className="size-3.5" />
                  Delete
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        </td>
      </tr>
    </>
  );
}

// ── Group header row ──────────────────────────────────────────────────

function ProjectGroupRow({
  project,
  count,
  allSelected,
  someSelected,
  onToggleAll,
}: {
  project: string;
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
}) {
  return (
    <tr className="border-b border-border/30 bg-muted/20">
      {/* Checkbox col */}
      <td className="py-2 pl-4 pr-0 w-10">
        <Checkbox
          checked={allSelected}
          indeterminate={!allSelected && someSelected}
          onCheckedChange={onToggleAll}
          aria-label={`Select all in ${project}`}
          className="opacity-60 hover:opacity-100"
        />
      </td>
      <td colSpan={6} className="py-2 pl-2 pr-4">
        <div className="flex items-center gap-2">
          <FolderIcon className="size-3.5 text-muted-foreground/60" />
          <span className="text-xs font-semibold text-muted-foreground">
            {project || "No project"}
          </span>
          <span className="text-xs text-muted-foreground/50">{count}</span>
        </div>
      </td>
    </tr>
  );
}

// ── Bulk action bar ───────────────────────────────────────────────────

function BulkBar({
  count,
  onRunSelected,
  onDeleteSelected,
  onClearSelection,
}: {
  count: number;
  onRunSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-ring/20 bg-accent/30 px-4 py-2">
      <span className="text-xs font-medium text-foreground">{count} selected</span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-full px-3 text-xs"
          onClick={onRunSelected}
        >
          <PlayIcon className="size-3" />
          Run selected
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 rounded-full border-destructive/30 px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDeleteSelected}
        >
          <Trash2Icon className="size-3" />
          Delete selected
        </Button>
      </div>
      <button
        type="button"
        className="ml-auto flex size-6 items-center justify-center rounded-full text-muted-foreground/60 hover:bg-accent hover:text-foreground"
        onClick={onClearSelection}
        aria-label="Clear selection"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

// ── Sort menu ─────────────────────────────────────────────────────────

function SortMenu({
  sortKey,
  sortDir,
  onSortChange,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
}) {
  const SortIcon = sortDir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          >
            <ArrowUpDownIcon className="size-3.5" />
            {SORT_LABELS[sortKey]}
            <SortIcon className="size-3 opacity-60" />
          </Button>
        }
      />
      <MenuPopup align="end">
        <MenuRadioGroup
          value={`${sortKey}:${sortDir}`}
          onValueChange={(v) => {
            const [k, d] = v.split(":") as [SortKey, SortDir];
            onSortChange(k, d);
          }}
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).flatMap((k) => [
            <MenuRadioItem key={`${k}:asc`} value={`${k}:asc`}>
              {SORT_LABELS[k]} ↑
            </MenuRadioItem>,
            <MenuRadioItem key={`${k}:desc`} value={`${k}:desc`}>
              {SORT_LABELS[k]} ↓
            </MenuRadioItem>,
          ])}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40">
        <ZapIcon className="size-6 text-muted-foreground/60" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">No automations yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Create an automation to schedule recurring agent tasks — standup summaries, security
          scans, weekly reports, and more.
        </p>
      </div>
      <Button size="sm" className="gap-1.5 rounded-full" onClick={onNew}>
        <PlusIcon className="size-3.5" />
        New automation
      </Button>
    </div>
  );
}

// ── AutomationsManager ────────────────────────────────────────────────

export function AutomationsManager() {
  const automations = useAutomationsStore((s) => s.automations);
  const createAutomation = useAutomationsStore((s) => s.createAutomation);
  const deleteAutomation = useAutomationsStore((s) => s.deleteAutomation);
  const runAutomation = useAutomationsStore((s) => s.runAutomation);
  const restoreAutomationRuntimeState = useAutomationsStore((s) => s.restoreAutomationRuntimeState);
  const projects = useStore((s) => s.projects);
  const providerStatuses = useServerConfig()?.providers ?? EMPTY_PROVIDER_STATUSES;
  const settings = useSettings();
  const navigate = useNavigate();

  // ── Local UI state ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  // ── Derived data ───────────────────────────────────────────────────

  /** All unique project names present in automations list */
  const allProjects = useMemo(
    () => [...new Set(automations.map((a) => a.project).filter(Boolean))].toSorted(),
    [automations],
  );

  /** Filtered + sorted flat list */
  const visibleItems = useMemo(() => {
    const filtered = projectFilter
      ? automations.filter((a) => a.project === projectFilter)
      : automations;
    return sortAutomations(filtered, sortKey, sortDir);
  }, [automations, projectFilter, sortKey, sortDir]);

  /**
   * When showing all projects, group items by project name for section headers.
   * Returns null when a project filter is active (render flat).
   */
  const groups = useMemo<Map<string, AutomItem[]> | null>(() => {
    if (projectFilter !== null) return null;
    const map = new Map<string, AutomItem[]>();
    for (const item of visibleItems) {
      const key = item.project || "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [visibleItems, projectFilter]);

  const runAutomationChat = useCallback(
    async (automation: AutomItem, options?: { navigateAfterRun?: boolean }) => {
      const project = resolveAutomationProject(projects, automation.project);
      if (!project) {
        toastManager.add({
          type: "error",
          title: "Project not found",
          description: `Could not resolve the project for “${automation.name}”.`,
        });
        return null;
      }

      const api = readNativeApi();
      if (!api) {
        toastManager.add({
          type: "error",
          title: "Automation run unavailable",
          description: "Open Bird Code in the desktop app to start an automation chat.",
        });
        return null;
      }

      const previousRuntimeState = runAutomation(automation.id);
      if (!previousRuntimeState) {
        return null;
      }

      const threadId = newThreadId();
      const createdAt = new Date().toISOString();
      const resolvedProvider = automation.provider as ProviderKind;
      const resolvedModel = resolveAppModelSelection(
        resolvedProvider,
        settings,
        providerStatuses,
        automation.model,
      );
      const modelSelection = {
        provider: resolvedProvider,
        model: resolvedModel,
      };
      const title = buildAutomationRunTitle(automation);

      try {
        await api.orchestration.dispatchCommand({
          type: "thread.turn.start",
          commandId: newCommandId(),
          threadId,
          message: {
            messageId: newMessageId(),
            role: "user",
            text: automation.prompt,
            attachments: [],
          },
          modelSelection,
          titleSeed: title,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: "default",
          bootstrap: {
            createThread: {
              projectId: project.id,
              title,
              modelSelection,
              runtimeMode: DEFAULT_RUNTIME_MODE,
              interactionMode: "default",
              branch: null,
              worktreePath: null,
              createdAt,
            },
          },
          createdAt,
        });

        const started = await waitForStartedServerThread(threadId, 2_000);
        if (!started) {
          throw new Error("The automation chat did not start in time.");
        }

        if (previousRuntimeState.status === "paused") {
          restoreAutomationRuntimeState(automation.id, {
            status: previousRuntimeState.status,
            nextRun: previousRuntimeState.nextRun,
          });
        } else {
          restoreAutomationRuntimeState(automation.id, {
            status: previousRuntimeState.status,
          });
        }

        if (options?.navigateAfterRun !== false) {
          await navigate({
            to: "/$threadId",
            params: { threadId },
          });
        }

        return threadId;
      } catch (error) {
        if (api) {
          await api.orchestration
            .dispatchCommand({
              type: "thread.delete",
              commandId: newCommandId(),
              threadId,
            })
            .catch(() => undefined);
        }
        restoreAutomationRuntimeState(automation.id, previousRuntimeState);
        toastManager.add({
          type: "error",
          title: "Could not run automation",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        });
        return null;
      }
    },
    [navigate, projects, providerStatuses, restoreAutomationRuntimeState, runAutomation, settings],
  );

  // ── Selection helpers ──────────────────────────────────────────────

  const toggleItem = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((a) => selectedIds.has(a.id));
  const someVisibleSelected = visibleItems.some((a) => selectedIds.has(a.id));
  const anySelected = selectedIds.size > 0;

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleItems.map((a) => a.id)));
    }
  };

  /** Toggle all items within a specific project group */
  const toggleGroup = (items: AutomItem[]) => {
    const allChecked = items.every((a) => selectedIds.has(a.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (allChecked) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  // ── Bulk actions ───────────────────────────────────────────────────

  const handleBulkRun = async () => {
    let lastThreadId: string | null = null;
    for (const id of selectedIds) {
      const automation = automations.find((item) => item.id === id);
      if (!automation) {
        continue;
      }
      const startedThreadId = await runAutomationChat(automation, { navigateAfterRun: false });
      if (startedThreadId) {
        lastThreadId = startedThreadId;
      }
    }
    if (lastThreadId) {
      await navigate({
        to: "/$threadId",
        params: { threadId: lastThreadId },
      });
    }
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    for (const id of selectedIds) {
      deleteAutomation(id);
    }
    setSelectedIds(new Set());
    setBulkDeleteOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-6">
      {/* ── Toolbar ── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">Automations</p>
          <p className="text-xs text-muted-foreground">
            {automations.length === 0
              ? "Schedule recurring agent tasks"
              : `${automations.length} automation${automations.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {automations.length > 0 && (
            <SortMenu
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
            />
          )}
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger
              render={
                <Button size="sm" className="gap-1.5 rounded-full">
                  <PlusIcon className="size-3.5" />
                  New automation
                </Button>
              }
            />
            <AutomationDialog
              onSave={(input) => {
                createAutomation(input);
                setCreateOpen(false);
              }}
            />
          </Dialog>
        </div>
      </div>

      {automations.length === 0 ? (
        <EmptyState onNew={() => setCreateOpen(true)} />
      ) : (
        <>
          {/* ── Project filter tabs ── */}
          {allProjects.length > 1 && (
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/50 py-2 scrollbar-none">
              <FilterPill
                active={projectFilter === null}
                onClick={() => {
                  setProjectFilter(null);
                  setSelectedIds(new Set());
                }}
              >
                All
              </FilterPill>
              {allProjects.map((p) => (
                <FilterPill
                  key={p}
                  active={projectFilter === p}
                  onClick={() => {
                    setProjectFilter(p);
                    setSelectedIds(new Set());
                  }}
                >
                  {p}
                </FilterPill>
              ))}
            </div>
          )}

          {/* ── Bulk action bar (shown when items selected) ── */}
          {anySelected && (
            <BulkBar
              count={selectedIds.size}
              onRunSelected={handleBulkRun}
              onDeleteSelected={() => setBulkDeleteOpen(true)}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          )}

          {/* ── Bulk delete confirm ── */}
          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} automations</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {selectedIds.size} automation
                  {selectedIds.size === 1 ? "" : "s"}. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter variant="bare">
                <AlertDialogClose
                  render={
                    <Button variant="outline" size="sm" className="rounded-full">
                      Cancel
                    </Button>
                  }
                />
                <AlertDialogClose
                  render={
                    <Button
                      variant="destructive"
                      size="sm"
                      className="rounded-full"
                      onClick={handleBulkDelete}
                    >
                      Delete all
                    </Button>
                  }
                />
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>

          {/* ── Table ── */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full min-w-0 text-left">
              {/*
               * colgroup constrains the name column so the prompt preview
               * never causes horizontal overflow on small viewports.
               */}
              <colgroup>
                <col className="w-10" /> {/* checkbox */}
                <col className="w-[28%] min-w-[120px]" /> {/* name */}
                <col className="w-32" /> {/* frequency */}
                <col className="w-20" /> {/* status */}
                <col className="w-28" /> {/* next run */}
                <col className="w-24" /> {/* last ran */}
                <col className="w-28" /> {/* actions */}
              </colgroup>

              {/* Column headers */}
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  {/* Select-all checkbox */}
                  <th className="py-2.5 pl-4 pr-0 w-10">
                    <div
                      className={cn(
                        "transition-opacity",
                        anySelected || allVisibleSelected
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <Checkbox
                        checked={allVisibleSelected}
                        indeterminate={!allVisibleSelected && someVisibleSelected}
                        onCheckedChange={toggleAllVisible}
                        aria-label="Select all"
                      />
                    </div>
                  </th>
                  <th className="py-2.5 pl-2 pr-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Frequency</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Next run</th>
                  <th className="py-2.5 px-3 font-medium">Last ran</th>
                  <th className="py-2.5 pl-2 pr-4" />
                </tr>
              </thead>

              <tbody>
                {groups
                  ? // ── Grouped view ──────────────────────────────
                    [...groups.entries()].map(([project, items]) => {
                      const groupAllSelected = items.every((a) => selectedIds.has(a.id));
                      const groupSomeSelected = items.some((a) => selectedIds.has(a.id));
                      return (
                        <Fragment key={project}>
                          <ProjectGroupRow
                            project={project}
                            count={items.length}
                            allSelected={groupAllSelected}
                            someSelected={groupSomeSelected}
                            onToggleAll={() => toggleGroup(items)}
                          />
                          {items.map((item) => (
                            <AutomationRow
                              key={item.id}
                              item={item}
                              selected={selectedIds.has(item.id)}
                              anySelected={anySelected}
                              onToggle={() => toggleItem(item.id)}
                              onRunNow={(automation) => {
                                void runAutomationChat(automation);
                              }}
                            />
                          ))}
                        </Fragment>
                      );
                    })
                  : // ── Flat filtered view ────────────────────────
                    visibleItems.map((item) => (
                      <AutomationRow
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        anySelected={anySelected}
                        onToggle={() => toggleItem(item.id)}
                        onRunNow={(automation) => {
                          void runAutomationChat(automation);
                        }}
                      />
                    ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── FilterPill ────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 shrink-0 rounded-full px-3 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
