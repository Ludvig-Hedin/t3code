/**
 * Inspector — edit the currently-selected design element.
 *
 * Phase 3 surface: Style (className) and Content (inner text). Both edits
 * round-trip through `design.applyEdit`; the server mutates the AST, writes
 * the source file, and returns the refreshed OID location. Dev-server HMR
 * then reloads the preview iframe.
 */
import { useEffect, useId, useState } from "react";

import {
  CopyIcon,
  FileCodeIcon,
  Loader2Icon,
  MousePointerClickIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";

import type { DesignInsertPosition, ProjectId } from "@t3tools/contracts";

import type { DesignNode } from "~/design/bridge";
import { useFilesPanelStore } from "~/filesPanelStore";
import { getWsRpcClient } from "~/wsRpcClient";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { InsertMenu } from "./InsertMenu";

type ResolvedLocation = {
  readonly relPath: string;
  readonly line: number;
  readonly col: number;
  readonly elementName: string;
} | null;

export interface InspectorProps {
  readonly projectId: ProjectId;
  readonly appCwd: string;
  readonly selectedOid: string | null;
  readonly selectedNode: DesignNode | null;
  readonly location: ResolvedLocation;
  readonly onAfterEdit: () => void;
  /**
   * Optional — when provided, an "Ask AI" button appears in the header. The
   * handler receives a markdown-formatted context block describing the
   * selected element (OID, file:line, current className, text preview).
   */
  readonly onAskAI?: ((contextBlock: string) => void) | undefined;
}

type EditStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "error"; readonly message: string };

