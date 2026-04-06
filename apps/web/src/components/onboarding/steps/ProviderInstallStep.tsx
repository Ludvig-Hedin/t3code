import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ProviderKind } from "@t3tools/contracts";
import { Badge } from "../../ui/badge";
import { ClaudeAI, Gemini, OllamaIcon, OpenAI, OpenCodeIcon } from "../../Icons";
import { useServerProviders } from "../../../rpc/serverState";
import { cn } from "~/lib/utils";

type Platform = "macos" | "linux" | "windows";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
};

interface ProviderInstallInfo {
  id: ProviderKind;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  commands: Record<Platform, string[]>;
}

const PROVIDERS: ProviderInstallInfo[] = [
  {
    id: "codex",
    label: "Codex",
    Icon: OpenAI,
    commands: {
      macos: ["npm install -g @openai/codex"],
      linux: ["npm install -g @openai/codex"],
      windows: ["npm install -g @openai/codex"],
    },
  },
  {
    id: "claudeAgent",
    label: "Claude",
    Icon: ClaudeAI,
    commands: {
      macos: ["npm install -g @anthropic-ai/claude-code"],
      linux: ["npm install -g @anthropic-ai/claude-code"],
      windows: ["npm install -g @anthropic-ai/claude-code"],
    },
  },
  {
    id: "gemini",
    label: "Gemini",
    Icon: Gemini,
    commands: {
      macos: ["npm install -g @google/gemini-cli"],
      linux: ["npm install -g @google/gemini-cli"],
      windows: ["npm install -g @google/gemini-cli"],
    },
  },
  {
    id: "opencode",
    label: "OpenCode",
    Icon: OpenCodeIcon,
    commands: {
      macos: ["curl -fsSL https://opencode.ai/install | sh"],
      linux: ["curl -fsSL https://opencode.ai/install | sh"],
      windows: ["npm install -g opencode"],
    },
  },
  {
    id: "ollama",
    label: "Ollama",
    Icon: OllamaIcon,
    commands: {
      macos: ["brew install ollama"],
      linux: ["curl -fsSL https://ollama.ai/install.sh | sh"],
      windows: ["winget install Ollama.Ollama"],
    },
  },
];

function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-1.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
      aria-label="Copy command"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

export function ProviderInstallStep() {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const serverProviders = useServerProviders();
  const installedIds = new Set(serverProviders.filter((p) => p.installed).map((p) => p.provider));
  const platforms: Platform[] = ["macos", "linux", "windows"];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Install providers</h2>
        <p className="text-sm text-muted-foreground">
          Bird Code works with multiple AI coding agents. Install the ones you want to use.
        </p>
      </div>

      {/* Platform tabs */}
      <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
        {platforms.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPlatform(p)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              platform === p
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Provider rows */}
      <div className="space-y-2">
        {PROVIDERS.map((provider) => {
          const isInstalled = installedIds.has(provider.id);
          const commands = provider.commands[platform];
          const Icon = provider.Icon;
          return (
            <div
              key={provider.id}
              className={cn("rounded-xl border bg-card px-4 py-3", isInstalled && "opacity-60")}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{provider.label}</span>
                </div>
                {isInstalled && (
                  <Badge
                    variant="outline"
                    className="text-green-500 border-green-500/30 bg-green-500/8 text-[10px]"
                  >
                    <CheckIcon className="size-3 mr-1" />
                    Installed
                  </Badge>
                )}
              </div>
              {commands.map((cmd) => (
                <div
                  key={cmd}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs"
                >
                  <span
                    className={cn(
                      "text-foreground/80 truncate",
                      isInstalled && "line-through text-muted-foreground/50",
                    )}
                  >
                    {cmd}
                  </span>
                  {!isInstalled && <CopyCommandButton command={cmd} />}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
