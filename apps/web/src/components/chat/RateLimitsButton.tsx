/**
 * RateLimitsButton — per-provider rate-limit popover in the BranchToolbar.
 *
 * Data arrives via `subscribeProviderRateLimits`. The server reads credentials
 * directly from disk / macOS keychain (same sources as codexbar) and calls the
 * provider REST APIs, so data is available without an active session.
 *
 * Primary shape in entry.rateLimits: FetchedRateLimits (discriminated by _source: "api")
 * Fallback: raw app-server / SDK push event payloads when a session is active.
 */
import { type ProviderKind, type ProviderRateLimitEntry } from "@t3tools/contracts";

// Mirror of the server-side FetchedRateLimits (apps/server/src/provider/RateLimitFetcher.ts).
// Keep in sync if the server type changes.
interface RateLimitWindow {
  id: string;
  label: string;
  usedPercent: number; // 0–100
  resetsAt: number; // Unix seconds
}

interface FetchedRateLimits {
  _source: "api";
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
import { GaugeCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { getWsRpcClient } from "../../wsRpcClient";
import { ClaudeAI, Gemini, OpenAI } from "../Icons";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// ---------------------------------------------------------------------------
// Type guard for the primary (direct-fetch) format
// ---------------------------------------------------------------------------

function isFetchedRateLimits(raw: unknown): raw is FetchedRateLimits {
  return (
    typeof raw === "object" && raw !== null && (raw as Record<string, unknown>)["_source"] === "api"
  );
}

// ---------------------------------------------------------------------------
// Fallback parsers for live push events (active session path)
// ---------------------------------------------------------------------------

// Codex app-server push: { rateLimits: { primary: { usedPercent, windowDurationMins, resetsAt } } }
function parseCodexPushEvent(raw: unknown): RateLimitWindow[] | null {
  const snap = (raw as Record<string, unknown> | null)?.["rateLimits"];
  if (typeof snap !== "object" || snap === null) return null;
  const s = snap as Record<string, unknown>;

  const windows: RateLimitWindow[] = [];
  for (const [key, label] of [
    ["primary", "Session"],
    ["secondary", "Weekly"],
  ] as const) {
    const w = s[key] as Record<string, unknown> | null | undefined;
    if (!w) continue;
    const usedPercent = Number(w["usedPercent"]);
    const resetsAt = Number(w["resetsAt"]);
    const windowDurationMins = Number(w["windowDurationMins"]);
    if (Number.isNaN(usedPercent) || Number.isNaN(resetsAt)) continue;
    windows.push({
      id: key,
      label: !Number.isNaN(windowDurationMins) ? windowLabelFromMins(windowDurationMins) : label,
      usedPercent,
      resetsAt,
    });
  }
  return windows.length > 0 ? windows : null;
}

// Claude SDK push: { type: "rate_limit_event", rate_limit_info: { utilization, rateLimitType, resetsAt } }
function parseClaudePushEvent(raw: unknown): RateLimitWindow[] | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r["type"] !== "rate_limit_event") return null;
  const info = r["rate_limit_info"] as Record<string, unknown> | null | undefined;
  if (!info) return null;

  const utilization = Number(info["utilization"]);
  if (Number.isNaN(utilization)) return null;

  const rateLimitType = String(info["rateLimitType"] ?? "");
  const resetsAt = Number(info["resetsAt"]);

