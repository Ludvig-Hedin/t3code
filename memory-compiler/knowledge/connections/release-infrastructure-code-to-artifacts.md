---
title: "Connection: Release Infrastructure - From Code to Distributed Artifacts"
connects:
  - "concepts/app-naming-versioning-strategy"
  - "concepts/desktop-build-automation-bun"
  - "concepts/github-actions-multi-platform-release"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Release Infrastructure - From Code to Distributed Artifacts

## The Connection

The release infrastructure is a three-stage system: versioning (git tags), building (Bun scripts), and publishing (GitHub Actions workflow). Together, these three systems enable a single developer action (git push with tag) to automatically produce tested, multi-platform, properly-named artifacts published to GitHub Releases. No manual steps, no email, no separate deployment. Each stage depends on the previous: versioning provides the tag that the build system reads, the build system produces artifacts that the workflow publishes, and the workflow runs only when the correct tag pattern matches.

## Key Insight

The release system is often viewed as three separate concerns (build, CI/CD, versioning), but they're actually one integrated system. The system works because:

1. **Version is the keystone** - Git tag `v1.0.0` is the single source of truth
2. **Build reads version** - Bun scripts don't hardcode versions; they extract from tag
3. **Workflow publishes with confidence** - Tests run before building, ensuring no broken releases
4. **Parallel builds save time** - Multi-platform builds on separate runners complete in 15-20 min instead of 45+
5. **Naming propagates automatically** - Product name from `package.json` appears in all artifact names

Change any single component, and the chain breaks:

- Remove git tag trigger from workflow? → Releases require manual CI kicks
- Hardcode version in code? → Sync issues between tag and artifacts
- Run builds sequentially? → Releases take 45+ minutes
- Remove pre-build validation? → Broken code ships to users

## Evidence

From the daily log:

1. **Versioning is the trigger:** "Release workflow runs... on git tag pushes (v*.*.\*)."

2. **Builds are automated and parallel:** "GitHub Actions workflow already auto-builds all platforms (macOS, Linux, Windows) on git tag pushes... Multi-platform builds happen in parallel on separate runners"

3. **Validation prevents broken releases:** "Release workflow runs tests, lint, and typecheck before building artifacts"

4. **Naming is automated:** "App ships as 'Bird Code (Alpha)' (productName in `apps/desktop/package.json`)... used in artifact names"

The conversation reveals a complete, integrated system. No gaps, no manual steps. A developer can release a new version with two commands:

```bash
git tag -a v1.0.0 -m "Release 1.0.0"
git push origin v1.0.0
```

Twenty minutes later, users download the artifact from GitHub Releases. No deployment scripts, no Jenkins UI, no Slack notifications asking "did you run the build?"

## Design Patterns Revealed

**Single Source of Truth (Git Tags)**
Version lives in git, not in code. Reduces sync issues, enables audit trail.

**Automation Over Manual**
Every step from code to artifact is automated. Developer push → tests → builds → publishes.

**Fail-Fast Validation**
Tests and checks run before building. Save CI time by not producing artifacts from broken commits.

**Platform-Native Builds**
Each platform builds on its own OS (macOS on macOS, Windows on Windows). Avoids cross-compilation complexity.

**Configuration-Driven Naming**
Product name in `package.json` is read by build system and inserted into artifact names. Change the config, all artifacts auto-update.

## Why This Matters

This architecture answers a common question: "How do we prevent shipping broken software?"

**Without this system:** Someone emails a JAR to the team, developer manually builds on their machine, hopes it works, uploads to a server.

**With this system:** Code → automated validation → automated multi-platform builds → published to GitHub Releases. If anything fails, user never sees a broken artifact because the workflow stops.

## Related Concepts

- [[concepts/app-naming-versioning-strategy]] - Versioning foundation of the system
- [[concepts/desktop-build-automation-bun]] - Building layer
- [[concepts/github-actions-multi-platform-release]] - Publishing layer
