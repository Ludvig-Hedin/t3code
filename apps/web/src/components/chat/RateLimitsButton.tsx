/**
 * RateLimitsButton — shows a per-provider rate-limit popover in the BranchToolbar.
 *
 * Data shapes (verified against server source / Codex app-server protocol):
 *
 * Codex entry.rateLimits:
 *   { rateLimits: { primary: { usedPercent, windowDurationMins, resetsAt (Unix s) },
 *                   secondary: RateLimitWindow | null,
 *                   planType: string | null,
 *                   limitId: string | null } }
 *
 * Claude entry.rateLimits (entire SDKRateLimitEvent):
 *   { type: "rate_limit_event",
 *     rate_limit_info: { status, utilization (0–1), rateLimitType, resetsAt (Unix s) } }
 */
import { type ProviderKind, type ProviderRateLimitEntry } from "@t3tools/contracts";
import { GaugeCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { getWsRpcClient } from "../../wsRpcClient";
import { ClaudeAI, Gemini, OpenAI } from "../Icons";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

// ---------------------------------------------------------------------------
// Actual wire-format types (do NOT guess — verified against protocol schema)
// ---------------------------------------------------------------------------

/** Codex app-server `RateLimitWindow` */
interface CodexRateLimitWindow {
  usedPercent: number; // integer 0–100
  windowDurationMins: number | null; // 300 = 5-hour session, 10080 = 7-day
  resetsAt: number | null; // Unix timestamp seconds
}

/** Codex app-server `RateLimitSnapshot` (nested under `rateLimits.rateLimits`) */
interface CodexRateLimitSnapshot {
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  planType: string | null;
  limitId: string | null;
  limitName?: string | null;
  credits?: unknown;
}

/**
 * What `ProviderRateLimitEntry.rateLimits` contains for Codex:
 *   { rateLimits: RateLimitSnapshot, rateLimitsByLimitId?: ... }
 */
interface CodexRateLimitsPayload {
  rateLimits: CodexRateLimitSnapshot;
  rateLimitsByLimitId?: Record<string, CodexRateLimitSnapshot> | null;
}

/**
 * Claude SDK `SDKRateLimitInfo` — what lives inside `rate_limit_info`
 */
interface SDKRateLimitInfo {
  status: "allowed" | "allowed_warning" | "rejected";
  rateLimitType?: "five_hour" | "seven_day" | "seven_day_opus" | "seven_day_sonnet" | "overage";
  utilization?: number; // 0–1 float
  resetsAt?: number; // Unix timestamp seconds
  overageStatus?: string;
  isUsingOverage?: boolean;
}

/**
 * What `ProviderRateLimitEntry.rateLimits` contains for Claude:
 *   the entire SDKRateLimitEvent
 */
interface ClaudeRateLimitsPayload {
  type: "rate_limit_event";
  rate_limit_info: SDKRateLimitInfo;
  uuid?: string;
  session_id?: string;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isCodexRateLimitsPayload(raw: unknown): raw is CodexRateLimitsPayload {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r["rateLimits"] === "object" && r["rateLimits"] !== null;
}

function isClaudeRateLimitsPayload(raw: unknown): raw is ClaudeRateLimitsPayload {
  if (typeof raw !== "object" || raw === null) return false;
  return (raw as Record<string, unknown>)["type"] === "rate_limit_event";
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Unix timestamp seconds → "resets in 2m" / "3h 5m" / "2d 4h" */
function formatResetsIn(unixSecs: number): string {
  const ms = unixSecs * 1000 - Date.now();
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

/** Unix timestamp seconds → "resets at 4:32 PM" */
function formatResetsAt(unixSecs: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(unixSecs * 1000),
  );
}

/** windowDurationMins → "5h session", "Weekly", etc. */
function windowLabel(mins: number | null): string {
  if (mins === null) return "Window";
  if (mins < 60) return `${mins}m session`;
  const h = mins / 60;
  if (h < 24) return `${h}h session`;
  const d = h / 24;
  return d === 7 ? "Weekly" : `${d}d window`;
}

/** rateLimitType → display label */
function claudeWindowLabel(type: string | undefined): string {
  switch (type) {
    case "five_hour":
      return "5h session";
    case "seven_day":
      return "Weekly";
    case "seven_day_opus":
      return "Opus (weekly)";
    case "seven_day_sonnet":
      return "Sonnet (weekly)";
    case "overage":
      return "Overage";
    default:
      return "Usage";
  }
}

// ---------------------------------------------------------------------------
// Progress bar component
// ---------------------------------------------------------------------------

function RateLimitBar({
  usedPercent,
  label,
  sublabel,
}: {
  usedPercent: number;
  label: string;
  sublabel: string;
}) {
  const clamped = Math.max(0, Math.min(100, usedPercent));
  const isWarning = clamped >= 80 && clamped < 95;
  const isDanger = clamped >= 95;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "text-xs font-medium tabular-nums",
            isDanger
              ? "text-destructive"
              : isWarning
                ? "text-warning-foreground"
                : "text-foreground/80",
          )}
        >
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            isDanger ? "bg-destructive" : isWarning ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground/70">{sublabel}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Codex section
// ---------------------------------------------------------------------------

function CodexSection({ entry }: { entry: ProviderRateLimitEntry }) {
  const raw = entry.rateLimits;

  if (!isCodexRateLimitsPayload(raw)) {
    return <p className="text-xs text-muted-foreground/70 italic">Unexpected payload format.</p>;
  }

  const snapshot = raw.rateLimits;
  const windows: Array<{ win: CodexRateLimitWindow; label: string }> = [];

  if (snapshot.primary) {
    windows.push({
      win: snapshot.primary,
      label: windowLabel(snapshot.primary.windowDurationMins),
    });
  }
  if (snapshot.secondary) {
    windows.push({
      win: snapshot.secondary,
      label: windowLabel(snapshot.secondary.windowDurationMins),
    });
  }

  if (windows.length === 0) {
    return <p className="text-xs text-muted-foreground/70 italic">No windows reported yet.</p>;
  }

  return (
    <div className="space-y-3">
      {snapshot.planType && (
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-[0.06em]">
          {snapshot.planType}
        </p>
      )}
      {windows.map(({ win, label }) => (
        <RateLimitBar
          key={label}
          usedPercent={win.usedPercent}
          label={label}
          sublabel={
            win.resetsAt != null
              ? `Resets in ${formatResetsIn(win.resetsAt)}`
              : "Reset time unknown"
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claude section
// ---------------------------------------------------------------------------

function ClaudeSection({ entry }: { entry: ProviderRateLimitEntry }) {
  const raw = entry.rateLimits;

  if (!isClaudeRateLimitsPayload(raw)) {
    return <p className="text-xs text-muted-foreground/70 italic">Unexpected payload format.</p>;
  }

  const info = raw.rate_limit_info;
  // SDK utilization is 0–1; multiply by 100 for display
  const usedPercent = (info.utilization ?? 0) * 100;
  const label = claudeWindowLabel(info.rateLimitType);
  const statusColor =
    info.status === "rejected"
      ? "text-destructive"
      : info.status === "allowed_warning"
        ? "text-warning-foreground"
        : "text-success-foreground";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn("text-[10px] font-medium uppercase tracking-[0.06em]", statusColor)}>
          {info.status === "rejected"
            ? "Rate limited"
            : info.status === "allowed_warning"
              ? "Approaching limit"
              : "OK"}
        </span>
      </div>
      <RateLimitBar
        usedPercent={usedPercent}
        label={label}
        sublabel={
          info.resetsAt != null
            ? `Resets at ${formatResetsAt(info.resetsAt)} · ${Math.round(100 - usedPercent)}% remaining`
            : `${Math.round(100 - usedPercent)}% remaining`
        }
      />
      {info.isUsingOverage && (
        <p className="text-[10px] text-warning-foreground">Using overage credits.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider config registry
// ---------------------------------------------------------------------------

interface ProviderConfig {
  kind: ProviderKind;
  label: string;
  iconClassName?: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  Section: (props: { entry: ProviderRateLimitEntry }) => React.ReactElement;
  noDataNote: string;
}

const PROVIDER_CONFIGS: ReadonlyArray<ProviderConfig> = [
  {
    kind: "codex",
    label: "OpenAI Codex",
    iconClassName: "text-muted-foreground/80",
    Icon: OpenAI,
    Section: CodexSection,
    noDataNote: "No active session.",
  },
  {
    kind: "claudeAgent",
    label: "Anthropic Claude",
    iconClassName: "text-[#d97757]",
    Icon: ClaudeAI,
    Section: ClaudeSection,
    noDataNote: "Rate limits appear after the first API call.",
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    iconClassName: "text-muted-foreground/80",
    Icon: Gemini,
    Section: () => (
      <p className="text-xs text-muted-foreground/70 italic">
        Rate limit data not yet available for Gemini.
      </p>
    ),
    noDataNote: "No active session.",
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RateLimitsButton() {
  const [limits, setLimits] = useState<Map<ProviderKind, ProviderRateLimitEntry>>(new Map());
  const [ready, setReady] = useState(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = getWsRpcClient();

    // Mark ready after 3 s even if no events arrive (no active sessions).
    readyTimerRef.current = setTimeout(() => setReady(true), 3000);

    const unsub = client.provider.onRateLimitUpdate((entry) => {
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
        readyTimerRef.current = null;
      }
      setReady(true);
      setLimits((prev) => new Map(prev).set(entry.provider, entry));
    });

    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      unsub();
    };
  }, []);

  const activeProviders = PROVIDER_CONFIGS.filter((p) => limits.has(p.kind));

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="shrink-0 gap-1 px-2 text-muted-foreground/70 hover:text-foreground/80"
            aria-label="View provider rate limits"
          />
        }
      >
        <GaugeCircleIcon aria-hidden="true" className="size-3 shrink-0" />
        <span className="hidden text-xs sm:inline">Rate limits</span>
      </PopoverTrigger>

      <PopoverPopup side="top" align="start" sideOffset={6} className="w-72">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Rate Limits
          </p>

          {!ready && <p className="text-xs text-muted-foreground/60 animate-pulse">Fetching…</p>}

          {ready && activeProviders.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic">
              No active sessions. Start a Codex or Claude session to see rate limits.
            </p>
          )}

          {activeProviders.map((config, idx) => {
            const entry = limits.get(config.kind);
            return (
              <div key={config.kind}>
                {idx > 0 && <div className="mb-4 border-t border-border/50" />}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <config.Icon
                      aria-hidden="true"
                      className={cn("size-3.5 shrink-0", config.iconClassName)}
                    />
                    <span className="text-xs font-semibold text-foreground/90">{config.label}</span>
                  </div>
                  {entry == null ? (
                    <p className="text-xs text-muted-foreground/70 italic">{config.noDataNote}</p>
                  ) : (
                    <config.Section entry={entry} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
