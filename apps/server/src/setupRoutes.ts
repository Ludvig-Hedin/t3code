/**
 * setupRoutes — lightweight HTTP routes for the onboarding flow.
 *
 * GET  /api/setup/git-status        — checks if git is installed and configured
 * GET  /api/setup/import/scan       — scans provider history directories for detected projects
 * POST /api/setup/import/execute    — creates Bird Code projects + thread stubs from a selection
 */
import { exec } from "node:child_process";
import * as nodeFs from "node:fs/promises";
import * as os from "node:os";
import * as nodePath from "node:path";
import { promisify } from "node:util";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  ImportRequest,
  ProjectId,
  TrimmedNonEmptyString,
  ThreadId,
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine";

const execAsync = promisify(exec);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Known candidate paths for each provider's conversation history. */
const PROVIDER_HISTORY_CANDIDATES: Record<string, (home: string) => string[]> = {
  codex: (home) => [
    ...(process.env["CODEX_HOME"] ? [process.env["CODEX_HOME"]] : []),
    nodePath.join(home, ".codex", "sessions"),
    nodePath.join(home, ".codex"),
  ],
  claudeAgent: (home) => [
    nodePath.join(home, ".claude", "projects"),
    nodePath.join(home, ".claude"),
  ],
  gemini: (home) => [nodePath.join(home, ".gemini", "sessions"), nodePath.join(home, ".gemini")],
  opencode: (home) => [
    nodePath.join(home, ".config", "opencode"),
    nodePath.join(home, ".opencode"),
  ],
};

async function resolveProviderHistoryRoot(provider: string): Promise<string | null> {
  const home = os.homedir();
  const candidates = (PROVIDER_HISTORY_CANDIDATES[provider]?.(home) ?? []).filter(Boolean);
  for (const candidate of candidates) {
    try {
      await nodeFs.access(candidate);
      return candidate;
    } catch {
      // Not accessible — try next candidate
    }
  }
  return null;
}

async function scanProviderHistory(
  historyRoot: string,
): Promise<
  Array<{ projectName: string; projectPath: string; historyPath: string; threadCount: number }>
> {
  const results: Array<{
    projectName: string;
    projectPath: string;
    historyPath: string;
    threadCount: number;
  }> = [];
  try {
    const entries = await nodeFs.readdir(historyRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const historyPath = nodePath.join(historyRoot, entry.name);
      let threadCount = 0;
      try {
        const inner = await nodeFs.readdir(historyPath);
        threadCount = inner.filter((f) => f.endsWith(".json") || f.endsWith(".md")).length;
      } catch {
        // Unreadable inner dir — count stays 0
      }
      // Only include directories that have conversation files — skip config dirs etc.
      if (threadCount === 0) continue;
      results.push({
        projectName: entry.name,
        projectPath: historyPath,
        historyPath,
        threadCount,
      });
    }
  } catch {
    // Root dir unreadable — return empty
  }
  return results;
}

// ── Git Status Route ──────────────────────────────────────────────────────────

export const gitStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/setup/git-status",
  Effect.gen(function* () {
    const version = yield* Effect.tryPromise(() =>
      execAsync("git --version")
        .then((r) => r.stdout.trim())
        .catch(() => null),
    ).pipe(Effect.orElseSucceed(() => null));

    const [name, email] = yield* Effect.tryPromise(() =>
      Promise.all([
        execAsync("git config --global user.name")
          .then((r) => r.stdout.trim() || null)
          .catch(() => null),
        execAsync("git config --global user.email")
          .then((r) => r.stdout.trim() || null)
          .catch(() => null),
      ]),
    ).pipe(Effect.orElseSucceed(() => [null, null] as const));

    return HttpServerResponse.jsonUnsafe({
      installed: version !== null,
      version: version ?? null,
      nameConfigured: typeof name === "string" && name.length > 0,
      emailConfigured: typeof email === "string" && email.length > 0,
      name: name ?? null,
      email: email ?? null,
    });
  }),
);

// ── Import Scan Route ─────────────────────────────────────────────────────────

export const importScanRouteLayer = HttpRouter.add(
  "GET",
  "/api/setup/import/scan",
  Effect.gen(function* () {
    const PROVIDERS_TO_SCAN = ["codex", "claudeAgent", "gemini", "opencode"] as const;
    const allProjects: Array<{
      provider: string;
      projectName: string;
      projectPath: string;
      historyPath: string;
      threadCount: number;
    }> = [];

    for (const provider of PROVIDERS_TO_SCAN) {
      const historyRoot = yield* Effect.tryPromise(() => resolveProviderHistoryRoot(provider)).pipe(
        Effect.orElseSucceed(() => null),
      );

      if (!historyRoot) continue;

      const projects = yield* Effect.tryPromise(() => scanProviderHistory(historyRoot)).pipe(
        Effect.orElseSucceed(() => []),
      );

      for (const project of projects) {
        allProjects.push({ provider, ...project });
      }
    }

    return HttpServerResponse.jsonUnsafe({ projects: allProjects });
  }),
);

// ── Import Execute Route ──────────────────────────────────────────────────────

/**
 * Wraps in Layer.unwrap so OrchestrationEngineService is available via
 * closure inside the route handler.
 *
 * NOTE: We intentionally bypass normalizeDispatchCommand here. That helper
 * needs WorkspacePaths / FileSystem / ServerConfig which are not provided in
 * this layer's context. For the import flow the workspaceRoot is a resolved,
 * already-validated path from PROVIDER_HISTORY_CANDIDATES so normalisation
 * is not required.
 */
