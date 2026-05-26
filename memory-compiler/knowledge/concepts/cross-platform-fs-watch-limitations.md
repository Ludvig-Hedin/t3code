---
title: "Cross-Platform fs.watch Limitations: Recursive Watching"
aliases: [fs-watch-recursive, filesystem-watcher-portability, linux-recursive-watch]
tags: [nodejs, filesystem, cross-platform, linux, macos, file-watching]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# Cross-Platform fs.watch Limitations: Recursive Watching

Node.js `fs.watch({ recursive: true })` only works on macOS (darwin) and Windows. On Linux, the `recursive` option is silently ignored, watching only the top-level directory. Cross-platform applications must detect the platform and implement manual recursive watching on Linux by walking subdirectories and attaching individual watchers.

## Key Points

- **`recursive: true` is macOS/Windows only** — Linux silently ignores the flag and watches only the root directory
- **No error is thrown** — The behavior difference is silent, leading to bugs that only appear on Linux
- **Linux requires manual directory walking** — Traverse subdirectories and attach individual `fs.watch` calls
- **Chokidar is the common alternative** — Library abstracts platform differences but adds dependency weight
- **New directories need dynamic watcher attachment** — When directories are created, add new watchers on Linux

## Details

### The Platform Difference

```javascript
// Works as expected on macOS/Windows
fs.watch("/project", { recursive: true }, (event, filename) => {
  console.log(`Changed: ${filename}`);
});

// On Linux: ONLY watches /project, not /project/src/*, /project/lib/*, etc.
```

This is a documented Node.js limitation, but the silent failure mode catches many developers off guard. Code that works in development on macOS fails silently in production on Linux.

### Linux-Compatible Implementation

For Linux support without adding dependencies like chokidar:

```javascript
import { watch, readdir, stat } from "fs/promises";
import { join } from "path";

async function watchRecursive(dir, callback) {
  // Watch the directory itself
  const watcher = watch(dir);

  // Handle events
  (async () => {
    for await (const event of watcher) {
      callback(event.eventType, join(dir, event.filename));
    }
  })();

  // Recursively watch subdirectories
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await watchRecursive(join(dir, entry.name), callback);
    }
  }
}

// Platform-aware entry point
if (process.platform === "darwin" || process.platform === "win32") {
  fs.watch(rootDir, { recursive: true }, callback);
} else {
  watchRecursive(rootDir, callback);
}
```

### Handling Dynamic Directory Creation

On Linux, when a new directory is created, you must attach a new watcher:

```javascript
async function handleChange(event, filename) {
  if (event === "rename") {
    const fullPath = join(rootDir, filename);
    try {
      const stats = await stat(fullPath);
      if (stats.isDirectory()) {
        // New directory created — attach watcher
        await watchRecursive(fullPath, handleChange);
      }
    } catch {
      // File/directory was deleted, not created
    }
  }
}
```

### Why Not Just Use Chokidar?

The code review that surfaced this issue chose to implement manual recursive watching rather than adding chokidar because:

1. **Dependency weight** — Chokidar pulls in fsevents and other native modules
2. **Scope containment** — The fix was for a specific code path, not a general-purpose watcher
3. **Minimal diff** — Adding a single recursive walk function was less invasive than a new dependency

For applications that need robust file watching across platforms, chokidar remains the recommended solution. But for targeted fixes in existing codebases, manual implementation can be appropriate.

### Testing Considerations

This platform difference makes testing critical:

- **CI must include Linux** — macOS-only CI won't catch the bug
- **Docker containers are Linux** — Even if developers use macOS, containers expose the issue
- **Integration tests should create nested files** — Unit tests mocking `fs.watch` won't surface the recursive limitation

## Related Concepts

- [[concepts/process-output-dual-pattern-matching]] — Another cross-platform pattern where behavior differs silently

## Sources

- [[daily/2026-05-09.md]] — "`fs.watch({recursive: true})` only works on macOS/darwin; Linux requires walking subdirs and attaching individual watchers"
- [[daily/2026-05-09.md]] — "Cross-platform watcher: Implemented recursive directory walk with individual watchers rather than adding chokidar dependency — kept change self-contained"
