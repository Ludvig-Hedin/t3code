import { Schema } from "effect";
import { ProviderKind } from "./orchestration";

/** A detected project directory found under a provider's history path. */
export const ImportDetectedProject = Schema.Struct({
  provider: ProviderKind,
  projectName: Schema.String,
  /** Absolute path on disk — becomes the Bird Code workspaceRoot. */
  projectPath: Schema.String,
  /** Provider-local path to the history directory. */
  historyPath: Schema.String,
  /** Number of conversation files detected (approximate thread count). */
  threadCount: Schema.Number,
});
export type ImportDetectedProject = typeof ImportDetectedProject.Type;

export const ImportScanResult = Schema.Struct({
  projects: Schema.Array(ImportDetectedProject),
});
export type ImportScanResult = typeof ImportScanResult.Type;

/** One selection from the scan result the user wants imported. */
export const ImportSelection = Schema.Struct({
  provider: ProviderKind,
  projectPath: Schema.String,
  historyPath: Schema.String,
  projectName: Schema.String,
});
export type ImportSelection = typeof ImportSelection.Type;

export const ImportRequest = Schema.Struct({
  selections: Schema.Array(ImportSelection),
});
export type ImportRequest = typeof ImportRequest.Type;

export const ImportExecuteResult = Schema.Struct({
  importedProjectCount: Schema.Number,
  importedThreadCount: Schema.Number,
  errors: Schema.Array(Schema.String),
});
export type ImportExecuteResult = typeof ImportExecuteResult.Type;

/** Setup-time git check result (distinct from the git.ts GitStatusResult which is about repo state). */
export const SetupGitStatusResult = Schema.Struct({
  installed: Schema.Boolean,
  /** git --version output, e.g. "git version 2.39.0" */
  version: Schema.NullOr(Schema.String),
  /** true if git config --global user.name is set */
  nameConfigured: Schema.Boolean,
  /** true if git config --global user.email is set */
  emailConfigured: Schema.Boolean,
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
});
export type SetupGitStatusResult = typeof SetupGitStatusResult.Type;
