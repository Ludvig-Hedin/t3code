/**
 * DesignService — orchestrates the Design panel backend.
 *
 * Phase 1: eligibility detection.
 * Phase 2: AST stamping (`primeApp`) + OID → source-location resolution
 *   (`resolveOid`). Stamping is on-demand; a file watcher is deferred to a
 *   later phase. OID maps are kept in-memory, keyed by `appCwd`.
 *
 * @module DesignService
 */
import { Effect, ServiceMap } from "effect";

import type { DesignEligibleApp, DesignEligibleAppsDiagnostic } from "@t3tools/contracts";

export interface DesignEligibleAppsOutcome {
  readonly apps: DesignEligibleApp[];
  readonly diagnostics: DesignEligibleAppsDiagnostic[];
  readonly scannedDirCount: number;
}

export interface DesignOidLocation {
  readonly oid: string;
  readonly relPath: string;
  readonly line: number;
  readonly col: number;
  readonly elementName: string;
}

export interface DesignPrimeSummary {
  readonly fileCount: number;
  readonly oidCount: number;
  readonly writtenFileCount: number;
}

export type DesignEditOp =
  | { readonly kind: "setText"; readonly text: string }
  | { readonly kind: "setClassName"; readonly className: string | null }
  | { readonly kind: "delete" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "move"; readonly beforeOid: string | null }
  | {
      readonly kind: "insert";
      readonly tag: string;
      readonly position: "inside" | "before" | "after";
      readonly className?: string | null | undefined;
      readonly text?: string | undefined;
    };

export interface DesignApplyEditSummary {
  readonly changed: boolean;
  readonly relPath: string | null;
  readonly location: DesignOidLocation | null;
}

export type DesignResolveOidState = "primed" | "not-primed";

export interface DesignResolveOidOutcome {
  readonly location: DesignOidLocation | null;
  readonly state: DesignResolveOidState;
}

export interface DesignServiceShape {
  /**
   * Scan the project root and return all package.json files that declare
   * React as a dependency, along with diagnostics about excluded candidates.
   * Diagnostics power the Design panel's empty state so users can see why a
   * package.json wasn't eligible (no react, no dev script, etc.).
   * Never throws — file errors are captured as diagnostics.
   */
  readonly findEligibleApps: (
    projectId: string,
    cwd: string,
  ) => Effect.Effect<DesignEligibleAppsOutcome>;
  /**
   * Walk the app's source tree (`<appCwd>/src`, `<appCwd>/app`, or `<appCwd>`
   * if neither exists), parse every `.tsx`/`.jsx` file, stamp `data-oid`
   * attributes onto JSXOpeningElements, and write the mutated sources back.
   * Builds an in-memory `oid → location` index keyed by `${projectId}:${appCwd}`
   * so two projects sharing the same physical app dir don't clobber each other.
   */
  readonly primeApp: (
    projectId: string,
    appCwd: string,
  ) => Effect.Effect<DesignPrimeSummary>;
  /**
   * Look up an OID previously stamped by `primeApp`. The `state` field
   * distinguishes "app was never primed" from "OID unknown" so callers
   * can re-prime automatically after a server restart instead of failing
   * silently.
   */
  readonly resolveOid: (
    projectId: string,
    appCwd: string,
    oid: string,
  ) => Effect.Effect<DesignResolveOidOutcome>;
  /**
   * Apply an edit to the source file that contains `oid`. Updates the
   * in-memory OID index to reflect any coordinate shifts and writes the
   * new source back to disk.
   */
  readonly applyEdit: (
    projectId: string,
    appCwd: string,
    oid: string,
    op: DesignEditOp,
  ) => Effect.Effect<DesignApplyEditSummary>;
}

export class DesignService extends ServiceMap.Service<DesignService, DesignServiceShape>()(
  "t3/DesignService",
) {}
