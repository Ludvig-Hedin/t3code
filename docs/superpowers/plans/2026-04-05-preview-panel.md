# Preview Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Preview button to the Bird Code chat header that starts project dev servers, proxies their traffic through the T3 server (enabling iOS companion access), and renders them in a tabbed in-app panel that can be detached as a floating window.

**Architecture:** A new `PreviewServerManager` Effect service on the server spawns and monitors dev server child processes, detects their ports from stdout, and streams `PreviewEvent`s to connected clients. An HTTP reverse proxy route (`/preview/:projectId/:appId/*`) forwards traffic from clients (including iOS) to the locally running dev server. The web client renders a `PreviewPanel` side panel with tabs per app and an optional floating/detached mode.

**Tech Stack:** Effect.js (services, layers, streams), Node.js `child_process.spawn`, Node.js `node:http` (proxy), React + Zustand (client state), Tailwind + Shadcn/ui (UI components), Vitest (tests), TypeScript strict throughout.

---

## File Map

### New files

| File                                                       | Purpose                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/contracts/src/preview.ts`                        | Schema types: `PreviewApp`, `PreviewSession`, `PreviewEvent`, `PreviewAppPatch` |
| `apps/server/src/preview/Services/PreviewServerManager.ts` | Effect service interface                                                        |
| `apps/server/src/preview/Layers/PreviewServerManager.ts`   | Service implementation (process spawning, port detection, event streaming)      |
| `apps/server/src/preview/appDetection.ts`                  | Pure functions: scan filesystem, detect package manager, parse port from stdout |
| `apps/server/src/preview/appDetection.test.ts`             | Unit tests for detection logic                                                  |
| `apps/server/src/preview/previewProxyRoute.ts`             | Effect HttpRouter layer: HTTP reverse proxy to upstream dev server              |
| `apps/web/src/previewStore.ts`                             | Zustand store for preview app/session/log state                                 |
| `apps/web/src/components/PreviewPanel.tsx`                 | Tabbed side panel with iframe + log view                                        |
| `apps/web/src/components/PreviewFloatingWindow.tsx`        | Draggable/resizable detached window (React portal)                              |

### Modified files

| File                                          | Changes                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/rpc.ts`               | Add `WS_METHODS` preview entries + 6 Rpc definitions + add to `WsRpcGroup`                                     |
| `apps/server/src/ws.ts`                       | Add `PreviewServerManager` yield + 6 RPC handler entries                                                       |
| `apps/server/src/server.ts`                   | Add `PreviewServerManagerLive` to `RuntimeDependenciesLive`, add `previewProxyRouteLayer` to `makeRoutesLayer` |
| `apps/web/src/wsRpcClient.ts`                 | Add `preview` namespace to `WsRpcClient` interface + implementation                                            |
| `apps/web/src/uiStateStore.ts`                | Add `previewOpen`, `previewDetached`, `previewFloatingBounds` state                                            |
| `apps/web/src/components/chat/ChatHeader.tsx` | Add preview toggle `<Toggle>` button + props                                                                   |
| `apps/web/src/components/ChatView.tsx`        | Wire `previewOpen` state, `onTogglePreview`, render `<PreviewPanel>`                                           |

---

## Task 1: Contracts — preview.ts types

**Files:**

- Create: `packages/contracts/src/preview.ts`

- [ ] **Step 1.1: Create the preview contracts file**

```typescript
// packages/contracts/src/preview.ts
import { Schema } from "effect";
import { ProjectId } from "./orchestration"; // re-use existing ProjectId

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
  type: Schema.Union(Schema.Literal("browser"), Schema.Literal("logs")),
  /** True if the user overrode the auto-detected config */
  isManualOverride: Schema.Boolean,
});
export type PreviewApp = typeof PreviewApp.Type;

export const PreviewAppPatch = Schema.Struct({
  label: Schema.optional(Schema.String),
  command: Schema.optional(Schema.String),
  cwd: Schema.optional(Schema.String),
  type: Schema.optional(Schema.Union(Schema.Literal("browser"), Schema.Literal("logs"))),
});
export type PreviewAppPatch = typeof PreviewAppPatch.Type;

export const PreviewSessionStatus = Schema.Union(
  Schema.Literal("starting"),
  Schema.Literal("running"),
  Schema.Literal("stopped"),
  Schema.Literal("error"),
);
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

export const PreviewEvent = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("log"),
    appId: Schema.String,
    projectId: ProjectId,
    line: Schema.String,
    stream: Schema.Union(Schema.Literal("stdout"), Schema.Literal("stderr")),
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
);
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

export class PreviewError extends Schema.TaggedError<PreviewError>()("PreviewError", {
  message: Schema.String,
}) {}
```

- [ ] **Step 1.2: Export from contracts index**

Find the contracts index file and add the export:

```bash
grep -n "export \*" /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/packages/contracts/src/index.ts | head -5
```

Then add `export * from "./preview";` alongside the other exports.

- [ ] **Step 1.3: Verify no TypeScript errors**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -30
```

Expected: no errors related to preview.ts.

---

## Task 2: Contracts — RPC definitions

**Files:**

- Modify: `packages/contracts/src/rpc.ts`

- [ ] **Step 2.1: Add imports and WS_METHODS entries**

In `packages/contracts/src/rpc.ts`, add these imports after the existing `SkillInfo` import line (~line 85):

```typescript
import {
  PreviewApp,
  PreviewAppPatch,
  PreviewDetectAppsInput,
  PreviewError,
  PreviewEvent,
  PreviewGetSessionsInput,
  PreviewSession,
  PreviewStartInput,
  PreviewStopInput,
  PreviewSubscribeInput,
  PreviewUpdateAppInput,
} from "./preview";
```

- [ ] **Step 2.2: Add preview entries to WS_METHODS**

In the `WS_METHODS` const (after the `subscribeProviderRateLimits` entry, before `} as const`), add:

```typescript
  // Preview / dev-server methods
  previewDetectApps: "preview.detectApps",
  previewStart: "preview.start",
  previewStop: "preview.stop",
  previewGetSessions: "preview.getSessions",
  previewUpdateApp: "preview.updateApp",
  subscribePreviewEvents: "preview.subscribe",
```

- [ ] **Step 2.3: Add the six Rpc definitions**

Add these after the existing `WsSkillsGenerateRpc` definition (~line 390):

```typescript
export const WsPreviewDetectAppsRpc = Rpc.make(WS_METHODS.previewDetectApps, {
  payload: PreviewDetectAppsInput,
  success: Schema.Array(PreviewApp),
  error: PreviewError,
});

export const WsPreviewStartRpc = Rpc.make(WS_METHODS.previewStart, {
  payload: PreviewStartInput,
  success: PreviewSession,
  error: PreviewError,
});

export const WsPreviewStopRpc = Rpc.make(WS_METHODS.previewStop, {
  payload: PreviewStopInput,
  error: PreviewError,
});

export const WsPreviewGetSessionsRpc = Rpc.make(WS_METHODS.previewGetSessions, {
  payload: PreviewGetSessionsInput,
  success: Schema.Array(PreviewSession),
  error: PreviewError,
});

export const WsPreviewUpdateAppRpc = Rpc.make(WS_METHODS.previewUpdateApp, {
  payload: PreviewUpdateAppInput,
  success: PreviewApp,
  error: PreviewError,
});

export const WsSubscribePreviewEventsRpc = Rpc.make(WS_METHODS.subscribePreviewEvents, {
  payload: PreviewSubscribeInput,
  success: PreviewEvent,
  stream: true,
});
```

- [ ] **Step 2.4: Add new Rpcs to WsRpcGroup**

In the `WsRpcGroup = RpcGroup.make(...)` call, append after `WsSkillsGenerateRpc`:

```typescript
  WsPreviewDetectAppsRpc,
  WsPreviewStartRpc,
  WsPreviewStopRpc,
  WsPreviewGetSessionsRpc,
  WsPreviewUpdateAppRpc,
  WsSubscribePreviewEventsRpc,
