/**
 * RateLimitsButton — shows a per-provider rate-limit popover in the BranchToolbar.
 *
 * On mount it subscribes to `subscribeProviderRateLimits`. The server side:
 *  1. Proactively calls `account/rateLimits/read` on all active Codex sessions.
 *  2. Emits the cached snapshot immediately so the client gets data on open.
 *  3. Keeps streaming live updates as providers push new rate-limit events.
 */
import { type ProviderKind, type ProviderRateLimitEntry } from "@t3tools/contracts";
import { GaugeCircleIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { getWsRpcClient } from "../../wsRpcClient";
import { ClaudeAI, Gemini, OpenAI } from "../Icons";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

// ---------------------------------------------------------------------------
// Provider-specific payload types (parsed client-side via type guards)
// ---------------------------------------------------------------------------

interface CodexRateLimitWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: string;
}
interface CodexRateLimits {
  primaryLimit?: CodexRateLimitWindow;
  secondaryLimit?: CodexRateLimitWindow;
  [key: string]: unknown;
}

interface ClaudeRateLimits {
  type: "rate_limit_event";
  requests_limit?: number;
  requests_remaining?: number;
  requests_reset?: string;
  tokens_limit?: number;
  tokens_remaining?: number;
  tokens_reset?: string;
  input_tokens_limit?: number;
  input_tokens_remaining?: number;
  input_tokens_reset?: string;
  output_tokens_limit?: number;
  output_tokens_remaining?: number;
  output_tokens_reset?: string;
}

// Claude events are discriminated by the `type` field; everything else is Codex.
function isClaudeRateLimits(raw: unknown): raw is ClaudeRateLimits {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as Record<string, unknown>)["type"] === "rate_limit_event"
  );
}

