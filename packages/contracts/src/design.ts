// packages/contracts/src/design.ts
//
// Contracts for the Design panel — a visual editor mode that targets local
// React apps. Phase 1 only exposes eligibility detection so the UI can hide
// the panel when no React app is present. Subsequent phases will add
// selection/edit/insert operations.
import { Schema } from "effect";
import { ProjectId } from "./baseSchemas";

/**
 * A React app the Design panel can operate on. Represents a single
 * `package.json` within the project that declares `react` as a dependency.
 *
 * The Design panel picks one eligible app at a time — for monorepos with
 * multiple React packages, the panel shows an app selector (future phase).
 */
export const DesignEligibleApp = Schema.Struct({
  /** Stable id derived from the relative path, e.g. "apps/web". */
  id: Schema.String,
  /** Human-readable label, typically the last path segment. */
  label: Schema.String,
  /** Absolute working directory for the app. */
  cwd: Schema.String,
  /** Relative path of the package.json from the project root. */
  relativePath: Schema.String,
});
export type DesignEligibleApp = typeof DesignEligibleApp.Type;

export const DesignEligibleAppsInput = Schema.Struct({
  projectId: ProjectId,
});
export type DesignEligibleAppsInput = typeof DesignEligibleAppsInput.Type;

/**
 * Explains why a package.json was discovered during detection but not
 * returned as an eligible app. Powers the Design panel's empty state so
 * users can diagnose misconfigured projects without reading server logs.
 */
export const DesignEligibleAppsDiagnostic = Schema.Struct({
  /** Relative path from the project root, e.g. "frontend/package.json". */
  relativePath: Schema.String,
  /** Machine-readable rejection reason. */
  reason: Schema.Literals([
    "no-react",
    "no-dev-script",
    "skipped-packages-dir",
    "logs-only",
    "standalone-file",
    "read-error",
  ]),
  /** Short human-readable explanation suitable for display. */
  detail: Schema.String,
});
export type DesignEligibleAppsDiagnostic = typeof DesignEligibleAppsDiagnostic.Type;

export const DesignEligibleAppsResult = Schema.Struct({
  apps: Schema.Array(DesignEligibleApp),
  /**
   * Optional list of package.json files that were scanned but excluded.
   * Rendered in the "No React app detected" empty state to help users
   * understand what the scanner saw. Optional for backwards compat.
   */
  diagnostics: Schema.optionalKey(Schema.Array(DesignEligibleAppsDiagnostic)),
  /** Total number of top-level directories scanned (for UX feedback). */
  scannedDirCount: Schema.optionalKey(Schema.Number),
});
export type DesignEligibleAppsResult = typeof DesignEligibleAppsResult.Type;

export class DesignError extends Schema.TaggedErrorClass<DesignError>()("DesignError", {
  message: Schema.String,
}) {}

// ---------------------------------------------------------------------------
// primeApp — walk the app source tree, stamp data-oid on JSXOpeningElements,
// persist the source, and build the server-side OID index.
// ---------------------------------------------------------------------------

export const DesignPrimeAppInput = Schema.Struct({
  projectId: ProjectId,
  /** Absolute cwd of the React app to stamp (from DesignEligibleApp.cwd). */
  appCwd: Schema.String,
});
export type DesignPrimeAppInput = typeof DesignPrimeAppInput.Type;

export const DesignPrimeAppResult = Schema.Struct({
  /** Total `.tsx`/`.jsx` files scanned. */
  fileCount: Schema.Number,
  /** Distinct OIDs now in the server-side index. */
  oidCount: Schema.Number,
  /** Files that were mutated (stamped) and written back to disk. */
  writtenFileCount: Schema.Number,
});
export type DesignPrimeAppResult = typeof DesignPrimeAppResult.Type;

// ---------------------------------------------------------------------------
// resolveOid — look up where an OID lives in source. Called by the design
// panel when the user wants to jump from a selected element to its source.
// ---------------------------------------------------------------------------

export const DesignResolveOidInput = Schema.Struct({
  projectId: ProjectId,
  appCwd: Schema.String,
  oid: Schema.String,
});
export type DesignResolveOidInput = typeof DesignResolveOidInput.Type;