```

- [ ] **Step 2.5: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -30
```

Expected: no new errors.

---

## Task 3: Server — app detection pure functions + tests (TDD)

**Files:**

- Create: `apps/server/src/preview/appDetection.ts`
- Create: `apps/server/src/preview/appDetection.test.ts`

- [ ] **Step 3.1: Write the failing tests first**

```typescript
// apps/server/src/preview/appDetection.test.ts
import { describe, expect, it } from "vitest";
import {
  detectPortFromLine,
  buildDetectionCandidates,
  detectPackageManager,
  type DetectionCandidate,
} from "./appDetection";

describe("detectPortFromLine", () => {
  it("detects vite local URL", () => {
    expect(detectPortFromLine("  ➜  Local:   http://localhost:5173/")).toBe(5173);
  });
  it("detects next.js output", () => {
    expect(detectPortFromLine("   - Local:        http://localhost:3000")).toBe(3000);
  });
  it("detects plain localhost:PORT", () => {
    expect(detectPortFromLine("Server running at http://localhost:8080")).toBe(8080);
  });
  it("detects 127.0.0.1:PORT", () => {
    expect(detectPortFromLine("Listening on 127.0.0.1:4000")).toBe(4000);
  });
  it("detects 0.0.0.0:PORT patterns", () => {
    expect(detectPortFromLine("Running on http://0.0.0.0:5000")).toBe(5000);
  });
  it("detects 'Listening on port N'", () => {
    expect(detectPortFromLine("Listening on port 3001")).toBe(3001);
  });
  it("returns null for non-port lines", () => {
    expect(detectPortFromLine("Compiling... done in 1.2s")).toBeNull();
  });
  it("ignores port 0", () => {
    expect(detectPortFromLine("listening on 0.0.0.0:0")).toBeNull();
  });
});

describe("buildDetectionCandidates", () => {
  it("returns web candidate for root package.json with dev script", () => {
    const entries = [{ relativePath: "package.json", hasDevScript: true, hasBunLock: true }];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.id).toBe("web");
    expect(candidates[0]!.command).toBe("bun run dev");
    expect(candidates[0]!.type).toBe("browser");
  });

  it("finds apps/web as separate candidate", () => {
    const entries = [
      { relativePath: "apps/web/package.json", hasDevScript: true, hasBunLock: false },
    ];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates.some((c) => c.id === "web" && c.cwd === "/repo/apps/web")).toBe(true);
  });

  it("marks server apps as logs type", () => {
    const entries = [
      { relativePath: "apps/server/package.json", hasDevScript: true, hasBunLock: true },
    ];
    const candidates = buildDetectionCandidates("/repo", entries);
    const server = candidates.find((c) => c.id === "server");
    expect(server?.type).toBe("logs");
  });

  it("detects python manage.py", () => {
    const entries = [{ relativePath: "manage.py", hasDevScript: false, hasBunLock: false }];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates.some((c) => c.command.includes("manage.py"))).toBe(true);
  });
});

describe("detectPackageManager", () => {
  it("returns bun when bun.lock present", () => {
    expect(detectPackageManager(["bun.lock", "package.json"])).toBe("bun");
  });
  it("returns pnpm when pnpm-lock.yaml present", () => {
    expect(detectPackageManager(["pnpm-lock.yaml", "package.json"])).toBe("pnpm");
  });
  it("returns yarn when yarn.lock present", () => {
    expect(detectPackageManager(["yarn.lock", "package.json"])).toBe("yarn");
  });
  it("falls back to npm", () => {
    expect(detectPackageManager(["package.json"])).toBe("npm");
  });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun run test apps/server/src/preview/appDetection.test.ts 2>&1 | tail -20
```

Expected: all tests FAIL with "Cannot find module './appDetection'".

- [ ] **Step 3.3: Implement appDetection.ts**

```typescript
// apps/server/src/preview/appDetection.ts
import path from "node:path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";
export type PreviewType = "browser" | "logs";

export interface DetectionEntry {
  /** Relative path from project root, e.g. "apps/web/package.json" */
  relativePath: string;
  hasDevScript: boolean;
  hasBunLock: boolean;
}

export interface DetectionCandidate {
  id: string;
  label: string;
  command: string;
  cwd: string;
  type: PreviewType;
}

/** Port patterns emitted by common dev servers. Returns port number or null. */
export function detectPortFromLine(line: string): number | null {
  const patterns = [
    // Vite: ➜  Local:   http://localhost:5173/
    /localhost:(\d+)/i,
    // Any 127.0.0.1:PORT
    /127\.0\.0\.1:(\d+)/,
    // 0.0.0.0:PORT (django, flask, etc.)
    /(?:0\.0\.0\.0):(\d+)/,
    // "Listening on port N"
    /listening on port\s+(\d+)/i,
    // "started server on 0.0.0.0:PORT" (next.js)
    /started server on .*?:(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) {
        return port;
      }
    }
  }
  return null;
}

export function detectPackageManager(fileNames: string[]): PackageManager {
  const set = new Set(fileNames);
  if (set.has("bun.lock") || set.has("bun.lockb")) return "bun";
  if (set.has("pnpm-lock.yaml")) return "pnpm";
  if (set.has("yarn.lock")) return "yarn";
  return "npm";
}

/**
 * Rules for matching common monorepo app directories to their metadata.
 * Order matters: more specific paths first.
 */
const KNOWN_SUBDIRS: Array<{
  pathFragment: string;
  id: string;
  label: string;
  type: PreviewType;
}> = [
  { pathFragment: "apps/web", id: "web", label: "Web", type: "browser" },
  { pathFragment: "apps/server", id: "server", label: "Server", type: "logs" },
  { pathFragment: "apps/desktop", id: "desktop", label: "Desktop", type: "logs" },
  { pathFragment: "apps/mobile", id: "mobile", label: "Mobile", type: "logs" },
  { pathFragment: "apps/marketing", id: "marketing", label: "Marketing", type: "browser" },
  { pathFragment: "apps/api", id: "api", label: "API", type: "logs" },
  { pathFragment: "packages/", id: "", label: "", type: "logs" }, // skip packages/
];

function devCommand(pm: PackageManager): string {
  if (pm === "bun") return "bun run dev";
  if (pm === "pnpm") return "pnpm run dev";
  if (pm === "yarn") return "yarn dev";
  return "npm run dev";
}

/** Build detection candidates from a list of scanned filesystem entries. */
export function buildDetectionCandidates(
  projectRoot: string,
  entries: DetectionEntry[],
): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  const seenIds = new Set<string>();

  // Detect package manager from root-level lock files
  const rootFiles = entries.map((e) => path.basename(e.relativePath));
  const pm = detectPackageManager(rootFiles);

  for (const entry of entries) {
    const rel = entry.relativePath.replace(/\\/g, "/");

    // --- manage.py → Django ---
    if (rel === "manage.py") {
      const id = "api";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "API",
          command: "python manage.py runserver",
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    // --- pyproject.toml at root → Python app ---
    if (rel === "pyproject.toml") {
      const id = "api";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "API",
          command: "python -m uvicorn main:app --reload",
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    // --- Cargo.toml at root → Rust ---
    if (rel === "Cargo.toml") {
      const id = "app";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "App",
          command: "cargo run",
          cwd: projectRoot,
          type: "logs",
        });
      }
      continue;
    }

    // --- package.json files ---
    if (!rel.endsWith("package.json") || !entry.hasDevScript) continue;

    const dir = path.dirname(rel); // ".", "apps/web", etc.
    const absCwd = dir === "." ? projectRoot : path.join(projectRoot, dir);

    // Check for known sub-directory patterns
    const known = KNOWN_SUBDIRS.find((k) =>
      k.pathFragment ? rel.startsWith(k.pathFragment) : false,
    );

    // Skip packages/ dirs
    if (known && known.id === "") continue;

    // Root package.json
    if (dir === ".") {
      const id = "web";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "Web",
          command: devCommand(pm),
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    if (known) {
      if (!seenIds.has(known.id)) {
        seenIds.add(known.id);
        // Detect package manager from the sub-app's own files (it may differ)
        const subPm = detectPackageManager(rootFiles); // simplification: use root pm
        candidates.push({
          id: known.id,
          label: known.label,
          command: devCommand(subPm),
          cwd: absCwd,
          type: known.type,
        });
      }
      continue;
    }

    // Unknown package.json with dev script — use directory name as id
    const dirName = path.basename(dir);
    const unknownId = dirName || "app";
    if (!seenIds.has(unknownId)) {
      seenIds.add(unknownId);
      candidates.push({
        id: unknownId,
        label: dirName,
        command: devCommand(pm),
        cwd: absCwd,
        type: "browser",
      });
    }
  }

  return candidates;
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun run test apps/server/src/preview/appDetection.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 3.5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && git add packages/contracts/src/preview.ts packages/contracts/src/index.ts packages/contracts/src/rpc.ts apps/server/src/preview/appDetection.ts apps/server/src/preview/appDetection.test.ts && git commit -m "$(cat <<'EOF'
feat: add preview contracts, RPC definitions, and app detection logic

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Server — PreviewServerManager service + layer

**Files:**

- Create: `apps/server/src/preview/Services/PreviewServerManager.ts`
- Create: `apps/server/src/preview/Layers/PreviewServerManager.ts`

- [ ] **Step 4.1: Create the service interface**

```typescript
// apps/server/src/preview/Services/PreviewServerManager.ts
import { Effect, ServiceMap, Stream } from "effect";
import type { PreviewApp, PreviewEvent, PreviewSession } from "@t3tools/contracts";

