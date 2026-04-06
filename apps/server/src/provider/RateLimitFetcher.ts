/**
 * RateLimitFetcher — reads provider credentials from disk / macOS keychain
 * (the same sources as codexbar) and calls the provider usage REST APIs
 * directly, without requiring an active coding session in this app.
 *
 * Codex:  ~/.codex/auth.json  →  tokens.access_token + account_id
 *         GET https://chatgpt.com/backend-api/wham/usage
 *
 * Claude: macOS keychain "Claude Code-credentials"  →  claudeAiOauth.accessToken
 *         GET https://api.anthropic.com/api/oauth/usage
 *
 * Results are returned as `ProviderRateLimitEntry` items using the normalized
 * `FetchedRateLimits` shape (discriminated by `_source: "api"`).
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ProviderRateLimitEntry } from "@t3tools/contracts";

// ---------------------------------------------------------------------------
// Normalized format stored in ProviderRateLimitEntry.rateLimits
// ---------------------------------------------------------------------------

export interface RateLimitWindow {
  id: string; // "primary", "secondary", "five_hour", "seven_day", etc.
  label: string; // "5h session", "Weekly", "Sonnet (weekly)"
  usedPercent: number; // 0–100
  resetsAt: number; // Unix timestamp, seconds
}

export interface FetchedRateLimits {
  _source: "api"; // discriminator so the client can detect this format
  windows: RateLimitWindow[];
  planType?: string;
  credits?: { balance: string; unlimited: boolean };
  extraUsage?: {
    usedCredits: number;
    monthlyLimit: number;
    usedPercent: number;
    currency?: string;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function windowLabel(seconds: number): string {
  const mins = seconds / 60;
  if (mins < 60) return `${mins}m session`;
  const h = mins / 60;
  if (h < 24) return `${h}h session`;
  const d = h / 24;
  return d === 7 ? "Weekly" : `${d}d window`;
}

function isoToUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

// ---------------------------------------------------------------------------
// Codex  (reads ~/.codex/auth.json)
// ---------------------------------------------------------------------------

interface CodexAuthJson {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
}

interface CodexWhamWindow {
  used_percent?: number;
  limit_window_seconds?: number;
  reset_at?: number;
}

interface CodexWhamUsage {
  plan_type?: string;
  rate_limit?: {
    primary_window?: CodexWhamWindow;
    secondary_window?: CodexWhamWindow;
  };
  credits?: {
    has_credits?: boolean;
    unlimited?: boolean;
    balance?: string;
  };
}

async function fetchCodexRateLimits(): Promise<ProviderRateLimitEntry | null> {
  try {
    const authPath = join(homedir(), ".codex", "auth.json");
    const raw = JSON.parse(readFileSync(authPath, "utf-8")) as CodexAuthJson;

    const accessToken = raw.tokens?.access_token;
    const accountId = raw.tokens?.account_id;
    if (!accessToken) return null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "CodexBar",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;

    const res = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as CodexWhamUsage;

    const windows: RateLimitWindow[] = [];

    const pw = data.rate_limit?.primary_window;
    if (pw && pw.used_percent != null && pw.limit_window_seconds && pw.reset_at) {
      windows.push({
        id: "primary",
        label: windowLabel(pw.limit_window_seconds),
        usedPercent: pw.used_percent,
        resetsAt: pw.reset_at,
      });
    }

    const sw = data.rate_limit?.secondary_window;
    if (sw && sw.used_percent != null && sw.limit_window_seconds && sw.reset_at) {
      windows.push({
        id: "secondary",
        label: windowLabel(sw.limit_window_seconds),
        usedPercent: sw.used_percent,
        resetsAt: sw.reset_at,
      });
    }

    if (windows.length === 0) return null;

    const rateLimits: FetchedRateLimits = {
      _source: "api",
      windows,
      ...(data.plan_type ? { planType: data.plan_type } : {}),
      ...(data.credits
        ? {
            credits: {
              balance: data.credits.balance ?? "0",
              unlimited: data.credits.unlimited ?? false,
            },
          }
        : {}),
    };

    return {
      provider: "codex",
      rateLimits,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claude  (reads macOS keychain "Claude Code-credentials")
// ---------------------------------------------------------------------------

interface ClaudeOAuthUsageWindow {
  utilization?: number; // 0–100 (e.g. 23.0)
  resets_at?: string; // ISO-8601
}

interface ClaudeOAuthUsage {
  five_hour?: ClaudeOAuthUsageWindow | null;
  seven_day?: ClaudeOAuthUsageWindow | null;
  seven_day_oauth_apps?: ClaudeOAuthUsageWindow | null;
  seven_day_opus?: ClaudeOAuthUsageWindow | null;
  seven_day_sonnet?: ClaudeOAuthUsageWindow | null;
  seven_day_cowork?: ClaudeOAuthUsageWindow | null;
  iguana_necktie?: ClaudeOAuthUsageWindow | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number;
    used_credits?: number;
    utilization?: number;
    currency?: string;
  } | null;
}

/** Async keychain read — avoids blocking the event loop (execFileSync would stall Effect fibers). */
function readClaudeOAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    // Same keychain key as codexbar: "Claude Code-credentials"
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf-8", timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(stdout.trim()) as { claudeAiOauth?: { accessToken?: string } };
          resolve(data.claudeAiOauth?.accessToken ?? null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

// Only the keys that map to ClaudeOAuthUsageWindow (not extra_usage)
type ClaudeWindowKey =
  | "five_hour"
  | "seven_day"
  | "seven_day_oauth_apps"
  | "seven_day_opus"
  | "seven_day_sonnet"
  | "seven_day_cowork"
  | "iguana_necktie";

const CLAUDE_WINDOW_CONFIG: ReadonlyArray<{
  key: ClaudeWindowKey;
  id: string;
  label: string;
}> = [
  { key: "five_hour", id: "five_hour", label: "5h session" },
  { key: "seven_day", id: "seven_day", label: "Weekly" },
  { key: "seven_day_sonnet", id: "seven_day_sonnet", label: "Sonnet (weekly)" },
  { key: "seven_day_opus", id: "seven_day_opus", label: "Opus (weekly)" },
  { key: "seven_day_cowork", id: "seven_day_cowork", label: "Cowork (weekly)" },
  { key: "seven_day_oauth_apps", id: "seven_day_oauth_apps", label: "OAuth apps (weekly)" },
];

async function fetchClaudeRateLimits(): Promise<ProviderRateLimitEntry | null> {
  try {
    const token = await readClaudeOAuthToken();
    if (!token) return null;

    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/1.0.0",
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ClaudeOAuthUsage;

    const windows: RateLimitWindow[] = [];
    for (const { key, id, label } of CLAUDE_WINDOW_CONFIG) {
      const w = data[key];
      if (!w || w.utilization == null || !w.resets_at) continue;
      windows.push({
        id,
        label,
        usedPercent: w.utilization, // already 0–100
        resetsAt: isoToUnix(w.resets_at),
      });
    }

    if (windows.length === 0) return null;

    const rateLimits: FetchedRateLimits = {
      _source: "api",
      windows,
      ...(data.extra_usage?.is_enabled && data.extra_usage.monthly_limit != null
        ? {
            extraUsage: {
              usedCredits: data.extra_usage.used_credits ?? 0,
              monthlyLimit: data.extra_usage.monthly_limit,
              usedPercent: data.extra_usage.utilization ?? 0,
              ...(data.extra_usage.currency ? { currency: data.extra_usage.currency } : {}),
            },
          }
        : {}),
    };

    return {
      provider: "claudeAgent",
      rateLimits,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini  (reads ~/.gemini/oauth_creds.json)
// ---------------------------------------------------------------------------

interface GeminiOAuthCreds {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number; // ms since epoch
}

interface GeminiLoadCodeAssistResponse {
  cloudaicompanionProject?: string;
  currentTier?: { id?: string; name?: string };
}

interface GeminiQuotaBucket {
  modelId: string;
  remainingFraction: number; // 0.0–1.0
  resetTime: string; // ISO-8601
  tokenType?: string;
}

interface GeminiQuotaResponse {
  buckets?: GeminiQuotaBucket[];
}

/** Best bucket per model: lowest remainingFraction (i.e. most used). */
function pickBestBucket(buckets: GeminiQuotaBucket[]): Map<string, GeminiQuotaBucket> {
  const map = new Map<string, GeminiQuotaBucket>();
  for (const b of buckets) {
    const existing = map.get(b.modelId);
    if (!existing || b.remainingFraction < existing.remainingFraction) {
      map.set(b.modelId, b);
    }
  }
  return map;
}

/** Display label for a Gemini modelId. */
function geminiModelLabel(modelId: string): string {
  if (modelId.includes("flash-lite") || modelId.includes("flash_lite")) return "Flash Lite";
  if (modelId.includes("flash")) return "Flash";
  if (modelId.includes("pro")) return "Pro";
  return modelId;
}

async function fetchGeminiRateLimits(): Promise<ProviderRateLimitEntry | null> {
  try {
    const credsPath = join(homedir(), ".gemini", "oauth_creds.json");
    const creds = JSON.parse(readFileSync(credsPath, "utf-8")) as GeminiOAuthCreds;
    const accessToken = creds.access_token;
    if (!accessToken) return null;

    const authHeader = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    // Step 1: get the managed project ID (needed for quota endpoint)
    let projectId = "";
    try {
      const loadRes = await fetch("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist", {
        method: "POST",
        headers: authHeader,
        body: "{}",
      });
      if (loadRes.ok) {
        const loadData = (await loadRes.json()) as GeminiLoadCodeAssistResponse;
        projectId = loadData.cloudaicompanionProject ?? "";
      }
    } catch {
      /* non-fatal */
    }

    // Step 2: fetch per-model quota buckets
    const quotaRes = await fetch(
      "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
      { method: "POST", headers: authHeader, body: JSON.stringify({ project: projectId }) },
    );
    if (!quotaRes.ok) return null;

    const quotaData = (await quotaRes.json()) as GeminiQuotaResponse;
    const buckets = quotaData.buckets ?? [];
    if (buckets.length === 0) return null;

    // Step 1: best bucket per modelId (lowest remainingFraction = most used)
    const bestByModelId = pickBestBucket(buckets);

    // Step 2: merge by display label — multiple model versions (e.g. gemini-2.5-flash,
    // gemini-3-flash-preview) map to the same label. Keep worst case (highest usedPercent).
    const byLabel = new Map<string, RateLimitWindow>();
    for (const b of bestByModelId.values()) {
      const label = geminiModelLabel(b.modelId);
      const usedPercent = (1 - b.remainingFraction) * 100;
      const existing = byLabel.get(label);
      if (!existing || usedPercent > existing.usedPercent) {
        byLabel.set(label, {
          id: label.toLowerCase().replace(/\s+/g, "_"),
          label,
          usedPercent,
          resetsAt: isoToUnix(b.resetTime),
        });
      }
    }
    const windows: RateLimitWindow[] = Array.from(byLabel.values());

    if (windows.length === 0) return null;

    const rateLimits: FetchedRateLimits = { _source: "api", windows };
    return { provider: "gemini", rateLimits, updatedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches rate limits for all configured providers by reading credentials
 * from disk/keychain and calling provider REST APIs. Session-independent.
 * Errors are swallowed per-provider — absent credentials simply yield null.
 */
export async function fetchAllRateLimits(): Promise<ProviderRateLimitEntry[]> {
  const [codex, claude, gemini] = await Promise.allSettled([
    fetchCodexRateLimits(),
    fetchClaudeRateLimits(),
    fetchGeminiRateLimits(),
  ]);

  const results: ProviderRateLimitEntry[] = [];
  if (codex.status === "fulfilled" && codex.value) results.push(codex.value);
  if (claude.status === "fulfilled" && claude.value) results.push(claude.value);
  if (gemini.status === "fulfilled" && gemini.value) results.push(gemini.value);
  return results;
}
