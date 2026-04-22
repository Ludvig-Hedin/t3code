/**
 * File-contents search for the Files panel.
 *
 * Prefers ripgrep (`rg`) for speed and gitignore awareness. Falls back to a
 * bounded JS grep over the workspace index when `rg` is not on PATH, so the
 * feature still works on minimal environments. The `ripgrepAvailable` flag on
 * the result lets the UI surface a hint.
 *
 * Kept as a plain Effect function (not a service) because it is stateless and
 * self-contained: no caching, no platform resources beyond a short-lived child
 * process.
 *
 * @module workspace/contentSearch
 */
import fsPromises from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { Effect } from "effect";

import {
  type ProjectEntry,
  type ProjectFileContentHit,
  type ProjectSearchFileContentsInput,
  type ProjectSearchFileContentsResult,
  PROJECT_SEARCH_ENTRIES_MAX_LIMIT,
  ProjectSearchFileContentsError,
} from "@t3tools/contracts";

import { isCommandAvailable } from "../open.ts";
import { WorkspaceEntries } from "./Services/WorkspaceEntries.ts";

// Per-file match cap protects the UI from dumping thousands of hits from a
// single generated file (e.g. a minified bundle containing a common token).
const PER_FILE_MATCH_CAP = 20;
// Hard ceiling on preview line length so a single very long line cannot blow
// up the response size. `rg` doesn't trim by default.
const PREVIEW_MAX_LENGTH = 400;
// Overall timeout for the spawned ripgrep process. Any longer than this and
// the search is almost certainly unhelpful anyway.
const RIPGREP_TIMEOUT_MS = 15_000;

interface RipgrepMatchData {
  readonly path?: { text?: string };
  readonly lines?: { text?: string };
  readonly line_number?: number;
  readonly absolute_offset?: number;
  readonly submatches?: ReadonlyArray<{
    readonly start?: number;
    readonly end?: number;
  }>;
}

interface RipgrepMessage {
  readonly type: string;
  readonly data?: RipgrepMatchData;
}

function truncatePreview(line: string): string {
  if (line.length <= PREVIEW_MAX_LENGTH) return line;
  return `${line.slice(0, PREVIEW_MAX_LENGTH)}…`;
}

/**
 * Ripgrep JSON submatch `start` / `end` are UTF-8 **byte** offsets into the
 * matched line. The UI highlights using JavaScript string indices (UTF-16 code
 * units), so we map byte positions to code-unit indices.
 */