export interface PreviewServerManagerShape {
  /** Scan project cwd and return detected app candidates. */
  readonly detectApps: (projectId: string, cwd: string) => Effect.Effect<PreviewApp[], never>;

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

  /** Stream PreviewEvents for a project. Never ends unless the process itself dies. */
  readonly streamEvents: (projectId: string) => Stream.Stream<PreviewEvent, never>;
}

export class PreviewServerManager extends ServiceMap.Service<
  PreviewServerManager,
  PreviewServerManagerShape
>()("t3/PreviewServerManager") {}
```

- [ ] **Step 4.2: Create the implementation layer**

```typescript
// apps/server/src/preview/Layers/PreviewServerManager.ts
import { spawn, type ChildProcess } from "node:child_process";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";

import { Effect, Layer, Stream, Queue, Ref } from "effect";
import type { PreviewApp, PreviewEvent, PreviewSession } from "@t3tools/contracts";
import { Schema } from "effect";

import {
  PreviewServerManager,
  type PreviewServerManagerShape,
} from "../Services/PreviewServerManager";
import { buildDetectionCandidates, detectPortFromLine, type DetectionEntry } from "../appDetection";

interface RunningSession {
  session: PreviewSession;
  process: ChildProcess;
  app: PreviewApp;
}

/** Scan a directory shallowly for known config files. Does not throw. */
async function scanProjectEntries(cwd: string): Promise<DetectionEntry[]> {
  const entries: DetectionEntry[] = [];
  try {
    const rootFiles = fs.readdirSync(cwd);
    const hasBunLock = rootFiles.includes("bun.lock") || rootFiles.includes("bun.lockb");

    // Scan root package.json
    const rootPkgPath = path.join(cwd, "package.json");
    if (rootFiles.includes("package.json")) {
      try {
        const pkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8")) as {
          scripts?: Record<string, string>;
        };
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
    const appsDir = path.join(cwd, "apps");
    if (fs.existsSync(appsDir)) {
      const appDirs = fs
        .readdirSync(appsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      for (const appDir of appDirs) {
        const pkgPath = path.join(appsDir, appDir, "package.json");
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
        // Detect mobile: look for *.xcodeproj or package.json with expo
        const subFiles = fs.readdirSync(path.join(appsDir, appDir));
        if (subFiles.some((f) => f.endsWith(".xcodeproj"))) {
          entries.push({ relativePath: `apps/${appDir}/mobile`, hasDevScript: false, hasBunLock });
        }
      }
    }
  } catch {
    /* cwd doesn't exist or not readable */
  }
  return entries;
}

const MAX_LOG_LINES = 1000;

export const PreviewServerManagerLive = Layer.scoped(
  PreviewServerManager,
  Effect.gen(function* () {
    // projectId:appId -> RunningSession
    const runningSessions = new Map<string, RunningSession>();
    // projectId -> PreviewApp[] (detected + overrides)
    const projectApps = new Map<string, PreviewApp[]>();
    // projectId -> manual overrides (appId -> partial PreviewApp)
    const manualOverrides = new Map<string, Map<string, Partial<PreviewApp>>>();
    // Global event queue — all subscribers share it via Stream.fromQueue
    const eventQueue = yield* Queue.unbounded<PreviewEvent>();

    // Cleanup all processes when the scope ends (server shutdown)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const { process } of runningSessions.values()) {
          try {
            process.kill("SIGTERM");
          } catch {
            /* already dead */
          }
        }
        runningSessions.clear();
      }),
    );

    const emitEvent = (event: PreviewEvent) =>
      Effect.runSync(Queue.offer(eventQueue, event).pipe(Effect.asVoid));

    const updateSession = (key: string, patch: Partial<PreviewSession>) => {
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
          const apps: PreviewApp[] = candidates.map((c) => {
            const override = overrides.get(c.id);
            return {
              id: c.id,
              projectId: projectId as any,
              label: override?.label ?? c.label,
              command: override?.command ?? c.command,
              cwd: override?.cwd ?? c.cwd,
              type: override?.type ?? c.type,
              isManualOverride: Boolean(override),
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
              new Error(`App "${appId}" not found. Call detectApps first.`),
            );
          }

          const key = `${projectId}:${appId}`;
          // Kill existing process if running
          const existing = runningSessions.get(key);
          if (existing) {
            try {
              existing.process.kill("SIGTERM");
            } catch {
              /* ignore */
            }
            runningSessions.delete(key);
          }

          const session: PreviewSession = {
            appId,
            projectId: projectId as any,
            status: "starting",
            port: null,
            pid: null,
            startedAt: new Date().toISOString(),
            errorMessage: null,
          };

          // Parse command into parts
          const parts = app.command.split(/\s+/);
          const cmd = parts[0]!;
          const args = parts.slice(1);

          const child = spawn(cmd, args, {
            cwd: app.cwd,
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
            shell: process.platform === "win32",
          });

          session.pid = child.pid ?? null;
          runningSessions.set(key, { session, process: child, app });

          // Watch stdout for port detection and log streaming
          const rl = readline.createInterface({ input: child.stdout! });
          rl.on("line", (line) => {
            emitEvent({ type: "log", appId, projectId: projectId as any, line, stream: "stdout" });
            if (runningSessions.get(key)?.session.port === null) {
              const port = detectPortFromLine(line);
              if (port !== null) {
                updateSession(key, { status: "running", port });
              }
            }
          });

          // Watch stderr
          const rlErr = readline.createInterface({ input: child.stderr! });
          rlErr.on("line", (line) => {
            emitEvent({ type: "log", appId, projectId: projectId as any, line, stream: "stderr" });
          });

          child.on("error", (err) => {
            updateSession(key, { status: "error", errorMessage: err.message });
          });

          child.on("close", (code) => {
            const current = runningSessions.get(key);
            if (current && current.session.status !== "error") {
              updateSession(key, {
                status: "error",
                errorMessage: `Process exited with code ${code ?? "unknown"}`,
              });
            }
          });

          emitEvent({ type: "status-change", appId, projectId: projectId as any, session });
          return session;
        }),

      stopApp: (projectId, appId) =>
        Effect.gen(function* () {
          const key = `${projectId}:${appId}`;
          const existing = runningSessions.get(key);
          if (!existing) return;

          const child = existing.process;
          if (process.platform === "win32" && child.pid) {
            const { spawnSync } = yield* Effect.promise(() =>
              Promise.resolve(require("node:child_process") as typeof import("node:child_process")),
            );
            spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
          } else {
            child.kill("SIGTERM");
            // Force-kill after 3s
            setTimeout(() => {
              try {
                child.kill("SIGKILL");
              } catch {
                /* already dead */
              }
            }, 3000);
          }

          updateSession(key, { status: "stopped", port: null });
          runningSessions.delete(key);
        }),

      getSession: (projectId, appId) => {
        const key = `${projectId}:${appId}`;
        return runningSessions.get(key)?.session ?? null;
      },

      getSessions: (projectId) => {
        return [...runningSessions.values()]
          .filter((s) => s.session.projectId === projectId)
          .map((s) => s.session);
      },

      updateApp: (projectId, appId, patch) =>
        Effect.gen(function* () {
          const apps = projectApps.get(projectId) ?? [];
          const app = apps.find((a) => a.id === appId);
          if (!app) {
            return yield* Effect.fail(new Error(`App "${appId}" not found.`));
          }
          const overrides = manualOverrides.get(projectId) ?? new Map();
          const existing = overrides.get(appId) ?? {};
          overrides.set(appId, { ...existing, ...patch });
          manualOverrides.set(projectId, overrides);
          const updated: PreviewApp = {
            ...app,
            ...patch,
            isManualOverride: true,
          };
          const nextApps = apps.map((a) => (a.id === appId ? updated : a));
          projectApps.set(projectId, nextApps);
          emitEvent({ type: "apps-updated", projectId: projectId as any, apps: nextApps });
          return updated;
        }),

      getApps: (projectId) => projectApps.get(projectId) ?? [],

      streamEvents: (projectId) =>
        Stream.fromQueue(eventQueue).pipe(
          Stream.filter((e) => {
            if (e.type === "log") return e.projectId === projectId;
            if (e.type === "status-change") return e.projectId === projectId;
            if (e.type === "apps-updated") return e.projectId === projectId;
            return false;
          }),
        ),
    };

    return service;
  }),
);
```

- [ ] **Step 4.3: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i preview | head -20
```

