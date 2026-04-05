// apps/server/src/preview/Layers/PreviewServerManager.ts
import { spawn, spawnSync } from "node:child_process";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import { Effect, Layer, PubSub, Stream } from "effect";
import { ProjectId } from "@t3tools/contracts";
import type { PreviewApp, PreviewEvent, PreviewSession } from "@t3tools/contracts";

import {
  PreviewServerManager,
  type PreviewServerManagerShape,
} from "../Services/PreviewServerManager";
import {
  buildDetectionCandidates,
  detectPortFromLine,
  type DetectionEntry,
} from "../appDetection";

interface RunningSession {
  session: PreviewSession;
  process: ReturnType<typeof spawn>;
  app: PreviewApp;
}

/** Scan a directory shallowly for known config files. Does not throw. */
async function scanProjectEntries(cwd: string): Promise<DetectionEntry[]> {
  const entries: DetectionEntry[] = [];
  try {
    const rootFiles = fs.readdirSync(cwd);
    const hasBunLock = rootFiles.includes("bun.lock") || rootFiles.includes("bun.lockb");

    // Scan root package.json
    if (rootFiles.includes("package.json")) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(nodePath.join(cwd, "package.json"), "utf-8"),
        ) as { scripts?: Record<string, string> };
        entries.push({
          relativePath: "package.json",
          hasDevScript: Boolean(pkg.scripts?.["dev"] || pkg.scripts?.["start"]),
          hasBunLock,
        });
      } catch {
        /* ignore malformed package.json */
      }
    }

    // Scan manage.py / pyproject.toml / Cargo.toml at root
    for (const f of ["manage.py", "pyproject.toml", "Cargo.toml"]) {
      if (rootFiles.includes(f)) {
        entries.push({ relativePath: f, hasDevScript: false, hasBunLock: false });
      }
    }

    // Scan apps/* sub-directories
    const appsDir = nodePath.join(cwd, "apps");
    if (fs.existsSync(appsDir)) {
      const appDirs = fs
        .readdirSync(appsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const appDir of appDirs) {
        const pkgPath = nodePath.join(appsDir, appDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
              scripts?: Record<string, string>;
            };
            entries.push({
              relativePath: `apps/${appDir}/package.json`,
              hasDevScript: Boolean(pkg.scripts?.["dev"] || pkg.scripts?.["start"]),
              hasBunLock,
            });
          } catch {
            /* ignore */
          }
        }
        // Detect mobile: look for *.xcodeproj
        const subFiles = fs.readdirSync(nodePath.join(appsDir, appDir));
        if (subFiles.some((f) => f.endsWith(".xcodeproj"))) {
          entries.push({
            relativePath: `apps/${appDir}/mobile`,
            hasDevScript: false,
            hasBunLock,
          });
        }
      }
    }
  } catch {
    /* cwd doesn't exist or not readable */
  }
  return entries;
}

/** Try to kill a child process. Ignores errors if the process is already dead. */
function tryKill(child: ReturnType<typeof spawn>): void {
  try {
    child.kill("SIGTERM");
  } catch {
    /* already dead */
  }
}

/** Kill a child process, using platform-appropriate strategy. */
function killProcess(child: ReturnType<typeof spawn>): void {
  if (process.platform === "win32" && child.pid) {
    // On Windows, use taskkill to terminate the process tree
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      tryKill(child);
    }
  } else {
    tryKill(child);
    // Force-kill after 3 seconds if SIGTERM didn't work
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, 3000);
  }
}

