# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 5-step right-side onboarding sheet (auto-shown on first launch, reopenable from Settings) covering provider install, mobile pairing, git setup, feature tour, and a conversation importer that creates real Bird Code projects/threads from detected provider history.

**Architecture:** A global `OnboardingSheet` component mounted in `AppBootstrapGate` (`__root.tsx`) renders a right-side Sheet (using the existing `Sheet` component). State is persisted in `localStorage` (`birdcode:onboarding`). Server-side import and git-check logic are added as new Effect HTTP routes in `apps/server/src/setupRoutes.ts` and composed into the server layer. The `ImportChatsFlow` component is reused in both onboarding step 5 and the Settings → Providers tab.

**Tech Stack:** React 19, TanStack Router, Tailwind CSS v4, Effect HTTP, existing `Sheet`/`Button`/`Badge` UI components, `@t3tools/contracts` orchestration commands (`project.create`, `thread.create`), Node `child_process` for git checks, Node `fs` for directory scanning.

---

## File Map

### New Files

| File                                                               | Purpose                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/importHistory.ts`                          | Schemas: `ImportScanResult`, `ImportRequest`, `GitStatusResult`                                          |
| `apps/server/src/setupRoutes.ts`                                   | HTTP routes: `GET /api/setup/git-status`, `GET /api/setup/import/scan`, `POST /api/setup/import/execute` |
| `apps/web/src/hooks/useOnboarding.ts`                              | `useOnboarding()` — localStorage-backed state (open, currentStep, complete)                              |
| `apps/web/src/components/onboarding/OnboardingSheet.tsx`           | Root sheet component, step router, nav buttons                                                           |
| `apps/web/src/components/onboarding/steps/ProviderInstallStep.tsx` | Step 1 — install commands with platform tabs                                                             |
| `apps/web/src/components/onboarding/steps/MobilePairingStep.tsx`   | Step 2 — wraps `BirdCodeMobileCompanionPanel`                                                            |
| `apps/web/src/components/onboarding/steps/GitSetupStep.tsx`        | Step 3 — git install + config check                                                                      |
| `apps/web/src/components/onboarding/steps/FeatureTourStep.tsx`     | Step 4 — 6-card feature grid                                                                             |
| `apps/web/src/components/onboarding/ImportChatsFlow.tsx`           | Step 5 + Settings reuse — scan → select → import                                                         |

### Modified Files

| File                                                      | Change                                                    |
| --------------------------------------------------------- | --------------------------------------------------------- |
| `packages/contracts/src/index.ts`                         | `export * from "./importHistory"`                         |
| `apps/server/src/server.ts`                               | Compose `setupRouteLayer` into server                     |
| `apps/web/src/routes/__root.tsx`                          | Mount `<OnboardingSheet />` in `AppBootstrapGate`         |
| `apps/web/src/components/settings/SettingsSidebarNav.tsx` | Add "Setup Guide" footer button                           |
| `apps/web/src/components/settings/SettingsPanels.tsx`     | Add `ImportChatsFlow` section to `ProvidersSettingsPanel` |

---

## Task 1: Import History Contracts

**Files:**

- Create: `packages/contracts/src/importHistory.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create the contracts file**

```typescript
// packages/contracts/src/importHistory.ts
import { Schema } from "effect";
import { ProviderKind } from "./orchestration";

/** A detected project directory found under a provider's history path. */
export const ImportDetectedProject = Schema.Struct({
  provider: ProviderKind,
  projectName: Schema.String,
  /** Absolute path on disk — becomes the Bird Code workspaceRoot. */
  projectPath: Schema.String,
  /** Provider-local path to the history directory. */
  historyPath: Schema.String,
  /** Number of conversation files detected (approximate thread count). */
  threadCount: Schema.Number,
});
export type ImportDetectedProject = typeof ImportDetectedProject.Type;

export const ImportScanResult = Schema.Struct({
  projects: Schema.Array(ImportDetectedProject),
});
export type ImportScanResult = typeof ImportScanResult.Type;

/** One selection from the scan result the user wants imported. */
export const ImportSelection = Schema.Struct({
  provider: ProviderKind,
  projectPath: Schema.String,
  historyPath: Schema.String,
  projectName: Schema.String,
});
export type ImportSelection = typeof ImportSelection.Type;

export const ImportRequest = Schema.Struct({
  selections: Schema.Array(ImportSelection),
});
export type ImportRequest = typeof ImportRequest.Type;

export const ImportExecuteResult = Schema.Struct({
  importedProjectCount: Schema.Number,
  importedThreadCount: Schema.Number,
  errors: Schema.Array(Schema.String),
});
export type ImportExecuteResult = typeof ImportExecuteResult.Type;

export const GitStatusResult = Schema.Struct({
  installed: Schema.Boolean,
  /** git --version output, e.g. "git version 2.39.0" */
  version: Schema.NullOr(Schema.String),
  /** true if git config --global user.name is set */
  nameConfigured: Schema.Boolean,
  /** true if git config --global user.email is set */
  emailConfigured: Schema.Boolean,
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
});
export type GitStatusResult = typeof GitStatusResult.Type;
```