Expected: no preview-related type errors.

- [ ] **Step 4.4: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && git add apps/server/src/preview/ && git commit -m "$(cat <<'EOF'
feat: add PreviewServerManager service and implementation layer

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Server — HTTP proxy route

**Files:**

- Create: `apps/server/src/preview/previewProxyRoute.ts`

- [ ] **Step 5.1: Create the proxy route layer**

```typescript
// apps/server/src/preview/previewProxyRoute.ts
/**
 * HTTP reverse proxy for preview dev servers.
 *
 * Routes /preview/:projectId/:appId/* → http://127.0.0.1:{port}/*
 * This allows iOS and desktop clients to access locally running dev servers
 * through the Bird Code server's existing connection.
 */
import * as nodeHttp from "node:http";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { PreviewServerManager } from "./Services/PreviewServerManager";

/** Extract projectId, appId, and the remaining path from a /preview/:p/:a/* URL */
function parsePreviewPath(pathname: string): {
  projectId: string;
  appId: string;
  rest: string;
} | null {
  // Expected: /preview/<projectId>/<appId>[/rest]
  const match = /^\/preview\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]!),
    appId: decodeURIComponent(match[2]!),
    rest: match[3] ?? "/",
  };
}

const previewProxyHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const urlOpt = HttpServerRequest.toURL(request);

  if (!urlOpt._tag || urlOpt._tag === "None") {
    return HttpServerResponse.text("Bad Request", { status: 400 });
  }

  const url = (urlOpt as { _tag: "Some"; value: URL }).value;
  const parsed = parsePreviewPath(url.pathname);
  if (!parsed) {
    return HttpServerResponse.text("Invalid preview path", { status: 400 });
  }

  const { projectId, appId, rest } = parsed;
  const previewManager = yield* PreviewServerManager;
  const session = previewManager.getSession(projectId, appId);

  if (!session || session.port === null) {
    return HttpServerResponse.json({ error: "App not running", appId, projectId }, { status: 502 });
  }

  const port = session.port;
  const upstreamPath = rest + (url.search ?? "");

  // Forward the request to the upstream dev server using Node's http module
  const result = yield* Effect.promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>(
    () =>
      new Promise((resolve, reject) => {
        const proxyReq = nodeHttp.request(
          {
            hostname: "127.0.0.1",
            port,
            path: upstreamPath,
            method: request.method,
            headers: {
              ...Object.fromEntries(request.headers),
              host: `127.0.0.1:${port}`,
            },
          },
          (proxyRes) => {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              const headers: Record<string, string> = {};
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                if (v !== undefined) {
                  headers[k] = Array.isArray(v) ? v.join(", ") : v;
                }
              }
              // Rewrite Location headers that point to the upstream
              if (headers["location"]) {
                headers["location"] = headers["location"].replace(
                  new RegExp(`http://(?:127\\.0\\.0\\.1|localhost):${port}`),
                  `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(appId)}`,
                );
              }
              resolve({
                status: proxyRes.statusCode ?? 200,
                headers,
                body: Buffer.concat(chunks),
              });
            });
            proxyRes.on("error", reject);
          },
        );
        proxyReq.on("error", reject);
        proxyReq.end();
      }),
  ).pipe(
    Effect.catchAll(() =>
      Effect.succeed({
        status: 502,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ error: "Upstream connection failed" })),
      }),
    ),
  );

  return HttpServerResponse.uint8Array(new Uint8Array(result.body), {
    status: result.status,
    headers: result.headers,
  });
});

export const previewProxyRouteLayer = HttpRouter.add(
  "GET",
  "/preview/:projectId/:appId/*",
  previewProxyHandler,
).pipe(
  HttpRouter.add("POST", "/preview/:projectId/:appId/*", previewProxyHandler),
  HttpRouter.add("PUT", "/preview/:projectId/:appId/*", previewProxyHandler),
);
```

- [ ] **Step 5.2: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i preview | head -20
```

Expected: no errors.

---

## Task 6: Server — ws.ts RPC handlers

**Files:**

- Modify: `apps/server/src/ws.ts`

- [ ] **Step 6.1: Add PreviewServerManager import**

In `apps/server/src/ws.ts`, add after the last existing import (e.g. after `Mem0Service`):

```typescript
import { PreviewServerManager } from "./preview/Services/PreviewServerManager";
```

Also add the preview type imports at the top of the file with the contracts imports:

```typescript
import {
  // ... existing imports ...
  WS_METHODS,
  WsRpcGroup,
  // add:
  PreviewError,
} from "@t3tools/contracts";
```

- [ ] **Step 6.2: Yield PreviewServerManager in WsRpcLayer**

