/**
 * PluginService - Lists, installs, and removes Claude Code plugins.
 *
 * Plugins live in ~/.claude/plugins/marketplaces/<marketplace>/plugins/<plugin-name>/.
 * Each plugin directory may contain a package.json with name, version, and description.
 *
 * Managed installs (via install()) are placed under the "t3code" marketplace directory.
 *
 * Follows the same ServiceMap.Service + Layer.effect pattern as McpService.
 *
 * @module PluginService
 */
import { PluginError, type PluginInfo } from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path, ServiceMap } from "effect";
import * as os from "node:os";

import { runProcess } from "../processRunner.ts";

// ── Service interface ────────────────────────────────────────────────────────

export interface PluginServiceShape {
  /** List all installed Claude Code plugins across all marketplace directories. */
  list(): Effect.Effect<readonly PluginInfo[], PluginError>;

  /**
   * Install a plugin from a local path or git URL.
   *
   * - Local path (starts with /, ~, or .): copied into the t3code marketplace.
   * - Git URL (starts with https://, http://, git@, or ends with .git): cloned.
   *
   * Returns the PluginInfo for the newly installed plugin.
   */
  install(source: string): Effect.Effect<PluginInfo, PluginError>;

  /**
   * Remove an installed plugin by name.
   * Searches across all marketplaces for a matching plugin directory.
   */
  remove(name: string): Effect.Effect<void, PluginError>;
}

// ── Service tag ──────────────────────────────────────────────────────────────

export class PluginService extends ServiceMap.Service<PluginService, PluginServiceShape>()(
  "t3/plugins/PluginService",
) {}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Try to read and parse a package.json in the given directory.
 * Returns default values if the file is missing or malformed — we never
 * want a broken package.json to prevent listing other plugins.
 */
const readPackageJson = (
  fs: FileSystem.FileSystem,
  pluginDir: string,
): Effect.Effect<{ name: string; version: string; description: string }, never> =>
  Effect.gen(function* () {
    const pkgPath = `${pluginDir}/package.json`;
    const exists = yield* fs.exists(pkgPath).pipe(Effect.orElseSucceed(() => false));

    if (!exists) {
      return { name: "", version: "unknown", description: "" };
    }

    const raw = yield* fs.readFileString(pkgPath, "utf8").pipe(
      Effect.orElseSucceed(() => "{}"),
    );

    // Wrap JSON.parse in Effect.try so malformed JSON falls back to defaults
    // instead of throwing or crashing the list operation.
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: () => ({}),
    }).pipe(Effect.orElseSucceed(() => ({})));

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { name: "", version: "unknown", description: "" };
    }

    const pkg = parsed as Record<string, unknown>;
    return {
      name: typeof pkg["name"] === "string" ? pkg["name"] : "",
      version: typeof pkg["version"] === "string" ? pkg["version"] : "unknown",
      description: typeof pkg["description"] === "string" ? pkg["description"] : "",
    };
  });

/**
 * Derive a plugin name from a git URL.
 * Strips the trailing ".git" suffix and takes the last path segment.
 * e.g. "https://github.com/foo/my-plugin.git" → "my-plugin"
 */
function pluginNameFromGitUrl(url: string): string {
  // Remove trailing .git if present, then take the last path segment.
  const withoutDotGit = url.endsWith(".git") ? url.slice(0, -4) : url;
  const segments = withoutDotGit.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "plugin";
}

/**
 * Resolve a source string that may start with "~" to the full absolute path.
 */
function resolvePath(source: string): string {
  if (source.startsWith("~/") || source === "~") {
    return os.homedir() + source.slice(1);
  }
  return source;
}

/**
 * Determine whether the given source string represents a local path
 * (starts with /, ~, or .).
 */
function isLocalPath(source: string): boolean {
  return source.startsWith("/") || source.startsWith("~") || source.startsWith(".");
}

/**
 * Determine whether the given source string represents a git URL.
 */
function isGitUrl(source: string): boolean {
  return (
    source.startsWith("https://") ||
    source.startsWith("http://") ||
    source.startsWith("git@") ||
    source.endsWith(".git")
  );
}

