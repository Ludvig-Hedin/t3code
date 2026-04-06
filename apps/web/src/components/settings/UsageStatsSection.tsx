/**
 * UsageStatsSection — aggregates token and message usage from all Bird Code sessions
 * and displays them in the Providers settings tab.
 *
 * Data source: store threads → activities (turn.started, context-window.updated) + messages.
 * Stats are grouped by time period and can be filtered by provider.
 *
 * Token data is only available when the provider emits `context-window.updated` events.
 * When no token data was recorded for a period, token fields show "No data" rather than "0"
 * to avoid misleading the user.
 */
import { useMemo, useState } from "react";
import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@t3tools/contracts";
import { useStore } from "../../store";
import { formatContextWindowTokens } from "../../lib/contextWindow";
import { formatModelDisplayName } from "../../lib/modelDisplayName";
import { type Thread } from "../../types";
import { cn } from "../../lib/utils";

// ── Time period helpers ────────────────────────────────────────────────────────

type TimePeriod = "all" | "year" | "month" | "week" | "today";

const TIME_PERIOD_LABELS: Record<TimePeriod, string> = {
  all: "All time",
  year: "This year",
  month: "This month",
  week: "This week",
  today: "Today",
};

function getStartOfPeriod(period: TimePeriod): Date | null {
  if (period === "all") return null;
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    // ISO week starts Monday
    const day = now.getDay(); // 0 = Sunday
    const diffToMonday = (day + 6) % 7; // days since Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  if (period === "year") {
    return new Date(now.getFullYear(), 0, 1);
  }
  return null;
}

function isInPeriod(isoDate: string, start: Date | null): boolean {
  if (start === null) return true;
  const d = new Date(isoDate);
  return d >= start;
}

// ── Stats aggregation ──────────────────────────────────────────────────────────

interface TurnStats {
  /** Provider kind inferred from the thread's model selection */
  provider: ProviderKind;
  /** Human-readable model slug from turn.started activity payload */
  model: string | null;
  /** Input tokens — null means no context-window.updated was emitted for this turn */
  inputTokens: number | null;
  /** Output tokens — null means no context-window.updated was emitted for this turn */
  outputTokens: number | null;
  startedAt: string;
}

interface ProviderStats {
  inputTokens: number;
  outputTokens: number;
  messages: number;
  /** True if at least one turn for this provider had token data */
  hasTokenData: boolean;
}

interface AggregatedStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  /** True if at least one turn across all providers had token data */
  hasTokenData: boolean;
  messageCount: number;
  /** model slug → turn count */
  modelUsage: Map<string, number>;
  providerUsage: Map<ProviderKind, ProviderStats>;
}

function aggregateStats(
  turns: TurnStats[],
  messages: Array<{ provider: ProviderKind }>,
): AggregatedStats {
  const result: AggregatedStats = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    hasTokenData: false,
    messageCount: messages.length,
    modelUsage: new Map(),
    providerUsage: new Map(),
  };

  for (const turn of turns) {
    const hasData = turn.inputTokens !== null || turn.outputTokens !== null;
    const inputTokens = turn.inputTokens ?? 0;
    const outputTokens = turn.outputTokens ?? 0;

    if (hasData) {
      result.totalInputTokens += inputTokens;
      result.totalOutputTokens += outputTokens;
      result.hasTokenData = true;
    }

    if (turn.model) {
      result.modelUsage.set(turn.model, (result.modelUsage.get(turn.model) ?? 0) + 1);
    }

    const provEntry: ProviderStats = result.providerUsage.get(turn.provider) ?? {
      inputTokens: 0,
      outputTokens: 0,
      messages: 0,
      hasTokenData: false,
    };
    if (hasData) {
      provEntry.inputTokens += inputTokens;
      provEntry.outputTokens += outputTokens;
      provEntry.hasTokenData = true;
    }
    result.providerUsage.set(turn.provider, provEntry);
  }

  // Count AI messages per provider
  for (const msg of messages) {
    const provEntry = result.providerUsage.get(msg.provider);
    if (provEntry) {
      provEntry.messages += 1;
    } else {
      // Provider had messages but no turns in range — create a stub entry
      result.providerUsage.set(msg.provider, {
        inputTokens: 0,
        outputTokens: 0,
        messages: 1,
        hasTokenData: false,
      });
    }
  }

  result.totalTokens = result.totalInputTokens + result.totalOutputTokens;
  return result;
}

