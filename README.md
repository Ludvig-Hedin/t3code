# Bird Code

Bird Code is a minimal web GUI for coding agents (currently Codex and Claude, more coming soon).
It also includes an iOS-first companion app that mirrors the desktop UI and lets you chat with the desktop session from your phone.

## Installation

> [!WARNING]
> Bird Code currently supports Codex and Claude.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install Claude Code and run `claude auth login`

## Local development

Install dependencies, then start the app with Bun:

```bash
bun install
bun run dev
```

If you only want the web app, use `bun run dev:web`. For the desktop app, use `bun run dev:desktop`.

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

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

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

Desktop releases (versioning, local build, publish): [docs/desktop-release-simple.md](./docs/desktop-release-simple.md)

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Use [GitHub Issues](https://github.com/Ludvig-Hedin/t3code/issues) or discussions on the repo.
