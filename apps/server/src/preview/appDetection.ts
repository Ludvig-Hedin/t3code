// apps/server/src/preview/appDetection.ts
import path from "node:path";

export type PackageManager = "bun" | "pnpm" | "yarn" | "npm";
export type PreviewType = "browser" | "logs";

export interface DetectionEntry {
  /** Relative path from project root, e.g. "apps/web/package.json" */
  relativePath: string;
  hasDevScript: boolean;
  hasBunLock: boolean;
}

export interface DetectionCandidate {
  id: string;
  label: string;
  command: string;
  cwd: string;
  type: PreviewType;
}

/** Port patterns emitted by common dev servers. Returns port number or null. */
export function detectPortFromLine(line: string): number | null {
  const patterns = [
    // Vite: ➜  Local:   http://localhost:5173/
    /localhost:(\d+)/i,
    // Any 127.0.0.1:PORT
    /127\.0\.0\.1:(\d+)/,
    // 0.0.0.0:PORT (django, flask, etc.)
    /(?:0\.0\.0\.0):(\d+)/,
    // "Listening on port N"
    /listening on port\s+(\d+)/i,
    // "started server on 0.0.0.0:PORT" (next.js)
    /started server on .*?:(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (match?.[1]) {
      const port = parseInt(match[1], 10);
      if (port > 0 && port < 65536) {
        return port;
      }
    }
  }
  return null;
}

export function detectPackageManager(fileNames: string[]): PackageManager {
  const set = new Set(fileNames);
  if (set.has("bun.lock") || set.has("bun.lockb")) return "bun";
  if (set.has("pnpm-lock.yaml")) return "pnpm";
  if (set.has("yarn.lock")) return "yarn";
  return "npm";
}

/**
 * Rules for matching common monorepo app directories to their metadata.
 * Order matters: more specific paths first.
 */
const KNOWN_SUBDIRS: Array<{
  pathFragment: string;
  id: string;
  label: string;
  type: PreviewType;
}> = [
  { pathFragment: "apps/web", id: "web", label: "Web", type: "browser" },
  { pathFragment: "apps/server", id: "server", label: "Server", type: "logs" },
  { pathFragment: "apps/desktop", id: "desktop", label: "Desktop", type: "logs" },
  { pathFragment: "apps/mobile", id: "mobile", label: "Mobile", type: "logs" },
  { pathFragment: "apps/marketing", id: "marketing", label: "Marketing", type: "browser" },
  { pathFragment: "apps/api", id: "api", label: "API", type: "logs" },
  { pathFragment: "packages/", id: "", label: "", type: "logs" }, // skip packages/
];

function devCommand(pm: PackageManager): string {
  if (pm === "bun") return "bun run dev";
  if (pm === "pnpm") return "pnpm run dev";
  if (pm === "yarn") return "yarn dev";
  return "npm run dev";
}

/** Build detection candidates from a list of scanned filesystem entries. */
export function buildDetectionCandidates(
  projectRoot: string,
  entries: DetectionEntry[],
): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  const seenIds = new Set<string>();

  // Detect package manager from root-level lock files (basenames only).
  // Also synthesise a "bun.lock" entry when any entry carries hasBunLock: true,
  // because the caller may not include the lockfile as a separate DetectionEntry.
  const rootFiles = entries.map((e) => path.basename(e.relativePath));
  if (entries.some((e) => e.hasBunLock) && !rootFiles.includes("bun.lock")) {
    rootFiles.push("bun.lock");
  }
  const pm = detectPackageManager(rootFiles);

  for (const entry of entries) {
    const rel = entry.relativePath.replace(/\\/g, "/");

    // --- manage.py → Django ---
    if (rel === "manage.py") {
      const id = "api";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "API",
          command: "python manage.py runserver",
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    // --- pyproject.toml at root → Python app ---
    if (rel === "pyproject.toml") {
      const id = "api";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "API",
          command: "python -m uvicorn main:app --reload",
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    // --- Cargo.toml at root → Rust ---
    if (rel === "Cargo.toml") {
      const id = "app";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "App",
          command: "cargo run",
          cwd: projectRoot,
          type: "logs",
        });
      }
      continue;
    }

    // --- package.json files ---
    if (!rel.endsWith("package.json") || !entry.hasDevScript) continue;

    const dir = path.dirname(rel); // ".", "apps/web", etc.
    const absCwd = dir === "." ? projectRoot : path.join(projectRoot, dir);

    // Check for known sub-directory patterns
    const known = KNOWN_SUBDIRS.find((k) =>
      k.pathFragment ? rel.startsWith(k.pathFragment) : false,
    );

    // Skip packages/ dirs
    if (known && known.id === "") continue;

    // Root package.json
    if (dir === ".") {
      const id = "web";
      if (!seenIds.has(id)) {
        seenIds.add(id);
        candidates.push({
          id,
          label: "Web",
          command: devCommand(pm),
          cwd: projectRoot,
          type: "browser",
        });
      }
      continue;
    }

    if (known) {
      if (!seenIds.has(known.id)) {
        seenIds.add(known.id);
        candidates.push({
          id: known.id,
          label: known.label,
          command: devCommand(pm),
          cwd: absCwd,
          type: known.type,
        });
      }
      continue;
    }

    // Unknown package.json with dev script — use directory name as id
    const dirName = path.basename(dir);
    const unknownId = dirName || "app";
    if (!seenIds.has(unknownId)) {
      seenIds.add(unknownId);
      candidates.push({
        id: unknownId,
        label: dirName,
        command: devCommand(pm),
        cwd: absCwd,
        type: "browser",
      });
    }
  }

  return candidates;
}