- [ ] **Step 2: Export from contracts index**

In `packages/contracts/src/index.ts`, add:

```typescript
export * from "./importHistory";
```

(append after the last existing `export * from` line)

- [ ] **Step 3: Verify types compile**

```bash
cd /path/to/t3code && bun typecheck --filter @t3tools/contracts
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/importHistory.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add ImportHistory and GitStatus schemas"
```

---

## Task 2: Server — Setup Routes

**Files:**

- Create: `apps/server/src/setupRoutes.ts`

- [ ] **Step 1: Create the route file**

> **CRITICAL — Effect generator pattern:** Inside `Effect.gen(function* () { ... })`, use `yield*` (not `await`) to unwrap Effect values. Raw Node.js promises must be wrapped: `yield* Effect.tryPromise(() => somePromise)`. Follow the exact pattern used in `apps/server/src/mobile.ts`. The helper functions (`resolveProviderHistoryPath`, `scanProviderHistory`) are plain `async` functions called outside the generator via `Effect.tryPromise`.

```typescript
// apps/server/src/setupRoutes.ts
import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type ImportRequest,
  type ImportExecuteResult,
  ProjectId,
  ProviderKind,
  ThreadId,
} from "@t3tools/contracts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine";

const execAsync = promisify(exec);

// ── Git Status ────────────────────────────────────────────────────────────────

export const gitStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/setup/git-status",
  Effect.gen(function* () {
    // Use yield* (not await) to unwrap Effects inside Effect.gen
    const versionResult = yield* Effect.tryPromise(() =>
      execAsync("git --version")
        .then((r) => r.stdout.trim())
        .catch(() => null),
    ).pipe(Effect.orElseSucceed(() => null));
    const installed = versionResult !== null;

    const [name, email] = yield* Effect.tryPromise(() =>
      Promise.all([
        execAsync("git config --global user.name")
          .then((r) => r.stdout.trim() || null)
          .catch(() => null),
        execAsync("git config --global user.email")
          .then((r) => r.stdout.trim() || null)
          .catch(() => null),
      ]),
    ).pipe(Effect.orElseSucceed(() => [null, null] as const));

    return HttpServerResponse.json({
      installed,
      version: versionResult ?? null,
      nameConfigured: name !== null && name.length > 0,
      emailConfigured: email !== null && email.length > 0,
      name: name ?? null,
      email: email ?? null,
    });
  }),
);

// ── Provider history paths ────────────────────────────────────────────────────

/** Known provider history directory resolver. Returns null if path doesn't exist. */
async function resolveProviderHistoryPath(provider: string): Promise<string | null> {
  const home = os.homedir();
  const candidates: Record<string, string[]> = {
    codex: [
      process.env["CODEX_HOME"] ?? "",
      path.join(home, ".codex", "sessions"),
      path.join(home, ".codex"),
    ],
    claudeAgent: [path.join(home, ".claude", "projects"), path.join(home, ".claude")],
    gemini: [path.join(home, ".gemini", "sessions"), path.join(home, ".gemini")],
    opencode: [path.join(home, ".config", "opencode"), path.join(home, ".opencode")],
  };

  const paths = (candidates[provider] ?? []).filter(Boolean);
  for (const candidate of paths) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/** Scan one provider history dir for project-like subdirectories. */
async function scanProviderHistory(
  provider: string,
  historyRoot: string,
): Promise<
  Array<{ projectName: string; projectPath: string; historyPath: string; threadCount: number }>
> {
  const results: Array<{
    projectName: string;
    projectPath: string;
    historyPath: string;
    threadCount: number;
  }> = [];
  try {
    const entries = await fs.readdir(historyRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const historyPath = path.join(historyRoot, entry.name);
      // Count json/md files inside as a proxy for "threads"
      let threadCount = 0;
      try {
        const inner = await fs.readdir(historyPath);
        threadCount = inner.filter((f) => f.endsWith(".json") || f.endsWith(".md")).length;
      } catch {
        threadCount = 0;
      }
      // The project path is the directory that the agent was run in.
      // For Codex the folder name is typically base64url or a path-encoded project root.
      // We use the historyPath directory as the workspace root fallback.
      results.push({
        projectName: entry.name,
        projectPath: historyPath,
        historyPath,
        threadCount: Math.max(threadCount, 1),
      });
    }
  } catch {
    // directory unreadable — skip silently
  }
  return results;
}

// ── Import Scan ───────────────────────────────────────────────────────────────

export const importScanRouteLayer = HttpRouter.add(
  "GET",
  "/api/setup/import/scan",
  Effect.gen(function* () {
    const providersToScan: string[] = ["codex", "claudeAgent", "gemini", "opencode"];
    const allProjects: Array<{
      provider: string;
      projectName: string;
      projectPath: string;
      historyPath: string;
      threadCount: number;
    }> = [];

    for (const provider of providersToScan) {
      // yield* (not await) for all Effects inside Effect.gen
      const historyRoot = yield* Effect.tryPromise(() => resolveProviderHistoryPath(provider)).pipe(
        Effect.orElseSucceed(() => null),
      );

      if (!historyRoot) continue;

      const projects = yield* Effect.tryPromise(() =>
        scanProviderHistory(provider, historyRoot),
      ).pipe(Effect.orElseSucceed(() => []));

      for (const p of projects) {
        allProjects.push({ provider, ...p });
      }
    }

    return HttpServerResponse.json({ projects: allProjects });
  }),
);

// ── Import Execute ────────────────────────────────────────────────────────────

export const importExecuteRouteLayer = HttpRouter.add(
  "POST",
  "/api/setup/import/execute",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const bodyText = yield* Effect.tryPromise(() => request.text());
    const body = yield* Effect.try(() => JSON.parse(bodyText) as ImportRequest).pipe(
      Effect.orElseFail(() => new Error("Invalid JSON")),
    );

    const engine = yield* OrchestrationEngineService;
    let importedProjects = 0;
    let importedThreads = 0;
    const errors: string[] = [];

    for (const selection of body.selections) {
      try {
        const projectId = ProjectId.makeUnsafe(crypto.randomUUID());
        const projectCommandId = CommandId.makeUnsafe(`import:project:${crypto.randomUUID()}`);

        // yield* dispatchCommand — it returns an Effect, not a Promise
        yield* engine.dispatchCommand({
          type: "project.create",
          commandId: projectCommandId,
          projectId,
          title: selection.projectName,
          workspaceRoot: selection.projectPath,
          defaultModelSelection: null,
        });
        importedProjects++;

        // Scan for threads to create stubs for — wrap plain promise with Effect.tryPromise
        const conversationFiles = yield* Effect.tryPromise(() =>
          fs
            .readdir(selection.historyPath)
            .then((entries) =>
              entries.filter((f) => f.endsWith(".json") || f.endsWith(".md")).slice(0, 50),
            ),
        ).pipe(Effect.orElseSucceed(() => [] as string[]));

        // Create one thread stub per conversation file
        for (const file of conversationFiles) {
          const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
          const threadCommandId = CommandId.makeUnsafe(`import:thread:${crypto.randomUUID()}`);
          const title =
            file
              .replace(/\.(json|md)$/, "")
              .replace(/_/g, " ")
              .slice(0, 80) || "Imported conversation";

          yield* engine.dispatchCommand({
            type: "thread.create",
            commandId: threadCommandId,
            threadId,
            projectId,
            title,
            modelSelection: {
              provider: selection.provider as typeof ProviderKind.Type,
              model: "default",
            } as never,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          });
          importedThreads++;
        }

        // If no files found, still create one stub thread
        if (conversationFiles.length === 0) {
          const threadId = ThreadId.makeUnsafe(crypto.randomUUID());
          const threadCommandId = CommandId.makeUnsafe(`import:thread:${crypto.randomUUID()}`);
          yield* engine.dispatchCommand({
            type: "thread.create",
            commandId: threadCommandId,
            threadId,
            projectId,
            title: `${selection.projectName} (imported)`,
            modelSelection: {
              provider: selection.provider as typeof ProviderKind.Type,
              model: "default",
            } as never,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          });
          importedThreads++;
        }
      } catch (err) {
        errors.push(
          `Failed to import ${selection.projectName}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return HttpServerResponse.json({
      importedProjectCount: importedProjects,
      importedThreadCount: importedThreads,
      errors,
    });
  }),
);
```

> **Note for implementor:** `OrchestrationEngineService` is used in `apps/server/src/mobile.ts` — follow the same import pattern. If the `modelSelection` shape for the `thread.create` command requires a specific model string (not `"default"`), check `packages/contracts/src/model.ts` for `DEFAULT_*_MODEL` constants per provider and use those instead.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
bun typecheck --filter @t3tools/server
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/setupRoutes.ts
git commit -m "feat(server): add git-status and import scan/execute HTTP routes"
```

