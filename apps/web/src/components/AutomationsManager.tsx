/**
 * AutomationsManager — Main UI for browsing, creating, editing, and running automations.
 *
 * Table-based layout showing each automation's status, schedule, last run, and next run.
 * Actions per row: Run Now, Edit (opens AutomationDialog), Rename (inline), Delete (with confirm).
 */
import {
  CalendarClockIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  EditIcon,
  EllipsisIcon,
  LoaderCircleIcon,
  PlusIcon,
  PlayIcon,
  TimerIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";

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
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Dialog, DialogTrigger } from "~/components/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "~/components/ui/menu";
import {
  type AutomItem,
  type CreateAutomationInput,
  FREQUENCY_LABELS,
  useAutomationsStore,
} from "~/automationsStore";

// ── Helpers ───────────────────────────────────────────────────────────

/** Format an ISO string as a short relative or absolute datetime. */
function formatRunTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  // Less than a minute
  if (absMs < 60_000) return "just now";

  const minutes = Math.floor(absMs / 60_000);
  if (absMs < 3_600_000) return diffMs < 0 ? `${minutes}m ago` : `in ${minutes}m`;

  const hours = Math.floor(absMs / 3_600_000);
  if (absMs < 86_400_000) return diffMs < 0 ? `${hours}h ago` : `in ${hours}h`;

  const days = Math.floor(absMs / 86_400_000);
  if (absMs < 7 * 86_400_000) return diffMs < 0 ? `${days}d ago` : `in ${days}d`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Status badge ──────────────────────────────────────────────────────

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

// ── Rename cell ───────────────────────────────────────────────────────

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
      className="h-6 w-full min-w-0 rounded border border-ring bg-background px-2 text-sm outline-none ring-2 ring-ring/24"
    />
  );
}

// ── Delete confirm dialog ─────────────────────────────────────────────

function DeleteConfirmDialog({
  automation,
  open,
  onOpenChange,
  onConfirm,
}: {
  automation: AutomItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete automation</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">"{automation.name}"</span>? This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter variant="bare">
          <AlertDialogClose
            render={
              <Button variant="outline" size="sm">
                Cancel
              </Button>
            }
          />
          <AlertDialogClose
            render={
              <Button variant="destructive" size="sm" onClick={onConfirm}>
                Delete
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}

// ── AutomationRow ─────────────────────────────────────────────────────

function AutomationRow({ item }: { item: AutomItem }) {
  const rename = useAutomationsStore((s) => s.renameAutomation);
  const deleteAuto = useAutomationsStore((s) => s.deleteAutomation);
  const runAuto = useAutomationsStore((s) => s.runAutomation);
  const toggle = useAutomationsStore((s) => s.toggleAutomationStatus);
  const update = useAutomationsStore((s) => s.updateAutomation);

  const [renaming, setRenaming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleRenameCommit = (name: string) => {
    if (name.trim()) rename(item.id, name.trim());
    setRenaming(false);
  };

  const handleEdit = (input: CreateAutomationInput) => {
    update(item.id, input);
    setEditOpen(false);
  };

  return (
    <>
      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <AutomationDialog existing={item} onSave={handleEdit} />
      </Dialog>

      {/* Delete confirm */}
      <DeleteConfirmDialog
        automation={item}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          deleteAuto(item.id);
          setDeleteOpen(false);
        }}
      />

      <tr className="group border-b border-border/50 transition-colors hover:bg-muted/30">
        {/* Name */}
        <td className="py-3 pl-4 pr-3">
          {renaming ? (
            <RenameInput
              initial={item.name}
              onCommit={handleRenameCommit}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
              {item.prompt && (
                <span className="truncate text-xs text-muted-foreground/70">
                  {item.prompt.slice(0, 80)}
                  {item.prompt.length > 80 ? "…" : ""}
                </span>
              )}
            </div>
          )}
        </td>

        {/* Project */}
        <td className="py-3 px-3 text-sm text-muted-foreground">{item.project || "—"}</td>

        {/* Frequency */}
        <td className="py-3 px-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <TimerIcon className="size-3.5 shrink-0 opacity-60" />
            {FREQUENCY_LABELS[item.frequency]}
            {item.frequencyTime && item.frequency !== "manual" && item.frequency !== "hourly" && (
              <span className="text-muted-foreground/50">· {item.frequencyTime}</span>
            )}
          </div>
        </td>

        {/* Status */}
        <td className="py-3 px-3">
          <StatusBadge status={item.status} />
        </td>

        {/* Next Run */}
        <td className="py-3 px-3 text-sm tabular-nums text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarClockIcon className="size-3.5 shrink-0 opacity-60" />
            {item.frequency === "manual"
              ? "Manual"
              : item.nextRun
                ? formatRunTime(item.nextRun)
                : "—"}
          </div>
        </td>

        {/* Last Ran */}
        <td className="py-3 px-3 text-sm tabular-nums text-muted-foreground">
          {formatRunTime(item.lastRan)}
        </td>

        {/* Actions */}
        <td className="py-3 pl-3 pr-4">
          <div className="flex items-center justify-end gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            {/* Run Now */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={item.status === "running"}
              onClick={() => runAuto(item.id)}
            >
              <PlayIcon className="size-3" />
              Run now
            </Button>

            {/* More actions menu */}
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
      <Button size="sm" className="gap-1.5" onClick={onNew}>
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

  const [createOpen, setCreateOpen] = useState(false);

  const handleCreate = (input: CreateAutomationInput) => {
    createAutomation(input);
    setCreateOpen(false);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">Automations</p>
          <p className="text-xs text-muted-foreground">
            {automations.length === 0
              ? "Schedule recurring agent tasks"
              : `${automations.length} automation${automations.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-1.5">
                <PlusIcon className="size-3.5" />
                New automation
              </Button>
            }
          />
          <AutomationDialog onSave={handleCreate} />
        </Dialog>
      </div>

      {/* Content */}
      {automations.length === 0 ? (
        <EmptyState onNew={() => setCreateOpen(true)} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50 text-xs text-muted-foreground">
                <th className="py-2.5 pl-4 pr-3 font-medium">Name</th>
                <th className="py-2.5 px-3 font-medium">Project</th>
                <th className="py-2.5 px-3 font-medium">Frequency</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium">Next run</th>
                <th className="py-2.5 px-3 font-medium">Last ran</th>
                <th className="py-2.5 pl-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {automations.map((item) => (
                <AutomationRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
