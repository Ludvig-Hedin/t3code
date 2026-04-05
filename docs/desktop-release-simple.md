# Desktop app: versions, local builds, and publishing

Short guide. For signing secrets and CI details, see [`release.md`](./release.md).

## How version numbers work (the “auto” part)

You **do not** need to manually edit `package.json` for every release if you use **GitHub Actions**:

1. You choose **one** version when you release (for example `1.2.3`).
2. The workflow runs a script that **sets the same version** on the packages that ship (`apps/desktop`, `apps/server`, `apps/web`, `packages/contracts`).
3. After the release finishes, a bot can **commit that version bump back to `main`** so the repo stays in sync.

So the **tag / workflow input is the source of truth** for the shipped version. Local `package.json` versions are what you last built or what CI last committed.

**In-app updates** (menu → check for updates) use **GitHub Releases** — when a new release is published, users can update from there. No separate upload to the marketing site for the installer files.

---

## Publish a new version (for users to download)

Do this when `main` is ready to ship.

1. Pick a version: `X.Y.Z` (three numbers), e.g. `0.0.16`.

2. **Option A — tag (usual):**

   ```bash
   git checkout main
   git pull
   git tag v0.0.16
   git push origin v0.0.16
   ```

3. **Option B — GitHub UI:**  
   **Actions** → **Release Desktop** → **Run workflow** → type `0.0.16` or `v0.0.16` → Run.

4. Wait until the workflow is **green**. Then open **GitHub → Releases** — you should see the new version and files (`.dmg`, `.exe`, `.AppImage`, update metadata).

That’s it. The marketing download page reads **latest release from GitHub**, so it picks up new files without you copying anything by hand (as long as the repo in `apps/marketing/src/lib/releases.ts` matches where you publish).

---

## Build a desktop installer on your own machine

Use this to test a **local** `.dmg` / `.exe` / `.AppImage` before or instead of CI.

**Requirements:** Bun installed, repo cloned, dependencies installed (`bun install` at the repo root).

1. **Compile what the packager needs:**

   ```bash
   bun run build:desktop
   ```

2. **Build one artifact** (pick the line for your OS):

   | OS                  | Command                          |
   | ------------------- | -------------------------------- |
   | macOS Apple Silicon | `bun run dist:desktop:dmg:arm64` |
   | macOS Intel         | `bun run dist:desktop:dmg:x64`   |
   | Linux               | `bun run dist:desktop:linux`     |
   | Windows             | `bun run dist:desktop:win`       |

3. **Find outputs** under the repo’s `release/` folder (installers and helper files).

**Version label on the built app:** If you don’t pass anything extra, the script uses the version from **`apps/server/package.json`**. To force a version string on the artifact, use the full artifact script with `--build-version`:

```bash
bun run dist:desktop:artifact -- --platform mac --target dmg --arch arm64 --build-version 0.0.16 --verbose
```

(`bun run dist:desktop:dmg:arm64` is a shortcut to the same script with those flags filled in — add `--build-version` via the generic command above when you need it.)

---

## Quick reference

| Goal                    | What to do                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ship to real users      | Push tag `vX.Y.Z` or run **Release Desktop** workflow                                                         |
| Bump version in repo    | Let CI do it after release, or run `node scripts/update-release-package-versions.ts X.Y.Z` locally and commit |
| Build installer locally | `bun run build:desktop` then `bun run dist:desktop:dmg:arm64` (or another platform script)                    |
| Full detail / signing   | [`release.md`](./release.md)                                                                                  |
