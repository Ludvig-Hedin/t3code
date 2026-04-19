/**
 * FilesPanelTree — VS Code-style lazy file tree for the Files panel.
 *
 * Each directory fires a `projects.listDirectory` query only when it is
 * expanded, so the tree scales to large repos without an up-front crawl.
 * Styling mirrors ChangedFilesTree for visual parity with the rest of the app.
 *
 * The tree is stateless beyond React Query caches plus the expanded-dirs map
 * in `useFilesPanelStore` — this keeps scroll-to-open-file and restore-on-
 * reload behaviour straightforward in later phases.
 */
import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRightIcon, FolderClosedIcon, FolderIcon } from "lucide-react";

import type { ProjectEntry } from "@t3tools/contracts";

import { useFilesPanelStore } from "~/filesPanelStore";
import { projectListDirectoryQueryOptions } from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";

import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

const DEPTH_INDENT_PX = 14;
const BASE_PADDING_PX = 8;

export interface FilesPanelTreeProps {
  cwd: string;
  activeRelativePath: string | null;
  resolvedTheme: "light" | "dark";
  onOpenFile: (relativePath: string) => void;
}

export const FilesPanelTree = memo(function FilesPanelTree({
  cwd,
  activeRelativePath,
  resolvedTheme,
  onOpenFile,
}: FilesPanelTreeProps) {
  // Root folder ("") always rendered — the user does not need to click to open
  // the repository root, it is the starting surface.
  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tree" aria-label="Files tree">
      <DirectoryChildren
        cwd={cwd}
        relativePath=""
        depth={0}
        activeRelativePath={activeRelativePath}
        resolvedTheme={resolvedTheme}
        onOpenFile={onOpenFile}
      />
    </div>
  );
});

interface DirectoryChildrenProps {
  cwd: string;
  relativePath: string;
  depth: number;
  activeRelativePath: string | null;
  resolvedTheme: "light" | "dark";
  onOpenFile: (relativePath: string) => void;
}

function DirectoryChildren({
  cwd,
  relativePath,
  depth,
  activeRelativePath,
  resolvedTheme,
  onOpenFile,
}: DirectoryChildrenProps) {
  const query = useQuery(
    projectListDirectoryQueryOptions({
      cwd,
      relativePath,
      showHidden: false,
    }),
  );

  if (query.isPending) {
    return <TreeLeafMessage depth={depth} label="Loading…" tone="muted" />;
  }
  if (query.isError) {
    return (
      <TreeLeafMessage
        depth={depth}
        label="Failed to load directory"
        tone="error"
      />
    );
  }

  const entries = query.data?.entries ?? [];
  if (entries.length === 0) {
    return <TreeLeafMessage depth={depth} label="(empty)" tone="muted" />;
  }

  return (
    <>
      {entries.map((entry) =>
        entry.kind === "directory" ? (
          <DirectoryNode
            key={`dir:${entry.path}`}
            cwd={cwd}
            entry={entry}
            depth={depth}
            activeRelativePath={activeRelativePath}
            resolvedTheme={resolvedTheme}
            onOpenFile={onOpenFile}
          />
        ) : (
          <FileNode
            key={`file:${entry.path}`}
            entry={entry}
            depth={depth}
            isActive={entry.path === activeRelativePath}
            resolvedTheme={resolvedTheme}
            onOpenFile={onOpenFile}
          />
        ),
      )}
      {query.data?.truncated ? (
        <TreeLeafMessage
          depth={depth}
          label="Showing first 1000 entries…"
          tone="muted"
        />
      ) : null}
    </>
  );
}

interface DirectoryNodeProps {
  cwd: string;
  entry: ProjectEntry;
  depth: number;
  activeRelativePath: string | null;
  resolvedTheme: "light" | "dark";
  onOpenFile: (relativePath: string) => void;
}

function DirectoryNode({
  cwd,
  entry,
  depth,
  activeRelativePath,
  resolvedTheme,
  onOpenFile,
}: DirectoryNodeProps) {
  const isExpanded = useFilesPanelStore((s) => Boolean(s.expandedDirs[entry.path]));
  const setExpanded = useFilesPanelStore((s) => s.setExpanded);
  const name = useMemo(() => leafName(entry.path), [entry.path]);
  const leftPadding = BASE_PADDING_PX + depth * DEPTH_INDENT_PX;

  return (
    <div role="treeitem" aria-expanded={isExpanded}>
      <button
        type="button"
        aria-label={`Directory ${entry.path}`}
        className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-accent/40"
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => setExpanded(entry.path, !isExpanded)}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
            isExpanded && "rotate-90",
          )}
        />
        {isExpanded ? (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        ) : (
          <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        )}
        <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground">
          {name}
        </span>
      </button>
      {isExpanded ? (
        <div role="group">
          <DirectoryChildren
            cwd={cwd}
            relativePath={entry.path}
            depth={depth + 1}
            activeRelativePath={activeRelativePath}
            resolvedTheme={resolvedTheme}
            onOpenFile={onOpenFile}
          />
        </div>
      ) : null}
    </div>
  );
}

interface FileNodeProps {
  entry: ProjectEntry;
  depth: number;
  isActive: boolean;
  resolvedTheme: "light" | "dark";
  onOpenFile: (relativePath: string) => void;
}

function FileNode({ entry, depth, isActive, resolvedTheme, onOpenFile }: FileNodeProps) {
  const name = useMemo(() => leafName(entry.path), [entry.path]);
  // Align the file-icon column with the folder-icon column by reserving the
  // chevron slot (3.5 + gap-1.5 ≈ 20 px) in the leading padding.
  const leftPadding = BASE_PADDING_PX + depth * DEPTH_INDENT_PX;

  return (
    <button
      type="button"
      role="treeitem"
      aria-label={`File ${entry.path}`}
      data-active={isActive ? "true" : undefined}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-accent/40",
        isActive && "bg-accent/50",
      )}
      style={{ paddingLeft: `${leftPadding}px` }}
      onClick={() => onOpenFile(entry.path)}
    >
      <span aria-hidden="true" className="size-3.5 shrink-0" />
      <VscodeEntryIcon
        pathValue={entry.path}
        kind="file"
        theme={resolvedTheme}
        className="size-3.5 text-muted-foreground/70"
      />
      <span
        className={cn(
          "truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {name}
      </span>
    </button>
  );
}

interface TreeLeafMessageProps {
  depth: number;
  label: string;
  tone: "muted" | "error";
}

function TreeLeafMessage({ depth, label, tone }: TreeLeafMessageProps) {
  const leftPadding = BASE_PADDING_PX + (depth + 1) * DEPTH_INDENT_PX;
  return (
    <div
      className={cn(
        "truncate px-2 py-1 font-mono text-[11px]",
        tone === "error" ? "text-destructive" : "text-muted-foreground/60",
      )}
      style={{ paddingLeft: `${leftPadding}px` }}
    >
      {label}
    </div>
  );
}

function leafName(relativePath: string): string {
  const trimmed = relativePath.replace(/\/+$/u, "");
  const slashIndex = trimmed.lastIndexOf("/");
  if (slashIndex === -1) return trimmed;
  return trimmed.slice(slashIndex + 1);
}
