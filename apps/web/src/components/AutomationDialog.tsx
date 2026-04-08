/**
 * AutomationDialog — Modal dialog for creating or editing an automation.
 *
 * Uses Menu-based chip dropdowns (same pattern as ProviderModelPicker / TraitsPicker)
 * to avoid z-index conflicts inside the base-ui Dialog portal.
 *
 * Layout:
 *   Name (pill input) → Prompt (textarea) → chips bar (project, frequency, time,
 *   model, reasoning) → day pills (if weekly/custom) → templates (create mode only)
 *   Footer: [Clear all] [Cancel] [Save]
 */
import {
  BrainIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeIcon,
  FolderIcon,
  GitBranchIcon,
  SearchIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { Button } from "~/components/ui/button";
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Menu,
  MenuGroup,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "~/components/ui/menu";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { useStore } from "~/store";
import { useServerProviders } from "~/rpc/serverState";
import {
  type CreateAutomationInput,
  type AutomItem,
  type DayValue,
  type FrequencyType,
  type ReasoningLevel,
  DAY_OPTIONS,
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  REASONING_LEVEL_LABELS,
  REASONING_LEVEL_OPTIONS,
} from "~/automationsStore";

// ── Time picker data ──────────────────────────────────────────────────

/** 0–23 hours for the time picker */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
/** 5-minute intervals for the time picker */
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function splitTime(time: string): { hour: string; minute: string } {
  const [h = "09", m = "00"] = time.split(":");
  return { hour: h.padStart(2, "0"), minute: m.padStart(2, "0") };
}

// ── Frequencies ───────────────────────────────────────────────────────

/** Frequencies that require a time picker */
const FREQUENCIES_WITH_TIME = new Set<FrequencyType>([
  "daily",
  "weekly",
  "weekday",
  "weekends",
  "custom",
]);

/** Frequencies that allow day-of-week selection */
const FREQUENCIES_WITH_DAYS = new Set<FrequencyType>(["weekly", "custom"]);

// ── Templates ─────────────────────────────────────────────────────────

interface AutomationTemplate {
  name: string;
  title: string;
  description: string;
  icon: ReactNode;
  preset: Partial<CreateAutomationInput>;
}

const TEMPLATES: AutomationTemplate[] = [
  {
    name: "daily-standup",
    title: "Daily Standup",
    description: "Summarise commits and open PRs each morning",
    icon: <ClockIcon className="size-3.5" />,
    preset: {
      name: "Daily Standup Summary",
      prompt:
        "Review the git log from the past 24 hours and open pull requests. Write a brief standup summary: what was done, what's in progress, and any blockers.",
      frequency: "weekday",
      frequencyTime: "09:00",
      frequencyDays: [],
    },
  },
  {
    name: "weekly-report",
    title: "Weekly Report",
    description: "Generate a progress report every Monday",
    icon: <CalendarIcon className="size-3.5" />,
    preset: {
      name: "Weekly Progress Report",
      prompt:
        "Analyse the git history and open issues from the past week. Produce a structured weekly report with highlights, metrics, and next week's priorities.",
      frequency: "weekly",
      frequencyTime: "09:00",
      frequencyDays: ["mon"],
    },
  },
  {
    name: "security-scan",
    title: "Security Scan",
    description: "Check dependencies for vulnerabilities daily",
    icon: <SearchIcon className="size-3.5" />,
    preset: {
      name: "Dependency Security Scan",
      prompt:
        "Run a dependency audit and check for known CVEs. Report any high or critical vulnerabilities with remediation steps.",
      frequency: "daily",
      frequencyTime: "08:00",
      frequencyDays: [],
    },
  },
  {
    name: "code-review",
    title: "Code Review",
    description: "Review staged changes on demand",
    icon: <CodeIcon className="size-3.5" />,
    preset: {
      name: "Code Review",
      prompt:
        "Review the latest uncommitted changes in the project. Provide actionable feedback on code quality, potential bugs, and style consistency.",
      frequency: "manual",
      frequencyTime: "09:00",
      frequencyDays: [],
    },
  },
  {
    name: "release-notes",
    title: "Release Notes",
    description: "Draft release notes from merged PRs on Fridays",
    icon: <GitBranchIcon className="size-3.5" />,
    preset: {
      name: "Release Notes Draft",
      prompt:
        "Examine merged pull requests since the last tag. Draft user-facing release notes grouped by feature, fix, and breaking change.",
      frequency: "weekly",
      frequencyTime: "16:00",
      frequencyDays: ["fri"],
    },
  },
  {
    name: "quick-task",
    title: "Blank",
    description: "Start from a blank manual automation",
    icon: <ZapIcon className="size-3.5" />,
    preset: {
      name: "",
      prompt: "",
      frequency: "manual",
      frequencyTime: "09:00",
      frequencyDays: [],
    },
  },
];

// ── Chip button ───────────────────────────────────────────────────────

/**
 * Shared pill-shaped ghost button used as a Menu trigger for all chip selectors.
 * Matches the ProviderModelPicker / TraitsPicker visual style.
 */
const ChipButton = forwardRef<
  HTMLButtonElement,
  Omit<ComponentProps<typeof Button>, "children"> & {
    icon?: ReactNode;
    label: string;
  }
>(function ChipButton({ icon, label, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      className={cn(
        "h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground/90 [&_svg]:mx-0",
        className,
      )}
      {...props}
    >
      {icon}
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="size-3 shrink-0 opacity-50" />
    </Button>
  );
});

// ── AutomationDialog ──────────────────────────────────────────────────

interface AutomationDialogProps {
  /** When provided the dialog opens in edit mode, pre-filled from this item. */
  existing?: AutomItem;
  onSave: (input: CreateAutomationInput) => void;
}

const EMPTY_DEFAULTS = {
  name: "",
  prompt: "",
  frequency: "manual" as FrequencyType,
  frequencyTime: "09:00",
  frequencyDays: [] as DayValue[],
  reasoningLevel: "none" as ReasoningLevel,
};

export function AutomationDialog({ existing, onSave }: AutomationDialogProps) {
  const projects = useStore((s) => s.projects);
  const serverProviders = useServerProviders();

  // ── Derived model list from server providers ─────────────────────────
  const modelOptions = useMemo(() => {
    const opts: { provider: string; model: string; label: string }[] = [];
    for (const p of serverProviders) {
      if (!p.enabled || p.status !== "ready") continue;
      for (const m of p.models) {
        opts.push({ provider: p.provider, model: m.slug, label: m.name });
      }
    }
    if (opts.length === 0) {
      opts.push({ provider: "codex", model: "codex-1", label: "Codex 1" });
    }
    return opts;
  }, [serverProviders]);

  const projectNames = useMemo(() => {
    const names = projects.map((p) => p.cwd.split("/").at(-1) ?? p.cwd).filter(Boolean);
    return [...new Set(names)];
  }, [projects]);

  const defaultProject = projectNames[0] ?? "";
  const defaultModel = modelOptions[0];

  // ── Form state ───────────────────────────────────────────────────────
  const [name, setName] = useState(existing?.name ?? EMPTY_DEFAULTS.name);
  const [prompt, setPrompt] = useState(existing?.prompt ?? EMPTY_DEFAULTS.prompt);
  const [project, setProject] = useState(existing?.project ?? defaultProject);
  const [frequency, setFrequency] = useState<FrequencyType>(
    existing?.frequency ?? EMPTY_DEFAULTS.frequency,
  );
  const [frequencyTime, setFrequencyTime] = useState(
    existing?.frequencyTime ?? EMPTY_DEFAULTS.frequencyTime,
  );
  const [frequencyDays, setFrequencyDays] = useState<DayValue[]>(
    existing?.frequencyDays ?? EMPTY_DEFAULTS.frequencyDays,
  );
  const [model, setModel] = useState(existing?.model ?? defaultModel?.model ?? "");
  const [provider, setProvider] = useState(existing?.provider ?? defaultModel?.provider ?? "");
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>(
    existing?.reasoningLevel ?? EMPTY_DEFAULTS.reasoningLevel,
  );

  // ── Clear all ────────────────────────────────────────────────────────
  const [clearPending, setClearPending] = useState(false);

  const handleClear = () => {
    if (clearPending) {
      setName(EMPTY_DEFAULTS.name);
      setPrompt(EMPTY_DEFAULTS.prompt);
      setFrequency(EMPTY_DEFAULTS.frequency);
      setFrequencyTime(EMPTY_DEFAULTS.frequencyTime);
      setFrequencyDays(EMPTY_DEFAULTS.frequencyDays);
      setReasoningLevel(EMPTY_DEFAULTS.reasoningLevel);
      setClearPending(false);
    } else {
      setClearPending(true);
      setTimeout(() => setClearPending(false), 2500);
    }
  };

  // ── Template application ─────────────────────────────────────────────
  const applyTemplate = useCallback((template: AutomationTemplate) => {
    const p = template.preset;
    if (p.name !== undefined) setName(p.name);
    if (p.prompt !== undefined) setPrompt(p.prompt);
    if (p.frequency !== undefined) setFrequency(p.frequency);
    if (p.frequencyTime !== undefined) setFrequencyTime(p.frequencyTime);
    if (p.frequencyDays !== undefined) setFrequencyDays(p.frequencyDays);
  }, []);

  // ── Day toggle ───────────────────────────────────────────────────────
  const toggleDay = (day: DayValue) => {
    setFrequencyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  // ── Time helpers ─────────────────────────────────────────────────────
  const { hour: selectedHour, minute: selectedMinute } = splitTime(frequencyTime);
  const setHour = (h: string) => setFrequencyTime(`${h}:${selectedMinute}`);
  const setMinute = (m: string) => setFrequencyTime(`${selectedHour}:${m}`);

  // ── Submission ───────────────────────────────────────────────────────
  const isReady = name.trim().length > 0 || prompt.trim().length > 0;

  const handleSave = () => {
    if (!isReady) return;
    onSave({
      name,
      prompt,
      project: project || defaultProject,
      frequency,
      frequencyTime,
      frequencyDays,
      model,
      provider,
      reasoningLevel,
    });
  };

  const selectedModelLabel =
    modelOptions.find((o) => o.model === model)?.label ?? (model || "Model");

  const showTimePicker = FREQUENCIES_WITH_TIME.has(frequency);
  const showDayPicker = FREQUENCIES_WITH_DAYS.has(frequency);

  // ── Input class shared across all text fields ────────────────────────
  const inputCls =
    "h-9 w-full rounded-full border border-input bg-background/60 px-4 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-ring transition-colors";

  return (
    <DialogPopup className="max-w-lg" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-base font-semibold">
          {existing ? "Edit automation" : "New automation"}
        </DialogTitle>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-3 px-6 pb-2 pt-0">
        {/* ── Name ── */}
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Automation name…"
          className={inputCls}
        />

        {/* ── Prompt ── */}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what the agent should do…"
          className="min-h-28 resize-none rounded-2xl"
        />

        {/* ── Chips bar ── */}
        <div className="flex flex-wrap items-center gap-1">
          {/* Project */}
          {projectNames.length > 0 && (
            <Menu modal={false}>
              <MenuTrigger
                render={
                  <ChipButton
                    icon={<FolderIcon className="size-3.5 shrink-0" />}
                    label={project || "Project"}
                  />
                }
              />
              <MenuPopup align="start">
                <MenuRadioGroup value={project} onValueChange={(v) => v && setProject(v)}>
                  {projectNames.map((p) => (
                    <MenuRadioItem key={p} value={p}>
                      {p}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
          )}

          {/* Frequency */}
          <Menu modal={false}>
            <MenuTrigger
              render={
                <ChipButton
                  icon={<CalendarIcon className="size-3.5 shrink-0" />}
                  label={FREQUENCY_LABELS[frequency]}
                />
              }
            />
            <MenuPopup align="start">
              <MenuRadioGroup
                value={frequency}
                onValueChange={(v) => v && setFrequency(v as FrequencyType)}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <MenuRadioItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>

          {/* Time (hour + minute) — same row as chips */}
          {showTimePicker && (
            <div className="flex items-center gap-0.5">
              {/* Hour */}
              <Menu modal={false}>
                <MenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-2 text-xs tabular-nums text-muted-foreground/70 hover:bg-accent hover:text-foreground/90"
                    >
                      {selectedHour}
                      <ChevronDownIcon className="size-3 opacity-50" />
                    </Button>
                  }
                />
                <MenuPopup className="max-h-48 overflow-y-auto" align="start">
                  <MenuRadioGroup value={selectedHour} onValueChange={(v) => v && setHour(v)}>
                    {HOURS.map((h) => (
                      <MenuRadioItem key={h} value={h}>
                        {h}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>

              <span className="text-xs text-muted-foreground/50">:</span>

              {/* Minute */}
              <Menu modal={false}>
                <MenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-2 text-xs tabular-nums text-muted-foreground/70 hover:bg-accent hover:text-foreground/90"
                    >
                      {selectedMinute}
                      <ChevronDownIcon className="size-3 opacity-50" />
                    </Button>
                  }
                />
                <MenuPopup align="start">
                  <MenuRadioGroup value={selectedMinute} onValueChange={(v) => v && setMinute(v)}>
                    {MINUTES.map((m) => (
                      <MenuRadioItem key={m} value={m}>
                        {m}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuPopup>
              </Menu>
            </div>
          )}

          {/* Model */}
          <Menu modal={false}>
            <MenuTrigger
              render={
                <ChipButton
                  icon={<SparklesIcon className="size-3.5 shrink-0" />}
                  label={selectedModelLabel}
                />
              }
            />
            <MenuPopup align="start">
              <MenuRadioGroup
                value={model}
                onValueChange={(v) => {
                  if (!v) return;
                  setModel(v);
                  const opt = modelOptions.find((o) => o.model === v);
                  if (opt) setProvider(opt.provider);
                }}
              >
                {modelOptions.map((o) => (
                  <MenuRadioItem key={`${o.provider}:${o.model}`} value={o.model}>
                    {o.label}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>

          {/* Reasoning */}
          <Menu modal={false}>
            <MenuTrigger
              render={
                <ChipButton
                  icon={<BrainIcon className="size-3.5 shrink-0" />}
                  label={REASONING_LEVEL_LABELS[reasoningLevel]}
                />
              }
            />
            <MenuPopup align="start">
              <MenuGroup>
                <div className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                  Reasoning
                </div>
                <MenuRadioGroup
                  value={reasoningLevel}
                  onValueChange={(v) => v && setReasoningLevel(v as ReasoningLevel)}
                >
                  {REASONING_LEVEL_OPTIONS.map((r) => (
                    <MenuRadioItem key={r} value={r}>
                      {REASONING_LEVEL_LABELS[r]}
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuGroup>
            </MenuPopup>
          </Menu>
        </div>

        {/* ── Day pills (same section, shown conditionally) ── */}
        {showDayPicker && (
          <div className="flex flex-wrap gap-1.5">
            {DAY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => toggleDay(value)}
                className={cn(
                  "h-7 rounded-full border px-3 text-xs font-medium transition-colors",
                  frequencyDays.includes(value)
                    ? "border-ring bg-accent text-foreground"
                    : "border-border/60 text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── Templates (create mode only, shown at bottom) ── */}
        {!existing && (
          <>
            <div className="mt-1 border-t border-border/50 pt-3">
              <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                Templates
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="flex flex-col gap-1 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground/70">{t.icon}</span>
                      <span className="text-xs font-medium text-foreground">{t.title}</span>
                    </div>
                    <span className="text-[10px] leading-tight text-muted-foreground/60">
                      {t.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogPanel>

      <DialogFooter variant="bare">
        {/* Clear all — two-tap confirm pattern */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "mr-auto rounded-full text-xs transition-colors",
            clearPending ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground/60",
          )}
          onClick={handleClear}
        >
          {clearPending ? "Confirm clear" : "Clear fields"}
        </Button>

        <DialogClose
          render={
            <Button variant="ghost" size="sm" className="rounded-full">
              Cancel
            </Button>
          }
        />
        <DialogClose
          disabled={!isReady}
          render={
            <Button size="sm" disabled={!isReady} className="rounded-full" onClick={handleSave}>
              {existing ? "Save changes" : "Create"}
            </Button>
          }
        />
      </DialogFooter>
    </DialogPopup>
  );
}