export const DesignOidLocation = Schema.Struct({
  oid: Schema.String,
  relPath: Schema.String,
  line: Schema.Number,
  col: Schema.Number,
  elementName: Schema.String,
});
export type DesignOidLocation = typeof DesignOidLocation.Type;

/**
 * Distinguishes "we never primed this app" from "this OID is unknown to a
 * primed app". Matters because a server restart wipes the in-memory index;
 * on `not-primed` the client re-calls `primeApp` automatically rather than
 * failing silently.
 */
export const DesignResolveOidState = Schema.Literals(["primed", "not-primed"]);
export type DesignResolveOidState = typeof DesignResolveOidState.Type;

export const DesignResolveOidResult = Schema.Struct({
  /** Null when the app has not been primed or the OID is unknown. */
  location: Schema.NullOr(DesignOidLocation),
  state: DesignResolveOidState,
});
export type DesignResolveOidResult = typeof DesignResolveOidResult.Type;

// ---------------------------------------------------------------------------
// applyEdit — mutate source for a given OID. Phase 3 ships two ops:
//   - setText: replace the JSX element's leading text child
//   - setClassName: overwrite (or remove) the className prop value
// ---------------------------------------------------------------------------

export const DesignEditSetText = Schema.Struct({
  kind: Schema.Literal("setText"),
  /** The new text value. Empty string removes the text child entirely. */
  text: Schema.String,
});
export type DesignEditSetText = typeof DesignEditSetText.Type;

export const DesignEditSetClassName = Schema.Struct({
  kind: Schema.Literal("setClassName"),
  /** The full new className value. Null removes the attribute entirely. */
  className: Schema.NullOr(Schema.String),
});
export type DesignEditSetClassName = typeof DesignEditSetClassName.Type;

/** Remove the targeted JSX element entirely. */
export const DesignEditDelete = Schema.Struct({
  kind: Schema.Literal("delete"),
});
export type DesignEditDelete = typeof DesignEditDelete.Type;

/** Insert a clone of the targeted element as its next sibling. */
export const DesignEditDuplicate = Schema.Struct({
  kind: Schema.Literal("duplicate"),
});
export type DesignEditDuplicate = typeof DesignEditDuplicate.Type;

/**
 * Reorder the targeted element within its parent. `beforeOid` identifies the
 * sibling to place the element in front of — null means "append to end".
 * Cross-parent moves are rejected in this phase.
 */
export const DesignEditMove = Schema.Struct({
  kind: Schema.Literal("move"),
  beforeOid: Schema.NullOr(Schema.String),
});
export type DesignEditMove = typeof DesignEditMove.Type;

/**
 * Insert a new element as a child (`position:"inside"`), previous sibling
 * (`"before"`), or next sibling (`"after"`) of the targeted element.
 */
export const DesignInsertPosition = Schema.Literals(["inside", "before", "after"]);
export type DesignInsertPosition = typeof DesignInsertPosition.Type;

export const DesignEditInsert = Schema.Struct({
  kind: Schema.Literal("insert"),
  /** JSX tag name, e.g. "div", "button", "span". */
  tag: Schema.String,
  position: DesignInsertPosition,
  /** Optional className to seed on the new element. */
  className: Schema.optionalKey(Schema.NullOr(Schema.String)),
  /** Optional inner text for the new element. */
  text: Schema.optionalKey(Schema.String),
});
export type DesignEditInsert = typeof DesignEditInsert.Type;

export const DesignEditOp = Schema.Union([
  DesignEditSetText,
  DesignEditSetClassName,
  DesignEditDelete,
  DesignEditDuplicate,
  DesignEditMove,
  DesignEditInsert,
]);
export type DesignEditOp = typeof DesignEditOp.Type;

export const DesignApplyEditInput = Schema.Struct({
  projectId: ProjectId,
  appCwd: Schema.String,
  oid: Schema.String,
  op: DesignEditOp,
});
export type DesignApplyEditInput = typeof DesignApplyEditInput.Type;

export const DesignApplyEditResult = Schema.Struct({
  /** Whether the source changed on disk. */
  changed: Schema.Boolean,
  /** Relative path of the file that was mutated, or null if nothing happened. */
  relPath: Schema.NullOr(Schema.String),
  /** The post-edit OID location (coordinates may have shifted slightly). */
  location: Schema.NullOr(DesignOidLocation),
});
export type DesignApplyEditResult = typeof DesignApplyEditResult.Type;