const makePreviewServerManager = Effect.fn("makePreviewServerManager")(function* () {
  // Capture service context so we can fire-and-forget Effect operations
  // from plain Node.js callbacks (readline line events, child process events).
  // This mirrors the pattern used in terminal/Layers/Manager.ts.
  const services = yield* Effect.services();
  const runFork = Effect.runForkWith(services);

  // projectId:appId -> RunningSession
  const runningSessions = new Map<string, RunningSession>();
  // projectId -> PreviewApp[] (detected + overrides)
  const projectApps = new Map<string, PreviewApp[]>();
  // projectId -> manual overrides (appId -> partial PreviewApp patch)
  const manualOverrides = new Map<string, Map<string, Partial<PreviewApp>>>();
  // Global broadcast PubSub — all subscribers receive every event and filter by projectId.
  // PubSub (unlike Queue) is a multi-consumer broadcast primitive, so two simultaneous
  // browser tabs each get the full event stream rather than splitting it.
  const eventQueue = yield* PubSub.unbounded<PreviewEvent>();

  // Cleanup all child processes on scope exit (server shutdown)
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      for (const { process: child } of runningSessions.values()) {
        tryKill(child);
      }
      runningSessions.clear();
    }),
  );

  // Fire-and-forget event emission from plain Node.js callbacks.
  // Uses runFork (bound to the Effect service context) to safely enqueue into the Effect Queue.
  const emitEvent = (event: PreviewEvent): void => {
    runFork(PubSub.publish(eventQueue, event).pipe(Effect.asVoid));
  };

  const updateSessionStatus = (key: string, patch: Partial<PreviewSession>): void => {
    const existing = runningSessions.get(key);
    if (!existing) return;
    existing.session = { ...existing.session, ...patch };
    emitEvent({
      type: "status-change",
      appId: existing.session.appId,
      projectId: existing.session.projectId,
      session: existing.session,
    });
  };

  const service: PreviewServerManagerShape = {
    detectApps: (projectId, cwd) =>
      Effect.promise(async () => {
        const entries = await scanProjectEntries(cwd);
        const candidates = buildDetectionCandidates(cwd, entries);
        const overrides = manualOverrides.get(projectId) ?? new Map();
        const pid = ProjectId.makeUnsafe(projectId);
        const apps: PreviewApp[] = candidates.map((c) => {
          const override = overrides.get(c.id);
          return {
            id: c.id,
            projectId: pid,
            label: override?.label ?? c.label,
            command: override?.command ?? c.command,
            cwd: override?.cwd ?? c.cwd,
            type: override?.type ?? c.type,
            isManualOverride: Boolean(override && Object.keys(override).length > 0),
          };
        });
        projectApps.set(projectId, apps);
        return apps;
      }),

    startApp: (projectId, appId) =>
      Effect.gen(function* () {
        const apps = projectApps.get(projectId) ?? [];
        const app = apps.find((a) => a.id === appId);
        if (!app) {
          return yield* Effect.fail(
            new Error(
              `App "${appId}" not found for project "${projectId}". Call detectApps first.`,
            ),
          );
        }

        const key = `${projectId}:${appId}`;

        // Stop any existing process for this key before starting fresh.
        // Extracted to Effect.sync to keep try/catch out of the generator body.
        yield* Effect.sync(() => {
          const existing = runningSessions.get(key);
          if (existing) {
            tryKill(existing.process);
            runningSessions.delete(key);
          }
        });

        const pid = ProjectId.makeUnsafe(projectId);

        // Parse command into executable + args
        const parts = app.command.split(/\s+/).filter(Boolean);
        const cmd = parts[0]!;
        const args = parts.slice(1);

        const child = spawn(cmd, args, {
          cwd: app.cwd,
          env: { ...process.env },
          stdio: ["ignore", "pipe", "pipe"],
          // On Windows, commands like "bun" need shell resolution
          shell: process.platform === "win32",
        });

        // Build the full session object in one shot — PreviewSession properties are readonly
        const session: PreviewSession = {
          appId,
          projectId: pid,
          status: "starting",
          port: null,
          pid: child.pid ?? null,
          startedAt: new Date().toISOString(),
          errorMessage: null,
        };

        runningSessions.set(key, { session, process: child, app });

        // Watch stdout line by line for port detection and log streaming
        const rl = readline.createInterface({ input: child.stdout! });
        rl.on("line", (line) => {
          emitEvent({ type: "log", appId, projectId: pid, line, stream: "stdout" });
          // Only detect port once (when port is still null)
          const current = runningSessions.get(key);
          if (current && current.session.port === null) {
            const detectedPort = detectPortFromLine(line);
            if (detectedPort !== null) {
              updateSessionStatus(key, { status: "running", port: detectedPort });
            }
          }
        });

        // Watch stderr for log streaming
        const rlErr = readline.createInterface({ input: child.stderr! });
        rlErr.on("line", (line) => {
          emitEvent({ type: "log", appId, projectId: pid, line, stream: "stderr" });
        });

        // Handle process spawn error (e.g. command not found)
        child.on("error", (err) => {
          updateSessionStatus(key, { status: "error", errorMessage: err.message });
        });

        // Handle process exit — mark as error unless already set to error
        child.on("close", (code) => {
          const current = runningSessions.get(key);
          if (current && current.session.status !== "error") {
            updateSessionStatus(key, {
              status: "error",
              errorMessage: `Process exited with code ${code ?? "unknown"}`,
            });
          }
        });

        // Emit initial "starting" status event
        emitEvent({ type: "status-change", appId, projectId: pid, session });
        return session;
      }),

    stopApp: (projectId, appId) =>
      Effect.sync(() => {
        const key = `${projectId}:${appId}`;
        const existing = runningSessions.get(key);
        if (!existing) return;

        killProcess(existing.process);
        updateSessionStatus(key, { status: "stopped", port: null });
        runningSessions.delete(key);
      }),

    getSession: (projectId, appId) => {
      const key = `${projectId}:${appId}`;
      return runningSessions.get(key)?.session ?? null;
    },

    getSessions: (projectId) =>
      [...runningSessions.values()]
        .filter((s) => s.session.projectId === projectId)
        .map((s) => s.session),

    updateApp: (projectId, appId, patch) =>
      Effect.gen(function* () {
        const apps = projectApps.get(projectId) ?? [];
        const app = apps.find((a) => a.id === appId);
        if (!app) {
          return yield* Effect.fail(new Error(`App "${appId}" not found.`));
        }
        const overrides =
          manualOverrides.get(projectId) ?? new Map<string, Partial<PreviewApp>>();
        const existingOverride = overrides.get(appId) ?? {};
        overrides.set(appId, { ...existingOverride, ...patch });
        manualOverrides.set(projectId, overrides);
        const updated: PreviewApp = { ...app, ...patch, isManualOverride: true };
        const nextApps = apps.map((a) => (a.id === appId ? updated : a));
        projectApps.set(projectId, nextApps);
        emitEvent({
          type: "apps-updated",
          projectId: ProjectId.makeUnsafe(projectId),
          apps: nextApps,
        });
        return updated;
      }),

    getApps: (projectId) => projectApps.get(projectId) ?? [],

    // Subscribe to the global broadcast PubSub and filter to this project.
    // Each call creates a fresh independent subscription, so multiple callers
    // (e.g., two browser tabs) each receive all events — no event splitting.
    // The stream never ends on its own — callers should manage lifecycle.
    streamEvents: (projectId) =>
      Stream.fromPubSub(eventQueue).pipe(
        Stream.filter((e) => {
          if (e.type === "log") return e.projectId === projectId;
          if (e.type === "status-change") return e.projectId === projectId;
          if (e.type === "apps-updated") return e.projectId === projectId;
          return false;
        }),
      ),
  };

  return service;
});

export const PreviewServerManagerLive = Layer.effect(
  PreviewServerManager,
  makePreviewServerManager(),
);
