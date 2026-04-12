---
title: "Package Manager Cache Corruption and Repair"
aliases: [cache-corruption, bun-internals, package-cache, node-modules-repair]
tags: [package-management, bun, troubleshooting, cache]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Package Manager Cache Corruption and Repair

Package managers like Bun maintain internal caches (e.g., `node_modules/.bun/`) to optimize performance. Disk cleanup operations, system crashes, or manual deletion can corrupt these caches, causing cryptic build or runtime errors. Unlike `package-lock.json` which is human-readable and version-controlled, internal caches are binary and automatically regenerated. The first troubleshooting step is a full `bun install` (or equivalent for npm/yarn), which clears corrupted caches and regenerates them from the lockfile.

## Key Points

- **Package managers cache metadata** - Bun uses `node_modules/.bun/` for fast lookups; npm/yarn use similar structures
- **Caches are not version-controlled** - These are build artifacts; corruption is often invisible until runtime
- **Disk cleanup can corrupt caches** - Partial deletions, interrupted operations, or filesystem errors break cache integrity
- **Full install regenerates caches** - `bun install` rebuilds the entire cache from lockfile, usually fixing silent failures
- **Symptoms are cryptic** - Errors may not mention caching (e.g., "cannot find module" despite it being installed)

## Details

### Cache Structure in Bun

```
node_modules/
├── .bun/
│   ├── cache/
│   │   └── [hashed package metadata]
│   └── [internal binary structures]
├── [actual packages]
└── [symlinks]
```

Bun's `.bun/` directory contains optimized lookups and metadata. If a system crash occurs while Bun is writing cache entries, the directory can be left in an inconsistent state.

### Symptoms of Cache Corruption

- Module resolution fails (`Cannot find module 'X'`) despite package being in `package.json`
- Intermittent failures (sometimes work, sometimes fail)
- Build succeeds but runtime crashes
- Cryptic errors in package installation or dependency resolution
- Clearing `node_modules` and reinstalling doesn't help (lockfile is fine, cache is dirty)

### Diagnosis and Repair

**Step 1: Check if cache is the issue**

```bash
# Remove the cache directory
rm -rf node_modules/.bun/

# Full reinstall (regenerates cache from lockfile)
bun install
# or
npm install
```

**Step 2: If that doesn't work, nuclear option**

```bash
# Clear all node_modules AND lockfile, start fresh
rm -rf node_modules/ bun.lock.b  # or package-lock.json
bun install
```

### Why Full Install Works

`bun install` reads the lockfile (which is authoritative and version-controlled) and:

1. Validates each locked dependency
2. Downloads/links packages from correct versions
3. **Regenerates the cache from scratch**
4. Writes `.bun/` with fresh metadata

If the lockfile is fine but cache is corrupted, the fresh cache solves the problem.

### Prevention

- Use version control for lockfiles (`bun.lock.b`, `package-lock.json`, `yarn.lock`)
- Avoid manual deletion of `node_modules/.bun/` (let the package manager manage it)
- If disk space is tight, use `bun install --no-save` to skip cache updates, or rely on `bun clean` if available

### Different Package Managers

| Tool | Cache Location                               | Repair Command          |
| ---- | -------------------------------------------- | ----------------------- |
| Bun  | `node_modules/.bun/`                         | `bun install`           |
| npm  | `node_modules/.package-lock.json` + `~/.npm` | `npm install --verbose` |
| Yarn | `node_modules/.yarn/`                        | `yarn install`          |
| pnpm | `node_modules/.pnpm/`                        | `pnpm install`          |

## Related Concepts

- [[concepts/concurrent-process-serialization]] - Both deal with invisible state that can diverge between operations
- [[concepts/git-branch-resolution-fallback-chains]] - Both require defensive error handling for silent failures

## Sources

- [[daily/2026-04-12.md]] - "Discovered corrupted `node_modules/.bun/` cache from disk cleanup → `bun install` restored it"
- [[daily/2026-04-12.md]] - "If disk space is tight, manually deleting node_modules or running aggressive cleanup can corrupt Bun's internal package cache"