---

## Task 3: Register Setup Routes in Server

**Files:**

- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Read current server.ts to find where route layers are composed** (it's around lines 1-65 of the file you've read)

- [ ] **Step 2: Add import and compose the new route layers**

At the top of `apps/server/src/server.ts`, add to the imports:

```typescript
import { gitStatusRouteLayer, importScanRouteLayer, importExecuteRouteLayer } from "./setupRoutes";
```

Find where `attachmentsRouteLayer`, `projectFaviconRouteLayer`, `mobileCompanionRouteLayer` are composed (in the `HttpRouter` pipe chain). Add the three new layers alongside them:

```typescript
// In the HttpRouter composition chain — add after mobileCompanionRouteLayer:
const AppHttpRouter = HttpRouter.empty.pipe(
  HttpRouter.concat(attachmentsRouteLayer),
  HttpRouter.concat(projectFaviconRouteLayer),
  HttpRouter.concat(mobileCompanionRouteLayer),
  HttpRouter.concat(gitStatusRouteLayer), // ← add
  HttpRouter.concat(importScanRouteLayer), // ← add
  HttpRouter.concat(importExecuteRouteLayer), // ← add
  HttpRouter.concat(staticAndDevRouteLayer), // keep last (wildcard catch-all)
);
```

> **Note:** Check the exact composition pattern in `apps/server/src/server.ts` — it may use `Layer.provide` with `HttpRouter.add` rather than `HttpRouter.concat`. Follow whatever pattern the existing routes use. The key constraint is that `staticAndDevRouteLayer` (the `"*"` wildcard) must remain last.

