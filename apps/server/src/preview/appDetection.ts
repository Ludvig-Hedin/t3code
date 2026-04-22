// apps/server/src/preview/appDetection.ts
import path from "node:path";

import type { PreviewFileItem } from "@t3tools/contracts";

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

export type StandalonePreviewKind = "html" | "markdown" | "tsx" | "docx";

const STANDALONE_PREVIEW_COMMAND_PREFIX = "preview-file";

interface StandalonePreviewPayload {
  readonly relativePath: string;
  readonly kind: StandalonePreviewKind;
}

function encodeStandalonePreviewPayload(payload: StandalonePreviewPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function createStandalonePreviewCommand(input: StandalonePreviewPayload): string {
  return `${STANDALONE_PREVIEW_COMMAND_PREFIX} ${encodeStandalonePreviewPayload(input)}`;
}

function decodeStandalonePreviewCommand(command: string): StandalonePreviewPayload | null {
  const [prefix, payload] = command.trim().split(/\s+/, 2);
  if (prefix !== STANDALONE_PREVIEW_COMMAND_PREFIX || !payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<StandalonePreviewPayload>;
    if (
      typeof parsed.relativePath !== "string" ||
      typeof parsed.kind !== "string" ||
      !["html", "markdown", "tsx", "docx"].includes(parsed.kind)
    ) {
      return null;
    }

    return { relativePath: parsed.relativePath, kind: parsed.kind };
  } catch {
    return null;
  }
}

export function parseStandalonePreviewCommand(command: string): StandalonePreviewPayload | null {
  return decodeStandalonePreviewCommand(command);
}

/** All previewable standalone files from scanned entries (not deduped by kind). */
export function listPreviewFileItemsFromEntries(entries: DetectionEntry[]): PreviewFileItem[] {
  const items: PreviewFileItem[] = [];
  for (const entry of entries) {
    const rel = entry.relativePath.replace(/\\/g, "/");
    const base = path.basename(rel);
    const rule = STANDALONE_FILE_PREVIEW_RULES.find((r) => base.toLowerCase().endsWith(r.ext));
    if (rule) {
      items.push({ relativePath: rel, label: base, kind: rule.kind });
    }
  }
  items.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return items;
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

const STANDALONE_FILE_PREVIEW_RULES: Array<{
  ext: string;
  kind: StandalonePreviewKind;
  id: string;
  label: string;
}> = [
  { ext: ".html", kind: "html", id: "html", label: "HTML" },
  { ext: ".htm", kind: "html", id: "html", label: "HTML" },
  { ext: ".md", kind: "markdown", id: "markdown", label: "Markdown" },
  { ext: ".mdx", kind: "markdown", id: "markdown", label: "Markdown" },
  { ext: ".tsx", kind: "tsx", id: "tsx", label: "TSX" },
  { ext: ".jsx", kind: "tsx", id: "tsx", label: "JSX" },
  { ext: ".docx", kind: "docx", id: "docx", label: "Docx" },
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
  const standaloneCandidates = new Map<string, DetectionCandidate>();

  for (const entry of entries) {
    const rel = entry.relativePath.replace(/\\/g, "/");
    const basename = path.basename(rel);

    const standaloneRule = STANDALONE_FILE_PREVIEW_RULES.find((rule) =>
      basename.toLowerCase().endsWith(rule.ext),
    );
    if (standaloneRule) {
      const id = standaloneRule.id;
      if (!seenIds.has(id) && !standaloneCandidates.has(id)) {
        standaloneCandidates.set(id, {
          id,
          // Use the actual filename (e.g. "README.md") rather than the generic
          // kind label (e.g. "Markdown") so the tab is immediately recognisable.
          label: path.basename(rel),
          command: createStandalonePreviewCommand({
            relativePath: rel,
            kind: standaloneRule.kind,
          }),
          cwd: projectRoot,
          type: "browser",
        });
      }
    }

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

  for (const candidate of standaloneCandidates.values()) {
    if (!seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      candidates.push(candidate);
    }
  }

  candidates.sort((left, right) => {
    const order: Record<string, number> = {
      html: 0,
      markdown: 1,
      tsx: 2,
      docx: 3,
      web: 10,
      api: 20,
      app: 30,
      server: 40,
      desktop: 50,
      mobile: 60,
      marketing: 70,
    };
    const leftOrder = order[left.id] ?? 100;
    const rightOrder = order[right.id] ?? 100;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.label.localeCompare(right.label);
  });

  return candidates;
}
