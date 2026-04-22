/**
 * PreviewServerManager - Service interface for managing preview dev-server processes.
 *
 * Owns lifecycle operations for detected app dev servers, session state,
 * and streaming of log/status events per project.
 *
 * @module PreviewServerManager
 */
import { Effect, ServiceMap, Stream } from "effect";

import type { PreviewApp, PreviewEvent, PreviewFileItem, PreviewSession } from "@t3tools/contracts";

export interface PreviewServerManagerShape {
  /** Scan project cwd and return detected app candidates. */
  readonly detectApps: (projectId: string, cwd: string) => Effect.Effect<PreviewApp[]>;

  /** Start a dev server process for the given appId. Returns initial session state. */
  readonly startApp: (projectId: string, appId: string) => Effect.Effect<PreviewSession, Error>;

  /** Stop a running dev server process. */
  readonly stopApp: (projectId: string, appId: string) => Effect.Effect<void, Error>;

  /** Get current session for a running app. Returns null if not running. */
  readonly getSession: (projectId: string, appId: string) => PreviewSession | null;

  /** Get all active sessions for a project. */
  readonly getSessions: (projectId: string) => PreviewSession[];

  /** Update an app's config (manual override). Returns the updated app. */
  readonly updateApp: (
    projectId: string,
    appId: string,
    patch: { label?: string; command?: string; cwd?: string; type?: "browser" | "logs" },
  ) => Effect.Effect<PreviewApp, Error>;

  /** Get current app list for a project (detected + overrides). */
  readonly getApps: (projectId: string) => PreviewApp[];

  /** List standalone previewable files under the project root (HTML, MD, TSX, DOCX, …). */
  readonly listFiles: (projectId: string, cwd: string) => Effect.Effect<PreviewFileItem[], Error>;

  /** Register or return a file-backed preview app for the given relative path. */
  readonly openFile: (
    projectId: string,
    cwd: string,
    relativePath: string,
  ) => Effect.Effect<PreviewApp, Error>;

  /** Stream PreviewEvents for a project. Never ends unless the process itself dies. */
  readonly streamEvents: (projectId: string) => Stream.Stream<PreviewEvent>;
}

/**
 * PreviewServerManager - Service tag for preview dev-server orchestration.
 */
export class PreviewServerManager extends ServiceMap.Service<
  PreviewServerManager,
  PreviewServerManagerShape
>()("t3/PreviewServerManager") {}
