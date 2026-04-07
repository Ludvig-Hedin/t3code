# AGENTS.md

## Task Completion Requirements

- All of `bun fmt`, `bun lint`, and `bun typecheck` must pass before considering tasks completed.
- NEVER run `bun test`. Always use `bun run test` (runs Vitest).

## Project Snapshot

Bird Code is a minimal web GUI for coding agents (Codex, Claude, Ollama, OpenCode, and more coming).

It ships as:

- A **web app** served by a local Node.js/Bun WebSocket server.
- An **Electron desktop app** wrapping the web app with native OS integration (auto-update, keep-awake, Cloudflare tunnel, system tray, etc.).
- A **native SwiftUI iOS companion app** that pairs with the desktop session for chat, diff review, and approvals on the go.

This repository is a **VERY EARLY WIP**. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long-term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js/Bun WebSocket + HTTP server. Wraps provider CLI/SDK processes (JSON-RPC or HTTP+SSE), serves the React web app, and manages provider sessions, persistence, git, terminal, MCP, skills, memory, plugins, preview, and mobile relay.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, diff review, terminal drawer, plan sidebar, branch toolbar, preview panel, keybindings, automations, onboarding, and all client-side state. Connects to the server via WebSocket.
- `apps/desktop`: Electron shell. Wraps the web UI with native capabilities: auto-update (`updateMachine`), keep-awake (`keepAwakeManager`), Cloudflare Named Tunnel remote access (`tunnelManager`), shell-env sync, IPC bridge, and remote settings persistence.
- `apps/mobile`: Native SwiftUI iPhone companion app. Pairs with the desktop session via QR code. Supports thread list, chat composer, diff review, approval actions, and device management. Not a second execution host — the desktop remains authoritative.
- `apps/marketing`: Marketing/landing page (separate from main app).
- `packages/contracts`: Shared Effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, model/session types, keybindings, MCP, skills, plugins, settings, and mobile. **Schema-only — no runtime logic.**
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`, `@t3tools/shared/orchestration`) — no barrel index.

## Provider Support

Bird Code currently supports these AI coding providers:

| Provider | Transport             | Session model                             |
| -------- | --------------------- | ----------------------------------------- |
| Codex    | JSON-RPC over stdio   | `codex app-server` subprocess per session |
| Claude   | OAuth + Claude Code   | `claude` subprocess via similar adapter   |
| Ollama   | HTTP + SSE            | Local Ollama server, pull/quit via RPC    |
| OpenCode | HTTP + SSE subprocess | `opencode app-server` subprocess + HTTP   |
| Gemini   | API (rate-limited)    | Managed server provider with rate limiter |

All providers implement the same `ProviderAdapterShape` interface and are registered in `ProviderAdapterRegistry` / `ProviderRegistry`.

## Codex App Server (Important)

Bird Code is currently Codex-first. The server starts `codex app-server` (JSON-RPC over stdio) per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent` (provider runtime activity is projected into orchestration events server-side).

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Key Server Subsystems

| Subsystem     | Location                         | Purpose                                                  |
| ------------- | -------------------------------- | -------------------------------------------------------- |
| Orchestration | `apps/server/src/orchestration/` | Domain event log, projector, decider, command invariants |
| Persistence   | `apps/server/src/persistence/`   | SQLite via Effect SQL, migrations                        |
| Provider      | `apps/server/src/provider/`      | All provider adapters + registries                       |
| Terminal      | `apps/server/src/terminal/`      | PTY management, terminal sessions                        |
| Git           | `apps/server/src/git/`           | Git operations, remote refs                              |
| Project       | `apps/server/src/project/`       | Project management, scripts                              |
| MCP           | `apps/server/src/mcp/`           | Model Context Protocol server integration                |
| Skills        | `apps/server/src/skills/`        | Skills system (`SkillService`)                           |
| Memory        | `apps/server/src/memory/`        | Memory service                                           |
| Plugins       | `apps/server/src/plugins/`       | Plugin system (`PluginService`)                          |
| Checkpointing | `apps/server/src/checkpointing/` | Diff/checkpoint management                               |
| Preview       | `apps/server/src/preview/`       | Preview panel + mobile webview relay                     |
| Mobile        | `apps/server/src/mobile.ts`      | Mobile relay: pairing, snapshots, dispatch, diffs        |
| Observability | `apps/server/src/observability/` | NDJSON trace file + optional OTLP export                 |

