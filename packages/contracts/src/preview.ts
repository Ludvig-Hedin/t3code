// packages/contracts/src/preview.ts
import { Schema } from "effect";
import { ProjectId } from "./baseSchemas";

export const PreviewApp = Schema.Struct({
  /** Stable slug, e.g. "web", "server", "mobile". Unique within a project. */
  id: Schema.String,
  projectId: ProjectId,
  label: Schema.String,
  /** Full shell command to run, e.g. "bun run dev" */
  command: Schema.String,
  /** Absolute working directory to spawn the command in */
  cwd: Schema.String,
  /** "browser" = show in iframe; "logs" = show log output only */
  type: Schema.Union([Schema.Literal("browser"), Schema.Literal("logs")]),
  /** True if the user overrode the auto-detected config */
  isManualOverride: Schema.Boolean,
});
export type PreviewApp = typeof PreviewApp.Type;

export const PreviewAppPatch = Schema.Struct({
  label: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Union([Schema.Literal("browser"), Schema.Literal("logs")])),
});
export type PreviewAppPatch = typeof PreviewAppPatch.Type;

export const PreviewSessionStatus = Schema.Union([
  Schema.Literal("starting"),
  Schema.Literal("running"),
  Schema.Literal("stopped"),
  Schema.Literal("error"),
]);
export type PreviewSessionStatus = typeof PreviewSessionStatus.Type;

export const PreviewSession = Schema.Struct({
  appId: Schema.String,
  projectId: ProjectId,
  status: PreviewSessionStatus,
  /** Null until port is detected from stdout */
  port: Schema.NullOr(Schema.Number),
  pid: Schema.NullOr(Schema.Number),
  startedAt: Schema.NullOr(Schema.String),
  errorMessage: Schema.NullOr(Schema.String),
});
export type PreviewSession = typeof PreviewSession.Type;

export const PreviewEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("log"),
    appId: Schema.String,
    projectId: ProjectId,
    line: Schema.String,
    stream: Schema.Union([Schema.Literal("stdout"), Schema.Literal("stderr")]),
  }),
  Schema.Struct({
    type: Schema.Literal("status-change"),
    appId: Schema.String,
    projectId: ProjectId,
    session: PreviewSession,
  }),
  Schema.Struct({
    type: Schema.Literal("apps-updated"),
    projectId: ProjectId,
    apps: Schema.Array(PreviewApp),
  }),
]);
export type PreviewEvent = typeof PreviewEvent.Type;

export const PreviewDetectAppsInput = Schema.Struct({ projectId: ProjectId });
export const PreviewStartInput = Schema.Struct({ projectId: ProjectId, appId: Schema.String });
export const PreviewStopInput = Schema.Struct({ projectId: ProjectId, appId: Schema.String });
export const PreviewGetSessionsInput = Schema.Struct({ projectId: ProjectId });
export const PreviewUpdateAppInput = Schema.Struct({
  projectId: ProjectId,
  appId: Schema.String,
  patch: PreviewAppPatch,
});
export const PreviewSubscribeInput = Schema.Struct({ projectId: ProjectId });

// Uses TaggedErrorClass to match the pattern used throughout this package
export class PreviewError extends Schema.TaggedErrorClass<PreviewError>()("PreviewError", {
  message: Schema.String,
}) {}
