// apps/web/src/previewStore.ts
/**
 * Client-side state for the preview panel.
 *
 * - apps: detected PreviewApp[] per project (populated on panel open)
 * - sessions: live PreviewSession per appId (updated via WebSocket events)
 * - logs: last MAX_LOG_LINES log lines per app
 * - activeAppId: which tab is selected per project
 */
import type { PreviewApp, PreviewEvent, PreviewSession } from "@t3tools/contracts";
import { create } from "zustand";

const MAX_LOG_LINES = 1000;

/** `${projectId}:${appId}` */
type SessionKey = string;

function sessionKey(projectId: string, appId: string): SessionKey {
  return `${projectId}:${appId}`;
}

/**
 * Stable empty-array constants used as selector fallbacks.
 *
 * IMPORTANT: selectors must return these constants (not inline `[]` or `?? []`)
 * when a key is absent. Zustand uses useSyncExternalStore, which calls the
 * selector on every render and compares results with Object.is. A new `[]`
 * on every render looks like a changed value → infinite re-render loop.
 */
const EMPTY_APPS: PreviewApp[] = [];
const EMPTY_LOGS: string[] = [];

export type DetectionStatus = "idle" | "detecting" | "done" | "error";

interface PreviewState {
  apps: Record<string, PreviewApp[]>;
  sessions: Record<SessionKey, PreviewSession>;
  logs: Record<SessionKey, string[]>;
  activeAppId: Record<string, string>;
  /** Tracks per-project scan progress so the UI can show a loading state. */
  detectionStatus: Record<string, DetectionStatus>;
}

interface PreviewStore extends PreviewState {
  setApps: (projectId: string, apps: PreviewApp[]) => void;
  setDetectionStatus: (projectId: string, status: DetectionStatus) => void;
  applyEvent: (event: PreviewEvent) => void;
  setActiveApp: (projectId: string, appId: string) => void;
  clearProject: (projectId: string) => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  apps: {},
  sessions: {},
  logs: {},
  activeAppId: {},
  detectionStatus: {},

  setApps: (projectId, apps) =>
    set((state) => ({
      apps: { ...state.apps, [projectId]: apps },
      detectionStatus: { ...state.detectionStatus, [projectId]: "done" as DetectionStatus },
      // Auto-select first app if nothing selected yet for this project
      activeAppId:
        state.activeAppId[projectId] != null
          ? state.activeAppId
          : { ...state.activeAppId, [projectId]: apps[0]?.id ?? "" },
    })),

  setDetectionStatus: (projectId, status) =>
    set((state) => ({
      detectionStatus: { ...state.detectionStatus, [projectId]: status },
    })),

  applyEvent: (event) =>
    set((state) => {
      if (event.type === "apps-updated") {
        return {
          apps: { ...state.apps, [event.projectId]: [...event.apps] },
          activeAppId:
            state.activeAppId[event.projectId] != null
              ? state.activeAppId
              : { ...state.activeAppId, [event.projectId]: event.apps[0]?.id ?? "" },
        };
      }

      if (event.type === "status-change") {
        const key = sessionKey(event.projectId, event.appId);
        return {
          sessions: { ...state.sessions, [key]: event.session },
        };
      }

      if (event.type === "log") {
        const key = sessionKey(event.projectId, event.appId);
        const existing = state.logs[key] ?? [];
        const next =
          existing.length >= MAX_LOG_LINES
            ? [...existing.slice(existing.length - MAX_LOG_LINES + 1), event.line]
            : [...existing, event.line];
        return { logs: { ...state.logs, [key]: next } };
      }

      return state;
    }),

  setActiveApp: (projectId, appId) =>
    set((state) => ({
      activeAppId: { ...state.activeAppId, [projectId]: appId },
    })),

  clearProject: (projectId) =>
    set((state) => {
      const nextApps = { ...state.apps };
      delete nextApps[projectId];
      const nextSessions = { ...state.sessions };
      const nextLogs = { ...state.logs };
      const nextActive = { ...state.activeAppId };
      delete nextActive[projectId];
      for (const key of Object.keys(nextSessions)) {
        if (key.startsWith(`${projectId}:`)) {
          delete nextSessions[key];
          delete nextLogs[key];
        }
      }
      return {
        apps: nextApps,
        sessions: nextSessions,
        logs: nextLogs,
        activeAppId: nextActive,
      };
    }),
}));

/** Convenience selector: apps for a project. Returns stable EMPTY_APPS constant when absent. */
export const selectApps =
  (projectId: string) =>
  (state: PreviewStore): PreviewApp[] =>
    // Must return the same reference when empty — see EMPTY_APPS comment above.
    state.apps[projectId] ?? EMPTY_APPS;

/** Convenience selector: session for a specific app */
export const selectSession =
  (projectId: string, appId: string) =>
  (state: PreviewStore): PreviewSession | null =>
    // null is a primitive — always Object.is-equal, safe to return inline.
    state.sessions[sessionKey(projectId, appId)] ?? null;

/** Convenience selector: log lines for a specific app. Returns stable EMPTY_LOGS constant when absent. */
export const selectLogs =
  (projectId: string, appId: string) =>
  (state: PreviewStore): string[] =>
    // Must return the same reference when empty — see EMPTY_APPS comment above.
    state.logs[sessionKey(projectId, appId)] ?? EMPTY_LOGS;

/** Convenience selector: active tab app id for a project */
export const selectActiveAppId =
  (projectId: string) =>
  (state: PreviewStore): string | null =>
    // null is a primitive — safe to return inline.
    state.activeAppId[projectId] ?? null;

/** Convenience selector: detection status for a project */
export const selectDetectionStatus =
  (projectId: string) =>
  (state: PreviewStore): DetectionStatus =>
    state.detectionStatus[projectId] ?? "idle";

/** Convenience selector: true if any app in the project is running or starting */
export const selectHasRunningApp =
  (projectId: string) =>
  (state: PreviewStore): boolean => {
    const apps = state.apps[projectId] ?? EMPTY_APPS;
    return apps.some((app) => {
      const s = state.sessions[sessionKey(projectId, app.id)];
      return s?.status === "running" || s?.status === "starting";
    });
  };
