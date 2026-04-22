// apps/web/src/components/PreviewPanel.tsx
/**
 * PreviewPanel — tabbed in-app preview panel for running dev servers.
 *
 * Renders an iframe for browser-type apps and log output for non-browser apps.
 * Detects apps on mount, subscribes to live preview events, and allows
 * starting/stopping individual apps.
 *
 * Error-safety: all async calls are try/caught; the panel never crashes the
 * parent app — it degrades to an informative empty state instead.
 */
import { Component, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  ExternalLinkIcon,
  Loader2Icon,
  MaximizeIcon,
  MonitorPlayIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import type { PreviewApp, PreviewSession, ProjectId } from "@t3tools/contracts";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { cn } from "~/lib/utils";
import {
  usePreviewStore,
  selectApps,
  selectSession,
  selectLogs,
  selectActiveAppId,
  selectDetectionStatus,
} from "../previewStore";
import { getWsRpcClient } from "../wsRpcClient";

// ---------------------------------------------------------------------------
// Error boundary — prevents panel crashes from propagating to the app shell
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  error: Error | null;
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-muted-foreground">
          <MonitorPlayIcon className="size-8 opacity-40" />
          <p className="text-sm font-medium text-destructive">Preview encountered an error</p>
          <p className="max-w-xs text-xs">{this.state.error.message}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset();
            }}
          >
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: PreviewSession["status"] | null }) {
  if (!status || status === "stopped") {
    return <span className="inline-block size-1.5 rounded-full bg-muted-foreground/40" />;
  }
  if (status === "starting") {
    return <Loader2Icon className="size-3 animate-spin text-amber-500" />;
  }
  if (status === "running") {
    return <span className="inline-block size-1.5 rounded-full bg-green-500" />;
  }
  // error
  return <span className="inline-block size-1.5 rounded-full bg-destructive" />;
}