function utf8ByteOffsetToCodeUnitIndex(line: string, byteOffset: number): number {
  if (byteOffset <= 0) return 0;
  let utf8Pos = 0;
  let codeUnitIndex = 0;
  for (const ch of line) {
    const charUtf8Len = Buffer.byteLength(ch, "utf8");
    if (utf8Pos + charUtf8Len > byteOffset) {
      return codeUnitIndex;
    }
    utf8Pos += charUtf8Len;
    codeUnitIndex += ch.length;
  }
  return codeUnitIndex;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRipgrepArgs(input: ProjectSearchFileContentsInput): string[] {
  const args = [
    "--json",
    "--no-messages",
    "--color=never",
    // Ripgrep already respects .gitignore by default. We explicitly opt out of
    // hidden files so behavior matches the Files-panel tree listing.
    "--max-count",
    String(PER_FILE_MATCH_CAP),
  ];
  if (!input.caseSensitive) args.push("--ignore-case");
  if (!input.useRegex) args.push("--fixed-strings");
  args.push("--", input.query);
  return args;
}

function runRipgrep(
  cwd: string,
  input: ProjectSearchFileContentsInput,
): Effect.Effect<
  { hits: ProjectFileContentHit[]; truncated: boolean },
  ProjectSearchFileContentsError
> {
  return Effect.callback<
    { hits: ProjectFileContentHit[]; truncated: boolean },
    ProjectSearchFileContentsError
  >((resume) => {
    const child = spawn("rg", buildRipgrepArgs(input), {
      cwd,
      // stderr is unused; piping it without a consumer can stall the process.
      stdio: ["ignore", "pipe", "ignore"],
    });

    const hits: ProjectFileContentHit[] = [];
    let truncated = false;
    let buffer = "";
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      // rg ran too long — terminate it and return what we have so far rather
      // than failing outright.
      truncated = true;
      child.kill("SIGTERM");
    }, RIPGREP_TIMEOUT_MS);

    const detachStreams = () => {
      child.stdout?.removeAllListeners();
      child.removeAllListeners();
    };

    const finish = (result: { hits: ProjectFileContentHit[]; truncated: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      detachStreams();
      resume(Effect.succeed(result));
    };

    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      detachStreams();
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore if the process is already gone.
      }
      resume(
        Effect.fail(
          new ProjectSearchFileContentsError({
            message: `ripgrep failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
          }),
        ),
      );
    };

    const processLine = (rawLine: string) => {
      if (!rawLine) return;
      let parsed: RipgrepMessage;
      try {
        parsed = JSON.parse(rawLine) as RipgrepMessage;
      } catch {
        return;
      }
      if (parsed.type !== "match" || !parsed.data) return;
      const data = parsed.data;
      const relativePath = data.path?.text;
      const previewLine = data.lines?.text ?? "";
      const lineNumber = data.line_number ?? 1;
      const firstSubmatch = data.submatches?.[0];
      const startBytes = firstSubmatch?.start ?? 0;
      const endBytes = firstSubmatch?.end ?? startBytes;
      if (!relativePath) return;

      const displayLine = previewLine.replace(/\r?\n$/u, "");
      let matchStart = utf8ByteOffsetToCodeUnitIndex(displayLine, startBytes);
      let matchEnd = utf8ByteOffsetToCodeUnitIndex(displayLine, endBytes);
      const preview = truncatePreview(displayLine);
      const previewLen = preview.length;
      matchStart = Math.min(matchStart, previewLen);
      matchEnd = Math.min(Math.max(matchEnd, matchStart), previewLen);

      // Column is 1-based (VS Code-style). matchStart/matchEnd are code-unit
      // indices into `preview` for highlighting.
      hits.push({
        relativePath,
        line: Math.max(1, lineNumber),
        column: Math.max(1, Math.min(matchStart + 1, Math.max(1, previewLen))),
        preview,
        matchStart,
        matchEnd,
      });

      if (hits.length >= input.limit) {
        truncated = true;
        child.kill("SIGTERM");
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        processLine(buffer.slice(0, newlineIndex));
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }
    });

    child.on("error", fail);
    child.on("close", () => {
      if (buffer.length > 0) processLine(buffer);
      finish({ hits, truncated });
    });

    // On interruption, nudge the child to exit; `close` runs `finish` so we
    // still resume exactly once. Do not strip listeners here — that would
    // strand the callback without `resume`.
    return Effect.sync(() => {
      clearTimeout(timeoutHandle);
      if (settled) return;
      try {
        child.kill("SIGTERM");
      } catch {
        // Ignore if the process is already gone.
      }
    });
  });
}

function buildJsMatcher(
  input: ProjectSearchFileContentsInput,
): (line: string) => { start: number; end: number } | null {
  const flags = input.caseSensitive ? "g" : "gi";
  const pattern = input.useRegex ? input.query : escapeRegex(input.query);
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    // Invalid user regex — fall back to literal match so search never hard-fails.
    regex = new RegExp(escapeRegex(input.query), flags);
  }
  return (line) => {
    regex.lastIndex = 0;
    const match = regex.exec(line);
    if (!match) return null;
    return { start: match.index, end: match.index + match[0].length };
  };
}

function runJsGrep(
  cwd: string,
  files: ReadonlyArray<ProjectEntry>,
  input: ProjectSearchFileContentsInput,
): Effect.Effect<
  { hits: ProjectFileContentHit[]; truncated: boolean },
  ProjectSearchFileContentsError
> {
  return Effect.tryPromise({
    try: async () => {
      const matcher = buildJsMatcher(input);
      const hits: ProjectFileContentHit[] = [];
      let truncated = false;

      for (const entry of files) {
        if (entry.kind !== "file") continue;
        if (hits.length >= input.limit) {
          truncated = true;
          break;
        }

        let content: string;
        try {
          content = await fsPromises.readFile(path.join(cwd, entry.path), "utf8");
        } catch {
          // Binary / permissions — skip silently.
          continue;
        }

        // Skip files that look binary (NUL byte in first 4 KB).
        if (content.slice(0, 4096).includes("\u0000")) continue;

        const lines = content.split(/\r?\n/);
        let perFileMatches = 0;
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i] ?? "";
          const match = matcher(line);
          if (!match) continue;
          const preview = truncatePreview(line);
          const previewLen = preview.length;
          const matchStart = Math.min(match.start, previewLen);
          const matchEnd = Math.min(Math.max(match.end, matchStart), previewLen);
          hits.push({
            relativePath: entry.path,
            line: i + 1,
            column: Math.max(1, Math.min(matchStart + 1, Math.max(1, previewLen))),
            preview,
            matchStart,
            matchEnd,
          });
          perFileMatches += 1;
          if (perFileMatches >= PER_FILE_MATCH_CAP) break;
          if (hits.length >= input.limit) {
            truncated = true;
            break;
          }
        }
        if (hits.length >= input.limit) {
          truncated = true;
          break;
        }
      }

      return { hits, truncated };
    },
    catch: (cause) =>
      new ProjectSearchFileContentsError({
        message: `JS content search failed: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause,
      }),
  });
}

/**
 * Run the content search and return hits.
 *
 * Transparently picks the best available engine:
 * - If `rg` is on PATH (and not explicitly disabled by env), we use it.
 * - Otherwise we run a bounded JS grep over a fresh workspace index so
 *   behaviour is consistent with the file-name search on the same host.
 */
export const searchFileContents = Effect.fn("workspace.contentSearch.searchFileContents")(
  function* (input: ProjectSearchFileContentsInput) {
    const workspaceEntries = yield* WorkspaceEntries;
    const ripgrepAvailable = isCommandAvailable("rg");

    if (ripgrepAvailable) {
      const { hits, truncated } = yield* runRipgrep(input.cwd, input);
      const result: ProjectSearchFileContentsResult = {
        hits,
        truncated,
        ripgrepAvailable: true,
      };
      return result;
    }

    // Fallback: grep the workspace index. Match the index cap so large
    // projects are not silently skipped; `truncated` reflects either hit-limit or
    // index truncation.
    const index = yield* workspaceEntries
      .search({ cwd: input.cwd, query: "", limit: PROJECT_SEARCH_ENTRIES_MAX_LIMIT })
      .pipe(
        Effect.mapError(
          (cause) =>
            new ProjectSearchFileContentsError({
              message: `Failed to list workspace for content search: ${cause.detail}`,
              cause,
            }),
        ),
      );

    const { hits, truncated } = yield* runJsGrep(input.cwd, index.entries, input);
    const result: ProjectSearchFileContentsResult = {
      hits,
      truncated: truncated || index.truncated,
      ripgrepAvailable: false,
    };
    return result;
  },
);