In `WsRpcLayer` (inside `WsRpcGroup.toLayer(Effect.gen(function* () { ... }))`), after the `const mem0 = yield* Mem0Service;` line, add:

```typescript
const previewManager = yield * PreviewServerManager;
```

- [ ] **Step 6.3: Add preview handler entries to WsRpcGroup.of({ ... })**

Inside the `return WsRpcGroup.of({ ... })` block, after the skills handlers (before the closing `}`), add:

```typescript
      // --- Preview ---
      [WS_METHODS.previewDetectApps]: (input) =>
        observeRpcEffect(
          WS_METHODS.previewDetectApps,
          Effect.gen(function* () {
            const projects = yield* import("./orchestration/Services/OrchestrationEngine").then(
              (m) => m.OrchestrationEngineService,
            );
            // Resolve cwd from project list
            const { projectId } = input;
            const rm = yield* (yield* Effect.service(import("./orchestration/Services/OrchestrationEngine").then(m => m.OrchestrationEngineService))).getReadModel();
            const project = rm.projects?.find?.((p: any) => p.id === projectId);
            const cwd = project?.cwd ?? "";
            return yield* previewManager.detectApps(projectId, cwd);
          }).pipe(
            Effect.mapError((e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) })),
          ),
          { "rpc.aggregate": "preview" },
        ),
      [WS_METHODS.previewStart]: ({ projectId, appId }) =>
        observeRpcEffect(
          WS_METHODS.previewStart,
          previewManager.startApp(projectId, appId).pipe(
            Effect.mapError((e) => new PreviewError({ message: e.message })),
          ),
          { "rpc.aggregate": "preview" },
        ),
      [WS_METHODS.previewStop]: ({ projectId, appId }) =>
        observeRpcEffect(
          WS_METHODS.previewStop,
          previewManager.stopApp(projectId, appId).pipe(
            Effect.mapError((e) => new PreviewError({ message: e.message })),
          ),
          { "rpc.aggregate": "preview" },
        ),
      [WS_METHODS.previewGetSessions]: ({ projectId }) =>
        observeRpcEffect(
          WS_METHODS.previewGetSessions,
          Effect.succeed(previewManager.getSessions(projectId)),
          { "rpc.aggregate": "preview" },
        ),
      [WS_METHODS.previewUpdateApp]: ({ projectId, appId, patch }) =>
        observeRpcEffect(
          WS_METHODS.previewUpdateApp,
          previewManager.updateApp(projectId, appId, patch).pipe(
            Effect.mapError((e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) })),
          ),
          { "rpc.aggregate": "preview" },
        ),
      [WS_METHODS.subscribePreviewEvents]: ({ projectId }) =>
        observeRpcStream(
          WS_METHODS.subscribePreviewEvents,
          previewManager.streamEvents(projectId),
          { "rpc.aggregate": "preview" },
        ),
```

**Note:** The `previewDetectApps` handler needs the project's cwd. The orchestration read model holds this. Look at how other handlers access `projectionSnapshotQuery` for the read model — use the same pattern. Replace the dynamic import approach in the step above with the already-yielded `projectionSnapshotQuery`:

```typescript
      [WS_METHODS.previewDetectApps]: ({ projectId }) =>
        observeRpcEffect(
          WS_METHODS.previewDetectApps,
          Effect.gen(function* () {
            const snapshot = yield* projectionSnapshotQuery.getSnapshot();
            const project = snapshot.projects?.find?.((p: any) => p.id === projectId);
            const cwd = project?.cwd ?? "";
            return yield* previewManager.detectApps(projectId, cwd);
          }).pipe(
            Effect.mapError((e) => new PreviewError({ message: e instanceof Error ? e.message : String(e) })),
          ),
          { "rpc.aggregate": "preview" },
        ),
```

- [ ] **Step 6.4: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i preview | head -20
```

Fix any type errors before proceeding.

---

## Task 7: Server — server.ts wiring

**Files:**

- Modify: `apps/server/src/server.ts`

- [ ] **Step 7.1: Import new layers**

In `apps/server/src/server.ts`, add after the existing imports:

```typescript
import { PreviewServerManagerLive } from "./preview/Layers/PreviewServerManager";
import { previewProxyRouteLayer } from "./preview/previewProxyRoute";
```

- [ ] **Step 7.2: Add PreviewServerManagerLive to RuntimeDependenciesLive**

In `RuntimeDependenciesLive`, after `Layer.provideMerge(Mem0ServiceLive)`:

```typescript
  Layer.provideMerge(PreviewServerManagerLive),
```

- [ ] **Step 7.3: Add previewProxyRouteLayer to makeRoutesLayer**

In `makeRoutesLayer = Layer.mergeAll(...)`, add `previewProxyRouteLayer`:

```typescript
export const makeRoutesLayer = Layer.mergeAll(
  attachmentsRouteLayer,
  mobileCompanionRouteLayer,
  previewProxyRouteLayer, // ← add this
  projectFaviconRouteLayer,
  staticAndDevRouteLayer,
  websocketRpcRouteLayer,
);
```

- [ ] **Step 7.4: Typecheck + lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -30 && bun lint 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7.5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && git add apps/server/src/ && git commit -m "$(cat <<'EOF'
feat: wire PreviewServerManager and HTTP proxy into server

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Web — wsRpcClient.ts preview namespace

**Files:**

- Modify: `apps/web/src/wsRpcClient.ts`

- [ ] **Step 8.1: Add preview type imports**

In `wsRpcClient.ts`, add to the contracts import:

```typescript
import {
  // ... existing
  WS_METHODS,
  // add:
  type PreviewApp,
  type PreviewSession,
  type PreviewEvent,
} from "@t3tools/contracts";
```

- [ ] **Step 8.2: Add preview namespace to WsRpcClient interface**

After the `skills` namespace in the interface, add:

```typescript
  readonly preview: {
    readonly detectApps: (input: { projectId: string }) => Promise<PreviewApp[]>;
    readonly start: (input: { projectId: string; appId: string }) => Promise<PreviewSession>;
    readonly stop: (input: { projectId: string; appId: string }) => Promise<void>;
    readonly getSessions: (input: { projectId: string }) => Promise<PreviewSession[]>;
    readonly updateApp: (input: {
      projectId: string;
      appId: string;
      patch: { label?: string; command?: string; cwd?: string; type?: "browser" | "logs" };
    }) => Promise<PreviewApp>;
    readonly onEvent: (
      projectId: string,
      listener: (event: PreviewEvent) => void,
    ) => () => void;
  };
```

- [ ] **Step 8.3: Add preview namespace to createWsRpcClient implementation**

In the `createWsRpcClient` return value, after the `skills` block:

```typescript
    preview: {
      detectApps: (input) =>
        transport.request((client) => client[WS_METHODS.previewDetectApps](input)),
      start: (input) =>
        transport.request((client) => client[WS_METHODS.previewStart](input)),
      stop: (input) =>
        transport.request((client) => client[WS_METHODS.previewStop](input)),
      getSessions: (input) =>
        transport.request((client) => client[WS_METHODS.previewGetSessions](input)),
      updateApp: (input) =>
        transport.request((client) => client[WS_METHODS.previewUpdateApp](input)),
      onEvent: (projectId, listener) =>
        transport.subscribe(
          (client) => client[WS_METHODS.subscribePreviewEvents]({ projectId }),
          listener,
        ),
    },
```

- [ ] **Step 8.4: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i preview | head -20
```

---

## Task 9: Web — previewStore.ts

**Files:**

- Create: `apps/web/src/previewStore.ts`

- [ ] **Step 9.1: Create the preview Zustand store**