/** Tab item — separate component so each tab has its own Zustand selector. */
function TabItem({
  app,
  projectId,
  isActive,
  onClick,
  onStart,
  onStop,
}: {
  app: PreviewApp;
  projectId: string;
  isActive: boolean;
  onClick: () => void;
  onStart: (app: PreviewApp) => void;
  onStop: (app: PreviewApp) => void;
}) {
  const session = usePreviewStore(selectSession(projectId, app.id));
  const isRunning = session?.status === "running" || session?.status === "starting";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <button type="button" onClick={onClick} className="flex items-center gap-1.5">
        <StatusDot status={session?.status ?? null} />
        <span>{app.label}</span>
      </button>
      <button
        type="button"
        className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
        title={isRunning ? `Stop ${app.label}` : `Start ${app.label}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isRunning) {
            onStop(app);
          } else {
            onStart(app);
          }
        }}
      >
        {isRunning ? (
          <SquareIcon className="size-2.5 fill-current" />
        ) : (
          <PlayIcon className="size-2.5 fill-current" />
        )}
      </button>
    </div>
  );
}

/** Auto-scrolling log view — used for non-browser (logs-type) apps. */
function LogView({ lines }: { lines: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="h-full overflow-y-auto bg-background p-3 font-mono text-xs text-foreground">
      {lines.length === 0 ? (
        <p className="text-muted-foreground">No output yet. Start the app to see logs.</p>
      ) : (
        lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="whitespace-pre-wrap break-all leading-5">
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Startup log view — shown while a browser-type app is in "starting" state.
 *
 * Maps raw dev-server output to human-readable step milestones so the user
 * sees "Installing dependencies…" or "Compiling…" rather than a static spinner.
 * Lines that don't match a known milestone are shown as-is in a terminal font.
 */
function StartupLogView({ lines, appLabel }: { lines: string[]; appLabel: string }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  /**
   * Map a raw log line to a friendly step label.
   * Returns null to pass the line through verbatim.
   */
  function toStepLabel(raw: string): string | null {
    const l = raw.toLowerCase();
    if (/npm install|bun install|pnpm install|yarn install|installing packages?/.test(l))
      return "Installing dependencies…";
    if (/npm run dev|bun run dev|pnpm dev|yarn dev/.test(l)) return `Starting ${appLabel}…`;
    if (/vite v\d|webpack|compiled successfully|ready in \d/.test(l)) return "Compiling…";
    if (/local:\s+http|localhost:\d|127\.0\.0\.1:\d|started server on/.test(l))
      return "Dev server ready — waiting for port…";
    return null;
  }

  // Only show non-empty lines to avoid visual clutter from blank log lines.
  const visibleLines = lines.filter((l) => l.trim().length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Sticky header: spinner + step label */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-4 py-2">
        <Loader2Icon className="size-3.5 shrink-0 animate-spin text-amber-500" />
        <span className="text-xs font-medium text-foreground">Starting {appLabel}…</span>
      </div>

      {/* Scrollable output */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-[1.6]">
        {visibleLines.length === 0 ? (
          <p className="text-muted-foreground/60">Waiting for output…</p>
        ) : (
          visibleLines.map((line, i) => {
            const step = toStepLabel(line);
            return step ? (
              // Milestone step — styled with amber dot for visual emphasis
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500/70" />
                <span>{step}</span>
              </div>
            ) : (
              // Raw log line — shown at reduced opacity to de-emphasise noise
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} className="whitespace-pre-wrap break-all text-muted-foreground/60">
                {line}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — inner (inside error boundary)
// ---------------------------------------------------------------------------

interface PreviewPanelProps {
  projectId: string;
  /** Called when the user clicks the detach button */
  onDetach: () => void;
}

function PreviewPanelInner({ projectId, onDetach }: PreviewPanelProps) {
  // Use EMPTY_APPS / EMPTY_LOGS stable constants via selectors — avoids the
  // useSyncExternalStore infinite-loop caused by `?? []` returning a new
  // reference every render.
  const apps = usePreviewStore(selectApps(projectId));
  const activeAppId = usePreviewStore(selectActiveAppId(projectId));
  const detectionStatus = usePreviewStore(selectDetectionStatus(projectId));
  const setActiveApp = usePreviewStore((s) => s.setActiveApp);
  const applyEvent = usePreviewStore((s) => s.applyEvent);
  const setApps = usePreviewStore((s) => s.setApps);
  const setDetectionStatus = usePreviewStore((s) => s.setDetectionStatus);

  // Derive active app — must be done before other hooks that depend on it
  const activeApp = apps.find((a) => a.id === activeAppId) ?? apps[0] ?? null;

  // These hooks are called unconditionally (Rules of Hooks).
  // selectSession / selectLogs return null / EMPTY_LOGS when the key doesn't
  // exist — stable primitives/references, no infinite-loop risk.
  const activeSession = usePreviewStore(selectSession(projectId, activeApp?.id ?? ""));
  const activeLogs = usePreviewStore(selectLogs(projectId, activeApp?.id ?? ""));
  const autoStartedStandaloneAppIds = useRef(new Set<string>());

  // Detect apps and subscribe to events on mount.
  useEffect(() => {
    const api = getWsRpcClient();
    const pid = projectId as ProjectId;

    // Mark detection as in-progress so the UI can show a spinner.
    setDetectionStatus(projectId, "detecting");

    // Detect apps — always resolves (never rejects) so the UI stays stable.
    api.preview
      .detectApps({ projectId: pid })
      .then((detected) => {
        setApps(projectId, detected); // also sets detectionStatus → "done"
      })
      .catch(() => {
        // Detection failed (e.g. server unreachable). Show empty state, not crash.
        setDetectionStatus(projectId, "error");
        setApps(projectId, []);
      });

    // Subscribe to live preview events (start/stop status, log lines).
    // The subscription may fail silently for projects with no running apps.
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = api.preview.onEvent(pid, (event) => {
        try {
          applyEvent(event);
        } catch {
          // Malformed event — ignore, don't crash
        }
      });
    } catch {
      // onEvent setup failed — continue without live events
    }

    return () => {
      unsubscribe?.();
    };
  }, [projectId, applyEvent, setApps, setDetectionStatus]);

  useEffect(() => {
    if (detectionStatus !== "done") return;
    if (!activeApp || activeSession) return;
    if (!activeApp.command.startsWith("preview-file ")) return;
    const appKey = `${projectId}:${activeApp.id}`;
    if (autoStartedStandaloneAppIds.current.has(appKey)) return;

    autoStartedStandaloneAppIds.current.add(appKey);
    void getWsRpcClient()
      .preview.start({ projectId: projectId as ProjectId, appId: activeApp.id })
      .catch(() => {
        autoStartedStandaloneAppIds.current.delete(appKey);
      });
  }, [activeApp, activeSession, detectionStatus, projectId]);

  const handleStart = useCallback(
    (app: PreviewApp) => {
      void getWsRpcClient()
        .preview.start({ projectId: projectId as ProjectId, appId: app.id })
        .catch(() => {
          // Start failure is shown via the session status-change event
        });
    },
    [projectId],
  );

  const handleStop = useCallback(
    (app: PreviewApp) => {
      void getWsRpcClient()
        .preview.stop({ projectId: projectId as ProjectId, appId: app.id })
        .catch(() => {
          // Stop failure is non-critical — process may already be dead
        });
    },
    [projectId],
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl =
    activeApp && activeSession?.status === "running"
      ? `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(activeApp.id)}/`
      : null;

  // --- Loading state while detection is in progress ---
  if (detectionStatus === "idle" || detectionStatus === "detecting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin opacity-60" />
        <p className="text-sm">Detecting apps…</p>
      </div>
    );
  }

  // --- Empty state: detection finished but no runnable apps found ---
  if (apps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <MonitorPlayIcon className="size-8 opacity-40" />
        <p className="text-sm font-medium">No runnable apps detected</p>
        <p className="max-w-xs text-xs leading-relaxed">
          {detectionStatus === "error"
            ? "Could not scan this project. Check that the server is running."
            : 'Add a package.json with a "dev" script, a manage.py, or a Cargo.toml to get started. You can also drop a .md, .html, or .tsx file in the project root to preview it instantly.'}
        </p>
      </div>
    );
  }

  // --- Normal state: one or more apps detected ---
  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background">
      {/* Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1">
        {apps.map((app) => (
          <TabItem
            key={app.id}
            app={app}
            projectId={projectId}
            isActive={app.id === (activeApp?.id ?? "")}
            onClick={() => setActiveApp(projectId, app.id)}
            onStart={handleStart}
            onStop={handleStop}
          />
        ))}

        {/* Detach button pushed to right */}
        <div className="ml-auto flex items-center pl-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={onDetach}>
                  <MaximizeIcon className="size-3" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Detach preview</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {/* Toolbar for browser apps */}
      {activeApp?.type === "browser" && (
        <div className="flex items-center gap-1 border-b border-border bg-card px-2 py-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={activeSession?.status !== "running"}
                  onClick={() => {
                    if (iframeRef.current && previewUrl) {
                      iframeRef.current.src = previewUrl;
                    }
                  }}
                >
                  <RefreshCwIcon className="size-3" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Refresh</TooltipPopup>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  disabled={activeSession?.status !== "running" || !previewUrl}
                  onClick={() => {
                    if (previewUrl) window.open(previewUrl, "_blank");
                  }}
                >
                  <ExternalLinkIcon className="size-3" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Open in new tab</TooltipPopup>
          </Tooltip>

          <span className="ml-auto text-xs text-muted-foreground">
            {activeSession?.status === "running" && activeSession.port
              ? `localhost:${activeSession.port}`
              : ""}
          </span>
        </div>
      )}

      {/* Preview content area */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {!activeApp ? null : activeApp.type === "browser" ? (
          activeSession?.status === "running" && previewUrl ? (
            <iframe
              ref={iframeRef}
              className="size-full border-none"
              src={previewUrl}
              title={`Preview: ${activeApp.label}`}
              // allow-same-origin is intentionally omitted: combining it with
              // allow-scripts lets the iframe escape its own sandbox (the iframe
              // can access window.parent and reach the Bird Code shell).
              // Instead, the preview proxy (previewProxyRoute.ts) sets
              // Access-Control-Allow-Origin: * on every response so that the
              // opaque null origin produced by the sandbox can still load all
              // proxied resources (scripts, stylesheets, fonts, etc.).
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          ) : activeSession?.status === "starting" ? (
            // Show a live startup log so the user can see what's happening
            // (installing deps, compiling, waiting for port, etc.) rather than
            // a static spinner with no information.
            <StartupLogView lines={activeLogs} appLabel={activeApp.label} />
          ) : activeSession?.status === "error" ? (
            // Error state: pinned header + scrollable process output so the user can
            // see exactly why the process failed without opening an external terminal.
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex shrink-0 items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2">
                <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                <span className="min-w-0 flex-1 text-xs font-medium text-destructive">
                  Failed to start {activeApp.label}
                  {activeSession.errorMessage && (
                    <span className="ml-1 font-normal text-muted-foreground">
                      — {activeSession.errorMessage.split("\n")[0]}
                    </span>
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => handleStart(activeApp)}
                >
                  Retry
                </Button>
              </div>

              {/* Error detail area — three cases ordered by information richness */}
              <div className="min-h-0 flex-1 overflow-y-auto bg-background p-3 font-mono text-xs">
                {activeLogs.length > 0 ? (
                  // Live output received during the session — most complete view
                  activeLogs.map((line, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <div
                      key={i}
                      className="whitespace-pre-wrap break-all leading-5 text-foreground"
                    >
                      {line}
                    </div>
                  ))
                ) : activeSession.errorMessage && activeSession.errorMessage.includes("\n") ? (
                  // No live logs but server captured output in the process buffer —
                  // show it in full so the user gets the same context they'd have
                  // seen in a terminal (exit code + last output block).
                  <pre className="whitespace-pre-wrap break-all text-foreground">
                    {activeSession.errorMessage}
                  </pre>
                ) : (
                  // Nothing captured at all — give actionable diagnostic hints
                  // rather than just echoing the exit code back at the user.
                  <div className="space-y-3 font-sans text-xs text-muted-foreground">
                    <p>
                      No output was captured from the process. The process may have exited
                      immediately before any output was flushed.
                    </p>
                    <p>
                      Command:{" "}
                      <code className="rounded bg-muted px-1 font-mono text-foreground">
                        {activeApp.command}
                      </code>
                    </p>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Common causes:</p>
                      <ul className="ml-4 list-disc space-y-1">
                        <li>
                          <code className="rounded bg-muted px-0.5 font-mono text-foreground">
                            {activeApp.command.split(" ")[0]}
                          </code>{" "}
                          is not installed or not in{" "}
                          <code className="rounded bg-muted px-0.5 font-mono">PATH</code>
                        </li>
                        <li>Dependencies not installed — run the install command first</li>
                        <li>Port already in use by another process</li>
                        <li>Missing required environment variables</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Stopped or no session yet.
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              {activeApp.command.startsWith("preview-file ") && !activeSession ? (
                // Standalone file previews (markdown, HTML, TSX, etc.) auto-start on
                // selection — show a brief spinner while the HTTP server is created
                // (typically resolves in < 200 ms).
                <>
                  <Loader2Icon className="size-6 animate-spin opacity-60" />
                  <p className="text-sm">Loading preview…</p>
                </>
              ) : (
                <>
                  <MonitorPlayIcon className="size-8 opacity-40" />
                  <p className="text-sm">
                    {activeApp.command.startsWith("preview-file ")
                      ? `Click ▶ to preview ${activeApp.label}`
                      : `Press ▶ to start ${activeApp.label}`}
                  </p>
                </>
              )}
            </div>
          )
        ) : (
          <LogView lines={activeLogs} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export — wraps inner component in an error boundary
// ---------------------------------------------------------------------------

export function PreviewPanel(props: PreviewPanelProps) {
  // resetKey bumps to unmount/remount the inner panel after an error boundary reset
  const resetKey = useRef(0);
  return (
    <PreviewErrorBoundary
      onReset={() => {
        resetKey.current += 1;
      }}
    >
      <PreviewPanelInner key={resetKey.current} {...props} />
    </PreviewErrorBoundary>
  );
}