- [ ] **Step 3: Typecheck**

```bash
bun typecheck --filter @t3tools/server
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/server.ts
git commit -m "feat(server): register setup HTTP routes"
```

---

## Task 4: Web — Onboarding State Hook

**Files:**

- Create: `apps/web/src/hooks/useOnboarding.ts`

- [ ] **Step 1: Create the hook**

```typescript
// apps/web/src/hooks/useOnboarding.ts
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "birdcode:onboarding";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface OnboardingState {
  completed: boolean;
  currentStep: OnboardingStep;
  open: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  currentStep: 1,
  open: false,
};

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OnboardingState>) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Manages onboarding sheet visibility and step progress.
 * Auto-opens on first launch (when `completed` is false and no prior state).
 */
export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    const loaded = loadState();
    // Auto-open on first visit (no prior storage entry at all)
    const hasStoredState = localStorage.getItem(STORAGE_KEY) !== null;
    return { ...loaded, open: !hasStoredState && !loaded.completed };
  });

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  const openOnboarding = useCallback(() => update({ open: true }), [update]);
  const closeOnboarding = useCallback(() => update({ open: false }), [update]);

  const goToStep = useCallback(
    (step: OnboardingStep) => update({ currentStep: step, open: true }),
    [update],
  );

  const nextStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= 5) {
        const next = { ...prev, open: false, completed: true };
        saveState(next);
        return next;
      }
      const next = { ...prev, currentStep: (prev.currentStep + 1) as OnboardingStep };
      saveState(next);
      return next;
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      const next = { ...prev, currentStep: (prev.currentStep - 1) as OnboardingStep };
      saveState(next);
      return next;
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    update({ completed: true, open: false });
  }, [update]);

  const skipStep = useCallback(() => {
    // Skipping is the same as next — advance without requiring completion
    nextStep();
  }, [nextStep]);

  return {
    open: state.open,
    currentStep: state.currentStep,
    completed: state.completed,
    openOnboarding,
    closeOnboarding,
    goToStep,
    nextStep,
    prevStep,
    completeOnboarding,
    skipStep,
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck --filter @t3tools/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useOnboarding.ts
git commit -m "feat(web): add useOnboarding state hook"
```

---

## Task 5: Step 1 — Provider Install

**Files:**