```typescript
// apps/web/src/previewStore.ts
/**
 * Client-side state for the preview panel.
 * Sessions and apps are populated by subscribePreviewEvents and RPC calls.
 * Logs are capped at MAX_LOG_LINES per app.
 */
import { type PreviewApp, type PreviewEvent, type PreviewSession } from "@t3tools/contracts";
import { create } from "zustand";

const MAX_LOG_LINES = 1000;

type SessionKey = string; // `${projectId}:${appId}`

function sessionKey(projectId: string, appId: string): SessionKey {
  return `${projectId}:${appId}`;
}

interface PreviewState {
  /** Detected apps per project */
  apps: Record<string, PreviewApp[]>;
  /** Live session state per app */
  sessions: Record<SessionKey, PreviewSession>;
  /** Log lines per app, capped at MAX_LOG_LINES */
  logs: Record<SessionKey, string[]>;
  /** Which tab is active per project */
  activeAppId: Record<string, string>;
}

interface PreviewStore extends PreviewState {
  setApps: (projectId: string, apps: PreviewApp[]) => void;
  applyEvent: (event: PreviewEvent) => void;
  setActiveApp: (projectId: string, appId: string) => void;
  clearProject: (projectId: string) => void;
}

export const usePreviewStore = create<PreviewStore>((set) => ({
  apps: {},
  sessions: {},
  logs: {},
  activeAppId: {},

  setApps: (projectId, apps) =>
    set((state) => ({
      apps: { ...state.apps, [projectId]: apps },
      // Auto-select first app if nothing selected yet
      activeAppId: state.activeAppId[projectId]
        ? state.activeAppId
        : { ...state.activeAppId, [projectId]: apps[0]?.id ?? "" },
    })),

  applyEvent: (event) =>
    set((state) => {
      if (event.type === "apps-updated") {
        return {
          apps: { ...state.apps, [event.projectId]: [...event.apps] },
          activeAppId: state.activeAppId[event.projectId]
            ? state.activeAppId
            : { ...state.activeAppId, [event.projectId]: event.apps[0]?.id ?? "" },
        };
      }

      if (event.type === "status-change") {
        const key = sessionKey(event.projectId, event.appId);
        return {
          sessions: { ...state.sessions, [key]: event.session },
        };
      }

      if (event.type === "log") {
        const key = sessionKey(event.projectId, event.appId);
        const existing = state.logs[key] ?? [];
        const next =
          existing.length >= MAX_LOG_LINES
            ? [...existing.slice(existing.length - MAX_LOG_LINES + 1), event.line]
            : [...existing, event.line];
        return { logs: { ...state.logs, [key]: next } };
      }

      return state;
    }),

  setActiveApp: (projectId, appId) =>
    set((state) => ({
      activeAppId: { ...state.activeAppId, [projectId]: appId },
    })),

  clearProject: (projectId) =>
    set((state) => {
      const nextApps = { ...state.apps };
      delete nextApps[projectId];
      const nextSessions = { ...state.sessions };
      const nextLogs = { ...state.logs };
      const nextActive = { ...state.activeAppId };
      delete nextActive[projectId];
      for (const key of Object.keys(nextSessions)) {
        if (key.startsWith(`${projectId}:`)) {
          delete nextSessions[key];
          delete nextLogs[key];
        }
      }
      return { apps: nextApps, sessions: nextSessions, logs: nextLogs, activeAppId: nextActive };
    }),
}));

/** Convenience selectors */
export const selectApps = (projectId: string) => (state: PreviewStore) =>
  state.apps[projectId] ?? [];

export const selectSession = (projectId: string, appId: string) => (state: PreviewStore) =>
  state.sessions[sessionKey(projectId, appId)] ?? null;

export const selectLogs = (projectId: string, appId: string) => (state: PreviewStore) =>
  state.logs[sessionKey(projectId, appId)] ?? [];

export const selectActiveAppId = (projectId: string) => (state: PreviewStore) =>
  state.activeAppId[projectId] ?? null;

export const selectHasRunningApp = (projectId: string) => (state: PreviewStore) => {
  const apps = state.apps[projectId] ?? [];
  return apps.some((app) => {
    const session = state.sessions[sessionKey(projectId, app.id)];
    return session?.status === "running" || session?.status === "starting";
  });
};
```

- [ ] **Step 9.2: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i preview | head -20
```

---

## Task 10: Web — uiStateStore.ts preview state

**Files:**

- Modify: `apps/web/src/uiStateStore.ts`

- [ ] **Step 10.1: Add preview state interface fields**

In `uiStateStore.ts`, update the `UiState` interface. After `UiThreadState`, add:

```typescript
export interface UiPreviewState {
  previewOpen: boolean;
  previewDetached: boolean;
  previewFloatingBounds: { x: number; y: number; w: number; h: number } | null;
}
```

And update `UiState`:

```typescript
export interface UiState extends UiProjectState, UiThreadState, UiPreviewState {}
```

- [ ] **Step 10.2: Update initialState**

In `initialState`, add:

```typescript
  previewOpen: false,
  previewDetached: false,
  previewFloatingBounds: null,
```

- [ ] **Step 10.3: Add actions to UiStateStore interface and implementation**

In `UiStateStore`:

```typescript
  setPreviewOpen: (open: boolean) => void;
  setPreviewDetached: (detached: boolean) => void;
  setPreviewFloatingBounds: (bounds: { x: number; y: number; w: number; h: number } | null) => void;
```

In `useUiStateStore` create call:

```typescript
  setPreviewOpen: (open) => set((state) => ({ ...state, previewOpen: open })),
  setPreviewDetached: (detached) => set((state) => ({ ...state, previewDetached: detached })),
  setPreviewFloatingBounds: (bounds) => set((state) => ({ ...state, previewFloatingBounds: bounds })),
```

- [ ] **Step 10.4: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i "uiStateStore\|UiState" | head -10
```

---

## Task 11: Web — ChatHeader.tsx preview toggle

**Files:**

- Modify: `apps/web/src/components/chat/ChatHeader.tsx`

- [ ] **Step 11.1: Add preview props and toggle button**

In `ChatHeader.tsx`, update the imports — add `MonitorPlayIcon` to the lucide-react import:

```typescript
import { DiffIcon, MonitorPlayIcon, TerminalSquareIcon } from "lucide-react";
```

Update `ChatHeaderProps` — add after `diffOpen`:

```typescript
  previewAvailable: boolean;
  previewOpen: boolean;
  hasRunningPreviewApp: boolean;
  onTogglePreview: () => void;
```

In the component destructuring, add:

```typescript
  previewAvailable,
  previewOpen,
  hasRunningPreviewApp,
  onTogglePreview,
```

Add the Preview toggle button just before the Terminal toggle button (inside the `shrink-0 items-center` div):

```tsx
<Tooltip>
  <TooltipTrigger
    render={
      <Toggle
        className="relative shrink-0"
        pressed={previewOpen}
        onPressedChange={onTogglePreview}
        aria-label="Toggle preview panel"
        variant="outline"
        size="xs"
        disabled={!previewAvailable}
      >
        <MonitorPlayIcon className="size-3" />
        {hasRunningPreviewApp && (
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-green-500" />
        )}
      </Toggle>
    }
  />
  <TooltipPopup side="bottom">
    {!previewAvailable
      ? "Preview is unavailable until this thread has an active project."
      : previewOpen
        ? "Close preview panel"
        : "Open preview panel"}
  </TooltipPopup>
</Tooltip>
```