export const importExecuteRouteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;

    // Build the set of allowed history roots once so we can validate each
    // request's historyPath against it (defence-in-depth on a local server).
    const home = os.homedir();
    const allowedRoots = new Set<string>(
      Object.values(PROVIDER_HISTORY_CANDIDATES).flatMap((fn) => fn(home).filter(Boolean)),
    );

    const isAllowedPath = (p: string) => {
      for (const root of allowedRoots) {
        if (p === root || p.startsWith(root + nodePath.sep)) return true;
      }
      return false;
    };

    return HttpRouter.add(
      "POST",
      "/api/setup/import/execute",
      Effect.gen(function* () {
        // Parse request body — return 400 explicitly instead of silently
        // returning an empty selection list, so callers see why their request failed.
        // Effect.result wraps the outcome in Result<A,E> (not Exit): Success uses
        // `.success`, Failure uses `.failure` (see effect/Result).
        const bodyResult = yield* HttpServerRequest.schemaBodyJson(ImportRequest).pipe(
          Effect.result,
        );
        if (bodyResult._tag === "Failure") {
          return HttpServerResponse.jsonUnsafe(
            { error: "Invalid request body", detail: String(bodyResult.failure) },
            { status: 400 },
          );
        }
        const body = bodyResult.success;

        let importedProjectCount = 0;
        let importedThreadCount = 0;
        const errors: string[] = [];

        for (const selection of body.selections) {
          // Security: only read from paths within known provider history roots
          if (!isAllowedPath(selection.historyPath)) {
            errors.push(`Skipped "${selection.projectName}": path not within an allowed root.`);
            continue;
          }

          const projectId = ProjectId.makeUnsafe(crypto.randomUUID());
          const createdAt = new Date().toISOString();
          const title = TrimmedNonEmptyString.makeUnsafe(
            selection.projectName.slice(0, 200) || "Imported Project",
          );
          const workspaceRoot = TrimmedNonEmptyString.makeUnsafe(selection.projectPath);

          // ── Create project (cast directly — workspaceRoot is already resolved) ──
          const projectCommand: OrchestrationCommand = {
            type: "project.create",
            commandId: CommandId.makeUnsafe(`import:project:${crypto.randomUUID()}`),
            projectId,
            title,
            workspaceRoot,
            createdAt,
          };

          // Only increment the counter when the dispatch actually succeeded.
          // Effect.catch is the Effect v4 name for typed error recovery (replaces v3 catchAll).
          const projectResult = yield* engine.dispatch(projectCommand).pipe(
            Effect.catch((err) => {
              errors.push(`Dispatch project "${selection.projectName}": ${String(err)}`);
              return Effect.succeed({ sequence: -1 });
            }),
          );
          if (projectResult.sequence === -1) {
            continue;
          }
          importedProjectCount++;

          // ── Scan for thread files ─────────────────────────────────────────
          const conversationFiles = yield* Effect.tryPromise(() =>
            nodeFs
              .readdir(selection.historyPath)
              .then((entries) =>
                entries.filter((f) => f.endsWith(".json") || f.endsWith(".md")).slice(0, 50),
              ),
          ).pipe(Effect.orElseSucceed(() => [] as string[]));

          // Apply the same 80-char truncation as rawTitle so the TrimmedNonEmptyString
          // constraint is satisfied even when projectName is very long.
          const filesToImport =
            conversationFiles.length > 0
              ? conversationFiles
              : [`${selection.projectName} (imported)`.slice(0, 80).trim()];

          for (const file of filesToImport) {
            const rawTitle =
              file
                .replace(/\.(json|md)$/, "")
                .replace(/[_-]/g, " ")
                .trim()
                .slice(0, 80) || "Imported conversation";

            const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
            const threadTitle = TrimmedNonEmptyString.makeUnsafe(rawTitle);

            // thread.create passes through normalizeDispatchCommand unchanged
            // so we cast directly here as well, keeping parity.
            const threadCommand: OrchestrationCommand = {
              type: "thread.create",
              commandId: CommandId.makeUnsafe(`import:thread:${crypto.randomUUID()}`),
              threadId,
              projectId,
              title: threadTitle,
              // manifest = smart-router: routes to cheapest capable model automatically
              modelSelection: {
                provider: "manifest",
                model: TrimmedNonEmptyString.makeUnsafe("auto"),
              },
              runtimeMode: DEFAULT_RUNTIME_MODE,
              interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
              branch: null,
              worktreePath: null,
              createdAt,
            };

            // Only increment the counter when the dispatch actually succeeded.
            // (Effect.catch — typed error recovery; see project dispatch above.)
            const threadResult = yield* engine.dispatch(threadCommand).pipe(
              Effect.catch((err) => {
                errors.push(`Dispatch thread "${rawTitle}": ${String(err)}`);
                return Effect.succeed({ sequence: -1 });
              }),
            );
            if (threadResult.sequence !== -1) {
              importedThreadCount++;
            }
          }
        }

        return HttpServerResponse.jsonUnsafe({
          importedProjectCount,
          importedThreadCount,
          errors,
        });
      }),
    );
  }),
);
