---
title: "Multi-Platform Desktop Build Automation with GitHub Actions"
aliases: [desktop-build-pipeline, dmg-builds, cross-platform-build, release-automation]
tags: [ci-cd, devops, desktop, github-actions]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Multi-Platform Desktop Build Automation with GitHub Actions

Building desktop applications for multiple platforms (macOS, Linux, Windows) requires parallel build pipelines. GitHub Actions workflows can orchestrate builds across platforms efficiently by running jobs on separate runners and parallelizing compilations. The Bird Code project demonstrates a complete release automation setup: builds are triggered by git tags, tests and linting run before compilation, and artifacts are published to GitHub Releases.

## Key Points

- **Multi-platform runners** - Use separate GitHub Actions jobs (mac, linux, windows runners) to build in parallel
- **Git tag triggers** - Release workflow activates on `v*.*.* ` git tags (semantic versioning)
- **Pre-flight checks** - Run tests, lint, and typecheck before building to catch errors early
- **Local build variants** - `bun run dist:desktop:dmg` for DMG (universal arm64+x64), or architecture-specific variants
- **Single product name** - "Bird Code (Alpha)" is the shipping product; internal monorepo is "T3 Code"
- **Artifact publishing** - Built artifacts (DMG, exe, deb, etc.) published automatically to GitHub Releases

## Details

### GitHub Actions Release Workflow

The `.github/workflows/release.yml` workflow handles the full pipeline:

```yaml
on:
  push:
    tags:
      - "v*.*.*" # Triggered by semantic version tags

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test
      - run: npm run lint
      - run: npm run typecheck

  build-macos:
    runs-on: macos-latest
    needs: test
    steps:
      - run: bun run dist:desktop:dmg

  build-linux:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - run: bun run dist:desktop:linux

  build-windows:
    runs-on: windows-latest
    needs: test
    steps:
      - run: bun run dist:desktop:windows

  publish:
    runs-on: ubuntu-latest
    needs: [build-macos, build-linux, build-windows]
    steps:
      - run: gh release create ${{ github.ref }} --generate-notes *.dmg *.exe *.deb
```

Key design:

1. **Sequential validation** - Test job runs first; all builds depend on test success
2. **Parallel compilation** - macOS, Linux, Windows builds run simultaneously after validation
3. **Centralized publishing** - Final publish job collects all artifacts and creates release

### Local Build Commands

For development and manual builds:

```bash
# Universal DMG (arm64 + x64)
bun run dist:desktop:dmg

# Architecture-specific variants
bun run dist:desktop:dmg:arm64
bun run dist:desktop:dmg:x64

# Linux (AppImage or deb)
bun run dist:desktop:linux

# Windows (exe or msi)
bun run dist:desktop:windows
```

Corresponds to `scripts` section in `apps/desktop/package.json`.

### Product Naming Conventions

Critical distinction:

- **Monorepo internal name:** "T3 Code" (in `package.json`, git history)
- **User-facing product name:** "Bird Code (Alpha)" (in `apps/desktop/package.json` `productName`)

This separation allows the project to maintain internal naming while shipping a branded product. All user-visible artifacts (DMG, installer, application name in System Preferences) use the `productName`.

### Tag-Based Release Triggers

Releases are triggered by pushing git tags:

```bash
# Tag and push
git tag v1.2.3
git push origin v1.2.3

# GitHub Actions automatically:
# 1. Runs test job
# 2. Launches parallel builds (macOS, Linux, Windows)
# 3. Publishes artifacts to Releases
```

No manual intervention needed. The workflow handles the entire pipeline from commit to release.

### Cost Considerations

Multi-platform builds consume GitHub Actions minutes:

- macOS runner: ~15 min/job (more expensive)
- Linux runner: ~10 min/job
- Windows runner: ~12 min/job

For 1 release per week, this is typically within free tier (3,000 min/month). Monitor usage if frequency increases.

## Related Concepts

- [[concepts/git-branch-resolution-fallbacks]] - Release workflow may interact with branch detection
- [[concepts/systematic-feature-implementation-phases]] - Each phase (contracts, business logic, etc.) must pass pre-flight checks before release

## Sources

- [[daily/2026-04-12.md]] - "DMG builds are triggered via `bun run dist:desktop:dmg` (universal arm64+x64) or architecture-specific variants"
- [[daily/2026-04-12.md]] - "GitHub Actions workflow (`.github/workflows/release.yml`) already auto-builds all platforms (macOS, Linux, Windows) on git tag pushes (v*.*.\*)"
- [[daily/2026-04-12.md]] - "Release workflow runs tests, lint, and typecheck before building artifacts and publishing to GitHub Releases"
- [[daily/2026-04-12.md]] - "App ships as 'Bird Code (Alpha)' (productName in `apps/desktop/package.json`), while monorepo internally is 'T3 Code'"
