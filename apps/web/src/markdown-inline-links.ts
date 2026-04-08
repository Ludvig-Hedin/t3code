/**
 * markdown-inline-links.ts
 *
 * Custom remark plugin that auto-detects URLs and file paths embedded in
 * plain markdown text nodes and converts them to clickable link nodes.
 *
 * WHY: react-markdown + remark-gfm already handle `https://` links, but miss:
 *   - bare localhost URLs (localhost:3000)
 *   - malformed protocol URLs (http//:host, https//:host)
 *   - common bare domains (apple.com, github.com, etc.)
 *   - absolute/relative file paths in regular prose (/Users/john/file.ts)
 *
 * The plugin walks the mdast (markdown AST) and mutates text nodes into
 * sequences of text + link nodes. It safely skips text inside `code`,
 * `inlineCode`, `link`, and `linkReference` nodes so existing rendering
 * is never broken.
 */

// ---------------------------------------------------------------------------
// Minimal mdast-compatible type definitions
// We define them inline to avoid a direct @types/mdast dependency (transitive only).
// Using `unknown` casts at call sites avoids index-signature conflicts.
// ---------------------------------------------------------------------------

type MdastData = Record<string, unknown>;

// Generic AST node — intentionally loose so we can store any node
// without fighting index-signature constraints.
type MdastNode = {
  type: string;
  data?: MdastData;
  [key: string]: unknown;
};

type MdastParent = MdastNode & {
  children: MdastNode[];
};

type MdastText = MdastNode & {
  type: "text";
  value: string;
};

type MdastTextChild = {
  type: "text";
  value: string;
};

type MdastLink = MdastNode & {
  type: "link";
  url: string;
  title: string | null;
  data?: MdastData;
  children: MdastTextChild[];
};

type MdastRoot = MdastNode & {
  type: "root";
  children: MdastNode[];
};

// ---------------------------------------------------------------------------
// Pattern constants
// ---------------------------------------------------------------------------

/**
 * Node types whose descendant text nodes must NOT be rewritten.
 * - code / inlineCode: already rendered as monospace, not prose
 * - link / linkReference: already a link; don't double-wrap
 * - image / imageReference: has alt text but isn't interactive prose
 * - html: raw HTML; don't touch
 */
const SKIP_NODE_TYPES = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "html",
]);

/**
 * Common TLDs to recognise for bare domain matching (e.g. "apple.com").
 * Deliberately conservative — we avoid short ambiguous extensions (.js, .ts)
 * that clash with file extensions commonly appearing in code discussions.
 */
const KNOWN_TLDS =
  "com|org|net|io|dev|app|co|ai|gg|info|edu|gov|us|uk|de|fr|jp|ca|au|nl|se|no|dk|fi|ch|be|at|es|it|pt|pl|cz|ru|br|mx|in|sg|nz|ie|za|is|hu|gr|ro|bg|hr|sk|lt|lv|ee|si|cy|lu|mt";

/**
 * Combined pattern that finds all auto-linkable patterns in order of priority:
 *
 * Group 1 — Malformed protocol  (http// or https// missing colon, with optional ":")
 *           e.g. "http//:localhost:3000" → normalise to "http://localhost:3000"
 * Group 2 — Bare localhost[:port][/path]
 *           e.g. "localhost:3000/api/foo"
 * Group 3 — Standard URL already starting with http(s):// or ftp://
 *           (remark-gfm handles these via autolink literals, but we handle
 *            them here too so they go through our openExternal handler)
 * Group 4 — Bare domain with known TLD
 *           e.g. "apple.com", "github.com/foo/bar"
 *
 * IMPORTANT: This regex must never match inside backtick code. The plugin
 * ensures we only call it on plain `text` nodes.
 */
