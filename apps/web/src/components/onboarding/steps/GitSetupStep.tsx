import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { cn, resolveApiUrl } from "~/lib/utils";
import type { SetupGitStatusResult } from "@t3tools/contracts";

type Platform = "macos" | "linux" | "windows";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

const GIT_INSTALL_COMMANDS: Record<Platform, string> = {
  macos: "xcode-select --install",
  linux: "sudo apt install git",
  windows: "winget install Git.Git",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  // Store the timeout id so we can clear it on unmount and avoid calling
  // setCopied after the component has been removed from the tree.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 1800);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="ml-1.5 shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-foreground transition-colors"
    >
      {copied ? (
        <CheckIcon className="size-3.5 text-green-500" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

function CommandRow({ label, command }: { label: string; command: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs">
        <span className="text-foreground/80 truncate">{command}</span>
        <CopyButton text={command} />
      </div>
    </div>
  );
}

export function GitSetupStep() {
  const [platform] = useState<Platform>(detectPlatform);
  const [status, setStatus] = useState<SetupGitStatusResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(resolveApiUrl({ pathname: "/api/setup/git-status" }));
      if (res.ok) {
        setStatus((await res.json()) as SetupGitStatusResult);
      }
    } catch {
      // offline or server unavailable — leave null
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Git setup</h2>
          <p className="text-sm text-muted-foreground">
            Git lets Bird Code track changes and manage branches alongside your agent.
          </p>
        </div>
        <Button size="xs" variant="ghost" onClick={() => void fetchStatus()} disabled={loading}>
          <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Installed check */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Git installed</span>
          {loading ? (
            <Badge variant="outline" className="text-[10px]">
              Checking…
            </Badge>
          ) : status?.installed ? (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500/30 bg-green-500/8 text-[10px]"
            >
              <CheckIcon className="size-3 mr-1" />
              {status.version ?? "Installed"}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-amber-500 border-amber-500/30 bg-amber-500/8 text-[10px]"
            >
              Not found
            </Badge>
          )}
        </div>
        {!loading && !status?.installed && (
          <CommandRow label="Install git:" command={GIT_INSTALL_COMMANDS[platform]} />
        )}
      </div>

      {/* Identity check */}
      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Git identity</span>
          {loading ? (
            <Badge variant="outline" className="text-[10px]">
              Checking…
            </Badge>
          ) : status?.nameConfigured && status.emailConfigured ? (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500/30 bg-green-500/8 text-[10px]"
            >
              <CheckIcon className="size-3 mr-1" />
              Configured
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-amber-500 border-amber-500/30 bg-amber-500/8 text-[10px]"
            >
              Not set
            </Badge>
          )}
        </div>

        {/* Also verify that the values themselves are non-empty strings, not just
            that the flags are set — the server may return true with an empty value. */}
        {status?.nameConfigured && status.emailConfigured && status.name && status.email ? (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{status.name}</p>
            <p className="text-xs text-muted-foreground">{status.email}</p>
          </div>
        ) : (
          !loading && (
            <div className="space-y-2">
              <CommandRow
                label="Set your name:"
                command={`git config --global user.name "Your Name"`}
              />
              <CommandRow
                label="Set your email:"
                command={`git config --global user.email "you@example.com"`}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
