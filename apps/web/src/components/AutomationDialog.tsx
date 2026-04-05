/**
 * AutomationDialog — Modal dialog for creating or editing an automation.
 *
 * Supports all fields from the spec:
 *  - Name, Prompt
 *  - Project (from store), Frequency, Model (from server providers), Reasoning Level
 *  - Frequency time and custom day picker
 *  - Templates to quick-start with a preset (create mode only)
 */
import {
  BrainIcon,
  CalendarIcon,
  ClockIcon,
  CodeIcon,
  FolderIcon,
  GitBranchIcon,
  SearchIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Select, SelectButton, SelectItem, SelectPopup } from "~/components/ui/select";
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
    description: "Generate a weekly progress report every Monday",
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
    description: "Review staged changes and suggest improvements",
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

// ── Helpers ───────────────────────────────────────────────────────────

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

// ── AutomationDialog ──────────────────────────────────────────────────

interface AutomationDialogProps {
  /** When provided the dialog is in edit mode and pre-fills from this item */
  existing?: AutomItem;
  onSave: (input: CreateAutomationInput) => void;
}

export function AutomationDialog({ existing, onSave }: AutomationDialogProps) {
  const projects = useStore((s) => s.projects);
  const serverProviders = useServerProviders();

  // Flatten providers → model options
  const modelOptions = useMemo(() => {
    const opts: { provider: string; model: string; label: string }[] = [];
    for (const provider of serverProviders) {
      if (!provider.enabled || provider.status !== "ready") continue;
      for (const model of provider.models) {
        opts.push({
          provider: provider.provider,
          model: model.slug,
          label: model.name,
        });
      }
    }
    // Fallback when no providers are connected yet
    if (opts.length === 0) {
      opts.push({ provider: "codex", model: "codex-1", label: "Codex 1" });
    }
    return opts;
  }, [serverProviders]);

  const projectNames = useMemo(() => {
    const names = projects.map((p) => p.cwd.split("/").at(-1) ?? p.cwd).filter(Boolean);
    return [...new Set(names)];
  }, [projects]);

  // ── Form state ──────────────────────────────────────────────────────

  const defaultProject = projectNames[0] ?? "";
  const defaultModel = modelOptions[0];

  const [name, setName] = useState(existing?.name ?? "");
  const [prompt, setPrompt] = useState(existing?.prompt ?? "");
  const [project, setProject] = useState(existing?.project ?? defaultProject);
  const [frequency, setFrequency] = useState<FrequencyType>(existing?.frequency ?? "manual");
  const [frequencyTime, setFrequencyTime] = useState(existing?.frequencyTime ?? "09:00");
  const [frequencyDays, setFrequencyDays] = useState<DayValue[]>(existing?.frequencyDays ?? []);
  const [model, setModel] = useState(existing?.model ?? defaultModel?.model ?? "");
  const [provider, setProvider] = useState(existing?.provider ?? defaultModel?.provider ?? "");
  const [reasoningLevel, setReasoningLevel] = useState<ReasoningLevel>(
    existing?.reasoningLevel ?? "none",
  );

  // ── Template application ────────────────────────────────────────────

  const applyTemplate = useCallback((template: AutomationTemplate) => {
    const p = template.preset;
    if (p.name !== undefined) setName(p.name);
    if (p.prompt !== undefined) setPrompt(p.prompt);
    if (p.frequency !== undefined) setFrequency(p.frequency);
    if (p.frequencyTime !== undefined) setFrequencyTime(p.frequencyTime);
    if (p.frequencyDays !== undefined) setFrequencyDays(p.frequencyDays);
  }, []);

  // ── Day picker toggle ───────────────────────────────────────────────

  const toggleDay = (day: DayValue) => {
    setFrequencyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  // ── Submission ──────────────────────────────────────────────────────

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

  const selectedModelOption = modelOptions.find((o) => o.model === model);
  const showTimePicker = FREQUENCIES_WITH_TIME.has(frequency);
  const showDayPicker = FREQUENCIES_WITH_DAYS.has(frequency);

  return (
    <DialogPopup className="max-w-xl" showCloseButton={false}>
      <DialogHeader>
        <DialogTitle className="text-base">
          {existing ? "Edit automation" : "New automation"}
        </DialogTitle>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-4 px-6 pb-2 pt-0">
        {/* Templates — shown only in create mode */}
        {!existing && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Start from a template</p>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-accent hover:border-border"
                >
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    {t.icon}
                    <span className="text-xs font-medium text-foreground">{t.title}</span>
                  </div>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily standup summary"
            className="h-8 rounded-lg border border-input bg-background px-3 text-sm outline-none ring-ring/24 placeholder:text-muted-foreground/60 focus:border-ring focus:ring-[3px]"
          />
        </div>

        {/* Prompt */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Prompt</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what the agent should do…"
            className="min-h-24 resize-none"
          />
        </div>

        {/* Row: Project + Frequency */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <Select value={project} onValueChange={(v) => setProject(v ?? project)}>
              <SelectButton size="sm" className="w-full">
                <FolderIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{project || "Select project"}</span>
              </SelectButton>
              <SelectPopup>
                {projectNames.length > 0 ? (
                  projectNames.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>
                    No projects
                  </SelectItem>
                )}
              </SelectPopup>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Frequency</label>
            <Select value={frequency} onValueChange={(v) => v && setFrequency(v as FrequencyType)}>
              <SelectButton size="sm" className="w-full">
                <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{FREQUENCY_LABELS[frequency]}</span>
              </SelectButton>
              <SelectPopup>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FREQUENCY_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </div>

        {/* Time picker */}
        {showTimePicker && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Time</label>
            <input
              type="time"
              value={frequencyTime}
              onChange={(e) => setFrequencyTime(e.target.value)}
              className="h-8 w-36 rounded-lg border border-input bg-background px-3 text-sm outline-none ring-ring/24 focus:border-ring focus:ring-[3px]"
            />
          </div>
        )}

        {/* Day picker */}
        {showDayPicker && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Day(s)</label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={cn(
                    "h-7 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    frequencyDays.includes(value)
                      ? "border-ring bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Row: Model + Reasoning */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <Select
              value={model}
              onValueChange={(v) => {
                if (!v) return;
                setModel(v);
                const opt = modelOptions.find((o) => o.model === v);
                if (opt) setProvider(opt.provider);
              }}
            >
              <SelectButton size="sm" className="w-full">
                <SparklesIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">
                  {selectedModelOption?.label ?? (model || "Select model")}
                </span>
              </SelectButton>
              <SelectPopup>
                {modelOptions.map((o) => (
                  <SelectItem key={`${o.provider}:${o.model}`} value={o.model}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reasoning</label>
            <Select
              value={reasoningLevel}
              onValueChange={(v) => v && setReasoningLevel(v as ReasoningLevel)}
            >
              <SelectButton size="sm" className="w-full">
                <BrainIcon className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{REASONING_LEVEL_LABELS[reasoningLevel]}</span>
              </SelectButton>
              <SelectPopup>
                {REASONING_LEVEL_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASONING_LEVEL_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </div>
      </DialogPanel>

      <DialogFooter variant="bare">
        <DialogClose
          render={
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          }
        />
        <DialogClose
          disabled={!isReady}
          render={
            <Button size="sm" disabled={!isReady} onClick={handleSave}>
              {existing ? "Save changes" : "Create automation"}
            </Button>
          }
        />
      </DialogFooter>
    </DialogPopup>
  );
}
