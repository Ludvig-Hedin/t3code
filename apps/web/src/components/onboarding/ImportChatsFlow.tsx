/**
 * ImportChatsFlow — reusable conversation import UI.
 *
 * Used in:
 *  - Onboarding step 4
 *  - Settings → Providers tab ("Import Conversations" section)
 *
 * Flow: scan → select providers → import → done
 */
import { useEffect, useState } from "react";
import { CheckIcon, DownloadIcon, LoaderIcon } from "lucide-react";
import { PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import type { ImportDetectedProject, ImportExecuteResult } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toastManager } from "../ui/toast";
import { ClaudeAI, Gemini, OllamaIcon, OpenAI, OpenCodeIcon } from "../Icons";
import { cn, resolveApiUrl } from "~/lib/utils";

const PROVIDER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
};

type Phase = "scan" | "select" | "importing" | "done";

function projectKey(p: ImportDetectedProject): string {
  return `${p.provider}::${p.historyPath}`;
}

/**
 * Groups projects by provider and calculates thread counts per provider.
 */
function groupByProvider(
  projects: ImportDetectedProject[],
): Map<string, { projects: ImportDetectedProject[]; threadCount: number }> {
  const grouped = new Map<string, { projects: ImportDetectedProject[]; threadCount: number }>();

  for (const project of projects) {
    if (!grouped.has(project.provider)) {
      grouped.set(project.provider, { projects: [], threadCount: 0 });
    }
    const group = grouped.get(project.provider)!;
    group.projects.push(project);
    group.threadCount += project.threadCount;
  }

  return grouped;
}

/**
 * @param onDone — optional callback fired after a successful import (used by OnboardingSheet to advance the step)
 */
export function ImportChatsFlow({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [projects, setProjects] = useState<ImportDetectedProject[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportExecuteResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const runScan = async () => {
    setPhase("scan");
    setScanError(null);
    try {
      const res = await fetch(resolveApiUrl({ pathname: "/api/setup/import/scan" }));
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const data = (await res.json()) as { projects: ImportDetectedProject[] };
      setProjects(data.projects);
      // Select all providers by default
      const grouped = groupByProvider(data.projects);
      setSelectedProviders(new Set(grouped.keys()));
      setPhase("select");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
      setPhase("select");
    }
  };

  useEffect(() => {
    void runScan();
  }, []);

  const toggleProvider = (provider: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  const runImport = async () => {
    // Get all projects from selected providers
    const selections = projects
      .filter((p) => selectedProviders.has(p.provider))
      .map((p) => ({
        provider: p.provider,
        projectPath: p.projectPath,
        historyPath: p.historyPath,
        projectName: p.projectName,
      }));

    if (selections.length === 0) {
      toastManager.add({ type: "info", title: "Nothing selected" });
      return;
    }

    setPhase("importing");
    try {
      const res = await fetch(resolveApiUrl({ pathname: "/api/setup/import/execute" }), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      if (!res.ok) throw new Error(`Import failed (${res.status})`);
      const data = (await res.json()) as ImportExecuteResult;
      setResult(data);
      setPhase("done");
      toastManager.add({
        type: data.errors.length === 0 ? "success" : "warning",
        title: "Import complete",
        description: `${data.importedProjectCount} projects, ${data.importedThreadCount} threads imported.`,
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPhase("select");
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === "scan") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Scanning for existing conversations…</p>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === "done" && result) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-green-500/12">
          <CheckIcon className="size-6 text-green-500" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold">Import complete</p>
          <p className="text-sm text-muted-foreground">
            {result.importedProjectCount} project{result.importedProjectCount !== 1 ? "s" : ""},{" "}
            {result.importedThreadCount} thread{result.importedThreadCount !== 1 ? "s" : ""} added
            to your sidebar.
          </p>
        </div>
        {result.errors.length > 0 && (
          <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-left">
            <p className="text-xs font-medium text-amber-600 mb-1">Some projects had issues:</p>
            {result.errors.map((e) => (
              <p key={e} className="text-xs text-muted-foreground">
                {e}
              </p>
            ))}
          </div>
        )}
        {onDone && (
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    );
  }

  // ── Importing ─────────────────────────────────────────────────────────────
  if (phase === "importing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Importing conversations…</p>
      </div>
    );
  }

  // ── Select ────────────────────────────────────────────────────────────────
  const grouped = groupByProvider(projects);
  const selectedCount = selectedProviders.size;
  const totalThreadsForSelectedProviders = Array.from(grouped.entries())
    .filter(([provider]) => selectedProviders.has(provider))
    .reduce((sum, [, group]) => sum + group.threadCount, 0);

  return (
    <div className="space-y-4">
      {scanError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-xs text-red-500">
          {scanError}
        </div>
      )}

      {projects.length === 0 && !scanError ? (
        <div className="rounded-xl border bg-muted/30 px-4 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No conversations found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Install a provider and start a session to see conversations here.
          </p>
          <Button size="xs" variant="outline" className="mt-3" onClick={() => void runScan()}>
            Scan again
          </Button>
        </div>
      ) : (
        <>
          {/* Count + select/clear controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selectedCount} provider{selectedCount !== 1 ? "s" : ""} selected (~
              {totalThreadsForSelectedProviders} threads)
            </span>
            <div className="flex gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSelectedProviders(new Set(grouped.keys()))}
              >
                All
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setSelectedProviders(new Set())}>
                None
              </Button>
            </div>
          </div>

          {/* Provider list */}
          <div className="space-y-1.5 pr-1">
            {Array.from(grouped.entries()).map(([provider, group]) => {
              const isSelected = selectedProviders.has(provider);
              const ProviderIcon = PROVIDER_ICON[provider];
              const providerLabel =
                PROVIDER_DISPLAY_NAMES[provider as keyof typeof PROVIDER_DISPLAY_NAMES] ?? provider;
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => toggleProvider(provider)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    isSelected
                      ? "border-primary/30 bg-primary/6"
                      : "border-border bg-card hover:bg-accent",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-4 items-center justify-center rounded border-2 shrink-0 transition-colors",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent",
                    )}
                  >
                    {isSelected && <CheckIcon className="size-3 text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {ProviderIcon && (
                        <ProviderIcon className="size-3 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs font-medium text-muted-foreground">
                        {providerLabel}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {group.threadCount} {group.threadCount === 1 ? "thread" : "threads"}
                  </Badge>
                </button>
              );
            })}
          </div>

          <Button
            className="w-full"
            disabled={selectedCount === 0}
            onClick={() => void runImport()}
          >
            <DownloadIcon className="size-4 mr-2" />
            Import{" "}
            {selectedCount > 0
              ? `${totalThreadsForSelectedProviders} thread${totalThreadsForSelectedProviders !== 1 ? "s" : ""}`
              : ""}
          </Button>
        </>
      )}
    </div>
  );
}
