import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DesignEligibleApp,
  DesignEligibleAppsDiagnostic,
  ProjectId,
} from "@t3tools/contracts";

import { useDesignPanelStore } from "~/designPanelStore";
import { getWsRpcClient } from "~/wsRpcClient";

export interface UseDesignEligibleAppsResult {
  /** `null` while the first fetch is in flight; otherwise the most recent result. */
  readonly apps: readonly DesignEligibleApp[] | null;
  /** Reasons package.jsons were excluded during the last scan. Empty if scan never ran. */
  readonly diagnostics: readonly DesignEligibleAppsDiagnostic[];
  /** Total top-level dirs walked by the last scan. `null` until a scan has completed. */
  readonly scannedDirCount: number | null;
  /** Populated when the RPC itself failed (network, server crash). Cleared on success. */
  readonly error: string | null;
  /** Re-runs detection against the server. Resolves with the latest scan snapshot (or null if no project). */
  readonly refetch: () => Promise<{
    readonly apps: readonly DesignEligibleApp[];
    readonly error: string | null;
    readonly scannedDirCount: number | null;
  } | null>;
  /** True while a fetch is in flight (initial or manual refetch). */
  readonly isFetching: boolean;
}

/**
 * Fetches + caches the list of design-eligible React apps for a project.
 *
 * Used by both the `ChatHeader` toggle (to gate availability) and the
 * `DesignPanel` body (to render the list). Results are cached in
 * `designPanelStore.eligibleAppsByProjectId` so both consumers share a single
 * RPC round-trip per project id.
 *
 * Returns `null` while the first fetch is in flight, `[]` on error or when no
 * React apps are detected. Any RPC failure is surfaced via `error` — callers
 * can distinguish "scan found nothing" from "scan itself failed".
 */
export function useDesignEligibleApps(projectId: ProjectId | null): UseDesignEligibleAppsResult {
  const cached = useDesignPanelStore((store) =>
    projectId ? (store.eligibleAppsByProjectId[projectId] ?? null) : null,
  );
  const diagnostics = useDesignPanelStore((store) =>
    projectId ? (store.diagnosticsByProjectId[projectId] ?? EMPTY_DIAGNOSTICS) : EMPTY_DIAGNOSTICS,
  );
  const scannedDirCount = useDesignPanelStore((store) =>
    projectId ? (store.scannedDirCountByProjectId[projectId] ?? null) : null,
  );
  const setEligibleApps = useDesignPanelStore((store) => store.setEligibleApps);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchSeq = useRef(0);

  const runFetch = useCallback(
    async (pid: ProjectId) => {
      const seq = ++fetchSeq.current;
      setIsFetching(true);
      setError(null);
      try {
        const result = await getWsRpcClient().design.eligibleApps({ projectId: pid });
        if (seq !== fetchSeq.current) {
          return {
            apps: result.apps,
            error: null as string | null,
            scannedDirCount: result.scannedDirCount ?? 0,
          };
        }
        setEligibleApps(pid, {
          apps: result.apps,
          diagnostics: result.diagnostics ?? [],
          scannedDirCount: result.scannedDirCount ?? 0,
        });
        return {
          apps: result.apps,
          error: null as string | null,
          scannedDirCount: result.scannedDirCount ?? 0,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Scan failed";
        if (seq === fetchSeq.current) {
          setError(message);
          setEligibleApps(pid, {
            apps: [],
            diagnostics: [
              {
                relativePath: ".",
                reason: "read-error",
                detail: message,
              },
            ],
            scannedDirCount: 0,
          });
        }
        return {
          apps: [] as const,
          error: message,
          scannedDirCount: 0,
        };
      } finally {
        if (seq === fetchSeq.current) setIsFetching(false);
      }
    },
    [setEligibleApps],
  );

  useEffect(() => {
    if (!projectId) {
      setIsFetching(false);
      return;
    }
    void runFetch(projectId);
    return () => {
      fetchSeq.current += 1;
    };
  }, [projectId, runFetch]);

  const refetch = useCallback(async () => {
    if (!projectId) return null;
    return runFetch(projectId);
  }, [projectId, runFetch]);

  return { apps: cached, diagnostics, scannedDirCount, error, refetch, isFetching };
}

const EMPTY_DIAGNOSTICS: readonly DesignEligibleAppsDiagnostic[] = [];
