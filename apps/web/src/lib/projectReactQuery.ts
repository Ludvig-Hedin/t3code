import type {
  ProjectListDirectoryResult,
  ProjectSearchEntriesResult,
  ProjectSearchFileContentsResult,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";

export const projectQueryKeys = {
  all: ["projects"] as const,
  searchEntries: (cwd: string | null, query: string, limit: number) =>
    ["projects", "search-entries", cwd, query, limit] as const,
  // Directory listing is cached per (cwd, relativePath) so expanding the same
  // folder twice reuses the last successful response until explicitly
  // invalidated (e.g. after a write).
  listDirectory: (cwd: string | null, relativePath: string, showHidden: boolean) =>
    ["projects", "list-directory", cwd, relativePath, showHidden] as const,
  // Content search cache keyed by the full query+filters so toggling case
  // sensitivity or regex does not reuse a stale hit set.
  searchFileContents: (
    cwd: string | null,
    query: string,
    limit: number,
    caseSensitive: boolean,
    useRegex: boolean,
  ) => ["projects", "search-file-contents", cwd, query, limit, caseSensitive, useRegex] as const,
};

const DEFAULT_SEARCH_ENTRIES_LIMIT = 80;
const DEFAULT_SEARCH_ENTRIES_STALE_TIME = 15_000;
const EMPTY_SEARCH_ENTRIES_RESULT: ProjectSearchEntriesResult = {
  entries: [],
  truncated: false,
};

export function projectSearchEntriesQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_ENTRIES_LIMIT;
  return queryOptions({
    queryKey: projectQueryKeys.searchEntries(input.cwd, input.query, limit),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace entry search is unavailable.");
      }
      return api.projects.searchEntries({
        cwd: input.cwd,
        query: input.query,
        limit,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_ENTRIES_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_ENTRIES_RESULT,
  });
}

// Directory listings change infrequently during a session; a 30 s stale window
// keeps the tree responsive without being too eager about fs churn.
const DEFAULT_LIST_DIRECTORY_STALE_TIME = 30_000;
const EMPTY_LIST_DIRECTORY_RESULT: ProjectListDirectoryResult = {
  relativePath: "",
  entries: [],
  truncated: false,
};

export function projectListDirectoryQueryOptions(input: {
  cwd: string | null;
  relativePath: string;
  showHidden?: boolean;
  enabled?: boolean;
  staleTime?: number;
}) {
  const showHidden = input.showHidden ?? false;
  return queryOptions({
    queryKey: projectQueryKeys.listDirectory(input.cwd, input.relativePath, showHidden),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace directory listing is unavailable.");
      }
      return api.projects.listDirectory({
        cwd: input.cwd,
        relativePath: input.relativePath,
        showHidden,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null,
    staleTime: input.staleTime ?? DEFAULT_LIST_DIRECTORY_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_LIST_DIRECTORY_RESULT,
  });
}

const DEFAULT_SEARCH_FILE_CONTENTS_LIMIT = 200;
// Content search results are expensive (ripgrep scan) so cache for longer than
// name search. Still short enough that edits don't surface stale hits for
// long.
const DEFAULT_SEARCH_FILE_CONTENTS_STALE_TIME = 30_000;
const EMPTY_SEARCH_FILE_CONTENTS_RESULT: ProjectSearchFileContentsResult = {
  hits: [],
  truncated: false,
  ripgrepAvailable: true,
};

export function projectSearchFileContentsQueryOptions(input: {
  cwd: string | null;
  query: string;
  enabled?: boolean;
  limit?: number;
  caseSensitive?: boolean;
  useRegex?: boolean;
  staleTime?: number;
}) {
  const limit = input.limit ?? DEFAULT_SEARCH_FILE_CONTENTS_LIMIT;
  const caseSensitive = input.caseSensitive ?? false;
  const useRegex = input.useRegex ?? false;
  return queryOptions({
    queryKey: projectQueryKeys.searchFileContents(
      input.cwd,
      input.query,
      limit,
      caseSensitive,
      useRegex,
    ),
    queryFn: async () => {
      const api = ensureNativeApi();
      if (!input.cwd) {
        throw new Error("Workspace content search is unavailable.");
      }
      return api.projects.searchFileContents({
        cwd: input.cwd,
        query: input.query,
        limit,
        caseSensitive,
        useRegex,
      });
    },
    enabled: (input.enabled ?? true) && input.cwd !== null && input.query.length > 0,
    staleTime: input.staleTime ?? DEFAULT_SEARCH_FILE_CONTENTS_STALE_TIME,
    placeholderData: (previous) => previous ?? EMPTY_SEARCH_FILE_CONTENTS_RESULT,
  });
}