const INLINE_URL_PATTERN = new RegExp(
  [
    // Group 1: malformed protocol (http// or https//:…)
    "(https?)//:([^\\s<>\"'`]+)",
    // Group 2: localhost with optional port + path
    "(localhost(?::\\d{1,5})?(?:/[^\\s<>\"'`]*)?)",
    // Group 3: standard URL
    "(https?://[^\\s<>\"'`]+)",
    // Group 4: bare domain.tld (only common TLDs to avoid false positives)
    `((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\\.)+(?:${KNOWN_TLDS})(?:/[^\\s<>"'\`]*)?)`,
  ].join("|"),
  "g",
);

/**
 * File path pattern — matches the most common path forms that appear in
 * plain prose:
 *   /absolute/posix/path           (must start at a known root prefix)
 *   ~/home/relative/path
 *   C:\Windows\absolute\path  /  C:/Windows/path
 *   \\UNC\share\path
 *   apps/web/src/file.ts           (relative, at least 2 path components)
 *
 * We require at least one `/` separator to avoid single-word false positives.
 * A trailing :LINE or :LINE:COL position suffix is captured too.
 */
const FILE_PATH_PATTERN = new RegExp(
  [
    // Absolute POSIX or home-relative
    "(?:~\\/|(?:\\/(?:Users|home|tmp|var|etc|opt|mnt|Volumes|private|root)\\/)[^\\s<>\"'`]+)",
    // Windows absolute: C:\ or C:/
    "|(?:[A-Za-z]:[/\\\\][^\\s<>\"'`]+)",
    // Windows UNC: \\server\share
    "|(?:\\\\\\\\[^\\s<>\"'`]+)",
    // Relative path with at least 2 components (word/word or word/word/more)
    // Must not start with http(s):// so we don't double-match URLs
    "|(?:(?![a-zA-Z][a-zA-Z0-9+.-]*:\\/\\/)(?:[A-Za-z0-9._-]+\\/)+[A-Za-z0-9._-]+(?::\\d+(?::\\d+)?)?)",
  ].join(""),
  "g",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseUrl(raw: string): string {
  // Normalise malformed protocol: http//:host → http://host
  const malformed = raw.match(/^(https?)\/\/:(.*)/);
  if (malformed) {
    return `${malformed[1]}://${malformed[2]}`;
  }
  // Bare localhost
  if (/^localhost(:\d+)?(\/.*)?$/.test(raw)) {
    return `http://${raw}`;
  }
  // Bare domain (no protocol)
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

/** Trim trailing punctuation and unbalanced closing brackets from a match. */
function trimTrailing(value: string): string {
  // Strip trailing punctuation
  let out = value.replace(/[.,;:!?]+$/, "");
  // Trim unbalanced closing delimiters
  const trimUnbalanced = (open: string, close: string) => {
    while (out.endsWith(close)) {
      const opens = out.split(open).length - 1;
      const closes = out.split(close).length - 1;
      if (opens >= closes) break;
      out = out.slice(0, -1);
    }
  };
  trimUnbalanced("(", ")");
  trimUnbalanced("[", "]");
  trimUnbalanced("{", "}");
  return out;
}

// ---------------------------------------------------------------------------
// Match types
// ---------------------------------------------------------------------------

interface UrlMatch {
  kind: "url";
  raw: string;
  href: string;
  start: number;
  end: number;
}

interface PathMatch {
  kind: "path";
  raw: string;
  start: number;
  end: number;
}

type InlineMatch = UrlMatch | PathMatch;

function findUrlMatches(text: string): UrlMatch[] {
  const matches: UrlMatch[] = [];
  INLINE_URL_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(INLINE_URL_PATTERN)) {
    const raw = trimTrailing(m[0]);
    if (!raw) continue;
    const start = m.index ?? 0;
    const end = start + raw.length;
    matches.push({ kind: "url", raw, href: normaliseUrl(raw), start, end });
  }
  return matches;
}

function findPathMatches(text: string, existing: InlineMatch[]): PathMatch[] {
  const matches: PathMatch[] = [];
  FILE_PATH_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(FILE_PATH_PATTERN)) {
    const raw = trimTrailing(m[0]);
    if (!raw || raw.length < 3) continue;
    const start = m.index ?? 0;
    const end = start + raw.length;
    // Skip if this range overlaps an existing URL match
    const overlaps = existing.some((e) => start < e.end && end > e.start);
    if (overlaps) continue;
    matches.push({ kind: "path", raw, start, end });
  }
  return matches;
}

