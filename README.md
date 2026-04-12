# Bird Code

Bird Code is a minimal web GUI for coding agents (currently Codex, Claude Code, Ollama, OpenCode, and Gemini — more coming soon).
It also includes an iOS-first companion app that mirrors the desktop UI and lets you chat with the desktop session from your phone.

## Features

- **Multi-provider**: Codex, Claude Code, Ollama (local), OpenCode, and Gemini — all through a unified session model.
- **Diff review & approvals**: Review proposed file changes inline before accepting.
- **Integrated terminal**: Multi-tab, split-pane PTY terminal embedded in the UI.
- **Branch & git controls**: Branch selector, commit, push, PR creation, and worktree management from the sidebar.
- **Plan sidebar**: See the agent's step-by-step plan as it works.
- **Preview panel**: Live web preview and mobile webview relay.
- **Keybindings**: Fully customizable keyboard shortcuts via `~/.t3/keybindings.json`. See `KEYBINDINGS.md`.
- **MCP support**: Connect Model Context Protocol servers to extend provider capabilities.
- **Skills & memory**: Persistent skill definitions and memory that survive across sessions.
- **Automations**: Define automation rules that trigger on agent events.
- **Plugins**: Extend Bird Code with plugins.
- **Voice transcription**: Record from the chat composer, auto-download a small local Whisper model on first use, and fall back to browser speech recognition if the model or server path is unavailable.
- **Onboarding**: 5-step onboarding sheet to get started quickly.
- **Remote access**: Expose the server over your LAN or via Cloudflare Named Tunnel for access from any device.
- **iOS companion app**: Native SwiftUI app that pairs with the desktop session for chat, diffs, and approvals on the go.
- **Desktop app**: Electron shell with auto-update, keep-awake, and system tray support.
- **Observability**: Local NDJSON trace file + optional OTLP export to Grafana LGTM or any OpenTelemetry backend.
- **Theming & appearance**: Customizable via settings (CSS variable injection).

## Installation

> [!WARNING]
> Bird Code supports Codex, Claude Code, Ollama, OpenCode, and Gemini.
> Install and authenticate at least one provider before use:
>
> - **Codex**: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - **Claude Code**: install Claude Code and run `claude auth login`
> - **Ollama**: install [Ollama](https://ollama.ai) and run it locally (Bird Code can pull models from the UI)
> - **OpenCode**: install [OpenCode](https://opencode.ai) — Bird Code will start its app-server automatically
> - **Gemini**: install the [Gemini CLI](https://github.com/google-gemini/gemini-cli) and run `gemini auth login`, or export `GEMINI_API_KEY` with a valid API key from [Google AI Studio](https://aistudio.google.com/apikey)

## Local development

Install dependencies, then start the app with Bun:

```bash
bun install
bun run dev
```

If you only want the web app, use `bun run dev:web`. For the desktop app, use `bun run dev:desktop`.

Optional transcription overrides live in [`.env.example`](./.env.example). You do not need to set them for the browser-local model path, but you can point the server fallback at a local Whisper-compatible HTTP endpoint if you want to override the default behavior.

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/Ludvig-Hedin/t3code/releases) (or the marketing site’s [/download](https://marketing-nu-six.vercel.app/download) page, which tracks the same latest build), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

(The published **winget** package id is still `T3Tools.T3Code`; the installed desktop app is **Bird Code** — same as GitHub Releases builds.)

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## iOS companion

The iPhone companion lives in [`apps/mobile`](./apps/mobile). It is a native SwiftUI app that connects to the desktop session through the server's mobile relay routes and reuses the same orchestration read model and styling language as the desktop app.

Pairing is QR-first:

- Open the desktop app's `Mobile` settings tab to show the QR and pairing code.
- On iPhone, open Bird Code, go to `Settings`, then use the `Pair` tab to scan or paste the code.
- The pairing code includes the desktop auth context automatically, so you should not need to look up a token manually.
- The `Advanced` tab keeps the server URL and auth token fields only for edge cases.
- The QR should point at a reachable desktop address on your LAN, not `localhost`.
- Allow Local Network access on iPhone when prompted the first time you pair.
- The iOS app icon is bundled from `apps/mobile/Resources/Assets.xcassets/AppIcon.appiconset`; if the old icon sticks around, delete and reinstall the app once so iOS refreshes its cache.

To generate the Xcode project locally:

```bash
cd apps/mobile
xcodegen generate
```

## Remote access

See [`REMOTE.md`](./REMOTE.md) for the full setup guide. The short version:

- **LAN**: run with `--host 0.0.0.0 --auth-token <token>` and open `http://<lan-ip>:<port>` on another device.
- **Cloudflare Tunnel**: enable from the desktop app's `Mobile` settings tab. The app manages `cloudflared` for you.

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

Desktop releases (versioning, local build, publish): [docs/desktop-release-simple.md](./docs/desktop-release-simple.md)

iOS companion setup: [docs/ios-companion.md](./docs/ios-companion.md)

Keybindings: [KEYBINDINGS.md](./KEYBINDINGS.md)

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Use [GitHub Issues](https://github.com/Ludvig-Hedin/t3code/issues) or discussions on the repo.
