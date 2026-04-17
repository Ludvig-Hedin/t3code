/**
 * modelDisplayName — converts raw provider model slugs into short, human-readable labels.
 *
 * The canonical slugs (after alias resolution via MODEL_SLUG_ALIASES_BY_PROVIDER)
 * use hyphens and dots for version numbers, e.g. "claude-sonnet-4-6", "gpt-5.4".
 * The pattern-based fallback handles future or custom slugs gracefully.
 */

/**
 * Exact-match map for all known canonical slugs used in this codebase.
 * Always check here first before falling through to pattern heuristics.
 */
const KNOWN_MODEL_DISPLAY_NAMES: Record<string, string> = {
  // ── Claude ────────────────────────────────────────────────────────────
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-opus-4-7": "Claude Opus 4.7",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-opus-4": "Claude Opus 4",
  "claude-sonnet-4": "Claude Sonnet 4",
  "claude-haiku-4": "Claude Haiku 4",
  // Legacy 3.x slugs (still appear in older sessions)
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
  "claude-3-opus-20240229": "Claude 3 Opus",
  "claude-3-sonnet-20240229": "Claude 3 Sonnet",
  "claude-3-haiku-20240307": "Claude 3 Haiku",

  // ── Codex / GPT ───────────────────────────────────────────────────────
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 mini",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
  "gpt-5.1-codex-mini": "GPT-5.1 Codex mini",
  "gpt-5.1-codex-max": "GPT-5.1 Codex max",
  "codex-mini-latest": "Codex mini",
  "gpt-4o": "GPT-4o",
  "gpt-4o-mini": "GPT-4o mini",
  o1: "o1",
  "o1-mini": "o1 mini",
  o3: "o3",
  "o3-mini": "o3 mini",
  "o4-mini": "o4 mini",

  // ── Gemini ────────────────────────────────────────────────────────────
  "gemini-2.5-pro": "Gemini 2.5 Pro",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-flash-lite": "Gemini 2.5 Flash Lite",
  "gemini-3-pro-preview": "Gemini 3 Pro",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "gemini-3-flash-preview": "Gemini 3 Flash",

  // ── Manifest (auto-router) ─────────────────────────────────────────────
  auto: "Auto",
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a raw model slug into a short, readable display name.
 *
 * Priority:
 *  1. Exact match in KNOWN_MODEL_DISPLAY_NAMES
 *  2. Pattern heuristics (claude / gemini / gpt / llama)
 *  3. Generic fallback: split on hyphens, title-case
 */
export function formatModelDisplayName(slug: string): string {
  if (!slug) return slug;

  // 1. Exact match
  const exact = KNOWN_MODEL_DISPLAY_NAMES[slug];
  if (exact) return exact;

  // 2. Strip provider namespace (e.g. "moonshot/kimi-k2-5" → recurse on "kimi-k2-5")
  if (slug.includes("/")) {
    const afterSlash = slug.slice(slug.indexOf("/") + 1);
    return formatModelDisplayName(afterSlash);
  }

  // 3. Claude pattern: claude-{tier(letters)}-{major}-{minor}[-{date}]
  //    e.g. "claude-sonnet-4-6" → "Claude Sonnet 4.6"
  //    Guard: if the captured "minor" is 6+ digits it is a date suffix
  //    (e.g. "20241022"), not a real minor version — fall through to claudeSimple.
  const claudeVersioned = slug.match(/^claude-([a-z]+)-(\d+)-(\d+)(?:-\d+)?$/);
  if (claudeVersioned) {
    const [, tier, major, minor] = claudeVersioned;
    if (minor!.length < 6) {
      return `Claude ${capitalize(tier!)} ${major}.${minor}`;
    }
    // Looks like a date — treat as major-version-only (claudeSimple path).
    return `Claude ${capitalize(tier!)} ${major}`;
  }
  // Claude without minor: claude-{tier}-{major}[-{date}]
  const claudeSimple = slug.match(/^claude-([a-z]+)-(\d+)(?:-\d+)?$/);
  if (claudeSimple) {
    const [, tier, major] = claudeSimple;
    return `Claude ${capitalize(tier!)} ${major}`;
  }

  // 4. Gemini pattern: gemini-{version}-{rest}[-preview]
  //    e.g. "gemini-2.5-flash-lite" → "Gemini 2.5 Flash Lite"
  //         "gemini-3-pro-preview"  → "Gemini 3 Pro"
  const geminiMatch = slug.match(/^gemini-([\d.]+)-(.+)$/);
  if (geminiMatch) {
    const [, version, rest] = geminiMatch;
    // Strip "-preview" suffix if present
    const name = rest!.replace(/-preview$/, "");
    const nameWords = name.split("-").map(capitalize).join(" ");
    return `Gemini ${version} ${nameWords}`;
  }

  // 5. GPT pattern: gpt-{version}[-{rest}]
  //    e.g. "gpt-5.4" → "GPT-5.4", "gpt-5.4-mini" → "GPT-5.4 mini"
  const gptMatch = slug.match(/^gpt-([\d.]+)(?:-(.+))?$/);
  if (gptMatch) {
    const [, version, rest] = gptMatch;
    return rest ? `GPT-${version} ${rest}` : `GPT-${version}`;
  }

  // 6. Llama pattern: llama{version} or llama-{version}
  const llamaMatch = slug.match(/^llama-?(.+)$/i);
  if (llamaMatch) {
    return `Llama ${llamaMatch[1]}`;
  }

  // 7. Generic fallback: title-case each hyphen-separated part
  return slug.split("-").map(capitalize).join(" ");
}