  return [
    {
      id: rateLimitType || "usage",
      label: claudeTypeLabel(rateLimitType),
      usedPercent: utilization * 100,
      resetsAt: Number.isNaN(resetsAt) ? Date.now() / 1000 : resetsAt,
    },
  ];
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function windowLabelFromMins(mins: number): string {
  if (mins < 60) return `${mins}m session`;
  const h = mins / 60;
  if (h < 24) return `${h}h session`;
  const d = h / 24;
  return d === 7 ? "Weekly" : `${d}d window`;
}

function claudeTypeLabel(type: string): string {
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

// ---------------------------------------------------------------------------
// Progress bar
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
// Provider section — renders windows from whatever format arrived
// ---------------------------------------------------------------------------

function ProviderRateLimitSection({ entry }: { entry: ProviderRateLimitEntry }) {
  const raw = entry.rateLimits;

  // Primary path: direct fetch from credential files/keychain (FetchedRateLimits)
  if (isFetchedRateLimits(raw)) {
    return (
      <div className="space-y-3">
        {raw.planType && (
          <p className="text-[10px] uppercase tracking-[0.06em] text-muted-foreground/60">
            {raw.planType}
          </p>
        )}
        {raw.windows.map((w) => (
          <RateLimitBar
            key={w.id}
            usedPercent={w.usedPercent}
            label={w.label}
            sublabel={`Resets in ${formatResetsIn(w.resetsAt)}`}
          />
        ))}
        {raw.credits && !raw.credits.unlimited && (
          <p className="text-[10px] text-muted-foreground/60">
            Balance: {Number(raw.credits.balance).toFixed(2)} credits
          </p>
        )}
        {raw.extraUsage && raw.extraUsage.monthlyLimit > 0 && (
          <RateLimitBar
            key="extra"
            usedPercent={raw.extraUsage.usedPercent}
            label="Usage credits"
            sublabel={`$${raw.extraUsage.usedCredits.toFixed(2)} / $${raw.extraUsage.monthlyLimit} this month`}
          />
        )}
      </div>
    );
  }

  // Fallback: Codex app-server push event (active session)
  if (entry.provider === "codex") {
    const windows = parseCodexPushEvent(raw);
    if (windows) {
      return (
        <div className="space-y-3">
          {windows.map((w) => (
            <RateLimitBar
              key={w.id}
              usedPercent={w.usedPercent}
              label={w.label}
              sublabel={`Resets in ${formatResetsIn(w.resetsAt)}`}
            />
          ))}
        </div>
      );
    }
  }

  // Fallback: Claude SDK push event (active session)
  if (entry.provider === "claudeAgent") {
    const windows = parseClaudePushEvent(raw);
    if (windows) {
      return (
        <div className="space-y-3">
          {windows.map((w) => (
            <RateLimitBar
              key={w.id}
              usedPercent={w.usedPercent}
              label={w.label}
              sublabel={`Resets in ${formatResetsIn(w.resetsAt)}`}
            />
          ))}
        </div>
      );
    }
  }

  return <p className="text-xs text-muted-foreground/70 italic">Data format unrecognized.</p>;
}

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------

const PROVIDER_CONFIGS: ReadonlyArray<{
  kind: ProviderKind;
  label: string;
  iconClassName?: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = [
  { kind: "codex", label: "OpenAI Codex", iconClassName: "text-muted-foreground/80", Icon: OpenAI },
  {
    kind: "claudeAgent",
    label: "Anthropic Claude",
    iconClassName: "text-[#d97757]",
    Icon: ClaudeAI,
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    iconClassName: "text-muted-foreground/80",
    Icon: Gemini,
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RateLimitsButton() {
  const [limits, setLimits] = useState<Map<ProviderKind, ProviderRateLimitEntry>>(new Map());
  const [ready, setReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = getWsRpcClient();

    // Mark ready after 4 s even if no data arrives (no configured providers).
    timerRef.current = setTimeout(() => setReady(true), 4000);

    const unsub = client.provider.onRateLimitUpdate((entry) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setReady(true);
      // Always take the latest entry per provider; subsequent updates (live push) override.
      setLimits((prev) => new Map(prev).set(entry.provider, entry));
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      unsub();
    };
  }, []);

  const activeProviders = PROVIDER_CONFIGS.filter((p) => limits.has(p.kind));

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
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
          }
        />
        <TooltipPopup side="top">View provider rate limits</TooltipPopup>
      </Tooltip>

      <PopoverPopup side="top" align="start" sideOffset={6} className="w-72">
        <div className="space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Rate Limits
          </p>

          {!ready && <p className="animate-pulse text-xs text-muted-foreground/60">Fetching…</p>}

          {ready && activeProviders.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic">
              No provider credentials found. Make sure you are logged in to Codex or Claude.
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
                  {entry != null ? (
                    <ProviderRateLimitSection entry={entry} />
                  ) : (
                    <p className="text-xs text-muted-foreground/70 italic">No data.</p>
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
