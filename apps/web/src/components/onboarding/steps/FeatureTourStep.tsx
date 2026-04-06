import {
  BrainCircuitIcon,
  DiffIcon,
  FolderOpenIcon,
  SmartphoneIcon,
  SparklesIcon,
  TerminalIcon,
} from "lucide-react";

const FEATURES = [
  {
    icon: BrainCircuitIcon,
    title: "Multi-provider AI",
    description: "Switch between Codex, Claude, Gemini, and more — all in one place.",
  },
  {
    icon: FolderOpenIcon,
    title: "Projects & Threads",
    description:
      "Organize sessions by directory. Pick up any conversation exactly where you left off.",
  },
  {
    icon: TerminalIcon,
    title: "Built-in Terminal",
    description: "Run commands alongside your agent without leaving the window.",
  },
  {
    icon: DiffIcon,
    title: "Diff Viewer",
    description: "See every file change your agent proposes before it lands.",
  },
  {
    icon: SmartphoneIcon,
    title: "Mobile Companion",
    description: "Review, approve, and continue sessions from your phone.",
  },
  {
    icon: SparklesIcon,
    title: "Skills & Automations",
    description: "Extend Bird Code with custom behaviors that run before or after any task.",
  },
] as const;

export function FeatureTourStep() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">What Bird Code can do</h2>
        <p className="text-sm text-muted-foreground">
          Here's a quick look at what's waiting for you.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="rounded-xl border bg-card px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium leading-tight">{feature.title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