export function Inspector({
  projectId,
  appCwd,
  selectedOid,
  selectedNode,
  location,
  onAfterEdit,
  onAskAI,
}: InspectorProps) {
  const fieldId = useId();
  const textAreaId = `${fieldId}-text`;
  const stylesTextAreaId = `${fieldId}-styles`;
  const [text, setText] = useState("");
  const [className, setClassName] = useState("");
  const [textStatus, setTextStatus] = useState<EditStatus>({ kind: "idle" });
  const [classStatus, setClassStatus] = useState<EditStatus>({ kind: "idle" });
  const [opError, setOpError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const setOpenFiles = useFilesPanelStore((s) => s.setOpen);
  const openFileAt = useFilesPanelStore((s) => s.openFileAt);

  // Reset local form state whenever the selected element changes.
  useEffect(() => {
    setText(selectedNode?.textPreview ?? "");
    setClassName(selectedNode?.className ?? "");
    setTextStatus({ kind: "idle" });
    setClassStatus({ kind: "idle" });
    setOpError(null);
  }, [selectedOid, selectedNode?.textPreview, selectedNode?.className]);

  const handleRevealInFiles = () => {
    if (!location) return;
    setOpenFiles(true);
    openFileAt(location.relPath, { line: location.line, column: location.col });
  };

  const handleSaveText = async () => {
    if (!selectedOid) return;
    setTextStatus({ kind: "saving" });
    try {
      await getWsRpcClient().design.applyEdit({
        projectId,
        appCwd,
        oid: selectedOid,
        op: { kind: "setText", text },
      });
      setTextStatus({ kind: "idle" });
      onAfterEdit();
    } catch (err) {
      setTextStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to save text",
      });
    }
  };

  const runOp = async (
    op: Parameters<ReturnType<typeof getWsRpcClient>["design"]["applyEdit"]>[0]["op"],
  ) => {
    if (!selectedOid) return;
    setOpError(null);
    try {
      await getWsRpcClient().design.applyEdit({ projectId, appCwd, oid: selectedOid, op });
      onAfterEdit();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Edit failed");
    }
  };

  const handleDuplicate = () => void runOp({ kind: "duplicate" });
  const handleConfirmDelete = () => {
    setConfirmDeleteOpen(false);
    void runOp({ kind: "delete" });
  };
  const handleInsert = (tag: string, position: DesignInsertPosition) =>
    void runOp({ kind: "insert", tag, position });

  const handleAskAI = () => {
    if (!onAskAI || !selectedOid || !selectedNode) return;
    const locationLine = location
      ? `${location.relPath}:${location.line}:${location.col}`
      : "unknown";
    const tag = location?.elementName ?? selectedNode.tag;
    const escapeXml = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const block =
      `<design_context>\n` +
      `Selected element: <${tag}>\n` +
      `Source: ${locationLine}\n` +
      `OID: ${selectedOid}\n` +
      (selectedNode.className ? `className: ${escapeXml(selectedNode.className)}\n` : "") +
      (selectedNode.textPreview ? `text: ${escapeXml(selectedNode.textPreview)}\n` : "") +
      `</design_context>\n\n`;
    onAskAI(block);
  };

  const handleSaveClassName = async (nextClassName: string | null) => {
    if (!selectedOid) return;
    setClassStatus({ kind: "saving" });
    try {
      await getWsRpcClient().design.applyEdit({
        projectId,
        appCwd,
        oid: selectedOid,
        op: { kind: "setClassName", className: nextClassName },
      });
      setClassStatus({ kind: "idle" });
      onAfterEdit();
    } catch (err) {
      setClassStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to save className",
      });
    }
  };

  if (!selectedOid) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <MousePointerClickIcon className="size-6 text-muted-foreground/40" />
        <p className="text-[11px] font-medium text-foreground/80">No element selected</p>
        <p className="max-w-xs text-[10px] text-muted-foreground/70">
          Click an element in the preview to edit its text, styles and structure.
        </p>
      </div>
    );
  }

  const elementLabel = location?.elementName ?? selectedNode?.tag ?? "element";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
              {`<${elementLabel}>`}
            </span>
          </div>
          {location && (
            <div
              className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70"
              title={`${location.relPath}:${location.line}:${location.col}`}
            >
              {location.relPath}:{location.line}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onAskAI && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAskAI}
                    aria-label="Send to AI chat"
                    className="h-7 px-2 text-[11px]"
                  >
                    <SparklesIcon className="mr-1 size-3" />
                    Ask AI
                  </Button>
                }
              />

              <TooltipPopup>Add this element as context to your chat</TooltipPopup>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDuplicate}
                  aria-label="Duplicate element"
                  className="size-7 p-0"
                >
                  <CopyIcon className="size-3" />
                </Button>
              }
            />

            <TooltipPopup>Duplicate</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDeleteOpen(true)}
                  aria-label="Delete element"
                  className="size-7 p-0 text-destructive hover:bg-destructive/10"
                >
                  <Trash2Icon className="size-3" />
                </Button>
              }
            />

            <TooltipPopup>Delete</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRevealInFiles}
                  disabled={!location}
                  aria-label="Open source in files"
                  className="h-7 px-2 text-[11px]"
                >
                  <FileCodeIcon className="mr-1 size-3" />
                  Open
                </Button>
              }
            />

            <TooltipPopup>Open source file</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {opError && (
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          <span className="min-w-0 flex-1 break-words">{opError}</span>
          <button
            type="button"
            onClick={() => setOpError(null)}
            className="shrink-0 text-destructive/70 hover:text-destructive"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this element?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-mono text-foreground">&lt;{elementLabel}&gt;</span>{" "}
              and everything inside it from your source code. This cannot be undone.
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
                  onClick={handleConfirmDelete}
                >
                  <Trash2Icon className="mr-1 size-3" />
                  Delete element
                </Button>
              }
            />
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <section className="flex flex-col gap-1.5 border-b border-border/50 px-3 py-3">
        <label
          htmlFor={textAreaId}
          className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
        >
          <span>Text content</span>
          <span className="font-sans normal-case tracking-normal text-muted-foreground/50">
            ⌘ + ↵ to save
          </span>
        </label>
        <textarea
          id={textAreaId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (text !== (selectedNode?.textPreview ?? "")) void handleSaveText();
            }
          }}
          rows={2}
          className="resize-y rounded-md border border-border/60 bg-background px-2 py-1.5 text-[12px] text-foreground focus:border-primary focus:outline-none"
          placeholder="Element text…"
        />

        <div className="flex items-center justify-between gap-2">
          {textStatus.kind === "error" ? (
            <span className="text-[10px] text-destructive">{textStatus.message}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">
              Replaces the text inside this element.
            </span>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSaveText()}
            disabled={textStatus.kind === "saving" || text === (selectedNode?.textPreview ?? "")}
            className="h-7 px-2 text-[11px]"
          >
            {textStatus.kind === "saving" ? (
              <>
                <Loader2Icon className="mr-1 size-3 animate-spin" />
                Saving…
              </>
            ) : (
              "Save text"
            )}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-1.5 px-3 py-3">
        <label
          htmlFor={stylesTextAreaId}
          className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
        >
          <span>Styles (Tailwind)</span>
          <span className="font-sans normal-case tracking-normal text-muted-foreground/50">
            ⌘ + ↵ to save
          </span>
        </label>
        <textarea
          id={stylesTextAreaId}
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (className !== (selectedNode?.className ?? ""))
                void handleSaveClassName(className);
            }
          }}
          rows={3}
          className="resize-y rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-[11px] text-foreground focus:border-primary focus:outline-none"
          placeholder="e.g. flex items-center gap-2 px-4 rounded-md"
        />

        <div className="flex items-center justify-between gap-2">
          {classStatus.kind === "error" ? (
            <span className="text-[10px] text-destructive">{classStatus.message}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">
              Space-separated Tailwind classes. Replaces the current value.
            </span>
          )}
          <div className="flex shrink-0 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleSaveClassName(null)}
              disabled={classStatus.kind === "saving" || !selectedNode?.className}
              className="h-7 px-2 text-[11px]"
            >
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveClassName(className)}
              disabled={
                classStatus.kind === "saving" || className === (selectedNode?.className ?? "")
              }
              className="h-7 px-2 text-[11px]"
            >
              {classStatus.kind === "saving" ? (
                <>
                  <Loader2Icon className="mr-1 size-3 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save styles"
              )}
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-border/50">
        <InsertMenu disabled={!selectedOid} onInsert={handleInsert} />
      </section>
    </div>
  );
}