- Create: `apps/web/src/components/onboarding/steps/ProviderInstallStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/onboarding/steps/ProviderInstallStep.tsx
import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { ClaudeAI, Gemini, OllamaIcon, OpenAI, OpenCodeIcon } from "../../Icons";
import { useServerProviders } from "../../../rpc/serverState";
import { cn } from "~/lib/utils";

type Platform = "macos" | "linux" | "windows";

function detectPlatform(): Platform {
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
  id: string;
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
  const providers = useServerProviders();

  const installedIds = new Set(providers.filter((p) => p.installed).map((p) => p.provider));

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

      {/* Provider list */}
      <div className="space-y-2">
        {PROVIDERS.map((provider) => {
          const isInstalled = installedIds.has(provider.id as never);
          const commands = provider.commands[platform];
          return (
            <div
              key={provider.id}
              className={cn("rounded-xl border bg-card px-4 py-3", isInstalled && "opacity-60")}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <provider.Icon className="size-4 text-muted-foreground" />
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
                      "text-foreground/80",
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
```

- [ ] **Step 2: Typecheck**

```bash
bun typecheck --filter @t3tools/web
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/onboarding/steps/ProviderInstallStep.tsx
git commit -m "feat(web): onboarding step 1 - provider install"
```

---

## Task 6: Step 2 — Mobile Pairing

**Files:**

- Create: `apps/web/src/components/onboarding/steps/MobilePairingStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/onboarding/steps/MobilePairingStep.tsx
import { BirdCodeMobileCompanionPanel } from "../../settings/MobileCompanionPanel";

/**
 * Wraps the existing mobile pairing panel for the onboarding sheet context.
 * The panel already handles the localhost-unavailable case gracefully.
 */
export function MobilePairingStep() {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Pair your phone</h2>
        <p className="text-sm text-muted-foreground">
          Continue your coding sessions on mobile. Scan the QR code with Bird Code on your phone.
        </p>
      </div>
      {/*
        BirdCodeMobileCompanionPanel contains its own scroll container and full layout.
        We override its outer padding to fit cleanly inside the sheet panel.
      */}
      <div className="-mx-6 [&>div]:px-0 [&>div]:py-0">
        <BirdCodeMobileCompanionPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/components/onboarding/steps/MobilePairingStep.tsx
git commit -m "feat(web): onboarding step 2 - mobile pairing"
```

---

## Task 7: Step 3 — Git Setup

**Files:**

- Create: `apps/web/src/components/onboarding/steps/GitSetupStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/onboarding/steps/GitSetupStep.tsx
import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { cn } from "~/lib/utils";
import type { GitStatusResult } from "@t3tools/contracts";

type Platform = "macos" | "linux" | "windows";

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "linux";
}

const GIT_INSTALL_COMMANDS: Record<Platform, string> = {
  macos: "xcode-select --install",
  linux: "sudo apt install git  # or: sudo dnf install git",
  windows: "winget install Git.Git",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
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
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/git-status");
      if (res.ok) setStatus((await res.json()) as GitStatusResult);
    } catch {
      /* offline — leave null */
    }
    setLoading(false);
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

      {/* Installed status */}
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

        {!status?.installed && !loading && (
          <CommandRow label="Install git:" command={GIT_INSTALL_COMMANDS[platform]} />
        )}
      </div>

      {/* Config status */}
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

        {status?.nameConfigured && status.emailConfigured ? (
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
```

- [ ] **Step 2: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/components/onboarding/steps/GitSetupStep.tsx
git commit -m "feat(web): onboarding step 3 - git setup"
```

---

## Task 8: Step 4 — Feature Tour

**Files:**

- Create: `apps/web/src/components/onboarding/steps/FeatureTourStep.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/onboarding/steps/FeatureTourStep.tsx
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
      "Organize sessions by directory. Pick up any conversation exactly where you left it.",
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
```

- [ ] **Step 2: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/components/onboarding/steps/FeatureTourStep.tsx
git commit -m "feat(web): onboarding step 4 - feature tour"
```

---

## Task 9: ImportChatsFlow Component (Step 5 + Settings Reuse)

**Files:**

