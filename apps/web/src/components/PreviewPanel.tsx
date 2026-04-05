// apps/web/src/components/PreviewPanel.tsx
/**
 * PreviewPanel — tabbed in-app preview panel for running dev servers.
 *
 * Renders an iframe for browser-type apps and log output for non-browser apps.
 * Detects apps on mount, subscribes to live preview events, and allows
 * starting/stopping individual apps.
 */
import { useCallback, useEffect, useRef } from "react";
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
} from "../previewStore";
import { getWsRpcClient } from "../wsRpcClient";

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

/** Auto-scrolling ANSI-safe log view. */
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PreviewPanelProps {
  projectId: string;
  /** Called when the user clicks the detach button */
  onDetach: () => void;
}

export function PreviewPanel({ projectId, onDetach }: PreviewPanelProps) {
  const apps = usePreviewStore(selectApps(projectId));
  const activeAppId = usePreviewStore(selectActiveAppId(projectId));
  const setActiveApp = usePreviewStore((s) => s.setActiveApp);
  const applyEvent = usePreviewStore((s) => s.applyEvent);
  const setApps = usePreviewStore((s) => s.setApps);

  const activeApp = apps.find((a) => a.id === activeAppId) ?? apps[0] ?? null;
  const activeSession = usePreviewStore(selectSession(projectId, activeApp?.id ?? ""));
  const activeLogs = usePreviewStore(selectLogs(projectId, activeApp?.id ?? ""));

  // Detect apps and subscribe to events on mount.
  // The API expects ProjectId (branded type), so we cast the string prop here.
  useEffect(() => {
    const api = getWsRpcClient();
    const pid = projectId as ProjectId;

    // Detect apps for this project
    void api.preview.detectApps({ projectId: pid }).then((detected) => {
      setApps(projectId, detected);
    });

    // Subscribe to live preview events
    const unsubscribe = api.preview.onEvent(pid, (event) => {
      applyEvent(event);
    });

    return unsubscribe;
  }, [projectId, applyEvent, setApps]);

  const handleStart = useCallback(
    (app: PreviewApp) => {
      void getWsRpcClient().preview.start({ projectId: projectId as ProjectId, appId: app.id });
    },
    [projectId],
  );

  const handleStop = useCallback(
    (app: PreviewApp) => {
      void getWsRpcClient().preview.stop({ projectId: projectId as ProjectId, appId: app.id });
    },
    [projectId],
  );

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewUrl =
    activeApp && activeSession?.status === "running"
      ? `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(activeApp.id)}/`
      : null;

  // Empty state when no apps detected
  if (apps.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <MonitorPlayIcon className="size-8 opacity-40" />
        <p className="text-sm">No previewable apps detected in this project.</p>
      </div>
    );
  }

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
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={onDetach}
                >
                  <MaximizeIcon className="size-3" />
                </Button>
              }
            />
            <TooltipPopup side="bottom">Detach preview</TooltipPopup>
          </Tooltip>
        </div>
      </div>

      {/* Preview area toolbar (browser apps only) */}
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
              // allow-same-origin is intentionally omitted: combining it with allow-scripts
              // would let the iframe remove its own sandbox, which is a security risk.
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
            />
          ) : activeSession?.status === "starting" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2Icon className="size-8 animate-spin" />
              <p className="text-sm">Starting {activeApp.label}&hellip;</p>
            </div>
          ) : activeSession?.status === "error" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-sm font-medium text-destructive">
                Failed to start {activeApp.label}
              </p>
              {activeSession.errorMessage && (
                <p className="max-w-xs text-center text-xs text-muted-foreground">
                  {activeSession.errorMessage}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={() => handleStart(activeApp)}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <MonitorPlayIcon className="size-8 opacity-40" />
              <p className="text-sm">Press ▶ to start {activeApp.label}</p>
            </div>
          )
        ) : (
          <LogView lines={activeLogs} />
        )}
      </div>
    </div>
  );
}
