// apps/server/src/design/Layers/DesignService.ts
import * as fs from "node:fs";
import * as nodePath from "node:path";

import { Effect, Layer } from "effect";

import type { DesignEligibleApp, DesignEligibleAppsDiagnostic } from "@t3tools/contracts";

import {
  buildDetectionCandidates,
  isReactApp,
  type PackageJsonLike,
} from "../../preview/appDetection";
import { scanProjectEntries } from "../../preview/Layers/PreviewServerManager";
import { applyEditToSource } from "../EditApplier";
import { stampSource } from "../OidStamper";
import {
  DesignService,
  type DesignApplyEditSummary,
  type DesignEligibleAppsOutcome,
  type DesignOidLocation,
  type DesignPrimeSummary,
  type DesignResolveOidOutcome,
  type DesignServiceShape,
} from "../Services/DesignService";

/** Scope an in-memory state map by project+app so two projects sharing the same physical
 * app directory do not clobber each other's OID indexes. */
function makeKey(projectId: string, appCwd: string): string {
  return `${projectId}:${appCwd}`;
}

/** Read and parse a package.json; returns null on any error. */
function readPackageJson(pkgPath: string): PackageJsonLike | null {
  try {
    const raw = fs.readFileSync(pkgPath, "utf-8");
    return JSON.parse(raw) as PackageJsonLike;
  } catch {
    return null;
  }
}

/** Walk a directory recursively, returning all `.jsx`/`.tsx` files. */
function walkJsxFiles(root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(root)) return out;
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    ".vercel",
    "out",
  ]);
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = nodePath.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push(abs);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".jsx"))) {
        out.push(abs);
      }
    }
  }
  return out;
}

function resolveAppSourceRoot(appCwd: string): string {
  // Prefer conventional source dirs; fall back to the app root itself.
  for (const candidate of ["src", "app"]) {
    const p = nodePath.join(appCwd, candidate);
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  return appCwd;
}

const INDEX_FILE_REL = ".t3/design-index.json";

interface PersistedIndex {
  readonly version: 1;
  readonly updatedAt: string;
  readonly locations: DesignOidLocation[];
}

function indexFilePath(appCwd: string): string {
  return nodePath.join(appCwd, INDEX_FILE_REL);
}

/** Serialize `applyEdit` / watcher restamp work per absolute file path to avoid RMW races. */
const fileMutationChains = new Map<string, Promise<void>>();

function runSerializedOnAbsPath<T>(absPath: string, fn: () => T): Promise<T> {
  const prev = fileMutationChains.get(absPath) ?? Promise.resolve();
  const run = prev.then(() => fn());
  fileMutationChains.set(
    absPath,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function loadPersistedIndex(appCwd: string): Map<string, DesignOidLocation> | null {
  const p = indexFilePath(appCwd);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<PersistedIndex>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.locations)) return null;
    const map = new Map<string, DesignOidLocation>();
    for (const loc of parsed.locations) {
      if (
        loc &&
        typeof loc === "object" &&
        typeof loc.oid === "string" &&
        typeof loc.relPath === "string" &&
        typeof loc.line === "number" &&
        typeof loc.col === "number" &&
        typeof loc.elementName === "string"
      ) {
        map.set(loc.oid, loc);
      }
    }
    return map;
  } catch {
    return null;
  }
}