/**
 * Collect all URL + file-path matches for a text string, sorted by position.
 */
function collectMatches(text: string): InlineMatch[] {
  const urlMatches = findUrlMatches(text);
  const pathMatches = findPathMatches(text, urlMatches);
  return [...urlMatches, ...pathMatches].toSorted((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function makeTextNode(value: string): MdastText {
  return { type: "text", value };
}

function makeUrlLinkNode(match: UrlMatch): MdastLink {
  return {
    type: "link",
    url: match.href,
    title: null,
    // Mark with custom data so the ChatMarkdown `a` renderer can distinguish
    // auto-detected URLs from existing markdown links.
    // hast-util-to-jsx-runtime copies hProperties to the rendered element.
    data: { hProperties: { "data-auto-link": "url" } },
    children: [{ type: "text", value: match.raw }],
  };
}

function makePathLinkNode(match: PathMatch): MdastLink {
  return {
    type: "link",
    url: match.raw,
    title: null,
    data: { hProperties: { "data-auto-link": "path" } },
    children: [{ type: "text", value: match.raw }],
  };
}

/**
 * Rewrite a single text node into an array of text + link nodes.
 * Returns the original node (in a single-element array) if no matches.
 */
function rewriteTextNode(node: MdastText): Array<MdastText | MdastLink> {
  const matches = collectMatches(node.value);
  if (matches.length === 0) return [node];

  const result: Array<MdastText | MdastLink> = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      result.push(makeTextNode(node.value.slice(cursor, match.start)));
    }
    result.push(match.kind === "url" ? makeUrlLinkNode(match) : makePathLinkNode(match));
    cursor = match.end;
  }

  if (cursor < node.value.length) {
    result.push(makeTextNode(node.value.slice(cursor)));
  }

  return result;
}

// ---------------------------------------------------------------------------
// AST walker
// ---------------------------------------------------------------------------

/**
 * Recursively walk the mdast and rewrite text nodes.
 * Mutates the tree in place — this is standard remark plugin behaviour.
 */
function walkAndRewrite(node: MdastNode, skipAncestor: boolean): void {
  if (!("children" in node) || !Array.isArray(node.children)) return;

  // Cast to parent now that we've confirmed it has children
  const parent = node as MdastParent;
  const nextChildren: MdastNode[] = [];
  let modified = false;

  for (const child of parent.children) {
    // If we're already inside a skip-type ancestor, pass through unchanged.
    // Also check if this child is itself a skip-type node.
    const childSkip = skipAncestor || SKIP_NODE_TYPES.has(child.type);

    if (!childSkip && child.type === "text") {
      const textNode = child as MdastText;
      const replacements = rewriteTextNode(textNode);
      if (replacements.length !== 1 || replacements[0] !== textNode) {
        for (const r of replacements) nextChildren.push(r as MdastNode);
        modified = true;
        continue;
      }
    }

    // Recurse into block/inline elements
    if ("children" in child) {
      walkAndRewrite(child, childSkip);
    }

    nextChildren.push(child);
  }

  if (modified) {
    parent.children = nextChildren;
  }
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

/**
 * remarkInlineLinks — a zero-dependency remark plugin.
 *
 * Usage:
 *   <ReactMarkdown remarkPlugins={[remarkGfm, remarkInlineLinks]}>
 */
export function remarkInlineLinks() {
  return (tree: MdastRoot) => {
    walkAndRewrite(tree as MdastNode, false);
  };
}
