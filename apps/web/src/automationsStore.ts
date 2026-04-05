/**
 * automationsStore — Zustand store with localStorage persistence for automations.
 *
 * Manages automation definitions including scheduling, model selection, and run history.
 * All state is client-only for now; no server persistence.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────

export type FrequencyType =
  | "manual"
  | "hourly"
  | "daily"
  | "weekly"
  | "weekday"
  | "weekends"
  | "custom";

export const FREQUENCY_LABELS: Record<FrequencyType, string> = {
  manual: "Manual",
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  weekday: "Weekdays",
  weekends: "Weekends",
  custom: "Custom",
};

export const FREQUENCY_OPTIONS: FrequencyType[] = [
  "manual",
  "hourly",
  "daily",
  "weekly",
  "weekday",
  "weekends",
  "custom",
];

export const DAY_OPTIONS = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
] as const;

export type DayValue = (typeof DAY_OPTIONS)[number]["value"];

export type ReasoningLevel = "none" | "low" | "medium" | "high";

export const REASONING_LEVEL_LABELS: Record<ReasoningLevel, string> = {
  none: "No reasoning",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const REASONING_LEVEL_OPTIONS: ReasoningLevel[] = ["none", "low", "medium", "high"];

export type AutomationStatus = "active" | "paused" | "running";

export interface AutomItem {
  id: string;
  name: string;
  prompt: string;
  project: string;
  frequency: FrequencyType;
  /** HH:MM string used for daily / weekly / weekday / weekends / custom */
  frequencyTime: string;
  /** Day-of-week values used for weekly and custom frequencies */
  frequencyDays: DayValue[];
  model: string;
  provider: string;
  reasoningLevel: ReasoningLevel;
  status: AutomationStatus;
  nextRun: string | null;
  lastRan: string | null;
  createdAt: string;
}

export interface CreateAutomationInput {
  name: string;
  prompt: string;
  project: string;
  frequency: FrequencyType;
  frequencyTime: string;
  frequencyDays: DayValue[];
  model: string;
  provider: string;
  reasoningLevel: ReasoningLevel;
}

// ── Next-run calculation ───────────────────────────────────────────────

const DAY_MAP: Record<DayValue, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Computes the next scheduled run time given a frequency and current time.
 * Returns null for manual automations.
 */
export function computeNextRun(
  frequency: FrequencyType,
  frequencyTime: string,
  frequencyDays: DayValue[],
  from: Date = new Date(),
): string | null {
  if (frequency === "manual") return null;

  const [hStr = "9", mStr = "0"] = frequencyTime.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);

  const candidate = new Date(from);

  if (frequency === "hourly") {
    // Next full hour from now
    candidate.setMinutes(0, 0, 0);
    candidate.setHours(candidate.getHours() + 1);
    return candidate.toISOString();
  }

  // Helper: advance to next occurrence of a weekday set at a given time
  const nextOccurrenceInDays = (allowedDays: number[]): Date => {
    const result = new Date(from);
    result.setSeconds(0, 0);
    result.setHours(h, m, 0, 0);
    // If the time today hasn't passed and today is an allowed day, use today
    for (let offset = 0; offset < 8; offset++) {
      const d = new Date(from);
      d.setDate(from.getDate() + offset);
      d.setHours(h, m, 0, 0);
      if (allowedDays.includes(d.getDay()) && d > from) {
        return d;
      }
    }
    return result; // fallback
  };

  if (frequency === "daily") {
    const result = new Date(from);
    result.setHours(h, m, 0, 0);
    if (result <= from) result.setDate(result.getDate() + 1);
    return result.toISOString();
  }

  if (frequency === "weekday") {
    return nextOccurrenceInDays([1, 2, 3, 4, 5]).toISOString();
  }

  if (frequency === "weekends") {
    return nextOccurrenceInDays([0, 6]).toISOString();
  }

  if (frequency === "weekly") {
    // Use first selected day, or Monday as default
    const dayNums = frequencyDays.length > 0 ? frequencyDays.map((d) => DAY_MAP[d]) : [1];
    return nextOccurrenceInDays(dayNums).toISOString();
  }

  if (frequency === "custom") {
    const dayNums = frequencyDays.map((d) => DAY_MAP[d]);
    if (dayNums.length === 0) return null;
    return nextOccurrenceInDays(dayNums).toISOString();
  }

  return null;
}