// ── Service factory ──────────────────────────────────────────────────────────

export const makePluginService = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  // All plugin paths are rooted at ~/.claude/plugins/marketplaces/.
  // os.homedir() is synchronous and stable for the process lifetime.
  const home = os.homedir();
  const marketplacesRoot = pathService.join(home, ".claude", "plugins", "marketplaces");
  const managedMarketplace = pathService.join(marketplacesRoot, "t3code");
  const managedPluginsDir = pathService.join(managedMarketplace, "plugins");

  // ── list ─────────────────────────────────────────────────────────────────

  const list = (): Effect.Effect<readonly PluginInfo[], PluginError> =>
    Effect.gen(function* () {
      // If the marketplaces root doesn't exist yet, return an empty list.
      const rootExists = yield* fs.exists(marketplacesRoot).pipe(
        Effect.mapError(
          (e) =>
            new PluginError({
              detail: `Failed to check plugin directory: ${String(e)}`,
              cause: e,
            }),
        ),
      );

      if (!rootExists) {
        return [] as readonly PluginInfo[];
      }

      // Read top-level marketplace directories.
      const marketplaceDirs = yield* fs.readDirectory(marketplacesRoot).pipe(
        Effect.mapError(
          (e) =>
            new PluginError({
              detail: `Failed to list marketplaces directory: ${String(e)}`,
              cause: e,
            }),
        ),
      );

      const allPlugins: PluginInfo[] = [];

      for (const marketplaceName of marketplaceDirs) {
        // The "cache/" directory is a download cache — skip it.
        if (marketplaceName === "cache") continue;

        const pluginsDir = pathService.join(marketplacesRoot, marketplaceName, "plugins");

        const pluginsDirExists = yield* fs.exists(pluginsDir).pipe(
          Effect.orElseSucceed(() => false),
        );
        if (!pluginsDirExists) continue;

        const pluginDirs = yield* fs.readDirectory(pluginsDir).pipe(
          Effect.orElseSucceed(() => [] as string[]),
        );

        for (const pluginDirName of pluginDirs) {
          const pluginPath = pathService.join(pluginsDir, pluginDirName);

          // Only include actual directories (not files that may live in plugins/).
          const stat = yield* fs.stat(pluginPath).pipe(
            Effect.orElseSucceed(() => null),
          );
          if (stat === null || stat.type !== "Directory") continue;

          const pkg = yield* readPackageJson(fs, pluginPath);

          allPlugins.push({
            name: pkg.name.length > 0 ? pkg.name : pluginDirName,
            version: pkg.version,
            description: pkg.description,
            // location and marketplace satisfy TrimmedNonEmptyString (a runtime refinement,
            // not a branded type). pluginPath is an absolute filesystem path and
            // marketplaceName is a non-empty directory entry — both guaranteed non-empty.
            location: pluginPath,
            marketplace: marketplaceName,
          });
        }
      }

      return allPlugins as readonly PluginInfo[];
    });

  // ── install ───────────────────────────────────────────────────────────────

  const install = (source: string): Effect.Effect<PluginInfo, PluginError> =>
    Effect.gen(function* () {
      // Ensure the managed marketplace plugins directory exists before installing.
      yield* fs.makeDirectory(managedPluginsDir, { recursive: true }).pipe(
        Effect.mapError(
          (e) =>
            new PluginError({
              detail: `Failed to create managed plugins directory: ${String(e)}`,
              cause: e,
            }),
        ),
      );

      let destDir: string;

      if (isLocalPath(source)) {
        // ── Local path install ──────────────────────────────────────────────
        const resolvedSource = resolvePath(source);
        const dirName = pathService.basename(resolvedSource);
        destDir = pathService.join(managedPluginsDir, dirName);

        const alreadyExists = yield* fs.exists(destDir).pipe(
          Effect.mapError(
            (e) =>
              new PluginError({
                detail: `Failed to check if plugin already exists: ${String(e)}`,
                cause: e,
              }),
          ),
        );

        if (alreadyExists) {
          // yield* on a TaggedError is shorthand for Effect.fail(new TaggedError(...)). Enabled by the Effect TS plugin.
          return yield* new PluginError({ detail: "Plugin already installed" });
        }

        // Copy the directory recursively into the managed marketplace.
        yield* fs.copy(resolvedSource, destDir).pipe(
          Effect.mapError(
            (e) =>
              new PluginError({
                detail: `Failed to copy plugin from ${resolvedSource}: ${String(e)}`,
                cause: e,
              }),
          ),
        );
      } else if (isGitUrl(source)) {
        // ── Git URL install ─────────────────────────────────────────────────
        const name = pluginNameFromGitUrl(source);
        destDir = pathService.join(managedPluginsDir, name);

        const alreadyExists = yield* fs.exists(destDir).pipe(
          Effect.mapError(
            (e) =>
              new PluginError({
                detail: `Failed to check if plugin already exists: ${String(e)}`,
                cause: e,
              }),
          ),
        );

        if (alreadyExists) {
          return yield* new PluginError({ detail: "Plugin already installed" });
        }

        // Use the shared runProcess helper (used by git/gh commands throughout the codebase)
        // to spawn `git clone` without pulling in an external library.
        yield* Effect.tryPromise({
          try: () => runProcess("git", ["clone", source, destDir]),
          catch: (e) =>
            new PluginError({
              detail: `Failed to clone plugin from ${source}: ${e instanceof Error ? e.message : String(e)}`,
              cause: e,
            }),
        });
      } else {
        // Unrecognized source — not a local path or git URL.
        return yield* new PluginError({
          detail: `Unrecognized plugin source "${source}". Provide an absolute/relative path or a git URL.`,
        });
      }

      // Read the installed plugin's package.json and return PluginInfo.
      const pkg = yield* readPackageJson(fs, destDir);
      const dirName = pathService.basename(destDir);

      // location and marketplace satisfy TrimmedNonEmptyString — both are non-empty
      // strings (destDir is an absolute path; "t3code" is a literal).
      return {
        name: pkg.name.length > 0 ? pkg.name : dirName,
        version: pkg.version,
        description: pkg.description,
        location: destDir,
        marketplace: "t3code",
      } satisfies PluginInfo;
    });

  // ── remove ────────────────────────────────────────────────────────────────

  const remove = (name: string): Effect.Effect<void, PluginError> =>
    Effect.gen(function* () {
      // If the marketplaces root doesn't exist, there is nothing to remove.
      const rootExists = yield* fs.exists(marketplacesRoot).pipe(
        Effect.mapError(
          (e) =>
            new PluginError({
              detail: `Failed to check plugin directory: ${String(e)}`,
              cause: e,
            }),
        ),
      );

      if (!rootExists) {
        return yield* new PluginError({ detail: `Plugin not found: ${name}` });
      }

      // Enumerate all marketplace directories to find the named plugin.
      const marketplaceDirs = yield* fs.readDirectory(marketplacesRoot).pipe(
        Effect.mapError(
          (e) =>
            new PluginError({
              detail: `Failed to list marketplaces directory: ${String(e)}`,
              cause: e,
            }),
        ),
      );

      for (const marketplaceName of marketplaceDirs) {
        if (marketplaceName === "cache") continue;

        // Check for a directory named exactly `name` under this marketplace.
        const candidate = pathService.join(marketplacesRoot, marketplaceName, "plugins", name);

        const exists = yield* fs.exists(candidate).pipe(
          Effect.orElseSucceed(() => false),
        );

        if (exists) {
          yield* fs.remove(candidate, { recursive: true }).pipe(
            Effect.mapError(
              (e) =>
                new PluginError({
                  detail: `Failed to remove plugin "${name}": ${String(e)}`,
                  cause: e,
                }),
            ),
          );
          return;
        }
      }

      // No marketplace contained a plugin with this name.
      return yield* new PluginError({ detail: `Plugin not found: ${name}` });
    });

  return { list, install, remove } satisfies PluginServiceShape;
});

// ── Live layer ───────────────────────────────────────────────────────────────

export const PluginServiceLive = Layer.effect(PluginService, makePluginService);