- Create: `apps/web/src/components/onboarding/ImportChatsFlow.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/onboarding/ImportChatsFlow.tsx
import { useEffect, useState } from "react";
import { CheckIcon, DownloadIcon, FolderIcon, LoaderIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toastManager } from "../ui/toast";
import { PROVIDER_DISPLAY_NAMES } from "@t3tools/contracts";
import type { ImportDetectedProject, ImportExecuteResult } from "@t3tools/contracts";
import { ClaudeAI, Gemini, OllamaIcon, OpenAI, OpenCodeIcon } from "../Icons";
import { cn } from "~/lib/utils";

const PROVIDER_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
};

type Phase = "scan" | "select" | "importing" | "done";

/**
 * Reusable import conversation flow.
 * Used in onboarding step 5 and in Settings → Providers tab.
 */
export function ImportChatsFlow({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>("scan");
  const [projects, setProjects] = useState<ImportDetectedProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<ImportExecuteResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Key for a project used as selection identifier
  const projectKey = (p: ImportDetectedProject) => `${p.provider}::${p.historyPath}`;

  const runScan = async () => {
    setPhase("scan");
    setScanError(null);
    try {
      const res = await fetch("/api/setup/import/scan");
      if (!res.ok) throw new Error("Scan failed");
      const data = (await res.json()) as { projects: ImportDetectedProject[] };
      setProjects(data.projects);
      setSelected(new Set(data.projects.map(projectKey)));
      setPhase("select");
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
      setPhase("select");
    }
  };

  useEffect(() => {
    void runScan();
  }, []);

  const toggleProject = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runImport = async () => {
    const selections = projects
      .filter((p) => selected.has(projectKey(p)))
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
      const res = await fetch("/api/setup/import/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selections }),
      });
      if (!res.ok) throw new Error("Import request failed");
      const data = (await res.json()) as ImportExecuteResult;
      setResult(data);
      setPhase("done");
      if (data.errors.length === 0) {
        toastManager.add({
          type: "success",
          title: "Import complete",
          description: `${data.importedProjectCount} projects, ${data.importedThreadCount} threads imported.`,
        });
      }
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setPhase("select");
    }
  };

  // ── Scan loading ──────────────────────────────────────────────────────────
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
            <p className="text-xs font-medium text-amber-600 mb-1">Some projects had errors:</p>
            {result.errors.map((e, i) => (
              <p key={i} className="text-xs text-muted-foreground">
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
  const selectedCount = selected.size;
  const totalThreads = projects
    .filter((p) => selected.has(projectKey(p)))
    .reduce((sum, p) => sum + p.threadCount, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Import conversations</h2>
        <p className="text-sm text-muted-foreground">
          Bird Code found existing conversations from your AI providers. Select the projects to
          import.
        </p>
      </div>

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
        </div>
      ) : (
        <>
          {/* Select/deselect all */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selectedCount} project{selectedCount !== 1 ? "s" : ""} selected (~{totalThreads}{" "}
              threads)
            </span>
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSelected(new Set(projects.map(projectKey)))}
              >
                Select all
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          </div>

          {/* Project list grouped by provider */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {projects.map((project) => {
              const key = projectKey(project);
              const isSelected = selected.has(key);
              const ProviderIcon = PROVIDER_ICON[project.provider];
              const providerLabel =
                PROVIDER_DISPLAY_NAMES[project.provider as keyof typeof PROVIDER_DISPLAY_NAMES] ??
                project.provider;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleProject(key)}
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
                      isSelected ? "border-primary bg-primary" : "border-muted-foreground/40",
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
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <FolderIcon className="size-3 text-muted-foreground/60 shrink-0" />
                      <span className="text-sm font-medium truncate">{project.projectName}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {project.threadCount} {project.threadCount === 1 ? "thread" : "threads"}
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
            {selectedCount > 0 ? `${totalThreads} thread${totalThreads !== 1 ? "s" : ""}` : ""}
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/components/onboarding/ImportChatsFlow.tsx
git commit -m "feat(web): ImportChatsFlow reusable component (step 5 + settings)"
```

---

## Task 10: Main OnboardingSheet

**Files:**

- Create: `apps/web/src/components/onboarding/OnboardingSheet.tsx`

- [ ] **Step 1: Create the sheet**