- [ ] **Step 11.2: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i "ChatHeader" | head -10
```

---

## Task 12: Web — PreviewPanel.tsx

**Files:**

- Create: `apps/web/src/components/PreviewPanel.tsx`

- [ ] **Step 12.1: Create PreviewPanel component**

```tsx
// apps/web/src/components/PreviewPanel.tsx
/**
 * Preview panel — tabbed side panel for in-app dev server preview.
 * Renders an iframe for browser apps, log output for non-browser apps.
 * Supports "detach" to float as a draggable overlay.
 */
import { useCallback, useEffect, useRef } from "react";
import {
  ExternalLinkIcon,
  MaximizeIcon,
  RefreshCwIcon,
  SquareIcon,
  PlayIcon,
  Loader2Icon,
} from "lucide-react";
import type { PreviewApp, PreviewSession } from "@t3tools/contracts";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { cn } from "~/lib/utils";
import {
  usePreviewStore,
  selectApps,
  selectSession,
  selectLogs,
  selectActiveAppId,
} from "../previewStore";
import { getWsRpcClient } from "../wsRpcClient";

interface PreviewPanelProps {
  projectId: string;
  /** Called when the user clicks the detach (maximize) button */
  onDetach: () => void;
}

function StatusDot({ status }: { status: PreviewSession["status"] | null }) {
  if (!status || status === "stopped") {
    return <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />;
  }
  if (status === "starting") {
    return <Loader2Icon className="size-3 animate-spin text-amber-500" />;
  }
  if (status === "running") {
    return <span className="inline-block size-1.5 rounded-full bg-green-500" />;
  }
  // error
  return <span className="inline-block size-1.5 rounded-full bg-destructive" />;
}

