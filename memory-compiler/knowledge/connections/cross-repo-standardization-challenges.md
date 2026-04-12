---
title: "Connection: Cross-Repo Standardization Challenges"
connects:
  - "concepts/git-branch-resolution-fallbacks"
  - "concepts/multi-platform-desktop-build-automation"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: Cross-Repo Standardization Challenges

## The Connection

Tools that operate across diverse repositories (code review harnesses, build automation, CI/CD pipelines) encounter constant friction from lack of standardization. Different repos use different default branches (`main`, `master`, `develop`), different product names (internal vs user-facing), different build configurations. The solution is not to enforce standardization (impossible), but to **detect and adapt dynamically**. Both git branch resolution and multi-platform builds illustrate this pattern: assume nothing, validate everything, adapt to what actually exists.

## Key Insight

The naive approach: **Write code for your repo, it works, ship it, break on someone else's repo.**

The robust approach: **Write code that discovers the target environment and adapts.**

In other words: **convention over configuration → configuration over assumption → **discovery and adaptation over all\*\*.

## Evidence

From the daily log:

1. **Branch naming:** "Cannot assume `main` exists as default branch; different repos use `master`, `develop`, `trunk`" → Tool must discover which branch exists
2. **Semantic versioning:** "Different repos use different default branch names — can't assume `main` exists" → git branch resolution via fallback chain
3. **Product naming:** "App ships as 'Bird Code (Alpha)' (productName in `apps/desktop/package.json`), while monorepo internally is 'T3 Code'" → Product name is configurable, not hardcoded
4. **Build artifacts:** Multi-platform workflow builds all platforms but publishes to same release → Adapts to what platforms exist

The pattern: **Try defaults → validate → adapt → error gracefully**

## Design Pattern

```typescript
// Generic approach for cross-repo tools:

function discoverEnvironment() {
  // Try common conventions
  const defaults = ["main", "master", "develop"];

  // Validate what actually exists
  const existing = defaults.filter((name) => exists(name));

  // Use first match, or fall back to discovery
  return existing[0] || fallbackDiscovery();
}
```

This pattern applies to:

- **Branch names** - Try common defaults, use what exists
- **Product names** - Read from config file, don't hardcode
- **Build commands** - Detect what platforms are available, build all
- **Dependency versions** - Check package.json instead of assuming versions

## Related Concepts

- [[concepts/git-branch-resolution-fallbacks]] - Specific instance of branch name discovery
- [[concepts/multi-platform-desktop-build-automation]] - General case of adapting to available platforms
- [[concepts/systematic-feature-implementation-phases]] - Well-architected systems are more portable across repos