```tsx
// apps/web/src/components/onboarding/OnboardingSheet.tsx
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetPanel, SheetFooter, SheetTitle } from "../ui/sheet";
import { type OnboardingStep, useOnboarding } from "../../hooks/useOnboarding";
import { ProviderInstallStep } from "./steps/ProviderInstallStep";
import { MobilePairingStep } from "./steps/MobilePairingStep";
import { GitSetupStep } from "./steps/GitSetupStep";
import { FeatureTourStep } from "./steps/FeatureTourStep";
import { ImportChatsFlow } from "./ImportChatsFlow";
import { cn } from "~/lib/utils";

const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Providers",
  2: "Mobile",
  3: "Git",
  4: "Features",
  5: "Import",
};

const TOTAL_STEPS = 5;

function StepDots({ current, total }: { current: OnboardingStep; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as OnboardingStep;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div
            key={step}
            className={cn(
              "rounded-full transition-all duration-200",
              isActive && "w-5 h-2 bg-foreground",
              isDone && "w-2 h-2 bg-foreground/40",
              !isActive && !isDone && "w-2 h-2 bg-muted-foreground/20",
            )}
          />
        );
      })}
    </div>
  );
}

function StepContent({ step }: { step: OnboardingStep }) {
  const { nextStep } = useOnboarding();
  switch (step) {
    case 1:
      return <ProviderInstallStep />;
    case 2:
      return <MobilePairingStep />;
    case 3:
      return <GitSetupStep />;
    case 4:
      return <FeatureTourStep />;
    case 5:
      return <ImportChatsFlow onDone={nextStep} />;
  }
}

export function OnboardingSheet() {
  const { open, currentStep, closeOnboarding, completeOnboarding, nextStep, prevStep, skipStep } =
    useOnboarding();

  const isLastStep = currentStep === TOTAL_STEPS;
  const isImportStep = currentStep === 5;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) closeOnboarding();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex flex-col w-[520px] max-w-full"
      >
        {/* Header */}
        <SheetHeader className="flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <StepDots current={currentStep} total={TOTAL_STEPS} />
            <span className="text-xs text-muted-foreground">
              {currentStep}/{TOTAL_STEPS} — {STEP_LABELS[currentStep]}
            </span>
          </div>
          <button
            type="button"
            onClick={completeOnboarding}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Skip setup"
            title="Skip all — you can return anytime via Settings"
          >
            <XIcon className="size-4" />
          </button>
        </SheetHeader>

        {/* Body */}
        <SheetPanel className="flex-1 min-h-0">
          <StepContent step={currentStep} />
        </SheetPanel>

        {/* Footer — hidden on the import step (ImportChatsFlow has its own CTA) */}
        {!isImportStep && (
          <SheetFooter variant="bare" className="flex-row items-center justify-between gap-2">
            <button
              type="button"
              onClick={skipStep}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
            >
              Skip this step
            </button>
            <div className="flex items-center gap-2">
              {currentStep > 1 && (
                <Button size="sm" variant="outline" onClick={prevStep}>
                  <ArrowLeftIcon className="size-3.5 mr-1" />
                  Back
                </Button>
              )}
              <Button size="sm" onClick={isLastStep ? completeOnboarding : nextStep}>
                {isLastStep ? (
                  <>
                    <CheckIcon className="size-3.5 mr-1" />
                    Done
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRightIcon className="size-3.5 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/components/onboarding/OnboardingSheet.tsx
git commit -m "feat(web): OnboardingSheet main component"
```

---

## Task 11: Mount OnboardingSheet in App Root

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`

- [ ] **Step 1: Add import at top of `__root.tsx`**

After the last existing import, add:

```typescript
import { OnboardingSheet } from "../components/onboarding/OnboardingSheet";
```

- [ ] **Step 2: Mount inside `AppBootstrapGate`**

Find the `AppBootstrapGate` function (lines 93–110 in the current file). Modify the returned JSX to include `<OnboardingSheet />`:

```tsx
// Current (do not remove Outlet or the popout check):
return (
  <AppSidebarLayout>
    <Outlet />
  </AppSidebarLayout>
);

