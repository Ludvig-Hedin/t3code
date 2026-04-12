---
title: "GitHub Actions Multi-Platform Release Automation"
aliases: [release-workflow, ci-cd-automation, platform-builds, github-actions]
tags: [deployment, automation, github-actions, infrastructure]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# GitHub Actions Multi-Platform Release Automation

The project includes a complete GitHub Actions release workflow (`.github/workflows/release.yml`) that automatically builds and publishes artifacts for multiple platforms (macOS, Linux, Windows) when a git tag is pushed. The workflow runs pre-flight checks (tests, lint, typecheck), builds platform-specific installers in parallel, and publishes releases to GitHub Releases. This automation eliminates manual build and release steps.

## Key Points

- **Git tag triggers** - Pushing a tag matching `v*.*.*` pattern automatically starts the release workflow
- **Pre-flight checks** - Tests, lint, and typecheck run before building to prevent broken releases
- **Parallel multi-platform builds** - macOS, Linux, and Windows builds run simultaneously on separate runners
- **Artifact publishing** - Build artifacts (DMG for macOS, installers for Windows/Linux) are published to GitHub Releases
- **No manual builds needed** - Developers just tag a commit and the workflow handles everything
- **Product naming** - App is released as "Bird Code (Alpha)" (defined in `apps/desktop/package.json` productName field)

## Details

### Trigger Pattern

```yaml
on:
  push:
    tags:
      - "v*.*.*"
```

Any push of a tag like `v1.0.0`, `v2.1.3`, etc., triggers the release workflow. This keeps releases tied to git history and makes versioning explicit.

### Workflow Steps

1. **Checkout code** - Pull the repository at the tagged commit
2. **Run tests** - Execute full test suite; fail fast if tests don't pass
3. **Run lint** - Check code quality with ESLint
4. **Typecheck** - Validate TypeScript compilation
5. **Build for platform N** - Compile application for each OS (runs in parallel):
   - macOS runner: builds universal DMG (ARM64 + x86_64)
   - Linux runner: builds Linux installer
   - Windows runner: builds Windows installer/executable
6. **Upload artifacts** - Each platform's build output is uploaded
7. **Create release** - GitHub Releases entry is created with all artifacts attached

### Multi-Platform Build Strategy

Each platform runs on its native runner:

- **macOS runs on macOS runner** - Builds native macOS DMG, code-signs if configured
- **Linux runs on Linux runner** - Builds Linux AppImage or .deb
- **Windows runs on Windows runner** - Builds .exe or .msi

Running each on its native platform ensures:

- Native code compilation
- Correct code signing and notarization (for macOS)
- Platform-specific optimization
- Genuine user experience (building on target OS)

Parallel execution means the workflow completes in the time of the slowest platform build, not the sum of all builds.

### Release Channel

The app is published as "Bird Code (Alpha)" indicating pre-release status. This is configurable in `apps/desktop/package.json`:

```json
{
  "productName": "Bird Code (Alpha)",
  "version": "0.1.0"
}
```

Updating `productName` changes the app name in installers; updating `version` updates the version distributed.

### Local DMG Building

For testing or manual builds without going through CI/CD:

```bash
bun run dist:desktop:dmg              # Creates universal DMG (both architectures)
bun run dist:desktop:dmg:arm64        # ARM64 only
bun run dist:desktop:dmg:x86          # x86_64 only
```

These scripts use the same build configuration as the GitHub Actions workflow, ensuring consistency between local and CI builds.

### Deployment Frequency

With this workflow in place, deployments are friction-free:

- Developer merges to main
- Decide it's time to release
- Run: `git tag v1.2.3 && git push --tags`
- Workflow automatically builds and publishes
- Users can download from GitHub Releases

This encourages frequent, small releases without fear of broken builds (pre-flight checks prevent that).

## Related Concepts

- [[concepts/dmg-universal-macos-build]] - macOS-specific build configuration
- [[concepts/build-infrastructure]] - General build tooling (if exists)

## Sources

- [[daily/2026-04-12.md]] - "GitHub Actions workflow (.github/workflows/release.yml) already auto-builds all platforms (macOS, Linux, Windows) on git tag pushes (v*.*.\*)"
- [[daily/2026-04-12.md]] - "Release workflow runs tests, lint, and typecheck before building artifacts and publishing to GitHub Releases"
- [[daily/2026-04-12.md]] - "Multi-platform builds happen in parallel on separate runners"
- [[daily/2026-04-12.md]] - "App ships as 'Bird Code (Alpha)' (productName in apps/desktop/package.json)"
