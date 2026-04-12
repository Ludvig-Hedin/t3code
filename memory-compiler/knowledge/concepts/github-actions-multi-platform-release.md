---
title: "GitHub Actions Multi-Platform Release Workflow"
aliases: [github-actions-release, release-workflow, ci-cd-automation]
tags: [ci-cd, github-actions, release-automation, deployment]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# GitHub Actions Multi-Platform Release Workflow

The project includes a GitHub Actions workflow that automates building and releasing the desktop application across multiple platforms. Triggered by git tags matching the pattern `v*.*.*`, the workflow runs automated tests and linting, builds distributable artifacts for macOS, Linux, and Windows in parallel, and publishes them to GitHub Releases. This approach eliminates manual release steps and ensures consistent builds across platforms.

## Key Points

- **Git tag trigger** - Pushes with tags matching `v*.*.*` (e.g., v1.0.0) trigger the release workflow
- **Parallel multi-platform builds** - macOS, Linux, Windows builds run on separate runners simultaneously
- **Pre-build validation** - Tests, linting, and typecheck run before artifact creation (fail-fast)
- **Automatic artifact publishing** - Built DMG, exe, AppImage, and other binaries publish to GitHub Releases
- **Workflow file location** - `.github/workflows/release.yml` contains the complete automation

## Details

### Workflow Trigger

```yaml
on:
  push:
    tags:
      - "v*.*.*"
```

This means the workflow fires when code is pushed with a tag like `v1.0.0`, `v0.1.0`, etc. The developer's responsibility is:

1. Commit code
2. Create annotated git tag: `git tag -a v1.0.0 -m "Release 1.0.0"`
3. Push tag: `git push origin v1.0.0`

No manual release UI or commands needed; git itself triggers the automation.

### Pre-Build Validation

Before building any artifacts, the workflow validates code quality and correctness:

```yaml
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: bun install
      - run: bun run test
      - run: bun run lint
      - run: bun run typecheck
```

If tests fail, lint errors exist, or types don't match, the workflow **stops before building**. This prevents releasing broken binaries. The fail-fast approach saves CI time by not building on a broken commit.

### Parallel Multi-Platform Builds

Once validation passes, separate build jobs run in parallel on platform-specific runners:

```yaml
jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - run: bun run dist:desktop:dmg
      - uses: actions/upload-artifact@v3
        with:
          name: macos-artifact
          path: release/*.dmg

  build-windows:
    runs-on: windows-latest
    steps:
      - run: bun run dist:desktop:exe
      - uses: actions/upload-artifact@v3
        with:
          name: windows-artifact
          path: release/*.exe

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - run: bun run dist:desktop:appimage
      - uses: actions/upload-artifact@v3
        with:
          name: linux-artifact
          path: release/*.AppImage
```

**Why parallel?** Building on the correct platform is critical:

- macOS builds should run on macOS (code signing, native tools)
- Windows builds on Windows (MSI generation, registry handling)
- Linux builds on Linux (AppImage, desktop file integration)

Parallel execution means the release completes in ~15-20 minutes (longest individual build) instead of sequential 45+ minutes.

### Artifact Publishing

After all builds complete, artifacts are published to GitHub Releases:

```yaml
jobs:
  publish:
    needs: [validate, build-macos, build-windows, build-linux]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v3
      - uses: softprops/action-gh-release@v1
        with:
          files: |
            macos-artifact/*.dmg
            windows-artifact/*.exe
            linux-artifact/*.AppImage
```

GitHub Releases automatically creates a new release page with:

- Release title (from git tag)
- Artifact downloads (DMG, exe, AppImage)
- Release notes (optional; can be auto-generated from commits)

Users can then download the appropriate artifact for their platform.

### Workflow State Management

The `.github/workflows/release.yml` file is under version control, making release automation part of the codebase. Changes to the build process (e.g., adding new platforms) are made by editing the workflow file and committing it—the process evolves with the code.

## Related Concepts

- [[concepts/desktop-build-automation-bun]] - The Bun build scripts invoked by GitHub Actions
- [[concepts/app-naming-and-versioning-strategy]] - Version numbers in git tags drive release versioning
- [[concepts/systematic-feature-implementation-phases]] - Release automation is infrastructure layer, not feature

## Sources

- [[daily/2026-04-12]] - "GitHub Actions workflow (`.github/workflows/release.yml`) already auto-builds all platforms (macOS, Linux, Windows) on git tag pushes (v*.*.\*)."
- [[daily/2026-04-12]] - "Release workflow runs tests, lint, and typecheck before building artifacts and publishing to GitHub Releases"
- [[daily/2026-04-12]] - "Multi-platform builds happen in parallel on separate runners"