/**
 * Extracts per-turn stats from a single thread's activities and messages.
 * For each turn, we take the LAST `context-window.updated` activity to get
 * the most accurate per-turn token snapshot (lastInputTokens, lastOutputTokens).
 *
 * If no context-window.updated exists for a turn, inputTokens/outputTokens are null —
 * meaning "no data recorded", not "zero tokens used".
 */
function extractTurnStatsFromThread(
  thread: Thread,
  periodStart: Date | null,
): { turns: TurnStats[]; messages: Array<{ provider: ProviderKind }> } {
  const provider = thread.modelSelection.provider;
  const activities = thread.activities;

  // turnId → model slug (from turn.started)
  const modelByTurnId = new Map<string, string>();
  // turnId → started-at (from turn.started, filtered by period)
  const startedAtByTurnId = new Map<string, string>();
  // turnId → last context-window.updated payload
  const lastCtxByTurnId = new Map<string, Record<string, unknown>>();

  for (const activity of activities) {
    if (!activity.turnId) continue;

    if (activity.kind === "turn.started") {
      if (!isInPeriod(activity.createdAt, periodStart)) continue;
      startedAtByTurnId.set(activity.turnId, activity.createdAt);
      const payload =
        activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
          ? (activity.payload as Record<string, unknown>)
          : null;
      if (payload && typeof payload.model === "string") {
        modelByTurnId.set(activity.turnId, payload.model.trim());
      }
    }

    if (activity.kind === "context-window.updated") {
      const payload =
        activity.payload && typeof activity.payload === "object" && !Array.isArray(activity.payload)
          ? (activity.payload as Record<string, unknown>)
          : null;
      if (payload) {
        // Keep the latest one per turn (activities arrive in chronological order)
        lastCtxByTurnId.set(activity.turnId, payload);
      }
    }
  }

  // Assemble one TurnStats per turn that started within the period
  const turns: TurnStats[] = [];
  for (const [turnId, startedAt] of startedAtByTurnId) {
    const ctx = lastCtxByTurnId.get(turnId);
    // Null means this provider doesn't emit context-window.updated
    const inputTokens =
      ctx !== undefined && typeof ctx.lastInputTokens === "number" ? ctx.lastInputTokens : null;
    const outputTokens =
      ctx !== undefined && typeof ctx.lastOutputTokens === "number" ? ctx.lastOutputTokens : null;

    turns.push({
      provider,
      model: modelByTurnId.get(turnId) ?? null,
      inputTokens,
      outputTokens,
      startedAt,
    });
  }

  // AI messages within the period
  const messages = thread.messages
    .filter((m) => m.role === "assistant" && !m.streaming && isInPeriod(m.createdAt, periodStart))
    .map(() => ({ provider }));

  return { turns, messages };
}

