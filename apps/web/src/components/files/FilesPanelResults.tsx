/**
 * FilesPanelResults — name + content search results for the Files panel.
 *
 * Drives two independent React Query calls:
 *   - Names:    `projects.searchEntries` (existing, fuzzy-ish substring match)
 *   - Contents: `projects.searchFileContents` (new, ripgrep when available)
 *
 * Rendered only when the header search input has a non-empty query. The
 * scope toggle ("Names" / "Contents") in the header decides which section is
 * prominent, but both sections always load so the user can glance at both
 * without round-tripping. Content hits include a line/column so the editor
 * can scroll to the exact match via `useFilesPanelStore.openFileAt`.
 */
import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSearchIcon, FolderSearchIcon } from "lucide-react";

import type {
  ProjectEntry,
  ProjectFileContentHit,
} from "@t3tools/contracts";

import {
  projectSearchEntriesQueryOptions,
  projectSearchFileContentsQueryOptions,
} from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";

import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

export interface FilesPanelResultsProps {
  cwd: string;
  query: string;
  scope: "names" | "contents";
  caseSensitive: boolean;
  useRegex: boolean;
  resolvedTheme: "light" | "dark";
  activeRelativePath: string | null;
  onOpenFile: (
    relativePath: string,
    selection?: { line: number; column: number } | null,
  ) => void;
}

export const FilesPanelResults = memo(function FilesPanelResults({
  cwd,
  query,
  scope,
  caseSensitive,
  useRegex,
  resolvedTheme,
  activeRelativePath,
  onOpenFile,
}: FilesPanelResultsProps) {
  const namesQuery = useQuery(
    projectSearchEntriesQueryOptions({ cwd, query }),
  );
  const contentsQuery = useQuery(
    projectSearchFileContentsQueryOptions({
      cwd,
      query,
      caseSensitive,
      useRegex,
    }),
  );

  // Both sections are shown together so the user can jump between names and
  // contents without toggling. The scope toggle only controls visual order
  // (active scope first) — we don't hide the inactive section because it's
  // useful as a quick secondary signal.
  const sections: Array<React.ReactNode> = [];
  if (scope === "names") {
    sections.push(
      <NamesSection
        key="names"
        query={namesQuery.data?.entries ?? []}
        truncated={namesQuery.data?.truncated ?? false}
        isLoading={namesQuery.isPending || namesQuery.isFetching}
        isError={namesQuery.isError}
        error={namesQuery.error}
        activeRelativePath={activeRelativePath}
        resolvedTheme={resolvedTheme}
        onOpenFile={(path) => onOpenFile(path)}
      />,
    );
    sections.push(
      <ContentsSection
        key="contents"
        hits={contentsQuery.data?.hits ?? []}
        truncated={contentsQuery.data?.truncated ?? false}
        ripgrepAvailable={contentsQuery.data?.ripgrepAvailable ?? true}
        isLoading={contentsQuery.isPending || contentsQuery.isFetching}
        isError={contentsQuery.isError}
        error={contentsQuery.error}
        activeRelativePath={activeRelativePath}
        onOpenFile={onOpenFile}
      />,
    );
  } else {
    sections.push(
      <ContentsSection
        key="contents"
        hits={contentsQuery.data?.hits ?? []}
        truncated={contentsQuery.data?.truncated ?? false}
        ripgrepAvailable={contentsQuery.data?.ripgrepAvailable ?? true}
        isLoading={contentsQuery.isPending || contentsQuery.isFetching}
        isError={contentsQuery.isError}
        error={contentsQuery.error}
        activeRelativePath={activeRelativePath}
        onOpenFile={onOpenFile}
      />,
    );
    sections.push(
      <NamesSection
        key="names"
        query={namesQuery.data?.entries ?? []}
        truncated={namesQuery.data?.truncated ?? false}
        isLoading={namesQuery.isPending || namesQuery.isFetching}
        isError={namesQuery.isError}
        error={namesQuery.error}
        activeRelativePath={activeRelativePath}
        resolvedTheme={resolvedTheme}
        onOpenFile={(path) => onOpenFile(path)}
      />,
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto py-1"
      role="list"
      aria-label="Files search results"
    >
      {sections}
    </div>
  );
});

interface NamesSectionProps {
  query: ReadonlyArray<ProjectEntry>;
  truncated: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  activeRelativePath: string | null;
  resolvedTheme: "light" | "dark";
  onOpenFile: (relativePath: string) => void;
}

function NamesSection({
  query,
  truncated,
  isLoading,
  isError,
  error,
  activeRelativePath,
  resolvedTheme,
  onOpenFile,
}: NamesSectionProps) {
  return (
    <section aria-label="Matching file names" className="mb-2">
      <SectionHeader
        icon={<FolderSearchIcon className="size-3 shrink-0 text-muted-foreground/70" />}
        title="Files"
        count={query.length}
        truncated={truncated}
      />
      {isError ? (
        <SectionMessage tone="error">
          {error instanceof Error ? error.message : "Failed to search names."}
        </SectionMessage>
      ) : query.length === 0 ? (
        <SectionMessage tone="muted">
          {isLoading ? "Searching…" : "No files matched."}
        </SectionMessage>
      ) : (
        query
          .filter((entry) => entry.kind === "file")
          .map((entry) => (
            <button
              key={`name:${entry.path}`}
              type="button"
              role="listitem"
              data-active={entry.path === activeRelativePath ? "true" : undefined}
              onClick={() => onOpenFile(entry.path)}
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-accent/40",
                entry.path === activeRelativePath && "bg-accent/50",
              )}
            >
              <VscodeEntryIcon
                pathValue={entry.path}
                kind="file"
                theme={resolvedTheme}
                className="size-3.5 text-muted-foreground/70"
              />
              <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground">
                {entry.path}
              </span>
            </button>
          ))
      )}
    </section>
  );
}