## Key Web UI Components

| Component                  | Purpose                                 |
| -------------------------- | --------------------------------------- |
| `ChatView.tsx`             | Main chat conversation view             |
| `DiffPanel.tsx`            | Diff review + approval panel            |
| `PlanSidebar.tsx`          | Agent plan/step sidebar                 |
| `BranchToolbar.tsx`        | Git branch status + worktree controls   |
| `GitActionsControl.tsx`    | Commit, push, PR actions                |
| `PreviewPanel.tsx`         | Live preview panel (web/mobile webview) |
| `Sidebar.tsx`              | Thread + project sidebar                |
| `AutomationsManager.tsx`   | Automation rules UI                     |
| `SkillsManager.tsx`        | Skills management UI                    |
| `ComposerPromptEditor.tsx` | Prompt composer with mentions           |
| `ThreadTerminalDrawer.tsx` | Embedded terminal drawer                |
| `CodeReviewControl.tsx`    | PR/code review actions                  |

## Remote Access

Bird Code can be reached from another device (phone, browser on a different machine) via two mechanisms:

1. **LAN / Direct**: bind `--host 0.0.0.0` and connect to `http://<lan-ip>:<port>`. See `REMOTE.md`.
2. **Cloudflare Named Tunnel**: managed from Electron via `TunnelManager` (`apps/desktop/src/tunnelManager.ts`). The desktop app downloads `cloudflared`, authenticates once, creates a named tunnel, and exposes a stable public URL. Controlled from the `Mobile` settings tab in the desktop app.

Always set an `--auth-token` when exposing the server outside localhost. See `REMOTE.md` for the full CLI/env option map.

## iOS Mobile Companion

- Lives in `apps/mobile` as a native SwiftUI app generated with XcodeGen.
- Pairs via QR code shown in the desktop `Mobile` settings tab.
- Supports thread list, chat composer, diff review, approval responses, and device management.
- The server exposes relay endpoints in `apps/server/src/mobile.ts`.
- Shared mobile thread summaries are in `packages/shared/src/orchestrationMobile.ts`.
- **Companion-only**: never becomes a second execution environment. Desktop stays authoritative.
- Push notifications and background refresh are **not yet implemented**.

See `docs/ios-companion.md` for full pairing and setup instructions.

## Onboarding

A 5-step onboarding sheet (`OnboardingSheet`) mounts at the app root and guides new users through: provider setup, project selection, first thread, settings, and getting started. It is controlled by `useOnboardingStore`.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor (Tauri, feature-complete, strong reference implementation): https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## File Path Formatting in Responses

Bird Code's markdown renderer auto-detects file paths in responses and makes them clickable — opening the file in the user's preferred editor. To ensure paths are always clickable, follow these rules:

**Always format file paths as Markdown links with absolute `file://` URLs:**

```
[relative/path/to/file](file:///absolute/path/to/file)
```

The absolute path = cwd + "/" + relative path. Example for a project at `/Users/ludvighedin/myproject`:

```
[apps/server/src/file.ts](file:///Users/ludvighedin/myproject/apps/server/src/file.ts)
```

**Fallback (auto-detected):** If you write a file path in backtick inline code (e.g. `` `apps/server/src/file.ts` ``), the renderer will also detect it and make it clickable using the session's cwd. Prefer the explicit Markdown link form for maximum reliability.

Apply this to all "Updated Files" sections and any mention of a specific file path in your responses.
