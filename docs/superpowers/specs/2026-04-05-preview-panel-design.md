# Preview Panel — Design Spec

**Date:** 2026-04-05  
**Status:** Approved, ready for implementation

---

## Context

Bird Code is a web GUI for coding agents. As agents make code changes, developers need a fast way to preview the running app without leaving Bird Code. This feature adds a Preview button to the `ChatHeader` that starts a project's dev server(s), proxies their traffic through the Bird Code server, and renders them in an in-app panel — available on both the desktop app and the iOS companion app.

---

## Goals

- Start/stop dev servers for any detected app in the project from within Bird Code.
- Preview browser-based apps in an iframe; show logs for non-browser apps (desktop, mobile, APIs).
- Support monorepos with multiple apps — each as a separate tab.
- Works on iOS companion because traffic is proxied through the Bird Code server (no direct localhost access needed).
- Hot reload (Vite HMR, Next.js fast refresh) works because the proxy also forwards WebSocket upgrades.
- Auto-detect the right start command; allow manual override per project.
- Servers are per-project (not per-thread).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Bird Code Server (apps/server)                                │
│                                                         │
│  PreviewServerManager (new service)                     │
│  ├─ detects apps in project cwd                         │
│  ├─ spawns/stops child processes                        │
│  ├─ reads stdout → detects port                         │
│  └─ streams PreviewEvents via WebSocket subscription    │
│                                                         │
│  HTTP routes (apps/server/src/http.ts)                  │
│  └─ /preview/:projectId/:appId/* → proxy → localhost:N  │
│     (also proxies WebSocket upgrades for HMR)           │
└───────────────────┬─────────────────────────────────────┘
                    │ same Bird Code server connection
              ┌─────┴──────┐
              │            │
        Desktop app      iOS app
              │            │
        PreviewPanel   PreviewPanel
        (side panel    (in iOS
        + detach)       companion)
```

---

## App Detection

The server scans the project `cwd` for known config files and builds a `PreviewApp[]`:

| Detected file                           | Default label | Default command              | Preview type |
| --------------------------------------- | ------------- | ---------------------------- | ------------ |
| Root `package.json` with `dev` script   | `web`         | `npm run dev` / `bun dev`    | iframe       |
| `apps/web/package.json` with `dev`      | `web`         | `bun dev`                    | iframe       |
| `apps/server/package.json` with `dev`   | `server`      | `bun dev`                    | logs         |
| `apps/desktop/package.json`             | `desktop`     | `bun dev`                    | logs         |
| `apps/mobile/` or `*.xcodeproj` present | `mobile`      | `expo start` / `bun dev`     | logs         |
| `pyproject.toml` / `manage.py`          | `api`         | `python manage.py runserver` | iframe       |
| `Cargo.toml`                            | `app`         | `cargo run`                  | logs         |

**Port detection:** stdout is watched for patterns:

- `localhost:PORT` / `127.0.0.1:PORT`
- `➜  Local:   http://localhost:PORT`
- `Running on http://0.0.0.0:PORT`
- `started server on 0.0.0.0:PORT`
- `Listening on port PORT`

**Package manager detection:** check for `bun.lock` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm.

**Manual override:** stored in server settings per project (`ServerSettings`). User can change label, command, cwd, and whether it's a browser or logs preview.

---

## New Contracts (`packages/contracts/src/preview.ts`)

```ts
// A detected or configured app in a project
interface PreviewApp {
  id: string; // stable slug, e.g. "web", "server"
  projectId: ProjectId;
  label: string; // display name
  command: string; // e.g. "bun run dev"
  cwd: string; // working dir to spawn in (may differ from project root)
  type: "browser" | "logs";
  isManualOverride: boolean;
}

// Live state of a running preview process
interface PreviewSession {
  appId: string;
  projectId: ProjectId;
  status: "starting" | "running" | "stopped" | "error";
  port: number | null; // null until port is detected from stdout
  pid: number | null;
  startedAt: string | null;
  errorMessage: string | null;
}

// Events streamed to the client
type PreviewEvent =
  | { type: "log"; appId: string; projectId: ProjectId; line: string; stream: "stdout" | "stderr" }
  | { type: "status-change"; appId: string; projectId: ProjectId; session: PreviewSession }
  | { type: "apps-updated"; projectId: ProjectId; apps: PreviewApp[] };
```

---

## New RPC Methods (`packages/contracts/src/rpc.ts`)

```ts
previewDetectApps   payload: { projectId }  → PreviewApp[]
previewStart        payload: { projectId, appId }  → PreviewSession
previewStop         payload: { projectId, appId }  → void
previewGetSessions  payload: { projectId }  → PreviewSession[]
previewUpdateApp    payload: { projectId, appId, patch: PreviewAppPatch }  → PreviewApp
// PreviewAppPatch: { label?: string; command?: string; cwd?: string; type?: "browser"|"logs" }
subscribePreviewEvents  payload: { projectId }  → Stream<PreviewEvent>
```

---

## HTTP Proxy Routes (`apps/server/src/http.ts`)

New route layer `previewProxyRouteLayer`:

- `GET|POST /preview/:projectId/:appId/*` — reverse-proxy to `http://localhost:{port}/{rest}` using Node's built-in `http` module (no extra dependency). Forward request headers, stream response body.
- WebSocket upgrade on same path — proxy WS connection to `ws://localhost:{port}/{rest}` (HMR support). Use Node's `http.request` + socket piping pattern (same approach used elsewhere in the codebase for WS forwarding).
- Returns `502` with a friendly JSON body `{ error: "App not running" }` if the app has no active session or port not yet detected.
- Rewrite `Location` response headers that contain `localhost:{port}` → `/preview/{projectId}/{appId}/`. No HTML body rewriting needed — Vite/Next.js assets use relative paths and work correctly through the proxy.

---

## Server Implementation

**New file:** `apps/server/src/preview/Services/PreviewServerManager.ts`

Responsibilities:

- `detectApps(projectId, cwd)` — scans filesystem, returns `PreviewApp[]`
- `startApp(projectId, appId)` — spawns child process via `child_process.spawn` (similar to `processRunner.ts` but long-lived, not awaited). Watches stdout line-by-line for port patterns.
- `stopApp(projectId, appId)` — sends `SIGTERM`, then `SIGKILL` after 3s (same pattern as `killCodexChildProcess`). On Windows uses `taskkill /T /F`.
- `getSession(projectId, appId)` — returns current `PreviewSession`
- `streamEvents(projectId)` — returns an async generator of `PreviewEvent`
- Sessions are keyed by `{projectId}:{appId}`. Processes are cleaned up on server shutdown.

**Wire into server:** Add `PreviewServerManagerLive` to `apps/server/src/server.ts` layer composition.

**WebSocket handler:** Add preview RPC methods to `apps/server/src/ws.ts` following the same pattern as terminal methods.

**App detection timing:** `previewDetectApps` is called automatically when the `PreviewPanel` first opens for a project (client-side, on mount). The result is stored in `previewStore`. When the user manually overrides an app config via `previewUpdateApp`, the updated list is re-fetched. The server also emits an `apps-updated` event if the filesystem changes (e.g. a new `package.json` is added by the agent).

---

## UI Components

### `ChatHeader.tsx` changes

- Add `previewAvailable: boolean`, `previewOpen: boolean`, `onTogglePreview: () => void` props.
- Add a `<Toggle>` button (same style as Terminal/Diff toggles) with a `MonitorPlayIcon` (or `PlayCircleIcon`) from lucide-react.
- Show a small green dot badge on the button when ≥1 app is running.
- Only render when `activeProjectName` is set.

### New: `PreviewPanel.tsx`

Location: `apps/web/src/components/PreviewPanel.tsx`

Structure:

```
PreviewPanel
├── Tab bar
│   └── Per app: [label] [status dot] [▶/■ button]  ← tab
├── Preview area
│   ├── If type=browser and status=running:   <iframe src="/preview/{projectId}/{appId}/" />
│   ├── If type=browser and status=starting:  Loading state (spinner + "Starting {label}...")
│   ├── If type=browser and status=error:     Error state with retry button
│   └── If type=logs:                         Scrollable ANSI log output (reuse terminal log renderer)
└── Toolbar (bottom)
    ├── Refresh iframe button (browser only)
    ├── Open in new tab button
    └── Detach button (⊞) → triggers floating mode
```

Layout: rendered as a resizable right panel, sibling to `PlanSidebar`. Default width ~40% of available space. Minimum width 320px.

### New: `PreviewFloatingWindow.tsx`

Location: `apps/web/src/components/PreviewFloatingWindow.tsx`

- Rendered via React portal into `document.body`
- Draggable by header bar
- Resizable from all edges (use existing resize patterns from sidebar)
- Same tab bar + preview area as `PreviewPanel`
- "Dock" button in toolbar → snaps back to side panel mode
- Position/size persisted in `uiStateStore`

### State additions to `uiStateStore.ts`

```ts
previewOpen: boolean; // panel visible
previewDetached: boolean; // floating mode
previewFloatingBounds: {
  (x, y, w, h);
} // floating window position
```

### New: `previewStore.ts`

Lightweight Zustand store:

```ts
apps: Record<ProjectId, PreviewApp[]>;
sessions: Record<`${ProjectId}:${string}`, PreviewSession>;
logs: Record<`${ProjectId}:${string}`, string[]>; // last N log lines per app
activeAppId: Record<ProjectId, string>; // selected tab per project
```

Fed by a `subscribePreviewEvents` subscription, started when `PreviewPanel` mounts. Log buffer is capped at **1000 lines per app** (oldest lines dropped when exceeded).

---

## iOS Companion

No iOS-specific changes needed. The iOS app already connects to the Bird Code server. The preview URL `/preview/{projectId}/{appId}/` is accessible over the same connection. The iOS companion can render a `WKWebView` pointed at that URL. A future iOS PR can add the preview panel UI — the server-side work in this spec is sufficient to make it work.

---

## Error Handling

| Scenario                     | Behaviour                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| App not detected             | Button disabled with tooltip "No previewable apps detected"                                                                                                              |
| Port not yet detected        | iframe shows loading spinner; poll session status                                                                                                                        |
| Process exits unexpectedly   | Status → `error`, show error message + retry button                                                                                                                      |
| Proxy receives no upstream   | Return `502` with JSON `{ error: "App not running" }`                                                                                                                    |
| Multiple apps want same port | Emit a `status-change` event with `status: "error"` and `errorMessage` describing the conflict; show in the tab's error state with a prompt to override the command/port |

---

## Out of Scope

- iOS companion UI for preview (server-side is ready; iOS UI is a separate PR)
- Authentication on the preview proxy (T3 server already has token auth on its endpoints)
- Multiple simultaneous iframes (tabs handle one at a time)
- Port forwarding for remote server deployments

---

## Verification

1. Open a Next.js / Vite project in T3. Click Preview button → app is detected → click Start on `web` tab → iframe loads the running app with hot reload working.
2. Open a monorepo (e.g. the t3code repo itself). Both `web` and `server` apps appear as tabs. Start `web` → iframe preview. Start `server` → log view.
3. On iOS companion, navigate to the same project, open preview → `WKWebView` loads `/preview/{projectId}/web/`.
4. Stop a running app → status changes to stopped, iframe shows "App not running".
5. Override command for an app in project settings → custom command is used on next start.
6. `bun lint` and `bun typecheck` pass.