interface ContentsSectionProps {
  hits: ReadonlyArray<ProjectFileContentHit>;
  truncated: boolean;
  ripgrepAvailable: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  activeRelativePath: string | null;
  onOpenFile: (
    relativePath: string,
    selection?: { line: number; column: number } | null,
  ) => void;
}

function ContentsSection({
  hits,
  truncated,
  ripgrepAvailable,
  isLoading,
  isError,
  error,
  activeRelativePath,
  onOpenFile,
}: ContentsSectionProps) {
  // Group hits by file so the list reads like VS Code's "search in files".
  const grouped = new Map<string, ProjectFileContentHit[]>();
  for (const hit of hits) {
    const existing = grouped.get(hit.relativePath);
    if (existing) existing.push(hit);
    else grouped.set(hit.relativePath, [hit]);
  }

  return (
    <section aria-label="Matching contents">
      <SectionHeader
        icon={<FileSearchIcon className="size-3 shrink-0 text-muted-foreground/70" />}
        title="Contents"
        count={hits.length}
        truncated={truncated}
      />
      {!ripgrepAvailable ? (
        <SectionMessage tone="muted">
          ripgrep not found — results limited to a bounded JS fallback.
        </SectionMessage>
      ) : null}
      {isError ? (
        <SectionMessage tone="error">
          {error instanceof Error ? error.message : "Failed to search contents."}
        </SectionMessage>
      ) : hits.length === 0 ? (
        <SectionMessage tone="muted">
          {isLoading ? "Searching…" : "No content matches."}
        </SectionMessage>
      ) : (
        Array.from(grouped.entries()).map(([relativePath, fileHits]) => (
          <div key={`content:${relativePath}`} className="mb-1">
            <div className="sticky top-0 z-[1] flex items-center gap-1.5 bg-card/80 px-2 pt-1 pb-0.5 backdrop-blur-sm">
              <span className="truncate font-mono text-[11px] text-foreground/80">
                {relativePath}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {fileHits.length}
              </span>
            </div>
            {fileHits.map((hit, idx) => (
              <button
                key={`content:${relativePath}:${hit.line}:${idx}`}
                type="button"
                role="listitem"
                data-active={
                  relativePath === activeRelativePath ? "true" : undefined
                }
                onClick={() =>
                  onOpenFile(relativePath, { line: hit.line, column: hit.column })
                }
                className={cn(
                  "group flex w-full items-start gap-2 rounded-md px-2 py-0.5 text-left hover:bg-accent/40",
                )}
              >
                <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground/60">
                  {hit.line}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground">
                  <HitPreview hit={hit} />
                </span>
              </button>
            ))}
          </div>
        ))
      )}
    </section>
  );
}

function HitPreview({ hit }: { hit: ProjectFileContentHit }) {
  // `matchStart` / `matchEnd` are byte offsets into `preview` according to the
  // server. Preview strings are short (bounded by the server), so substring
  // slicing is fine.
  const safeStart = Math.max(0, Math.min(hit.matchStart, hit.preview.length));
  const safeEnd = Math.max(safeStart, Math.min(hit.matchEnd, hit.preview.length));
  const before = hit.preview.slice(0, safeStart);
  const match = hit.preview.slice(safeStart, safeEnd);
  const after = hit.preview.slice(safeEnd);
  return (
    <>
      <span>{before}</span>
      <mark className="bg-yellow-200/60 text-foreground dark:bg-yellow-400/30">
        {match}
      </mark>
      <span>{after}</span>
    </>
  );
}

function SectionHeader(props: {
  icon: React.ReactNode;
  title: string;
  count: number;
  truncated: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
      {props.icon}
      <span>{props.title}</span>
      <span className="text-muted-foreground/50">
        {props.count}
        {props.truncated ? "+" : ""}
      </span>
    </div>
  );
}

function SectionMessage({
  tone,
  children,
}: {
  tone: "muted" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "px-3 py-1 font-mono text-[11px]",
        tone === "error" ? "text-destructive" : "text-muted-foreground/60",
      )}
    >
      {children}
    </div>
  );
}
