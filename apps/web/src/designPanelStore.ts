/**
 * designPanelStore - open/close + selected-app state for the Design panel.
 *
 * Modeled after `filesPanelStore`, but intentionally tiny for Phase 1.
 *
 * Persisted via debounced localStorage under `t3code:design-panel:v1`:
 *   - selectedAppIdByCwd      — last selected app per project cwd (monorepo support)
 *   - openByCwd               — remembered open-state per project cwd
 *
 * Session-only (never persisted):
 *   - open                    — panel starts closed per session
 *   - activeCwd               — derived from the active thread
 */
import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

import type { DesignEligibleApp, DesignEligibleAppsDiagnostic } from "@t3tools/contracts";

/**
 * Result cached per project id by `useDesignEligibleApps`. Keeping the
 * diagnostics alongside the apps lets the empty state stay in sync with
 * the most recent scan without re-issuing the RPC.
 */
export interface DesignEligibleAppsCacheEntry {
  readonly apps: readonly DesignEligibleApp[];
  readonly diagnostics: readonly DesignEligibleAppsDiagnostic[];
  readonly scannedDirCount: number;
}

interface PersistedDesignPanelState {
  openByCwd?: Record<string, boolean>;
  selectedAppIdByCwd?: Record<string, string>;
}

export interface DesignPanelState {
  open: boolean;
  openByCwd: Record<string, boolean>;
  activeCwd: string | null;
  /** Selected eligible app id, keyed by active cwd. */
  selectedAppIdByCwd: Record<string, string>;
  /**
   * Cached eligible-apps list keyed by projectId. Populated by
   * `useDesignEligibleApps` so both the ChatHeader toggle (for gating) and the
   * DesignPanel body (for rendering) can share a single RPC round-trip.
   */
  eligibleAppsByProjectId: Record<string, readonly DesignEligibleApp[]>;
  /** Diagnostics from the most recent scan, keyed by projectId. */
  diagnosticsByProjectId: Record<string, readonly DesignEligibleAppsDiagnostic[]>;
  /** Total top-level dirs scanned, keyed by projectId. */
  scannedDirCountByProjectId: Record<string, number>;

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setCwd: (cwd: string | null) => void;
  setSelectedAppId: (appId: string | null) => void;
  setEligibleApps: (projectId: string, entry: DesignEligibleAppsCacheEntry) => void;
}

const PERSISTED_STATE_KEY = "t3code:design-panel:v1";

function readPersistedState(): PersistedDesignPanelState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return {};
    return (JSON.parse(raw) as PersistedDesignPanelState) ?? {};
  } catch {
    return {};
  }
}

function persistState(state: DesignPanelState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedDesignPanelState = {
      openByCwd: state.openByCwd,
      selectedAppIdByCwd: state.selectedAppIdByCwd,
    };
    window.localStorage.setItem(PERSISTED_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors.
  }
}

const debouncedPersist = new Debouncer(persistState, { wait: 500 });
const persisted = readPersistedState();

const initialState: Pick<
  DesignPanelState,
  | "open"
  | "openByCwd"
  | "activeCwd"
  | "selectedAppIdByCwd"
  | "eligibleAppsByProjectId"
  | "diagnosticsByProjectId"
  | "scannedDirCountByProjectId"
> = {
  open: false,
  openByCwd: persisted.openByCwd ?? {},
  activeCwd: null,
  selectedAppIdByCwd: persisted.selectedAppIdByCwd ?? {},
  eligibleAppsByProjectId: {},
  diagnosticsByProjectId: {},
  scannedDirCountByProjectId: {},
};

export const useDesignPanelStore = create<DesignPanelState>((set, get) => ({
  ...initialState,

  setOpen: (open) => {
    const { activeCwd, openByCwd } = get();
    const nextOpenByCwd = activeCwd ? { ...openByCwd, [activeCwd]: open } : openByCwd;
    set({ open, openByCwd: nextOpenByCwd });
    debouncedPersist.maybeExecute(get());
  },
  toggle: () => {
    const { open, activeCwd, openByCwd } = get();
    const next = !open;
    const nextOpenByCwd = activeCwd ? { ...openByCwd, [activeCwd]: next } : openByCwd;
    set({ open: next, openByCwd: nextOpenByCwd });
    debouncedPersist.maybeExecute(get());
  },
  setCwd: (cwd) => {
    const { activeCwd, open, openByCwd } = get();
    if (cwd === activeCwd) return;
    // First mount — rehydrate from the persisted per-cwd map. Don't overwrite
    // the persisted open-state with the session default (false), which would
    // silently erase a previously-open state the user had.
    if (activeCwd === null) {
      if (!cwd) {
        set({ activeCwd: cwd });
        return;
      }
      const persistedOpen = openByCwd[cwd];
      if (persistedOpen === undefined) {
        // Unknown cwd — seed with the session default without overwriting.
        set({ activeCwd: cwd, openByCwd: { ...openByCwd, [cwd]: open } });
        debouncedPersist.maybeExecute(get());
        return;
      }
      set({ activeCwd: cwd, open: persistedOpen });
      return;
    }
    // Switch: save prior cwd's open, rehydrate the new one (default: closed).
    const nextOpenByCwd = { ...openByCwd, [activeCwd]: open };
    const rehydratedOpen = cwd ? (nextOpenByCwd[cwd] ?? false) : false;
    set({ activeCwd: cwd, open: rehydratedOpen, openByCwd: nextOpenByCwd });
    debouncedPersist.maybeExecute(get());
  },
  setSelectedAppId: (appId) => {
    const { activeCwd, selectedAppIdByCwd } = get();
    if (!activeCwd) return;
    const next = { ...selectedAppIdByCwd };
    if (appId === null) delete next[activeCwd];
    else next[activeCwd] = appId;
    set({ selectedAppIdByCwd: next });
    debouncedPersist.maybeExecute(get());
  },
  setEligibleApps: (projectId, entry) => {
    const { eligibleAppsByProjectId, diagnosticsByProjectId, scannedDirCountByProjectId } = get();
    const existingApps = eligibleAppsByProjectId[projectId];
    const existingDiagnostics = diagnosticsByProjectId[projectId];
    const appsUnchanged =
      existingApps !== undefined &&
      existingApps.length === entry.apps.length &&
      existingApps.every(
        (app, i) => app.id === entry.apps[i]?.id && app.cwd === entry.apps[i]?.cwd,
      );
    const diagnosticsUnchanged =
      existingDiagnostics !== undefined &&
      existingDiagnostics.length === entry.diagnostics.length &&
      existingDiagnostics.every(
        (d, i) =>
          d.relativePath === entry.diagnostics[i]?.relativePath &&
          d.reason === entry.diagnostics[i]?.reason,
      );
    const countUnchanged = scannedDirCountByProjectId[projectId] === entry.scannedDirCount;
    if (appsUnchanged && diagnosticsUnchanged && countUnchanged) return;
    set({
      eligibleAppsByProjectId: appsUnchanged
        ? eligibleAppsByProjectId
        : { ...eligibleAppsByProjectId, [projectId]: entry.apps },
      diagnosticsByProjectId: diagnosticsUnchanged
        ? diagnosticsByProjectId
        : { ...diagnosticsByProjectId, [projectId]: entry.diagnostics },
      scannedDirCountByProjectId: countUnchanged
        ? scannedDirCountByProjectId
        : { ...scannedDirCountByProjectId, [projectId]: entry.scannedDirCount },
    });
  },
}));
