# Bird Code — useful commands

Run these from the **repository root** unless noted. Package manager: **Bun** (`bun@1.3.9+` per `package.json`).

---

## First time

| Command       | What it does                    |
| ------------- | ------------------------------- |
| `bun install` | Install workspace dependencies. |

---

## Local development

| Command                 | What it does                                                                  |
| ----------------------- | ----------------------------------------------------------------------------- |
| `bun run dev`           | Full stack: contracts + web + server in parallel (Turbo, with TUI).           |
| `bun run dev:web`       | **Browser workflow:** server + Vite only (no Electron).                       |
| `bun run dev:server`    | Server package (`t3`) only.                                                   |
| `bun run dev:desktop`   | Desktop shell + web in parallel (Electron + Vite + server as wired in Turbo). |
| `bun run dev:marketing` | Marketing / landing app (`turbo` filter `@t3tools/marketing`).                |

**Preview / production-style starts (after a build):**

| Command                   | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `bun run start`           | `turbo run start --filter=t3` (built server). |
| `bun run start:desktop`   | Start built Electron app.                     |
| `bun run start:marketing` | Vite `preview` for marketing.                 |

**Desktop update testing:**

| Command                            | What it does                       |
| ---------------------------------- | ---------------------------------- |
| `bun run start:mock-update-server` | Serves a local “mock” update feed. |

---

## Build

| Command                   | What it does                                          |
| ------------------------- | ----------------------------------------------------- |
| `bun run build`           | `turbo run build` — all packages that define `build`. |
| `bun run build:desktop`   | Desktop app + server (`@t3tools/desktop` + `t3`).     |
| `bun run build:marketing` | Marketing site only.                                  |
| `bun run build:contracts` | Shared `@t3tools/contracts` only.                     |

**Before packaging a desktop installer locally:** run `bun run build:desktop` so the packager has compiled artifacts.

---

## Quality (CI expectations)

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `bun run typecheck` | TypeScript across the repo (Turbo).          |
| `bun run lint`      | `oxlint`.                                    |
| `bun run test`      | Vitest via Turbo (use this, not `bun test`). |
| `bun run fmt`       | Format with `oxfmt`.                         |
| `bun run fmt:check` | Check formatting only.                       |

**Desktop smoke (after build):** `bun run test:desktop-smoke` — runs the desktop package’s `smoke-test` script.

---

## Desktop installers (DMG, EXE, AppImage)

Outputs go under the repo’s **`release/`** directory (installers, update metadata, blockmaps, etc.).

**Generic script (all options):** use when you need extra flags such as `--build-version` or `--verbose`:

```bash
bun run dist:desktop:artifact -- --platform mac --target dmg --arch arm64 --build-version 0.0.16 --verbose
```

**Shortcuts (from root `package.json`):**

| Goal                          | Command                          |
| ----------------------------- | -------------------------------- |
| **macOS DMG (universal)**     | `bun run dist:desktop:dmg`       |
| **macOS DMG — Apple Silicon** | `bun run dist:desktop:dmg:arm64` |
| **macOS DMG — Intel**         | `bun run dist:desktop:dmg:x64`   |
| **Linux AppImage (x64)**      | `bun run dist:desktop:linux`     |
| **Windows NSIS (x64)**        | `bun run dist:desktop:win`       |

**Typical local DMG flow (macOS):**

```bash
bun run build:desktop
bun run dist:desktop:dmg:arm64    # or :x64, or `dist:desktop:dmg` for universal
```

**Release pipeline smoke (manifest / tooling check):** `bun run release:smoke`

---

## Shipping a version (GitHub Releases)

Publishing is automated: pushing a version tag (or running the **Release Desktop** workflow in GitHub Actions) builds macOS, Windows, and Linux artifacts and uploads them to **GitHub Releases**. In-app updates read those assets.

| Step | Command / action                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | `git checkout main` && `git pull`                                                                                          |
| 2    | `git tag vX.Y.Z` then `git push origin vX.Y.Z` **or** Actions → **Release Desktop** → run with version `X.Y.Z` or `vX.Y.Z` |
| 3    | Wait for `.github/workflows/release.yml` to finish, then check **Releases** on GitHub.                                     |

**Bump versions in-repo manually (optional):**  
`node scripts/update-release-package-versions.ts X.Y.Z` then commit.

Deeper detail (signing, CI, prerelease tags): see **[`docs/release.md`](./docs/release.md)**.  
Short end-to-end: **[`docs/desktop-release-simple.md`](./docs/desktop-release-simple.md)**.

---

## iOS (Swift) companion

From [`README.md`](./README.md) — app code lives in `apps/mobile`.

| Command                               | What it does                  |
| ------------------------------------- | ----------------------------- |
| `cd apps/mobile && xcodegen generate` | Regenerate the Xcode project. |

Open `BirdCode.xcodeproj` in Xcode to build and run on device or simulator.

---

## Misc

| Command                     | What it does                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `bun run clean`             | Remove `node_modules`, `dist` / `dist-electron`, Turbo caches (destructive; frees disk). |
| `bun run sync:vscode-icons` | Regenerate `apps/web` VS Code icon manifest from script.                                 |

---

## Run the CLI without the repo

```bash
npx t3
```

Installs / runs the published `t3` package from npm (useful for quick tryouts).

---

## See also

- **[`README.md`](./README.md)** — product overview, provider setup, iOS, desktop install via Homebrew/winget.
- **[`PROJECT.md`](./PROJECT.md)** — architecture, task completion (fmt / lint / typecheck), testing conventions.
- **GitHub:** [Releases](https://github.com/Ludvig-Hedin/t3code/releases) · [Actions](https://github.com/Ludvig-Hedin/t3code/actions)
