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
  openFiles?: string[];
  /**
   * Per-cwd open state so switching to a different project auto-closes the
   * panel (avoiding "Failed to load directory" from stale expanded paths) while
   * returning to a previous project restores whatever the user had before.
   */
  openByCwd?: Record<string, boolean>;
}

/**
 * Position inside a file that the editor should scroll to and highlight once
 * it finishes loading. Currently only produced by content-search hits in the
 * Files panel, but kept generic so future features (e.g. "go to error") can
 * reuse the same channel.
 */
export interface FilesPanelEditorSelection {
  line: number;
  column: number;
}

export interface FilesPanelState {
  open: boolean;
  /**
   * Remembered open-state per workspace cwd. When `setCwd` flips to a new cwd
   * the panel's visible `open` flag is rehydrated from this map so the user
   * returns to the same layout they left behind.
   */
  openByCwd: Record<string, boolean>;
  /** Working directory of the currently active project/thread. Set by FilesPanel. */
  activeCwd: string | null;
  activeRelativePath: string | null;
  /**
   * Ordered list of currently-open tabs (relative paths). First entry is the
   * leftmost tab. `activeRelativePath` must either be `null` or appear in this
   * list.
   */
  openFiles: string[];
  expandedDirs: Record<string, boolean>;
  dirtyByPath: Record<string, string>;
  searchQuery: string;
  searchScope: FilesPanelSearchScope;
  filters: FilesPanelFilters;
  /** Consumed (and cleared) by `FileEditorPane` once it positions the cursor. */
  pendingSelection: FilesPanelEditorSelection | null;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setCwd: (cwd: string | null) => void;
  setActivePath: (path: string | null) => void;
  openFileAt: (path: string, selection?: FilesPanelEditorSelection | null) => void;
  closeFile: (path: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  setDirty: (path: string, contents: string) => void;
  clearDirty: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setSearchScope: (scope: FilesPanelSearchScope) => void;
  setFilters: (patch: Partial<FilesPanelFilters>) => void;
  consumePendingSelection: () => FilesPanelEditorSelection | null;
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
      openFiles: state.openFiles,
      openByCwd: state.openByCwd,
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
  | "openByCwd"
  | "activeCwd"
  | "activeRelativePath"
  | "openFiles"
  | "expandedDirs"
  | "dirtyByPath"
  | "searchQuery"
  | "searchScope"
  | "filters"
  | "pendingSelection"
> = (() => {
  const persistedActive = persisted.activeRelativePath ?? null;
  // Rehydrate tabs from persistence; ensure the persisted active path is in
  // the list so the tab-bar never renders an "active file with no tab".
  const persistedOpen = Array.isArray(persisted.openFiles) ? persisted.openFiles : [];
  const seen = new Set<string>();
  const rehydratedOpen = persistedOpen.filter((p) => {
    if (typeof p !== "string" || p.length === 0 || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  if (persistedActive && !seen.has(persistedActive)) {
    rehydratedOpen.push(persistedActive);
  }
  return {
    open: false,
    openByCwd: persisted.openByCwd ?? {},
    activeCwd: null,
    activeRelativePath: persistedActive,
    openFiles: rehydratedOpen,
    expandedDirs: persisted.expandedDirs ?? {},
    dirtyByPath: {},
    searchQuery: "",
    searchScope: persisted.searchScope ?? "names",
    filters: { ...DEFAULT_FILTERS, ...(persisted.filters ?? {}) },
    pendingSelection: null,
  };
})();

export const useFilesPanelStore = create<FilesPanelState>((set, get) => ({
  ...initialState,

  setOpen: (open) => {
    // Remember the open-state per-cwd so switching projects and coming back
    // restores what the user had. When there's no active cwd yet (pre-boot)
    // we still flip `open` but skip the write — there's nothing to key on.
    const { activeCwd, openByCwd } = get();
    const nextOpenByCwd = activeCwd ? { ...openByCwd, [activeCwd]: open } : openByCwd;
    set({ open, openByCwd: nextOpenByCwd });
    debouncedPersist.maybeExecute(get());
  },
  toggle: () => {
    const { open } = get();
    // Route through setOpen so the per-cwd remembered state stays in sync.
    const next = !open;
    const { activeCwd, openByCwd } = get();
    const nextOpenByCwd = activeCwd ? { ...openByCwd, [activeCwd]: next } : openByCwd;
    set({ open: next, openByCwd: nextOpenByCwd });
    debouncedPersist.maybeExecute(get());
  },
  setCwd: (cwd) => {
    const { activeCwd, open, openByCwd } = get();
    if (cwd === activeCwd) {
      set({ activeCwd: cwd });
      return;
    }
    // Initial cwd (activeCwd was null) → FilesPanel is mounting for the first
    // time this session. Preserve whatever `open` state the user has already
    // set (e.g. they clicked the Files toggle in the chat header before the
    // panel mounted) rather than overwriting it with a stale/empty value.
    if (activeCwd === null) {
      const nextOpenByCwd = cwd ? { ...openByCwd, [cwd]: open } : openByCwd;
      set({ activeCwd: cwd, openByCwd: nextOpenByCwd });
      debouncedPersist.maybeExecute(get());
      return;
    }
    // Persist the previous cwd's open-state and rehydrate the new one.
    // Unknown/never-seen cwds default to closed so stale `expandedDirs`
    // never fire `projects.listDirectory` against a cwd that doesn't have
    // those paths (the "Failed to load directory" case).
    //
    // When switching to `null` (FilesPanel unmounting — e.g. navigating away
    // from a thread route), we preserve expandedDirs/openFiles/activeRelative
    // so the user returns to their layout. Only a switch to a different
    // *real* cwd resets that project-scoped state.
    const nextOpenByCwd = { ...openByCwd, [activeCwd]: open };
    const rehydratedOpen = cwd ? (nextOpenByCwd[cwd] ?? false) : false;
    const isRealCwdSwitch = cwd !== null && cwd !== activeCwd;
    set({
      activeCwd: cwd,
      open: rehydratedOpen,
      openByCwd: nextOpenByCwd,
      ...(isRealCwdSwitch
        ? {
            expandedDirs: {},
            openFiles: [],
            activeRelativePath: null,
            pendingSelection: null,
          }
        : {}),
    });
    debouncedPersist.maybeExecute(get());
  },
  setActivePath: (path) => {
    const { openFiles } = get();
    const nextOpen = path && !openFiles.includes(path) ? [...openFiles, path] : openFiles;
    set({ activeRelativePath: path, openFiles: nextOpen, pendingSelection: null });
    debouncedPersist.maybeExecute(get());
  },
  openFileAt: (path, selection) => {
    // A search hit wants the editor to open a file *and* jump to a specific
    // line/column. Set both in one update so the editor's mount effect always
    // sees the selection together with the new active path. Also ensure a tab
    // exists for this path — the editor pane reads tabs from openFiles.
    const { openFiles } = get();
    const nextOpen = openFiles.includes(path) ? openFiles : [...openFiles, path];
    set({
      activeRelativePath: path,
      openFiles: nextOpen,
      pendingSelection: selection ?? null,
    });
    debouncedPersist.maybeExecute(get());
  },
  closeFile: (path) => {
    const { openFiles, activeRelativePath, dirtyByPath } = get();
    const idx = openFiles.indexOf(path);
    if (idx === -1) return;
    const nextOpen = openFiles.filter((entry) => entry !== path);
    // Close of active tab → activate the neighbour on the right, falling back
    // to the left. This matches VS Code's tab-close behaviour.
    let nextActive = activeRelativePath;
    if (activeRelativePath === path) {
      nextActive = nextOpen[idx] ?? nextOpen[idx - 1] ?? null;
    }
    const nextDirty = { ...dirtyByPath };
    delete nextDirty[path];
    set({
      openFiles: nextOpen,
      activeRelativePath: nextActive,
      dirtyByPath: nextDirty,
      pendingSelection: null,
    });
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
  consumePendingSelection: () => {
    const current = get().pendingSelection;
    if (!current) return null;
    set({ pendingSelection: null });
    return current;
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
