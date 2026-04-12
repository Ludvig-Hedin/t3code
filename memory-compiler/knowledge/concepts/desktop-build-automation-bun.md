---
title: "Desktop App Build Automation with Bun"
aliases: [bun-build, desktop-dmg, universal-builds]
tags: [build-automation, desktop, bun, macos]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Desktop App Build Automation with Bun

Bun provides a streamlined task runner and build system for desktop applications. The desktop app uses Bun scripts to generate platform-specific distributable artifacts (DMG on macOS, installers on Windows/Linux). The build process supports universal builds (combining arm64 and x64 architectures) as well as architecture-specific builds, enabling local development and CI/CD automation.

## Key Points

- **Bun task runners** - `bun run dist:desktop:dmg` is the primary build command for macOS DMG creation
- **Universal builds** - Default includes both arm64 and x64 architectures in a single artifact
- **Architecture-specific variants** - Separate commands available for single-architecture builds when needed
- **Local vs CI context** - Same build scripts run locally during development and in GitHub Actions CI
- **Platform diversity** - Build system supports macOS (DMG), Windows (exe/msi), and Linux (AppImage/deb) with separate commands per platform

## Details

### Build Command Structure

The Bun build system for desktop uses descriptive task names following a pattern:

```bash
# macOS universal build (arm64 + x64)
bun run dist:desktop:dmg

# Architecture-specific builds
bun run dist:desktop:dmg:arm64
bun run dist:desktop:dmg:x64

# Windows builds
bun run dist:desktop:exe      # or msi

# Linux builds
bun run dist:desktop:appimage # or deb
```

Each command creates a production-ready distributable artifact in a predictable output directory (typically `dist/` or `release/`).

### Universal Build Process

Universal builds combine multiple architectures into a single artifact. On macOS, this means the DMG contains a universal app that runs natively on both Apple Silicon (arm64) and Intel (x64) Macs:

1. Build for arm64 architecture
2. Build for x64 architecture
3. Create universal binary combining both
4. Create DMG package containing universal binary
5. Output single DMG file compatible with all Macs

This approach maximizes distribution compatibility while requiring only one artifact per release.

### Bun Task Runner Integration

`bun` acts as both:

- **Package manager** (like npm/yarn/pnpm)
- **Task runner** (like npm scripts)

Desktop build scripts are defined in `apps/desktop/package.json` or root `package.json`:

```json
{
  "scripts": {
    "dist:desktop:dmg": "electron-builder --mac",
    "dist:desktop:dmg:arm64": "electron-builder --mac --arm64",
    "dist:desktop:dmg:x64": "electron-builder --mac --x64"
  }
}
```

The `bun run` command invokes these scripts with Bun's JavaScript runtime, which is faster than Node.js for build automation.

### Local Development Workflow

Developers can build locally for testing before pushing to CI:

```bash
# Build for current architecture only
bun run dist:desktop:dmg:arm64  # on Apple Silicon
bun run dist:desktop:dmg:x64    # on Intel Mac

# Or build universal (slower, requires both architectures)
bun run dist:desktop:dmg
```

Local builds allow:

- Verifying DMG creation before committing
- Testing installer behavior locally
- Debugging build issues in familiar environment

### Output and Versioning

Built artifacts follow naming conventions derived from `package.json`:

```
release/
├── Bird Code (Alpha)-1.0.0-arm64.dmg      # arm64 build
├── Bird Code (Alpha)-1.0.0-x64.dmg        # x64 build
├── Bird Code (Alpha)-1.0.0-universal.dmg  # universal build
└── latest-mac.yml                         # Update manifest
```

The product name ("Bird Code (Alpha)") comes from `apps/desktop/package.json`, allowing the app to have a user-facing name different from the repository name.

## Related Concepts

- [[concepts/github-actions-multi-platform-release-workflow]] - How CI/CD triggers these builds automatically
- [[concepts/app-naming-and-versioning-strategy]] - Product name configured in build scripts
- [[concepts/systematic-feature-implementation-phases]] - Build automation is infrastructure, not feature layer

## Sources

- [[daily/2026-04-12]] - "DMG builds are triggered via `bun run dist:desktop:dmg` (universal arm64+x64) or architecture-specific variants"
- [[daily/2026-04-12]] - "GitHub Actions workflow already auto-builds all platforms (macOS, Linux, Windows) on git tag pushes"