// ── Store ─────────────────────────────────────────────────────────────

const slug = (): string => Math.random().toString(36).slice(2, 10);

interface AutomationsState {
  automations: AutomItem[];

  /** Create a new automation and prepend it to the list */
  createAutomation: (input: CreateAutomationInput) => AutomItem;

  /** Update an existing automation's fields (excluding id / createdAt) */
  updateAutomation: (id: string, patch: Partial<CreateAutomationInput>) => void;

  /** Rename an automation by id */
  renameAutomation: (id: string, name: string) => void;

  /** Delete an automation by id */
  deleteAutomation: (id: string) => void;

  /**
   * Mark an automation as "running" and stamp lastRan.
   * In the future this will dispatch the actual agent run.
   */
  runAutomation: (id: string) => void;

  /** Toggle active / paused status */
  toggleAutomationStatus: (id: string) => void;
}

export const useAutomationsStore = create<AutomationsState>()(
  persist(
    (set, _get) => ({
      automations: [],

      createAutomation(input) {
        const nextRun = computeNextRun(input.frequency, input.frequencyTime, input.frequencyDays);
        const item: AutomItem = {
          id: `autom-${slug()}`,
          name: input.name.trim() || input.prompt.trim().split("\n")[0] || "Untitled automation",
          prompt: input.prompt,
          project: input.project,
          frequency: input.frequency,
          frequencyTime: input.frequencyTime,
          frequencyDays: input.frequencyDays,
          model: input.model,
          provider: input.provider,
          reasoningLevel: input.reasoningLevel,
          status: "active",
          nextRun,
          lastRan: null,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ automations: [item, ...state.automations] }));
        return item;
      },

      updateAutomation(id, patch) {
        set((state) => ({
          automations: state.automations.map((a) => {
            if (a.id !== id) return a;
            const merged = { ...a, ...patch };
            return {
              ...merged,
              name:
                patch.name !== undefined
                  ? patch.name.trim() || a.prompt.trim().split("\n")[0] || "Untitled automation"
                  : a.name,
              nextRun: computeNextRun(merged.frequency, merged.frequencyTime, merged.frequencyDays),
            };
          }),
        }));
      },

      renameAutomation(id, name) {
        set((state) => ({
          automations: state.automations.map((a) =>
            a.id === id ? { ...a, name: name.trim() || a.name } : a,
          ),
        }));
      },

      deleteAutomation(id) {
        set((state) => ({
          automations: state.automations.filter((a) => a.id !== id),
        }));
      },

      runAutomation(id) {
        // Stamps lastRan and recalculates nextRun. Actual agent dispatch is future work.
        set((state) => ({
          automations: state.automations.map((a) => {
            if (a.id !== id) return a;
            return {
              ...a,
              status: "active" as const,
              lastRan: new Date().toISOString(),
              nextRun: computeNextRun(a.frequency, a.frequencyTime, a.frequencyDays),
            };
          }),
        }));
      },

      toggleAutomationStatus(id) {
        set((state) => ({
          automations: state.automations.map((a) => {
            if (a.id !== id) return a;
            const next = a.status === "active" ? "paused" : "active";
            return {
              ...a,
              status: next,
              nextRun:
                next === "active"
                  ? computeNextRun(a.frequency, a.frequencyTime, a.frequencyDays)
                  : null,
            };
          }),
        }));
      },
    }),
    {
      name: "t3code:automations:v1",
      // Persist only the automations array; actions are always reconstructed
      partialize: (state) => ({ automations: state.automations }),
    },
  ),
);

// ── Selectors ─────────────────────────────────────────────────────────

export const selectAutomations = (state: AutomationsState) => state.automations;
export const selectActiveAutomations = (state: AutomationsState) =>
  state.automations.filter((a) => a.status !== "paused");
export const selectPausedAutomations = (state: AutomationsState) =>
  state.automations.filter((a) => a.status === "paused");