function savePersistedIndex(appCwd: string, index: Map<string, DesignOidLocation>): void {
  try {
    const dir = nodePath.dirname(indexFilePath(appCwd));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const payload: PersistedIndex = {
      version: 1,
      updatedAt: new Date().toISOString(),
      locations: [...index.values()],
    };
    fs.writeFileSync(indexFilePath(appCwd), JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    // swallow — persistence is best-effort.
  }
}

const makeDesignService = Effect.gen(function* () {
  /**
   * OID → location maps, keyed by `${projectId}:${appCwd}`. Kept in-memory;
   * persisted to `<appCwd>/.t3/design-index.json` after every mutation so
   * restarts don't lose state. A file watcher re-stamps modified files and
   * repopulates the index automatically.
   */
  const indexByKey = new Map<string, Map<string, DesignOidLocation>>();
  /** Open fs.FSWatcher instances per primed app, keyed by composite key (array to support multi-dir watching on non-darwin). */
  const watchersByKey = new Map<string, fs.FSWatcher[]>();
  /** Pending re-stamp timers per absolute file path. */
  const pendingWatchEvents = new Map<string, ReturnType<typeof setTimeout>>();
  /** Debounced save timer per composite key. */
  const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleSave(key: string, appCwd: string): void {
    const existing = pendingSaves.get(key);
    if (existing) clearTimeout(existing);
    pendingSaves.set(
      key,
      setTimeout(() => {
        const idx = indexByKey.get(key);
        if (idx) savePersistedIndex(appCwd, idx);
        pendingSaves.delete(key);
      }, 250),
    );
  }

  function restampFile(key: string, appCwd: string, absPath: string): void {
    const index = indexByKey.get(key);
    if (!index) return;
    if (!fs.existsSync(absPath)) {
      const rel = nodePath.relative(appCwd, absPath).split(nodePath.sep).join("/");
      for (const [k, v] of index) if (v.relPath === rel) index.delete(k);
      scheduleSave(key, appCwd);
      return;
    }
    let source: string;
    try {
      source = fs.readFileSync(absPath, "utf-8");
    } catch {
      return;
    }
    const relPath = nodePath.relative(appCwd, absPath).split(nodePath.sep).join("/");
    const result = stampSource(source, relPath);
    if (result.changed) {
      try {
        fs.writeFileSync(absPath, result.source, "utf-8");
      } catch {
        return;
      }
    }
    for (const [k, v] of index) if (v.relPath === relPath) index.delete(k);
    for (const loc of result.locations) {
      if (!index.has(loc.oid)) index.set(loc.oid, loc);
    }
    scheduleSave(key, appCwd);
  }

  function closeWatcher(key: string): void {
    const watchers = watchersByKey.get(key);
    if (!watchers) return;
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // best-effort — Node will GC the descriptor on process exit
      }
    }
    watchersByKey.delete(key);
  }

  function ensureWatcher(key: string, appCwd: string): void {
    if (watchersByKey.has(key)) return;
    const sourceRoot = resolveAppSourceRoot(appCwd);
    if (!fs.existsSync(sourceRoot)) return;

    const onFileChange = (filename: string, dir: string) => {
      if (!filename.endsWith(".tsx") && !filename.endsWith(".jsx")) return;
      const abs = nodePath.join(dir, filename);
      const existing = pendingWatchEvents.get(abs);
      if (existing) clearTimeout(existing);
      pendingWatchEvents.set(
        abs,
        setTimeout(() => {
          pendingWatchEvents.delete(abs);
          restampFile(key, appCwd, abs);
        }, 150),
      );
    };

    if (process.platform === "darwin") {
      let watcher: fs.FSWatcher;
      try {
        watcher = fs.watch(sourceRoot, { recursive: true });
      } catch {
        return;
      }
      watcher.on("change", (_event, filename) => {
        if (typeof filename !== "string") return;
        onFileChange(filename, sourceRoot);
      });
      watcher.on("error", () => {});
      watchersByKey.set(key, [watcher]);
    } else {
      // Non-darwin: fs.watch is not recursive, so watch every subdirectory individually.
      const dirsToWatch: string[] = [sourceRoot];
      const stack = [sourceRoot];
      while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const sub = nodePath.join(dir, entry.name);
            dirsToWatch.push(sub);
            stack.push(sub);
          }
        }
      }
      const watchers: fs.FSWatcher[] = [];
      for (const dir of dirsToWatch) {
        try {
          const w = fs.watch(dir, { recursive: false });
          w.on("change", (_event, filename) => {
            if (typeof filename !== "string") return;
            onFileChange(filename, dir);
          });
          w.on("error", () => {});
          watchers.push(w);
        } catch {
          // skip dirs we can't watch
        }
      }
      if (watchers.length === 0) return;
      watchersByKey.set(key, watchers);
    }
  }

  // Release every watcher and pending timer when the Layer's scope closes.
  // Without this, long-running web-mode servers leak FDs on every project
  // switch (macOS recursive watchers can hold thousands of descriptors).
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      for (const key of [...watchersByKey.keys()]) closeWatcher(key);
      for (const t of pendingWatchEvents.values()) clearTimeout(t);
      pendingWatchEvents.clear();
      for (const t of pendingSaves.values()) clearTimeout(t);
      pendingSaves.clear();
    }),
  );

  const findEligibleApps: DesignServiceShape["findEligibleApps"] = (_projectId, cwd) =>
    Effect.promise(async (): Promise<DesignEligibleAppsOutcome> => {
      const diagnostics: DesignEligibleAppsDiagnostic[] = [];
      if (!cwd) {
        return { apps: [], diagnostics, scannedDirCount: 0 };
      }
      // Reuse the preview system's detection so every Design app is also a
      // runnable preview app — and the IDs line up with /preview/:projectId/:appId/.
      let entries: Awaited<ReturnType<typeof scanProjectEntries>>;
      try {
        entries = await scanProjectEntries(cwd);
      } catch (err) {
        diagnostics.push({
          relativePath: ".",
          reason: "read-error",
          detail: err instanceof Error ? err.message : "Could not scan project",
        });
        return { apps: [], diagnostics, scannedDirCount: 0 };
      }
      const scannedDirCount = entries.length;

      // Track every package.json we encountered so we can explain rejections.
      // We walk candidates (not raw entries) because `buildDetectionCandidates`
      // is the source of truth for runnable-script filtering.
      const pkgEntries = entries.filter((e) => e.relativePath.endsWith("package.json"));

      let candidates: ReturnType<typeof buildDetectionCandidates>;
      try {
        candidates = buildDetectionCandidates(cwd, entries);
      } catch (err) {
        diagnostics.push({
          relativePath: ".",
          reason: "read-error",
          detail: err instanceof Error ? err.message : "Could not analyse project",
        });
        return { apps: [], diagnostics, scannedDirCount };
      }

      const eligible: DesignEligibleApp[] = [];
      const seenEligibleCwd = new Set<string>();

      for (const c of candidates) {
        const relPkg =
          (nodePath.relative(cwd, c.cwd) || ".") === "."
            ? "package.json"
            : `${nodePath.relative(cwd, c.cwd).split(nodePath.sep).join("/")}/package.json`;

        if (c.type !== "browser") {
          if (!seenEligibleCwd.has(c.cwd)) {
            diagnostics.push({
              relativePath: relPkg,
              reason: "logs-only",
              detail: "Runs in a terminal (not a browser preview).",
            });
          }
          continue;
        }
        if (c.command.startsWith("preview-file ")) {
          diagnostics.push({
            relativePath: c.id,
            reason: "standalone-file",
            detail: "Standalone file preview (no component tree).",
          });
          continue;
        }
        const pkg = readPackageJson(nodePath.join(c.cwd, "package.json"));
        if (!isReactApp(pkg)) {
          if (!seenEligibleCwd.has(c.cwd)) {
            diagnostics.push({
              relativePath: relPkg,
              reason: "no-react",
              detail: "package.json does not declare `react` as a dependency.",
            });
          }
          continue;
        }

        // Eligible. Dedupe by cwd so multi-script packages don't show twice.
        if (seenEligibleCwd.has(c.cwd)) continue;
        seenEligibleCwd.add(c.cwd);

        eligible.push({
          id: c.id,
          label: c.label,
          cwd: c.cwd,
          relativePath: relPkg,
        });
      }

      // Flag package.jsons that never made it into `candidates` at all. The
      // two common reasons are: (a) no runnable dev script and (b) being in
      // `packages/` which buildDetectionCandidates intentionally drops.
      const coveredCwds = new Set<string>();
      for (const c of candidates) coveredCwds.add(c.cwd);
      for (const entry of pkgEntries) {
        const dir =
          entry.relativePath === "package.json" ? "." : nodePath.dirname(entry.relativePath);
        const absCwd = dir === "." ? cwd : nodePath.join(cwd, dir);
        if (coveredCwds.has(absCwd)) continue;
        const normalizedRel = entry.relativePath.split(nodePath.sep).join("/");
        if (dir.startsWith("packages/") || dir === "packages") {
          diagnostics.push({
            relativePath: normalizedRel,
            reason: "skipped-packages-dir",
            detail: "Under `packages/` — treated as a library, not an app.",
          });
          continue;
        }
        diagnostics.push({
          relativePath: normalizedRel,
          reason: "no-dev-script",
          detail: "No runnable dev script found in package.json.",
        });
      }

      return { apps: eligible, diagnostics, scannedDirCount };
    });

  const primeApp: DesignServiceShape["primeApp"] = (projectId, appCwd) =>
    Effect.promise(async (): Promise<DesignPrimeSummary> => {
      const key = makeKey(projectId, appCwd);
      const sourceRoot = resolveAppSourceRoot(appCwd);
      const files = walkJsxFiles(sourceRoot);
      const index = new Map<string, DesignOidLocation>();
      let writtenFileCount = 0;
      let oidCount = 0;

      for (const abs of files) {
        let source: string;
        try {
          source = fs.readFileSync(abs, "utf-8");
        } catch {
          continue;
        }
        const relPath = nodePath.relative(appCwd, abs).split(nodePath.sep).join("/");
        const result = stampSource(source, relPath);
        if (result.changed) {
          try {
            fs.writeFileSync(abs, result.source, "utf-8");
            writtenFileCount++;
            // Only index OIDs after a successful write so resolveOid stays consistent with on-disk state.
            for (const loc of result.locations) {
              if (index.has(loc.oid)) continue;
              index.set(loc.oid, loc);
              oidCount++;
            }
          } catch {
            // swallow — read-only FS or transient EPERM. Don't index since OIDs aren't on disk.
          }
        } else {
          // Source unchanged — OIDs already on disk, safe to index.
          for (const loc of result.locations) {
            if (index.has(loc.oid)) continue;
            index.set(loc.oid, loc);
            oidCount++;
          }
        }
      }

      indexByKey.set(key, index);
      savePersistedIndex(appCwd, index);
      ensureWatcher(key, appCwd);
      return { fileCount: files.length, oidCount, writtenFileCount };
    });

  const resolveOid: DesignServiceShape["resolveOid"] = (projectId, appCwd, oid) =>
    Effect.sync((): DesignResolveOidOutcome => {
      const key = makeKey(projectId, appCwd);
      const index = indexByKey.get(key);
      if (!index) return { location: null, state: "not-primed" };
      return { location: index.get(oid) ?? null, state: "primed" };
    });

  const applyEdit: DesignServiceShape["applyEdit"] = (projectId, appCwd, oid, op) =>
    Effect.promise(async (): Promise<DesignApplyEditSummary> => {
      const key = makeKey(projectId, appCwd);
      const preIndex = indexByKey.get(key);
      if (!preIndex) return { changed: false, relPath: null, location: null };
      const preLoc = preIndex.get(oid);
      if (!preLoc) return { changed: false, relPath: null, location: null };
      const abs = nodePath.join(appCwd, preLoc.relPath);

      return runSerializedOnAbsPath(abs, (): DesignApplyEditSummary => {
        const index = indexByKey.get(key);
        if (!index) return { changed: false, relPath: null, location: null };
        const loc = index.get(oid);
        if (!loc) return { changed: false, relPath: null, location: null };

        let source: string;
        try {
          source = fs.readFileSync(abs, "utf-8");
        } catch {
          return { changed: false, relPath: loc.relPath, location: loc };
        }

        const edit = applyEditToSource(source, loc.relPath, oid, op);
        if (!edit.changed) {
          return { changed: false, relPath: loc.relPath, location: loc };
        }

        try {
          fs.writeFileSync(abs, edit.source, "utf-8");
        } catch {
          return { changed: false, relPath: loc.relPath, location: loc };
        }

        // Re-stamp the file we just touched so the in-memory OID index reflects
        // shifted line/col coordinates. The stamper is deterministic and
        // preserves existing OIDs, so previously-known OIDs keep their values.
        let latestSource = edit.source;
        try {
          latestSource = fs.readFileSync(abs, "utf-8");
        } catch {
          // use edit.source as-is
        }
        const restamp = stampSource(latestSource, loc.relPath);
        let restampWritten = !restamp.changed;
        if (restamp.changed) {
          try {
            fs.writeFileSync(abs, restamp.source, "utf-8");
            restampWritten = true;
          } catch {
            // ignore write failure — keep index consistent with on-disk state
          }
        }

        if (restampWritten) {
          // Purge the old entries for this file and repopulate only when disk matches.
          for (const [k, v] of index) {
            if (v.relPath === loc.relPath) index.delete(k);
          }
          for (const next of restamp.locations) {
            if (!index.has(next.oid)) index.set(next.oid, next);
          }
        }

        const updatedLocation = index.get(oid) ?? null;
        scheduleSave(key, appCwd);
        // Suppress the watcher's own echo for this file — we just wrote it.
        const existing = pendingWatchEvents.get(abs);
        if (existing) clearTimeout(existing);
        pendingWatchEvents.set(
          abs,
          setTimeout(() => pendingWatchEvents.delete(abs), 400),
        );
        return { changed: true, relPath: loc.relPath, location: updatedLocation };
      });
    });

  const service: DesignServiceShape = { findEligibleApps, primeApp, resolveOid, applyEdit };
  return service;
});

// `Effect.addFinalizer` inside `makeDesignService` adds `Scope` to the
// effect's requirements; Layer.effect honours that, producing a scoped
// layer whose finalizer (closing fs watchers) fires on shutdown.
export const DesignServiceLive = Layer.effect(DesignService, makeDesignService);
