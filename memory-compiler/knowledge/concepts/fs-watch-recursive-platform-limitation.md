---
title: "fs.watch Recursive Option Platform Limitation"
aliases: [fs-watch-recursive, node-watch-linux, cross-platform-file-watching]
tags: [node-js, file-system, cross-platform, linux, macos]
sources:
  - "daily/2026-05-09.md"
created: 2026-05-09
updated: 2026-05-09
---

# fs.watch Recursive Option Platform Limitation

Node.js `fs.watch({ recursive: true })` only works on macOS (darwin) and Windows. On Linux, the recursive option is silently ignored, requiring manual directory traversal and individual watcher attachment for each subdirectory.

## Key Points

- **macOS/Windows only** — The `recursive: true` option leverages OS-level APIs (FSEvents on macOS, ReadDirectoryChangesW on Windows) that natively support recursive watching
- **Linux silent failure** — On Linux, `recursive: true` is accepted without error but has no effect; only the top-level directory is watched
- **Manual workaround required** — On Linux, walk the directory tree and attach individual `fs.watch` instances to each subdirectory
- **Chokidar alternative** — The `chokidar` package provides cross-platform recursive watching, but adds a dependency
- **Self-contained fix preferred** — For targeted fixes, implementing a manual directory walk keeps the change scope minimal

## Details

### The Platform Behavior

```javascript
// This code behaves differently by platform:
fs.watch("/project/src", { recursive: true }, (event, filename) => {
  console.log(event, filename);
});
```

| Platform | Behavior                                                                |
| -------- | ----------------------------------------------------------------------- |
| macOS    | Watches `/project/src` and all subdirectories recursively               |
| Windows  | Watches `/project/src` and all subdirectories recursively               |
| Linux    | Watches only `/project/src`; changes in subdirectories are not detected |

### Linux Workaround Implementation

For Linux compatibility without adding dependencies, implement a directory walker:

```javascript
import { watch, readdirSync, statSync } from 'fs';
import { join } from 'path';

function watchRecursive(dir: string, callback: fs.WatchListener<string>) {
  const watchers: fs.FSWatcher[] = [];

  function walkAndWatch(currentDir: string) {
    // Watch this directory
    watchers.push(watch(currentDir, callback));

    // Recurse into subdirectories
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry);
      if (statSync(fullPath).isDirectory()) {
        walkAndWatch(fullPath);
      }
    }
  }

  walkAndWatch(dir);

  // Return cleanup function
  return () => watchers.forEach(w => w.close());
}
```

### Considerations

1. **New directory detection** — The manual approach requires re-scanning when new directories are created
2. **Watcher limits** — Linux has inotify watch limits (`/proc/sys/fs/inotify/max_user_watches`); many subdirectories may exhaust them
3. **Startup cost** — Initial directory walk adds latency proportional to directory depth/count
4. **Memory overhead** — Each watcher consumes memory; deep trees accumulate significant overhead

### Decision Context

In the 2026-05-09 code review session, the fix for a cross-platform file watcher chose to implement the manual directory walk rather than adding `chokidar` as a dependency. The rationale was keeping the change self-contained and minimizing diff scope for a targeted bugfix.

## Related Concepts

- [[concepts/process-output-dual-pattern-matching]] — Another cross-platform consideration from the same code review
- [[concepts/subprocess-detachment-macos]] — Platform-specific process behavior on macOS

## Sources

- [[daily/2026-05-09.md]] — "`fs.watch({recursive: true})` only works on macOS/darwin; Linux requires walking subdirs and attaching individual watchers"
- [[daily/2026-05-09.md]] — "Cross-platform watcher: Implemented recursive directory walk with individual watchers rather than adding chokidar dependency — kept change self-contained"