// Change to:
return (
  <AppSidebarLayout>
    <Outlet />
    {/* Onboarding sheet: auto-opens on first launch, reopenable from Settings */}
    <OnboardingSheet />
  </AppSidebarLayout>
);
```

The `OnboardingSheet` uses `Sheet` which renders into a portal, so placement in the component tree is cosmetic only — it won't affect layout.

- [ ] **Step 3: Typecheck + Commit**

```bash
bun typecheck --filter @t3tools/web
git add apps/web/src/routes/__root.tsx
git commit -m "feat(web): mount OnboardingSheet in app root"
```

---

## Task 12: Settings Integration — Sidebar Button + Providers Import Section

**Files:**

- Modify: `apps/web/src/components/settings/SettingsSidebarNav.tsx`
- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

- [ ] **Step 1: Add Setup Guide button to `SettingsSidebarNav.tsx`**

At the top of the file, add to imports:

```typescript
import { MapIcon } from "lucide-react";
```

Find the `SettingsSidebarNav` function. After the `<SidebarSeparator />` and before the existing `<SidebarFooter>` (which has the Back button), add a new menu item:

```tsx
<SidebarSeparator />
<SidebarFooter className="p-2">
  <SidebarMenu>
    {/* NEW: Setup Guide button — reopens onboarding sheet */}
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => {
          // Write open:true to onboarding localStorage state
          try {
            const raw = localStorage.getItem("birdcode:onboarding");
            const state = raw ? JSON.parse(raw) as Record<string, unknown> : {};
            localStorage.setItem(
              "birdcode:onboarding",
              JSON.stringify({ ...state, open: true }),
            );
          } catch { /* ignore */ }
          // Force a page-level re-render by dispatching a storage event
          window.dispatchEvent(new StorageEvent("storage", { key: "birdcode:onboarding" }));
        }}
      >
        <MapIcon className="size-4" />
        <span>Setup Guide</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
    {/* existing Back button */}
    <SidebarMenuItem>
      <SidebarMenuButton
        size="sm"
        className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => window.history.back()}
      >
        <ArrowLeftIcon className="size-4" />
        <span>Back</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</SidebarFooter>
```

> **Note:** `useOnboarding()` subscribes to `localStorage`. The storage event + direct write approach triggers the hook's state sync without needing to prop-drill through the settings tree. However, for a cleaner solution, update `useOnboarding` to also listen for `window.storage` events so the sheet re-opens immediately. Add this to `useOnboarding.ts`:
>
> ```typescript
> // In useOnboarding, inside the hook body, add:
> useEffect(() => {
>   const handler = (e: StorageEvent) => {
>     if (e.key === STORAGE_KEY) {
>       const loaded = loadState();
>       setState(loaded);
>     }
>   };
>   window.addEventListener("storage", handler);
>   return () => window.removeEventListener("storage", handler);
> }, []);
> ```
>
> Add this effect inside `useOnboarding` in `apps/web/src/hooks/useOnboarding.ts`.

- [ ] **Step 2: Add Import Conversations section to `ProvidersSettingsPanel` in `SettingsPanels.tsx`**

Find the `ProvidersSettingsPanel` function in `SettingsPanels.tsx`. Add at the top of the file (with other imports):

```typescript
import { ImportChatsFlow } from "../onboarding/ImportChatsFlow";
```

At the bottom of `ProvidersSettingsPanel`'s JSX (inside `<SettingsPageContainer>`, after the last `<SettingsSection>`), add:

```tsx
<SettingsSection title="Import Conversations" icon={<DownloadIcon className="size-3.5" />}>
  <SettingsRow>
    <p className="text-xs text-muted-foreground mb-4">
      Import existing conversations from your AI provider history. Imported projects and threads
      will appear in your sidebar and can be continued in Bird Code.
    </p>
    <ImportChatsFlow />
  </SettingsRow>
</SettingsSection>
```

Also add `DownloadIcon` to the lucide-react import at the top of `SettingsPanels.tsx`.

- [ ] **Step 3: Full typecheck**

```bash
bun typecheck
```

- [ ] **Step 4: Lint**

```bash
bun lint
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/settings/SettingsSidebarNav.tsx \
        apps/web/src/components/settings/SettingsPanels.tsx \
        apps/web/src/hooks/useOnboarding.ts
git commit -m "feat(web): settings Setup Guide button + Import Conversations panel"
```

---

## Verification

1. **First launch:** Delete `birdcode:onboarding` from localStorage (DevTools → Application → Local Storage). Reload. OnboardingSheet should auto-open on step 1.
2. **Step navigation:** Click Next/Back/Skip through all 5 steps. Step indicator dots should update. Sheet should close and set `completed: true` after step 5 Done or the ×.
3. **Setup Guide:** Open Settings → any tab → click "Setup Guide" in the left sidebar footer. Sheet should reopen at the last step.
4. **Provider Install:** Verify platform tabs auto-select correct OS. Providers already installed should show green ✓ and strikethrough command.
5. **Git status:** Open step 3. `/api/setup/git-status` should return correctly. Refresh button should re-check.
6. **Import scan:** Open Settings → Providers → scroll to "Import Conversations". With Codex installed and `~/.codex/` present, scan should return projects.
7. **Import execute:** Select a project, click Import. Projects and threads should appear in the main sidebar after import.
8. **Typecheck:** `bun typecheck` passes with zero errors.
9. **Lint:** `bun lint` passes with zero warnings.