function isCodexRateLimits(raw: unknown): raw is CodexRateLimits {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** "resets in 2m" / "resets in 3h 5m" / "resets in 2d 4h" from ISO date */
function formatResetsIn(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return "now";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** "resets at 4:32 PM" */
function formatResetsAt(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(isoDate),
  );
}

/** Human-readable window label: "Session", "1h window", "Weekly", etc. */
function windowLabel(windowMinutes: number): string {
  if (windowMinutes < 60) return `${windowMinutes}m session`;
  const hours = windowMinutes / 60;
  if (hours < 24) return `${hours}h window`;
  const days = hours / 24;
  return days === 7 ? "Weekly" : `${days}d window`;
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
// Provider sections
// ---------------------------------------------------------------------------

function CodexSection({ entry }: { entry: ProviderRateLimitEntry }) {
  const raw = entry.rateLimits;
  if (!isCodexRateLimits(raw)) {
    return <p className="text-xs text-muted-foreground/70 italic">Unrecognized payload format.</p>;
  }

  const windows: Array<{ win: CodexRateLimitWindow; label: string }> = [];
  if (raw.primaryLimit) {
    windows.push({ win: raw.primaryLimit, label: windowLabel(raw.primaryLimit.windowMinutes) });
  }
  if (raw.secondaryLimit) {
    windows.push({
      win: raw.secondaryLimit,
      label: windowLabel(raw.secondaryLimit.windowMinutes),
    });
  }

  if (windows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/70 italic">
        No active rate-limit windows reported.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {windows.map(({ win, label }) => (
        <RateLimitBar
          key={label}
          usedPercent={win.usedPercent}
          label={label}
          sublabel={`Resets in ${formatResetsIn(win.resetsAt)}`}
        />
      ))}
    </div>
  );
}

function ClaudeSection({ entry }: { entry: ProviderRateLimitEntry }) {
  const raw = entry.rateLimits;
  if (!isClaudeRateLimits(raw)) {
    return <p className="text-xs text-muted-foreground/70 italic">Unrecognized payload format.</p>;
  }

  const rows: Array<{ label: string; remaining: number; limit: number; reset?: string }> = [];

  if (raw.requests_limit != null && raw.requests_remaining != null) {
    rows.push({
      label: "Requests",
      remaining: raw.requests_remaining,
      limit: raw.requests_limit,
      ...(raw.requests_reset !== undefined ? { reset: raw.requests_reset } : {}),
    });
  }
  if (raw.tokens_limit != null && raw.tokens_remaining != null) {
    rows.push({
      label: "Tokens",
      remaining: raw.tokens_remaining,
      limit: raw.tokens_limit,
      ...(raw.tokens_reset !== undefined ? { reset: raw.tokens_reset } : {}),
    });
  }
  if (raw.input_tokens_limit != null && raw.input_tokens_remaining != null) {
    rows.push({
      label: "Input tokens",
      remaining: raw.input_tokens_remaining,
      limit: raw.input_tokens_limit,
      ...(raw.input_tokens_reset !== undefined ? { reset: raw.input_tokens_reset } : {}),
    });
  }
  if (raw.output_tokens_limit != null && raw.output_tokens_remaining != null) {
    rows.push({
      label: "Output tokens",
      remaining: raw.output_tokens_remaining,
      limit: raw.output_tokens_limit,
      ...(raw.output_tokens_reset !== undefined ? { reset: raw.output_tokens_reset } : {}),
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground/70 italic">
        Available after the next Claude API call.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map(({ label, remaining, limit, reset }) => {
        const usedPercent = limit > 0 ? ((limit - remaining) / limit) * 100 : 0;
        const sublabel = reset
          ? `Resets at ${formatResetsAt(reset)} · ${remaining.toLocaleString()} / ${limit.toLocaleString()} remaining`
          : `${remaining.toLocaleString()} / ${limit.toLocaleString()} remaining`;
        return (
          <RateLimitBar key={label} usedPercent={usedPercent} label={label} sublabel={sublabel} />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider config — drives which sections are rendered
// ---------------------------------------------------------------------------

const PROVIDER_CONFIG: ReadonlyArray<{
  kind: ProviderKind;
  label: string;
  iconClassName?: string;
  Section: (props: { entry: ProviderRateLimitEntry }) => React.ReactElement;
  noDataMessage: string;
}> = [
  {
    kind: "codex",
    label: "OpenAI Codex",
    iconClassName: "text-muted-foreground/80",
    Section: CodexSection,
    noDataMessage: "No active session.",
  },
  {
    kind: "claudeAgent",
    label: "Anthropic Claude",
    iconClassName: "text-[#d97757]",
    Section: ClaudeSection,
    noDataMessage: "Available after the next API call.",
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    iconClassName: "text-muted-foreground/80",
    // Gemini doesn't report rate limits — render a static message.
    Section: () => (
      <p className="text-xs text-muted-foreground/70 italic">
        Rate limit reporting not yet available for Gemini.
      </p>
    ),
    noDataMessage: "No active session.",
  },
];

const PROVIDER_ICONS: Record<ProviderKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RateLimitsButton() {
  const [limits, setLimits] = useState<Map<ProviderKind, ProviderRateLimitEntry>>(new Map());
  // Track whether the server has replied at all (first event OR brief timeout).
  const [ready, setReady] = useState(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = getWsRpcClient();

    // Mark ready after 2 s even if no events arrive (e.g. no active sessions).
    readyTimerRef.current = setTimeout(() => setReady(true), 2000);

    const unsub = client.provider.onRateLimitUpdate((entry) => {
      // First event means the server responded — cancel the fallback timer.
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

  // Providers that have sent at least one rate-limit entry.
  const activeProviders = PROVIDER_CONFIG.filter((p) => limits.has(p.kind));

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
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Rate Limits
            </p>
          </div>

          {/* Loading state */}
          {!ready && (
            <div className="flex items-center gap-2 py-1">
              <RefreshCwIcon className="size-3 animate-spin text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground/70">Fetching rate limits…</p>
            </div>
          )}

          {/* No active sessions */}
          {ready && activeProviders.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic">
              No active sessions detected. Start a Codex or Claude session to see rate limits.
            </p>
          )}

          {/* One section per provider that has reported data */}
          {activeProviders.map((config, idx) => {
            const entry = limits.get(config.kind);
            const ProviderIcon = PROVIDER_ICONS[config.kind];
            return (
              <div key={config.kind}>
                {idx > 0 && <div className="mb-4 border-t border-border/50" />}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ProviderIcon
                      aria-hidden="true"
                      className={cn("size-3.5 shrink-0", config.iconClassName)}
                    />
                    <span className="text-xs font-semibold text-foreground/90">{config.label}</span>
                  </div>
                  {entry == null ? (
                    <p className="text-xs text-muted-foreground/70 italic">
                      {config.noDataMessage}
                    </p>
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