function deriveStats(
  threads: Thread[],
  period: TimePeriod,
  filterProvider: ProviderKind | "all",
): AggregatedStats {
  const periodStart = getStartOfPeriod(period);
  const allTurns: TurnStats[] = [];
  const allMessages: Array<{ provider: ProviderKind }> = [];

  for (const thread of threads) {
    if (filterProvider !== "all" && thread.modelSelection.provider !== filterProvider) continue;
    const { turns, messages } = extractTurnStatsFromThread(thread, periodStart);
    allTurns.push(...turns);
    allMessages.push(...messages);
  }

  return aggregateStats(allTurns, allMessages);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  noData,
}: {
  label: string;
  value: string;
  sub?: string;
  /** When true, renders "No data" in muted style instead of value+sub */
  noData?: boolean;
}) {
  return (
    <div className="rounded-xl bg-muted/30 px-4 py-3 flex flex-col gap-0.5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">{label}</p>
      {noData ? (
        <p className="text-sm text-muted-foreground/40 italic">No data</p>
      ) : (
        <>
          <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground/50">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

const ALL_PROVIDERS: ProviderKind[] = ["codex", "claudeAgent", "gemini", "opencode", "ollama"];
const TIME_PERIODS: TimePeriod[] = ["today", "week", "month", "year", "all"];

export function UsageStatsSection() {
  const threads = useStore((s) => s.threads);
  const [period, setPeriod] = useState<TimePeriod>("all");
  const [filterProvider, setFilterProvider] = useState<ProviderKind | "all">("all");

  // Providers that have been used in at least one thread
  const usedProviders = useMemo(() => {
    const seen = new Set<ProviderKind>();
    for (const t of threads) seen.add(t.modelSelection.provider);
    return ALL_PROVIDERS.filter((p) => seen.has(p));
  }, [threads]);

  const stats = useMemo(
    () => deriveStats(threads, period, filterProvider),
    [threads, period, filterProvider],
  );

  // Sort models by turn count descending, show up to 6
  const topModels = useMemo(
    () => [...stats.modelUsage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    [stats.modelUsage],
  );

  // Provider breakdown — only rows with any activity in the current filter+period
  const providerRows = useMemo(
    () =>
      [...stats.providerUsage.entries()]
        .filter(([, v]) => v.inputTokens + v.outputTokens > 0 || v.messages > 0)
        .sort(
          (a, b) => b[1].inputTokens + b[1].outputTokens - (a[1].inputTokens + a[1].outputTokens),
        ),
    [stats.providerUsage],
  );

  const hasAnyData = stats.messageCount > 0 || topModels.length > 0;

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      {/* Period + provider filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Time period tabs */}
        <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
          {TIME_PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium transition-colors border-r border-border/60 last:border-r-0",
                period === p
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
              )}
            >
              {TIME_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Provider filter — only shown when multiple providers have been used */}
        {usedProviders.length > 1 && (
          <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setFilterProvider("all")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium transition-colors border-r border-border/60",
                filterProvider === "all"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
              )}
            >
              All providers
            </button>
            {usedProviders.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFilterProvider(p)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium transition-colors border-r border-border/60 last:border-r-0",
                  filterProvider === p
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
                )}
              >
                {PROVIDER_DISPLAY_NAMES[p]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasAnyData ? (
        <p className="text-xs text-muted-foreground/60 italic py-2">
          No usage data for this period.
          {filterProvider !== "all" && ' Try switching to "All providers".'}
        </p>
      ) : (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {/* Token stat — shows "No data" when the provider doesn't emit token events */}
            <StatCard
              label="Total tokens"
              noData={!stats.hasTokenData}
              value={formatContextWindowTokens(stats.totalTokens)}
              {...(stats.hasTokenData
                ? {
                    sub: `${formatContextWindowTokens(stats.totalInputTokens)} in · ${formatContextWindowTokens(stats.totalOutputTokens)} out`,
                  }
                : {})}
            />
            <StatCard label="AI responses" value={stats.messageCount.toLocaleString()} />
            {topModels.length > 0 && (
              <StatCard
                label="Top model"
                // Show the short display name prominently; slug as subtitle
                value={formatModelDisplayName(topModels[0]![0])}
                sub={topModels[0]![0]}
              />
            )}
          </div>

          {/* Models used — bar chart ranked by turn count */}
          {topModels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                Models used
              </p>
              <div className="space-y-1">
                {topModels.map(([slug, count]) => {
                  const maxCount = topModels[0]![1];
                  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                  return (
                    <div key={slug} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          {/* Show friendly name; tooltip reveals the raw slug */}
                          <span className="text-[11px] text-foreground/80 truncate" title={slug}>
                            {formatModelDisplayName(slug)}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                            {count} {count === 1 ? "turn" : "turns"}
                          </span>
                        </div>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary/40 transition-[width] duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provider breakdown — only when viewing all providers and multiple exist */}
          {filterProvider === "all" && providerRows.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
                By provider
              </p>
              <div className="rounded-xl border border-border/50 overflow-hidden">
                {providerRows.map(([provider, pStats], idx) => (
                  <div
                    key={provider}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-2 text-xs",
                      idx > 0 && "border-t border-border/40",
                    )}
                  >
                    <span className="font-medium text-foreground/80">
                      {PROVIDER_DISPLAY_NAMES[provider as ProviderKind] ?? provider}
                    </span>
                    <div className="flex items-center gap-3 text-muted-foreground/60 tabular-nums text-[11px]">
                      <span>{pStats.messages} msgs</span>
                      {/* Show "No data" for token column when provider doesn't emit events */}
                      {pStats.hasTokenData ? (
                        <span>
                          {formatContextWindowTokens(pStats.inputTokens + pStats.outputTokens)} tok
                        </span>
                      ) : (
                        <span className="italic text-muted-foreground/40">No token data</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
