/**
 * useFileDiff
 *
 * Fetches and caches the raw unified diff for a specific checkpoint turn,
 * then parses it into per-file sections using parse-diff.
 *
 * The fetch is lazy — nothing happens until `enabled` is true (i.e. the user
 * expands the diff card).  Results are cached in a module-level Map so that
 * re-expanding a card never re-fetches.
 *
 * Works for ALL providers because it reads from the git-checkpoint system,
 * which captures any file change regardless of which provider made it.
 */

import { useEffect, useState } from "react";
import parseDiff, { type File as DiffFile } from "parse-diff";
import { type ThreadId } from "@t3tools/contracts";
import { getWsRpcClient } from "~/wsRpcClient";

export type { DiffFile };

export interface FileDiffState {
  /** Parsed per-file diff sections, one entry per changed file. */
  files: DiffFile[];
  isLoading: boolean;
  /** Human-readable error, if any. */
  error: string | null;
}

// Module-level cache: key is `${threadId}:${checkpointTurnCount}`
const diffCache = new Map<string, DiffFile[]>();

/**
 * @param threadId        The thread whose checkpoint we are reading.
 * @param checkpointTurnCount  The "toTurnCount" for getTurnDiff.  The previous
 *                        checkpoint (fromTurnCount) is inferred as
 *                        `checkpointTurnCount - 1`.
 * @param enabled         Only start fetching when true.  Pass `isOpen` from
 *                        the parent card so we fetch lazily on first expand.
 */
export function useFileDiff(
  threadId: ThreadId | undefined,
  checkpointTurnCount: number | undefined,
  enabled: boolean,
): FileDiffState {
  const [state, setState] = useState<FileDiffState>({
    files: [],
    isLoading: false,
    error: null,
  });

  const cacheKey =
    threadId != null && checkpointTurnCount != null ? `${threadId}:${checkpointTurnCount}` : null;

  useEffect(() => {
    if (!enabled || cacheKey == null || threadId == null || checkpointTurnCount == null) return;

    // Serve from cache immediately if available
    const cached = diffCache.get(cacheKey);
    if (cached) {
      setState({ files: cached, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    // fromTurnCount is the checkpoint just before this one.
    // If this is the very first checkpoint, fromTurnCount = 0.
    const fromTurnCount = Math.max(0, checkpointTurnCount - 1);

    getWsRpcClient()
      .orchestration.getTurnDiff({ threadId, fromTurnCount, toTurnCount: checkpointTurnCount })
      .then((result) => {
        if (cancelled) return;
        const parsed = parseDiff(result.diff);
        diffCache.set(cacheKey, parsed);
        setState({ files: parsed, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ files: [], isLoading: false, error: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, cacheKey, threadId, checkpointTurnCount]);

  return state;
}