function LogView({ lines }: { lines: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="h-full overflow-y-auto bg-background p-3 font-mono text-xs text-foreground">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">No output yet. Start the app to see logs.</p>
      ) : (
        lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="whitespace-pre-wrap break-all leading-5">
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

export function PreviewPanel({ projectId, onDetach }: PreviewPanelProps) {
  const apps = usePreviewStore(selectApps(projectId));
  const activeAppId = usePreviewStore(selectActiveAppId(projectId));
  const setActiveApp = usePreviewStore((s) => s.setActiveApp);
  const applyEvent = usePreviewStore((s) => s.applyEvent);
  const setApps = usePreviewStore((s) => s.setApps);

  const activeApp = apps.find((a) => a.id === activeAppId) ?? apps[0] ?? null;
  const session = usePreviewStore(selectSession(projectId, activeApp?.id ?? ""));
  const logs = usePreviewStore(selectLogs(projectId, activeApp?.id ?? ""));

  // Subscribe to preview events and detect apps on mount
  useEffect(() => {
    const api = getWsRpcClient();
    // Detect apps for this project
    void api.preview.detectApps({ projectId }).then((detected) => {
      setApps(projectId, detected);
    });
    // Subscribe to live events
    const unsubscribe = api.preview.onEvent(projectId, (event) => {
      applyEvent(event);
    });
    return unsubscribe;
  }, [projectId, applyEvent, setApps]);

  const handleStart = useCallback(
    async (app: PreviewApp) => {
      const api = getWsRpcClient();
      await api.preview.start({ projectId, appId: app.id });
    },
    [projectId],
  );

  const handleStop = useCallback(
    async (app: PreviewApp) => {
      const api = getWsRpcClient();
      await api.preview.stop({ projectId, appId: app.id });
    },
    [projectId],
  );

  const previewUrl = activeApp
    ? `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(activeApp.id)}/`
    : null;

  if (apps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <MonitorPlayIcon className="size-8 opacity-40" />
        <p className="text-sm">No previewable apps detected in this project.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-0 overflow-x-auto border-b border-border bg-card px-2 py-1">
        {apps.map((app) => {
          const appSession = usePreviewStore.getState().sessions[`${projectId}:${app.id}`] ?? null;
          const isActive = app.id === activeApp?.id;
          return (
            <button
              key={app.id}
              type="button"
              onClick={() => setActiveApp(projectId, app.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <StatusDot status={appSession?.status ?? null} />
              <span>{app.label}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" className="size-6" onClick={onDetach}>
                  <MaximizeIcon className="size-3" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Detach preview</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {/* Toolbar for active app */}
      {activeApp && (
        <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
          {session?.status === "running" || session?.status === "starting" ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => void handleStop(activeApp)}
                    disabled={session.status === "starting"}
                  >
                    <SquareIcon className="size-3 fill-current" />
                  </Button>
                }
              />
              <TooltipPopup side="bottom">Stop {activeApp.label}</TooltipPopup>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => void handleStart(activeApp)}
                  >
                    <PlayIcon className="size-3 fill-current" />
                  </Button>
                }
              />
              <TooltipPopup side="bottom">Start {activeApp.label}</TooltipPopup>
            </Tooltip>
          )}
          {activeApp.type === "browser" && previewUrl && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => {
                        const iframe = document.querySelector<HTMLIFrameElement>(".preview-iframe");
                        if (iframe) iframe.src = iframe.src;
                      }}
                    >
                      <RefreshCwIcon className="size-3" />
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">Refresh</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() => window.open(previewUrl, "_blank")}
                    >
                      <ExternalLinkIcon className="size-3" />
                    </Button>
                  }
                />
                <TooltipPopup side="bottom">Open in new tab</TooltipPopup>
              </Tooltip>
            </>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {session?.status === "running" && session.port ? `localhost:${session.port}` : ""}
          </span>
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 overflow-hidden">
        {!activeApp ? null : activeApp.type === "browser" ? (
          session?.status === "running" && previewUrl ? (
            <iframe
              className="preview-iframe size-full border-none"
              src={previewUrl}
              title={`Preview: ${activeApp.label}`}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          ) : session?.status === "starting" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2Icon className="size-8 animate-spin" />
              <p className="text-sm">Starting {activeApp.label}…</p>
            </div>
          ) : session?.status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-destructive">
              <p className="text-sm font-medium">Failed to start {activeApp.label}</p>
              {session.errorMessage && (
                <p className="max-w-xs text-center text-xs text-muted-foreground">
                  {session.errorMessage}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => void handleStart(activeApp)}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <p className="text-sm">Press ▶ to start {activeApp.label}</p>
            </div>
          )
        ) : (
          <LogView lines={logs} />
        )}
      </div>
    </div>
  );
}

// Need to import this icon used in the empty state
import { MonitorPlayIcon } from "lucide-react";
```

- [ ] **Step 12.2: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | grep -i "PreviewPanel" | head -20
```

Fix any errors (e.g. `usePreviewStore.getState()` inside render — move it to a proper selector). The tab session status should use proper hooks:

Replace the tab rendering to use selectors correctly — move the `appSession` logic outside the map using a `TabItem` sub-component:

```tsx
function TabItem({
  app,
  projectId,
  isActive,
  onClick,
}: {
  app: PreviewApp;
  projectId: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const session = usePreviewStore(selectSession(projectId, app.id));
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <StatusDot status={session?.status ?? null} />
      <span>{app.label}</span>
    </button>
  );
}
```

And update the tab bar to use `<TabItem>` instead of the inline map.

---

## Task 13: Web — ChatView.tsx integration

**Files:**

- Modify: `apps/web/src/components/ChatView.tsx`

- [ ] **Step 13.1: Import PreviewPanel and preview store hooks**

In `ChatView.tsx`, add to the imports:

```typescript
import { PreviewPanel } from "./PreviewPanel";
import { useUiStateStore } from "../uiStateStore";
import { selectHasRunningApp, usePreviewStore } from "../previewStore";
```

- [ ] **Step 13.2: Read preview state from stores**

In the `ChatView` component body (near where `diffOpen` is derived around line 853), add:

```typescript
const previewOpen = useUiStateStore((s) => s.previewOpen);
const previewDetached = useUiStateStore((s) => s.previewDetached);
const setPreviewOpen = useUiStateStore((s) => s.setPreviewOpen);
const setPreviewDetached = useUiStateStore((s) => s.setPreviewDetached);
const activeProjectIdForPreview = activeProject?.id ?? null;
const hasRunningPreviewApp = usePreviewStore(selectHasRunningApp(activeProjectIdForPreview ?? ""));

const onTogglePreview = useCallback(() => {
  setPreviewOpen(!previewOpen);
}, [previewOpen, setPreviewOpen]);
```

- [ ] **Step 13.3: Pass preview props to ChatHeader**

Find the `<ChatHeader ... />` JSX (around line 4044) and add the new props:

```tsx
          previewAvailable={activeProject !== undefined}
          previewOpen={previewOpen}
          hasRunningPreviewApp={hasRunningPreviewApp}
          onTogglePreview={onTogglePreview}
```

- [ ] **Step 13.4: Render PreviewPanel in the layout**

Find where `<PlanSidebar>` is rendered in the layout. The main content area is a flex row. Add `<PreviewPanel>` as a sibling after the messages area when `previewOpen && !previewDetached && activeProjectIdForPreview`:

Search for `PlanSidebar` in ChatView.tsx to find the exact layout structure, then insert:

```tsx
{
  previewOpen && !previewDetached && activeProjectIdForPreview && (
    <div className="hidden w-[40%] min-w-[320px] max-w-[600px] shrink-0 md:flex md:flex-col">
      <PreviewPanel
        projectId={activeProjectIdForPreview}
        onDetach={() => {
          setPreviewDetached(true);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 13.5: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -30
```

Fix any errors before proceeding.

- [ ] **Step 13.6: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && git add apps/web/src/ && git commit -m "$(cat <<'EOF'
feat: add PreviewPanel, previewStore, and ChatView integration

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Web — PreviewFloatingWindow.tsx

**Files:**

- Create: `apps/web/src/components/PreviewFloatingWindow.tsx`

- [ ] **Step 14.1: Create the floating window component**

```tsx
// apps/web/src/components/PreviewFloatingWindow.tsx
/**
 * Detached, draggable/resizable preview window rendered via React portal.
 * Shares PreviewPanel content but floats above the main UI.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";
import { Button } from "./ui/button";
import { PreviewPanel } from "./PreviewPanel";
import { useUiStateStore } from "../uiStateStore";
import { cn } from "~/lib/utils";

interface PreviewFloatingWindowProps {
  projectId: string;
  onDock: () => void;
  onClose: () => void;
}

const DEFAULT_BOUNDS = { x: 80, y: 80, w: 720, h: 560 };
const MIN_W = 320;
const MIN_H = 240;

export function PreviewFloatingWindow({ projectId, onDock, onClose }: PreviewFloatingWindowProps) {
  const storedBounds = useUiStateStore((s) => s.previewFloatingBounds);
  const setFloatingBounds = useUiStateStore((s) => s.setPreviewFloatingBounds);

  const [bounds, setBoundsState] = useState(storedBounds ?? DEFAULT_BOUNDS);
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, x: 0, y: 0 });

  // Persist bounds on change
  useEffect(() => {
    setFloatingBounds(bounds);
  }, [bounds, setFloatingBounds]);

  const onMouseDownHeader = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      dragStart.current = { mx: e.clientX, my: e.clientY, x: bounds.x, y: bounds.y };

      const onMove = (me: MouseEvent) => {
        if (!dragging.current) return;
        const dx = me.clientX - dragStart.current.mx;
        const dy = me.clientY - dragStart.current.my;
        setBoundsState((b) => ({ ...b, x: dragStart.current.x + dx, y: dragStart.current.y + dy }));
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [bounds.x, bounds.y],
  );

  const content = (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
      style={{ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h }}
    >
      {/* Drag handle / title bar */}
      <div
        className="flex cursor-grab select-none items-center gap-2 border-b border-border bg-card px-3 py-2 active:cursor-grabbing"
        onMouseDown={onMouseDownHeader}
      >
        <span className="flex-1 text-xs font-medium text-muted-foreground">Preview</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={onDock}
          title="Dock preview"
        >
          <span className="text-[10px] font-bold">⊟</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={onClose}
          title="Close preview"
        >
          <XIcon className="size-3" />
        </Button>
      </div>

      {/* Panel content — reuses PreviewPanel (no detach button needed here) */}
      <div className="flex-1 overflow-hidden">
        <PreviewPanel projectId={projectId} onDetach={onDock} />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
```

- [ ] **Step 14.2: Render floating window in ChatView**

In `ChatView.tsx`, import `PreviewFloatingWindow`:

```typescript
import { PreviewFloatingWindow } from "./PreviewFloatingWindow";
```

Add rendering near the end of the main return, after `<ThreadTerminalDrawer>` and before the closing fragment:

```tsx
{
  previewOpen && previewDetached && activeProjectIdForPreview && (
    <PreviewFloatingWindow
      projectId={activeProjectIdForPreview}
      onDock={() => setPreviewDetached(false)}
      onClose={() => {
        setPreviewOpen(false);
        setPreviewDetached(false);
      }}
    />
  );
}
```

- [ ] **Step 14.3: Typecheck + lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -30 && bun lint 2>&1 | head -30
```

Fix all errors before proceeding.

- [ ] **Step 14.4: Final commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && git add apps/web/src/ && git commit -m "$(cat <<'EOF'
feat: add PreviewFloatingWindow detachable panel mode

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final verification

- [ ] **Step 15.1: Full typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1
```

Expected: zero errors.

- [ ] **Step 15.2: Lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun lint 2>&1
```

Expected: zero lint errors.

- [ ] **Step 15.3: Run all tests**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun run test 2>&1 | tail -30
```

Expected: all existing tests pass, new `appDetection.test.ts` tests pass.

- [ ] **Step 15.4: Manual smoke test**

1. Start the dev server: `bun dev`
2. Open a project in Bird Code that has a `package.json` with a `dev` script
3. Click the Preview toggle button (monitor icon) in the ChatHeader → panel appears on the right
4. App tab is detected → click ▶ → spinner appears → dev server starts → port detected → iframe loads
5. Click the detach button (⊞) → floating window appears, is draggable
6. Click dock button → snaps back to side panel
7. Click ■ stop → status changes to stopped
8. Click the Preview toggle button again → panel closes

---

## Spec Coverage Self-Check

| Spec requirement                                       | Covered by task                                    |
| ------------------------------------------------------ | -------------------------------------------------- |
| Preview button in ChatHeader                           | Task 11                                            |
| Auto-detect apps (package.json, manage.py, Cargo.toml) | Task 3                                             |
| Manual override via RPC                                | Task 6 (`previewUpdateApp`)                        |
| Per-project (not per-thread) server                    | Task 4 (sessions keyed by projectId:appId)         |
| Multiple apps as tabs                                  | Task 12 (tab bar)                                  |
| HTTP reverse proxy for iOS                             | Task 5                                             |
| Hot reload (WS HMR)                                    | Partial: HTTP proxy works; WS proxy is a follow-up |
| iframe for browser apps                                | Task 12                                            |
| Log view for non-browser apps                          | Task 12 (`LogView`)                                |
| Detach as floating window                              | Task 14                                            |
| Green dot badge when running                           | Task 11                                            |
| Start/stop per app                                     | Task 12 (▶/■ buttons)                              |
| Retry on error                                         | Task 12 (error state + Retry button)               |
| Log buffer capped at 1000 lines                        | Task 9                                             |
| Floating window position persisted                     | Task 14 + Task 10                                  |
| `bun lint` and `bun typecheck` pass                    | Task 15                                            |
