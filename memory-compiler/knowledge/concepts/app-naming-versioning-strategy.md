---
title: "App Naming and Versioning Strategy"
aliases: [product-naming, version-strategy, release-naming]
tags: [branding, versioning, configuration, release]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# App Naming and Versioning Strategy

The desktop application uses a distinct product name separate from the repository/monorepo name to maintain clear branding. The app ships as "Bird Code (Alpha)" while the internal codebase is "T3 Code." Versioning follows semantic versioning (major.minor.patch) with git tags as the source of truth, ensuring alignment between source control and distributed binaries.

## Key Points

- **Product name vs repository name** - App is "Bird Code (Alpha)" (user-facing); codebase is "T3 Code" (internal)
- **Product name configured in build** - `productName` in `apps/desktop/package.json` controls what users see
- **Semantic versioning** - Releases follow major.minor.patch format (v1.0.0, v0.1.0, etc.)
- **Git tags as version source** - Version numbers are defined by git tag names, not hardcoded in code
- **Auto-propagation to artifacts** - Build system reads version from tag and embeds it in filenames and app properties

## Details

### Product Naming Strategy

The distinction between product name and repository name serves multiple purposes:

**Bird Code (Alpha)** - User-facing product name

- What users see in the macOS menu bar
- What appears in installer dialog ("Install Bird Code (Alpha)")
- What shows in GitHub Releases download page
- Includes "(Alpha)" qualifier to set expectations about stability

**T3 Code** - Repository and internal name

- Monorepo directory name (`t3code/`)
- Internal documentation and chat references
- Development workflow and CI/CD scripts
- Version control commit history

This separation allows:

- Rebranding without code changes (just update `productName`)
- Clear distinction between "what we call it internally" vs. "what we sell"
- Alpha/Beta/Release variants without code duplication

### Configuration Points

Product name is set in `apps/desktop/package.json`:

```json
{
  "name": "bird-code-desktop",
  "version": "1.0.0",
  "productName": "Bird Code (Alpha)",
  "description": "Desktop IDE with AI capabilities"
}
```

The build system reads `productName` and uses it in artifact names:

- `Bird Code (Alpha)-1.0.0-universal.dmg`
- `Bird Code (Alpha)-1.0.0-x64.exe`
- `Bird Code (Alpha)-1.0.0.AppImage`

### Versioning with Git Tags

Version numbers are not hardcoded in the codebase. Instead, they live in git tags:

```bash
# Create a release
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0

# Workflow reads tag, extracts version "1.0.0"
# Uses it in artifact names and app properties
```

The workflow script extracts the version from the git tag:

- Tag: `v1.0.0` → Version: `1.0.0`
- Tag: `v0.5.2` → Version: `0.5.2`

This approach ensures:

- Single source of truth (git history)
- No sync issues between hardcoded version and git tags
- Audit trail of all releases in git history

### Alpha/Beta Strategy

The current release is branded as "Bird Code (Alpha)" to indicate stability level. To transition:

**To Beta:** Update `package.json`:

```json
"productName": "Bird Code (Beta)"
```

Commit, tag, and release. Next artifacts say "Bird Code (Beta)".

**To Production:** Update `package.json`:

```json
"productName": "Bird Code"
```

Commit, tag, and release. Next artifacts say "Bird Code" without qualifier.

No code changes needed; naming change propagates through the build system automatically.

## Related Concepts

- [[concepts/desktop-build-automation-bun]] - Build system reads productName and embeds version
- [[concepts/github-actions-multi-platform-release]] - Workflow extracts version from git tag
- [[concepts/http-endpoint-authentication-patterns]] - Not directly related; linked for cross-domain context

## Sources

- [[daily/2026-04-12]] - "App ships as 'Bird Code (Alpha)' (productName in `apps/desktop/package.json`), while monorepo internally is 'T3 Code'"
- [[daily/2026-04-12]] - "Release workflow triggered by git tag pushes (v*.*.\*); version numbers are defined by git tags, not hardcoded in code"
