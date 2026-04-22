import { Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

/** Aligned with workspace index size (`WORKSPACE_INDEX_MAX_ENTRIES`) so full-index scans are valid. */
export const PROJECT_SEARCH_ENTRIES_MAX_LIMIT = 25_000;
const PROJECT_WRITE_FILE_PATH_MAX_LENGTH = 512;

export const ProjectSearchEntriesInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_ENTRIES_MAX_LIMIT)),
});
export type ProjectSearchEntriesInput = typeof ProjectSearchEntriesInput.Type;

const ProjectEntryKind = Schema.Literals(["file", "directory"]);

export const ProjectEntry = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: ProjectEntryKind,
  parentPath: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectEntry = typeof ProjectEntry.Type;

export const ProjectSearchEntriesResult = Schema.Struct({
  entries: Schema.Array(ProjectEntry),
  truncated: Schema.Boolean,
});
export type ProjectSearchEntriesResult = typeof ProjectSearchEntriesResult.Type;

export class ProjectSearchEntriesError extends Schema.TaggedErrorClass<ProjectSearchEntriesError>()(
  "ProjectSearchEntriesError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const ProjectWriteFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_WRITE_FILE_PATH_MAX_LENGTH)),
  contents: Schema.String,
});
export type ProjectWriteFileInput = typeof ProjectWriteFileInput.Type;

export const ProjectWriteFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
});
export type ProjectWriteFileResult = typeof ProjectWriteFileResult.Type;

export class ProjectWriteFileError extends Schema.TaggedErrorClass<ProjectWriteFileError>()(
  "ProjectWriteFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

const PROJECT_READ_FILE_PATH_MAX_LENGTH = 512;

export const ProjectReadFileInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  relativePath: TrimmedNonEmptyString.check(Schema.isMaxLength(PROJECT_READ_FILE_PATH_MAX_LENGTH)),
});
export type ProjectReadFileInput = typeof ProjectReadFileInput.Type;

export const ProjectReadFileResult = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  contents: Schema.String,
});
export type ProjectReadFileResult = typeof ProjectReadFileResult.Type;

export class ProjectReadFileError extends Schema.TaggedErrorClass<ProjectReadFileError>()(
  "ProjectReadFileError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ---------------------------------------------------------------------------
// Directory listing — used by the Files panel tree to lazy-load children.
// `relativePath` may be the empty string to list the workspace root.
// ---------------------------------------------------------------------------

/** Max children returned per `projects.listDirectory` call (server truncates beyond this). */
export const PROJECT_LIST_DIRECTORY_MAX_ENTRIES = 1_000;

export const ProjectListDirectoryInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  // Empty string is allowed (= root). We therefore use Schema.String directly
  // instead of TrimmedNonEmptyString.
  relativePath: Schema.String.check(Schema.isMaxLength(PROJECT_READ_FILE_PATH_MAX_LENGTH)),
  showHidden: Schema.optional(Schema.Boolean),
});
export type ProjectListDirectoryInput = typeof ProjectListDirectoryInput.Type;

export const ProjectListDirectoryResult = Schema.Struct({
  relativePath: Schema.String,
  entries: Schema.Array(ProjectEntry).check(Schema.isMaxLength(PROJECT_LIST_DIRECTORY_MAX_ENTRIES)),
  truncated: Schema.Boolean,
});
export type ProjectListDirectoryResult = typeof ProjectListDirectoryResult.Type;

export class ProjectListDirectoryError extends Schema.TaggedErrorClass<ProjectListDirectoryError>()(
  "ProjectListDirectoryError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ---------------------------------------------------------------------------
// File-contents search — ripgrep when available, bounded JS fallback otherwise.
// Hits include UTF-16 code-unit indices (`matchStart`/`matchEnd`) into `preview`
// so the UI can highlight without re-running the regex (ripgrep byte offsets are
// converted server-side).
// ---------------------------------------------------------------------------

const PROJECT_SEARCH_FILE_CONTENTS_MAX_LIMIT = 500;

export const ProjectSearchFileContentsInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  query: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(PROJECT_SEARCH_FILE_CONTENTS_MAX_LIMIT)),
  caseSensitive: Schema.optional(Schema.Boolean),
  useRegex: Schema.optional(Schema.Boolean),
});
export type ProjectSearchFileContentsInput = typeof ProjectSearchFileContentsInput.Type;

export const ProjectFileContentHit = Schema.Struct({
  relativePath: TrimmedNonEmptyString,
  line: PositiveInt,
  column: PositiveInt,
  preview: Schema.String,
  matchStart: Schema.Number,
  matchEnd: Schema.Number,
});
export type ProjectFileContentHit = typeof ProjectFileContentHit.Type;

export const ProjectSearchFileContentsResult = Schema.Struct({
  hits: Schema.Array(ProjectFileContentHit),
  truncated: Schema.Boolean,
  ripgrepAvailable: Schema.Boolean,
});
export type ProjectSearchFileContentsResult = typeof ProjectSearchFileContentsResult.Type;

export class ProjectSearchFileContentsError extends Schema.TaggedErrorClass<ProjectSearchFileContentsError>()(
  "ProjectSearchFileContentsError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}
