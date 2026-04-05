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

interface PreviewState {
  apps: Record<string, PreviewApp[]>;
  sessions: Record<SessionKey, PreviewSession>;
  logs: Record<SessionKey, string[]>;
  activeAppId: Record<string, string>;
}

interface PreviewStore extends PreviewState {
  setApps: (projectId: string, apps: PreviewApp[]) => void;
  applyEvent: (event: PreviewEvent) => void;
  setActiveApp: (projectId: string, appId: string) => void;
  clearProject: (projectId: string) => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  apps: {},
  sessions: {},
  logs: {},
  activeAppId: {},

  setApps: (projectId, apps) =>
    set((state) => ({
      apps: { ...state.apps, [projectId]: apps },
      // Auto-select first app if nothing selected yet for this project
      activeAppId:
        state.activeAppId[projectId] != null
          ? state.activeAppId
          : { ...state.activeAppId, [projectId]: apps[0]?.id ?? "" },
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

/** Convenience selector: apps for a project */
export const selectApps =
  (projectId: string) =>
  (state: PreviewStore): PreviewApp[] =>
    state.apps[projectId] ?? [];

/** Convenience selector: session for a specific app */
export const selectSession =
  (projectId: string, appId: string) =>
  (state: PreviewStore): PreviewSession | null =>
    state.sessions[sessionKey(projectId, appId)] ?? null;

/** Convenience selector: log lines for a specific app */
export const selectLogs =
  (projectId: string, appId: string) =>
  (state: PreviewStore): string[] =>
    state.logs[sessionKey(projectId, appId)] ?? [];

/** Convenience selector: active tab app id for a project */
export const selectActiveAppId =
  (projectId: string) =>
  (state: PreviewStore): string | null =>
    state.activeAppId[projectId] ?? null;

/** Convenience selector: true if any app in the project is running or starting */
export const selectHasRunningApp =
  (projectId: string) =>
  (state: PreviewStore): boolean => {
    const apps = state.apps[projectId] ?? [];
    return apps.some((app) => {
      const s = state.sessions[sessionKey(projectId, app.id)];
      return s?.status === "running" || s?.status === "starting";
    });
  };
