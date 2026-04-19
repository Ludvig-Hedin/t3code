/**
 * filesPanelStore - open/close + view state for the Files panel.
 *
 * Mirrors the tiny `searchModalStore` but carries a bit more state because the
 * Files panel has its own tree, active file, dirty buffers, and search UI.
 *
 * Persisted via debounced localStorage under `t3code:files-panel:v1`:
 *   - expandedDirs            — which tree folders are expanded
 *   - searchScope             — "names" vs "contents"
 *   - filters                 — case sensitivity / regex / include / exclude
 *   - activeRelativePath      — last opened file so the editor re-opens it
 *
 * Session-only (never persisted):
 *   - open                    — users expect the panel to start closed
 *   - dirtyByPath             — unsaved buffers; we warn on unload instead
 *   - searchQuery             — ephemeral input state
 */
import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

export type FilesPanelSearchScope = "names" | "contents";

export interface FilesPanelFilters {
  caseSensitive: boolean;
  useRegex: boolean;
  includeGlobs: string;
  excludeGlobs: string;
}

interface PersistedFilesPanelState {
  expandedDirs?: Record<string, boolean>;
  searchScope?: FilesPanelSearchScope;
  filters?: Partial<FilesPanelFilters>;
  activeRelativePath?: string | null;
}

export interface FilesPanelState {
  open: boolean;
  activeRelativePath: string | null;
  expandedDirs: Record<string, boolean>;
  dirtyByPath: Record<string, string>;
  searchQuery: string;
  searchScope: FilesPanelSearchScope;
  filters: FilesPanelFilters;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setActivePath: (path: string | null) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  setDirty: (path: string, contents: string) => void;
  clearDirty: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchScope: (scope: FilesPanelSearchScope) => void;
  setFilters: (patch: Partial<FilesPanelFilters>) => void;
}

const PERSISTED_STATE_KEY = "t3code:files-panel:v1";

const DEFAULT_FILTERS: FilesPanelFilters = {
  caseSensitive: false,
  useRegex: false,
  includeGlobs: "",
  excludeGlobs: "",
};

function readPersistedState(): PersistedFilesPanelState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedFilesPanelState;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function persistState(state: FilesPanelState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedFilesPanelState = {
      expandedDirs: state.expandedDirs,
      searchScope: state.searchScope,
      filters: state.filters,
      activeRelativePath: state.activeRelativePath,
    };
    window.localStorage.setItem(PERSISTED_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors — they should not break panel UX.
  }
}

const debouncedPersist = new Debouncer(persistState, { wait: 500 });

const persisted = readPersistedState();

const initialState: Pick<
  FilesPanelState,
  | "open"
  | "activeRelativePath"
  | "expandedDirs"
  | "dirtyByPath"
  | "searchQuery"
  | "searchScope"
  | "filters"
> = {
  open: false,
  activeRelativePath: persisted.activeRelativePath ?? null,
  expandedDirs: persisted.expandedDirs ?? {},
  dirtyByPath: {},
  searchQuery: "",
  searchScope: persisted.searchScope ?? "names",
  filters: { ...DEFAULT_FILTERS, ...(persisted.filters ?? {}) },
};

export const useFilesPanelStore = create<FilesPanelState>((set, get) => ({
  ...initialState,

  setOpen: (open) => {
    set({ open });
  },
  toggle: () => {
    set({ open: !get().open });
  },
  setActivePath: (path) => {
    set({ activeRelativePath: path });
    debouncedPersist.maybeExecute(get());
  },
  setExpanded: (path, expanded) => {
    const next = { ...get().expandedDirs };
    if (expanded) next[path] = true;
    else delete next[path];
    set({ expandedDirs: next });
    debouncedPersist.maybeExecute(get());
  },
  setDirty: (path, contents) => {
    set({ dirtyByPath: { ...get().dirtyByPath, [path]: contents } });
    // dirtyByPath is intentionally session-only — no persist call here.
  },
  clearDirty: (path) => {
    const next = { ...get().dirtyByPath };
    delete next[path];
    set({ dirtyByPath: next });
  },
  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },
  setSearchScope: (scope) => {
    set({ searchScope: scope });
    debouncedPersist.maybeExecute(get());
  },
  setFilters: (patch) => {
    set({ filters: { ...get().filters, ...patch } });
    debouncedPersist.maybeExecute(get());
  },
}));

// Warn on window close if there are unsaved buffers — matches VS Code behaviour.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    const { dirtyByPath } = useFilesPanelStore.getState();
    if (Object.keys(dirtyByPath).length === 0) return;
    event.preventDefault();
    // Browser ignores custom strings but setting returnValue triggers the native prompt.
    event.returnValue = "";
  });
}
