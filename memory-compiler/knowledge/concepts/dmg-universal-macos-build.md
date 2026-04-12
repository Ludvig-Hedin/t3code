---
title: "Universal DMG Build Process for macOS Distribution"
aliases: [dmg-build, macos-installer, universal-binary, arm64-x86]
tags: [macos, deployment, build-process, distribution]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Universal DMG Build Process for macOS Distribution

The project builds macOS applications as universal disk images (DMGs) containing both ARM64 (Apple Silicon) and x86_64 (Intel) architectures in a single binary. This universal approach ensures the app runs natively on both modern Macs (M1/M2/M3) and older Intel-based systems without requiring separate downloads. The build is triggered via `bun run dist:desktop:dmg` and produces a standard macOS installer package.

## Key Points

- **Universal binary** - Single DMG contains both ARM64 and x86_64 machine code
- **Native performance** - Each architecture runs optimized code, not through emulation/Rosetta
- **Single distribution** - Users download one DMG regardless of their Mac architecture
- **Standard format** - DMG (disk image) is the familiar macOS installer format
- **Architecture-specific variants available** - Can build ARM64 or x86 only if needed (e.g., for testing)
- **Included in automated workflow** - GitHub Actions multi-platform release includes universal DMG builds

## Details

### Universal Binary Concept

Apple Silicon Macs (ARM64 architecture) launched in 2020. Older Macs use Intel (x86_64) architecture. A universal binary contains executable code for both, and the OS automatically runs the appropriate version at startup.

**Benefits:**

- Users don't need to choose an architecture
- Future-proof: supports both current and older hardware
- Performance: no emulation overhead (unlike Rosetta 2)

**Size tradeoff:** Universal binary is ~2x the size of a single-architecture binary because it contains both machine code versions.

### DMG Build Commands

```bash
# Universal build (ARM64 + x86_64)
bun run dist:desktop:dmg

# Architecture-specific builds (useful for testing, faster builds)
bun run dist:desktop:dmg:arm64        # ARM64 only
bun run dist:desktop:dmg:x86          # x86_64 only
```

These commands are typically defined in `apps/desktop/package.json` scripts section and use a build tool like Electron Builder or Tauri to create the DMG.

### DMG Format

A `.dmg` file is a macOS disk image containing:

- Application bundle (`.app` folder with universal binary and resources)
- License file (optional)
- Drag-to-Applications shortcut (optional)
- Background image (optional)

When a user opens a `.dmg`, macOS mounts it as a virtual volume. They drag the `.app` to Applications folder, the OS installs it, and they can eject the DMG.

### Build Output

After running the build command:

- **Location:** Typically in `dist/` or `out/` directory
- **Filename:** `Bird Code (Alpha)-X.Y.Z-universal.dmg` (includes version)
- **Size:** ~50-150 MB depending on app size (universal binary is larger)
- **Signature:** May be code-signed and notarized for distribution (configured separately)

### GitHub Actions Integration

The release workflow (`.github/workflows/release.yml`) includes DMG builds:

1. Checks out code at tag (e.g., `v1.0.0`)
2. Runs on macOS runner (needs native macOS to build for macOS)
3. Executes `bun run dist:desktop:dmg` equivalent
4. Uploads resulting DMG as release artifact
5. Users download from GitHub Releases

### Performance Considerations

**Universal binary tradeoffs:**

- **Size**: ~2x larger than single architecture
- **Build time**: ~2x longer than single architecture
- **Runtime**: Same performance as single-architecture on each platform

For distribution (GitHub Releases), universal is worth the extra size because users don't need to make a choice.

For development/testing, building `dmg:arm64` only is faster (useful for quick iterations on Apple Silicon Macs).

### Code Signing and Notarization

On macOS, production applications typically require:

- **Code signing** - Cryptographically sign the binary to verify origin
- **Notarization** - Submit to Apple for verification (required for Gatekeeper on modern macOS)

These are separate from building the DMG and are configured in the build tool's settings. The build command may automatically apply signing if certificates are available in the environment.

## Related Concepts

- [[concepts/github-actions-multiplatform-release]] - DMG builds are part of the release workflow
- [[concepts/build-infrastructure]] - General build tooling and automation (if exists)

## Sources

- [[daily/2026-04-12.md]] - "DMG builds are triggered via `bun run dist:desktop:dmg` (universal arm64+x64)"
- [[daily/2026-04-12.md]] - "DMG builds are available via npm script and support universal binaries"
- [[daily/2026-04-12.md]] - "Architecture-specific variants available for testing or specific builds"
