/**
 * DesignPanel — Onlook-style visual editor for React apps.
 *
 * UX pillars:
 *   1. App picker popover in the header (shows current app + status dot,
 *      lists all detected React apps, offers a manual override for command/cwd
 *      via `preview.updateApp`).
 *   2. Navigation toolbar: Layers toggle / Back / Forward / Reload / URL bar /
 *      Open in new tab / Re-prime. URL bar lets users jump to any route on the
 *      running dev server without leaving the canvas.
 *   3. Canvas is the hero — full-bleed iframe with consistent states
 *      (starting spinner + logs, error retry, stopped start-button, running).
 *   4. Layers sidebar collapses (default collapsed given panel width); Inspector
 *      drawer opens from the bottom once an element is selected.
 *
 * Preview lifecycle is integrated: selecting an app auto-starts the dev server
 * via `preview.start`, priming runs only after `status === "running"`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useParams } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  DatabaseIcon,
  ExternalLinkIcon,
  HomeIcon,
  LayoutPanelLeftIcon,
  Loader2Icon,
  MousePointerClickIcon,
  PaintbrushIcon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";

import { ThreadId, type DesignEligibleAppsDiagnostic, type ProjectId } from "@t3tools/contracts";

import { useComposerDraftStore } from "~/composerDraftStore";
import { onDesignMessage, postToDesignRuntime, type DesignNode } from "~/design/bridge";
import { useDesignPanelStore } from "~/designPanelStore";
import { useDesignEligibleApps } from "~/hooks/useDesignEligibleApps";
import { cn } from "~/lib/utils";
import { selectSession, usePreviewStore } from "~/previewStore";
import { useStore } from "~/store";
import { getWsRpcClient } from "~/wsRpcClient";

import { Inspector } from "./design/Inspector";
import { LayersTree } from "./design/LayersTree";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { toastManager } from "./ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";

export interface DesignPanelProps {
  mode: DiffPanelMode;
}

type PrimeStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "priming" }
  | { readonly kind: "primed"; readonly fileCount: number; readonly oidCount: number }
  | { readonly kind: "error"; readonly message: string };

type ResolvedLocation = {
  readonly relPath: string;
  readonly line: number;
  readonly col: number;
  readonly elementName: string;
} | null;

function StatusDot({ status }: { status: "starting" | "running" | "stopped" | "error" | null }) {
  const common = "inline-block size-2 rounded-full";
  const label =
    !status || status === "stopped"
      ? "Dev server stopped"
      : status === "starting"
        ? "Dev server starting"
        : status === "running"
          ? "Dev server running"
          : "Dev server error";
  if (!status || status === "stopped")
    return <span className={cn(common, "bg-muted-foreground/40")} title={label} />;
  if (status === "starting")
    return <Loader2Icon className="size-3 animate-spin text-amber-500" aria-label={label} />;
  if (status === "running") return <span className={cn(common, "bg-green-500")} title={label} />;
  return <span className={cn(common, "bg-destructive")} title={label} />;
}

export default function DesignPanel({ mode }: DesignPanelProps) {
  const setOpen = useDesignPanelStore((s) => s.setOpen);
  const setCwd = useDesignPanelStore((s) => s.setCwd);
  const activeCwd = useDesignPanelStore((s) => s.activeCwd);
  const selectedAppIdByCwd = useDesignPanelStore((s) => s.selectedAppIdByCwd);
  const setSelectedAppId = useDesignPanelStore((s) => s.setSelectedAppId);

  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const activeThread = useStore((store) =>
    routeThreadId ? store.threads.find((thread) => thread.id === routeThreadId) : undefined,
  );
  const activeDraftThread = useComposerDraftStore((store) =>
    routeThreadId ? (store.draftThreadsByThreadId[routeThreadId] ?? null) : null,
  );
  const activeProjectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? null;
  const activeProject = useStore((store) =>
    activeProjectId ? store.projects.find((project) => project.id === activeProjectId) : undefined,
  );
  const threadCwd = activeThread?.worktreePath ?? activeProject?.cwd ?? null;

  useEffect(() => {
    setCwd(threadCwd);
  }, [threadCwd, setCwd]);

  const {
    apps,
    diagnostics: appDiagnostics,
    scannedDirCount,
    error: scanError,
    refetch: refetchApps,
    isFetching: isFetchingApps,
  } = useDesignEligibleApps(activeProjectId);

  // Wrap refetch with user-visible feedback. The server-side scan is fast; if
  // the result is unchanged (still empty), there's no visual state transition,
  // and users reasonably report "re-scan does nothing". A toast confirms the
  // scan actually ran and summarises what it found.
  const handleRescan = useCallback(async () => {
    const result = await refetchApps();
    if (!result) return;
    const nextApps = result.apps ?? [];
    if (result.error) {
      toastManager.add({
        type: "error",
        title: "Design scan failed",
        description: result.error,
      });
    } else if (nextApps.length === 0) {
      const cnt = result.scannedDirCount;
      toastManager.add({
        type: "info",
        title: "No React apps found",
        description:
          cnt === null
            ? "Scan complete."
            : `Scanned ${cnt} ${cnt === 1 ? "directory" : "directories"}.`,
      });
    } else {
      toastManager.add({
        type: "success",
        title: `Found ${nextApps.length} React ${nextApps.length === 1 ? "app" : "apps"}`,
      });
    }
  }, [refetchApps]);
  const selectedAppId = activeCwd ? (selectedAppIdByCwd[activeCwd] ?? null) : null;
  const selectedApp = apps?.find((a) => a.id === selectedAppId) ?? null;

  useEffect(() => {
    if (!activeCwd || !apps || apps.length === 0) return;
    if (selectedAppId && apps.some((a) => a.id === selectedAppId)) return;
    const firstApp = apps[0];
    if (firstApp) setSelectedAppId(firstApp.id);
  }, [activeCwd, apps, selectedAppId, setSelectedAppId]);

  const previewSession = usePreviewStore(
    selectSession(activeProjectId ?? "", selectedApp?.id ?? ""),
  );

  // Auto-start the dev server once an eligible app is selected. We track IDs
  // we've already kicked off to avoid re-starting on every render / remount.
  // NOTE: we intentionally do NOT auto-restart after a manual stop — the
  // user stopped deliberately and the canvas shows an explicit Start button.
  const autoStartedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeProjectId || !selectedApp) return;
    const key = `${activeProjectId}:${selectedApp.id}`;
    if (autoStartedRef.current.has(key)) return;
    // Already running or starting? skip.
    if (previewSession?.status === "running" || previewSession?.status === "starting") {
      autoStartedRef.current.add(key);
      return;
    }
    autoStartedRef.current.add(key);
    void getWsRpcClient()
      .preview.start({ projectId: activeProjectId as ProjectId, appId: selectedApp.id })
      .catch(() => {
        autoStartedRef.current.delete(key);
      });
  }, [activeProjectId, selectedApp, previewSession?.status]);

  // Subscribe to preview events so the session store stays up to date.
  const applyEvent = usePreviewStore((s) => s.applyEvent);
  useEffect(() => {
    if (!activeProjectId) return;
    const pid = activeProjectId as ProjectId;
    try {
      return getWsRpcClient().preview.onEvent(pid, (event) => {
        try {
          applyEvent(event);
        } catch {
          /* ignore malformed events */
        }
      });
    } catch {
      return undefined;
    }
  }, [activeProjectId, applyEvent]);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [primeStatus, setPrimeStatus] = useState<PrimeStatus>({ kind: "idle" });
  const [nodes, setNodes] = useState<readonly DesignNode[]>([]);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation>(null);

  // URL navigation state — local history for back/forward.
  const [currentPath, setCurrentPath] = useState<string>("/");
  const [history, setHistory] = useState<string[]>(["/"]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);
  const [pathDraft, setPathDraft] = useState<string>("/");
  const [reloadNonce, setReloadNonce] = useState<number>(0);

  // Reset editor state when the app changes.
  useEffect(() => {
    setPrimeStatus({ kind: "idle" });
    setNodes([]);
    setSelectedOid(null);
    setResolvedLocation(null);
    setCurrentPath("/");
    setHistory(["/"]);
    setHistoryIdx(0);
    setPathDraft("/");
  }, [selectedApp?.cwd]);

  const prime = useCallback(async () => {
    if (!selectedApp || !activeProjectId) return;
    setPrimeStatus({ kind: "priming" });
    try {
      const result = await getWsRpcClient().design.primeApp({
        projectId: activeProjectId as ProjectId,
        appCwd: selectedApp.cwd,
      });
      setPrimeStatus({
        kind: "primed",
        fileCount: result.fileCount,
        oidCount: result.oidCount,
      });
    } catch (err) {
      setPrimeStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to prime app",
      });
    }
  }, [activeProjectId, selectedApp]);

  // Auto-prime once the dev server is running. Priming before the server is
  // ready is safe (it only rewrites files) but there's no iframe to drive, so
  // we hold until status === "running" for a coherent UX.
  useEffect(() => {
    if (!selectedApp || !activeProjectId) return;
    if (primeStatus.kind !== "idle") return;
    if (previewSession?.status !== "running") return;
    void prime();
  }, [activeProjectId, prime, primeStatus.kind, previewSession?.status, selectedApp]);

  // Subscribe to design runtime messages once the iframe is live.
  useEffect(() => {
    if (primeStatus.kind !== "primed") return;
    if (previewSession?.status !== "running") return;
    return onDesignMessage((msg) => {
      if (msg.type === "design.tree") {
        setNodes(msg.nodes);
      } else if (msg.type === "design.click") {
        setSelectedOid(msg.oid);
      } else if (msg.type === "design.ready") {
        postToDesignRuntime(iframeRef.current, { type: "design.requestTree" });
      }
    });
  }, [primeStatus.kind, previewSession?.status]);

  // Mirror selection back to the runtime.
  useEffect(() => {
    postToDesignRuntime(iframeRef.current, { type: "design.select", oid: selectedOid });
  }, [selectedOid]);

  // Resolve selected OID to its source location. If the server reports the
  // app is not primed (server restart wiped the in-memory index), kick off
  // a re-prime instead of failing silently.
  useEffect(() => {
    if (!selectedOid || !selectedApp || !activeProjectId) {
      setResolvedLocation(null);
      return;
    }
    let cancelled = false;
    void getWsRpcClient()
      .design.resolveOid({
        projectId: activeProjectId as ProjectId,
        appCwd: selectedApp.cwd,
        oid: selectedOid,
      })
      .then((result) => {
        if (cancelled) return;
        setResolvedLocation(result.location);
        if (result.state === "not-primed") {
          void prime();
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedLocation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, prime, selectedApp, selectedOid]);

  // Layers sidebar — default collapsed (panel is narrow).
  const [layersOpen, setLayersOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const prevSelectedOidRef = useRef<string | null>(null);
  useEffect(() => {
    // Only force-open the inspector on the first selection of a session.
    // On subsequent selections, respect the user's last open/closed choice —
    // constantly re-opening a 55%-tall drawer destroys the canvas context.
    if (selectedOid && prevSelectedOidRef.current === null) {
      setInspectorOpen(true);
    }
    prevSelectedOidRef.current = selectedOid;
  }, [selectedOid]);

  // ESC deselects the current element — users kept getting stuck with an
  // active selection and no way to clear it without re-clicking the canvas.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // Don't hijack ESC from text inputs / textareas / contenteditable.
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      )
        return;
      if (selectedOid) {
        e.preventDefault();
        setSelectedOid(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedOid]);

  const handleClose = () => setOpen(false);

  const requestTreeRefresh = useCallback(() => {
    postToDesignRuntime(iframeRef.current, { type: "design.requestTree" });
  }, []);

  const handleReorder = useCallback(
    (oid: string, beforeOid: string | null) => {
      if (!activeProjectId || !selectedApp) return;
      void getWsRpcClient()
        .design.applyEdit({
          projectId: activeProjectId as ProjectId,
          appCwd: selectedApp.cwd,
          oid,
          op: { kind: "move", beforeOid },
        })
        .then(() => requestTreeRefresh())
        .catch(() => undefined);
    },
    [activeProjectId, requestTreeRefresh, selectedApp],
  );

  const handleHoverOid = useCallback((oid: string | null) => {
    postToDesignRuntime(iframeRef.current, { type: "design.hover", oid });
  }, []);

  const handleAskAI = useCallback(
    (contextBlock: string) => {
      if (!routeThreadId) return;
      const store = useComposerDraftStore.getState();
      const existing = store.draftsByThreadId[routeThreadId]?.prompt ?? "";
      if (existing.startsWith(contextBlock)) return;
      store.setPrompt(routeThreadId, contextBlock + existing);
    },
    [routeThreadId],
  );

  const navigateTo = useCallback(
    (rawPath: string) => {
      let path = rawPath.trim();
      if (!path) path = "/";
      if (!path.startsWith("/")) path = `/${path}`;
      if (path === currentPath) {
        setReloadNonce((n) => n + 1);
        return;
      }
      setCurrentPath(path);
      setPathDraft(path);
      setHistory((h) => {
        const next = h.slice(0, historyIdx + 1);
        next.push(path);
        return next;
      });
      setHistoryIdx((i) => i + 1);
    },
    [currentPath, historyIdx],
  );

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const goBack = () => {
    if (!canGoBack) return;
    const nextIdx = historyIdx - 1;
    const nextPath = history[nextIdx] ?? "/";
    setHistoryIdx(nextIdx);
    setCurrentPath(nextPath);
    setPathDraft(nextPath);
  };
  const goForward = () => {
    if (!canGoForward) return;
    const nextIdx = historyIdx + 1;
    const nextPath = history[nextIdx] ?? "/";
    setHistoryIdx(nextIdx);
    setCurrentPath(nextPath);
    setPathDraft(nextPath);
  };
  const reload = () => setReloadNonce((n) => n + 1);

  const previewUrl = useMemo(() => {
    if (!activeProjectId || !selectedApp) return null;
    if (previewSession?.status !== "running") return null;
    const base = `/preview/${encodeURIComponent(activeProjectId)}/${encodeURIComponent(selectedApp.id)}`;
    const sep = currentPath.includes("?") ? "&" : "?";
    const nonce = reloadNonce > 0 ? `&_t=${reloadNonce}` : "";
    return `${base}${currentPath}${sep}design=1${nonce}`;
  }, [activeProjectId, selectedApp, previewSession?.status, currentPath, reloadNonce]);

  const selectedNode = selectedOid ? (nodes.find((n) => n.oid === selectedOid) ?? null) : null;
  const loadingApps = apps === null;

  const startSelected = () => {
    if (!activeProjectId || !selectedApp) return;
    void getWsRpcClient()
      .preview.start({ projectId: activeProjectId as ProjectId, appId: selectedApp.id })
      .catch(() => undefined);
  };
  const stopSelected = () => {
    if (!activeProjectId || !selectedApp) return;
    void getWsRpcClient()
      .preview.stop({ projectId: activeProjectId as ProjectId, appId: selectedApp.id })
      .catch(() => undefined);
  };

  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <PaintbrushIcon
              className="size-3.5 shrink-0 text-muted-foreground/70"
              aria-hidden="true"
            />
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Design
            </span>
            {activeProjectId && apps !== null && (
              <AppSelector
                projectId={activeProjectId as ProjectId}
                apps={apps}
                selectedApp={selectedApp}
                onSelect={setSelectedAppId}
                sessionStatus={previewSession?.status ?? null}
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {selectedApp && previewSession?.status === "running" && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Stop dev server"
                      onClick={stopSelected}
                      className="size-7 p-0"
                    >
                      <SquareIcon className="size-3 fill-current" />
                    </Button>
                  }
                />

                <TooltipPopup>Stop dev server</TooltipPopup>
              </Tooltip>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close Design panel"
              onClick={handleClose}
              className="size-7 p-0"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {loadingApps ? (
          <CenterMessage>Scanning project for React apps…</CenterMessage>
        ) : apps && apps.length === 0 ? (
          <EmptyAppsState
            onRetry={handleRescan}
            isRetrying={isFetchingApps}
            diagnostics={appDiagnostics}
            scannedDirCount={scannedDirCount}
            error={scanError}
          />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex shrink-0 items-center gap-1 border-b border-border/50 bg-muted/20 px-2 py-1.5">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label="Toggle layers"
                      aria-pressed={layersOpen}
                      onClick={() => setLayersOpen((v) => !v)}
                      className={cn(
                        "size-7 p-0",
                        layersOpen && "bg-accent text-foreground shadow-inner",
                      )}
                    >
                      <LayoutPanelLeftIcon className="size-3.5" />
                    </Button>
                  }
                />

                <TooltipPopup>{layersOpen ? "Hide layers" : "Show layers"}</TooltipPopup>
              </Tooltip>
              <div className="mx-0.5 h-4 w-px bg-border/60" />
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canGoBack}
                      onClick={goBack}
                      aria-label="Back"
                      className="size-7 p-0 disabled:opacity-40"
                    >
                      <ArrowLeftIcon className="size-3.5" />
                    </Button>
                  }
                />

                <TooltipPopup>Back</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!canGoForward}
                      onClick={goForward}
                      aria-label="Forward"
                      className="size-7 p-0 disabled:opacity-40"
                    >
                      <ArrowRightIcon className="size-3.5" />
                    </Button>
                  }
                />

                <TooltipPopup>Forward</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={reload}
                      aria-label="Reload preview"
                      className="size-7 p-0"
                    >
                      <RefreshCwIcon className="size-3.5" />
                    </Button>
                  }
                />

                <TooltipPopup>Reload preview</TooltipPopup>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateTo("/")}
                      disabled={currentPath === "/"}
                      aria-label="Home"
                      className="size-7 p-0 disabled:opacity-40"
                    >
                      <HomeIcon className="size-3.5" />
                    </Button>
                  }
                />

                <TooltipPopup>Home (/)</TooltipPopup>
              </Tooltip>
              <form
                className="flex min-w-0 flex-1 items-center"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigateTo(pathDraft);
                }}
              >
                <Input
                  size="sm"
                  value={pathDraft}
                  onChange={(e) => setPathDraft(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="/"
                  className="h-6.5 font-mono text-[11px]"
                  aria-label="Preview path — type a route and press Enter to navigate"
                  title="Type a route (e.g. /about) and press Enter"
                />
              </form>
              {previewUrl &&
                activeProjectId &&
                selectedApp &&
                previewSession?.status === "running" && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Open in new tab"
                          onClick={() => {
                            const url = `/preview/${encodeURIComponent(activeProjectId)}/${encodeURIComponent(selectedApp.id)}${currentPath}`;
                            window.open(url, "_blank", "noopener");
                          }}
                          className="size-7 p-0"
                        >
                          <ExternalLinkIcon className="size-3.5" />
                        </Button>
                      }
                    />

                    <TooltipPopup>Open in new browser tab</TooltipPopup>
                  </Tooltip>
                )}
              {selectedApp && primeStatus.kind === "primed" && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Re-scan elements"
                        onClick={() => void prime()}
                        className="size-7 p-0"
                      >
                        <DatabaseIcon className="size-3.5 text-muted-foreground/70" />
                      </Button>
                    }
                  />

                  <TooltipPopup>Re-scan elements (after external code edits)</TooltipPopup>
                </Tooltip>
              )}
            </div>

            {/* Main body: Layers + Canvas */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {layersOpen && (
                <div className="flex w-52 shrink-0 flex-col overflow-hidden border-r border-border/50 bg-card/30">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    <span>Layers</span>
                    {nodes.length > 0 && (
                      <span className="normal-case tracking-normal text-muted-foreground/60">
                        {nodes.length} {nodes.length === 1 ? "element" : "elements"}
                      </span>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <LayersTree
                      nodes={nodes}
                      selectedOid={selectedOid}
                      onSelect={setSelectedOid}
                      onHover={handleHoverOid}
                      onReorder={handleReorder}
                    />
                  </div>
                </div>
              )}
              <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
                <CanvasArea
                  projectId={activeProjectId}
                  appId={selectedApp?.id ?? null}
                  sessionStatus={previewSession?.status ?? null}
                  sessionError={previewSession?.errorMessage ?? null}
                  primeStatus={primeStatus}
                  previewUrl={previewUrl}
                  iframeRef={iframeRef}
                  onStart={startSelected}
                  onRetryPrime={() => void prime()}
                />

                {/* First-run hint: the canvas is running but nothing is selected yet. */}
                {previewUrl &&
                  primeStatus.kind === "primed" &&
                  !selectedOid &&
                  nodes.length > 0 && (
                    <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
                      <MousePointerClickIcon className="mr-1 inline size-3 text-muted-foreground/70" />
                      Click any element to edit
                    </div>
                  )}
              </div>
            </div>

            {/* Inspector drawer */}
            <div className="flex max-h-[55%] shrink-0 flex-col border-t border-border/50 bg-card/40">
              <div className="flex shrink-0 items-center border-b border-border/40 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setInspectorOpen((v) => !v)}
                  aria-expanded={inspectorOpen}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:bg-muted/50"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span>Inspector</span>
                    {selectedNode && (
                      <span className="truncate rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] normal-case text-primary">
                        {resolvedLocation?.elementName ?? selectedNode.tag}
                      </span>
                    )}
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "size-3 shrink-0 transition-transform",
                      inspectorOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                </button>
                {selectedOid && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label="Deselect element"
                          onClick={() => setSelectedOid(null)}
                          className="mr-1 size-6 shrink-0 p-0 text-muted-foreground/60 hover:text-foreground"
                        >
                          <XIcon className="size-3" />
                        </Button>
                      }
                    />

                    <TooltipPopup>Deselect (Esc)</TooltipPopup>
                  </Tooltip>
                )}
              </div>
              {inspectorOpen && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {activeProjectId && selectedApp ? (
                    <Inspector
                      projectId={activeProjectId as ProjectId}
                      appCwd={selectedApp.cwd}
                      selectedOid={selectedOid}
                      selectedNode={selectedNode}
                      location={resolvedLocation}
                      onAfterEdit={requestTreeRefresh}
                      onAskAI={routeThreadId ? handleAskAI : undefined}
                    />
                  ) : (
                    <div className="p-3 text-[11px] text-muted-foreground">
                      Select an app to start editing.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border/50 bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground/70">
              <StatusDot status={previewSession?.status ?? null} />
              <span>
                {!selectedApp
                  ? "No app"
                  : previewSession?.status === "running"
                    ? "Running"
                    : previewSession?.status === "starting"
                      ? "Starting…"
                      : previewSession?.status === "error"
                        ? "Error"
                        : "Stopped"}
              </span>
              <span className="truncate">
                {primeStatus.kind === "primed"
                  ? `${primeStatus.oidCount} elements · ${primeStatus.fileCount} files`
                  : primeStatus.kind === "priming"
                    ? "Preparing editor…"
                    : primeStatus.kind === "error"
                      ? primeStatus.message
                      : ""}
              </span>
              <div className="flex-1" />
              {resolvedLocation && (
                <span
                  className="truncate font-mono"
                  title={`${resolvedLocation.relPath}:${resolvedLocation.line}:${resolvedLocation.col}`}
                >
                  {resolvedLocation.relPath}:{resolvedLocation.line}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </DiffPanelShell>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
      {children}
    </div>
  );
}

function reasonLabel(reason: DesignEligibleAppsDiagnostic["reason"]): string {
  switch (reason) {
    case "no-react":
      return "Missing react dep";
    case "no-dev-script":
      return "No dev script";
    case "skipped-packages-dir":
      return "Library package";
    case "logs-only":
      return "Backend / logs";
    case "standalone-file":
      return "Standalone file";
    case "read-error":
      return "Scan error";
  }
}

function EmptyAppsState({
  onRetry,
  isRetrying,
  diagnostics,
  scannedDirCount,
  error,
}: {
  readonly onRetry: () => void;
  readonly isRetrying: boolean;
  readonly diagnostics: readonly DesignEligibleAppsDiagnostic[];
  readonly scannedDirCount: number | null;
  readonly error: string | null;
}) {
  const hasDiagnostics = diagnostics.length > 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
      <PaintbrushIcon className="size-8 text-muted-foreground/30" />
      <div>
        <p className="text-sm font-medium text-foreground">
          {error ? "Scan failed" : "No React app detected"}
        </p>
        {error ? (
          <p className="mt-1 max-w-sm text-xs text-destructive">{error}</p>
        ) : (
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            The Design editor needs a{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">package.json</code> that
            declares <code className="rounded bg-muted px-1 py-0.5 font-mono">react</code> and has a
            runnable dev script (e.g.{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">dev</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">start</code>).
          </p>
        )}
        {scannedDirCount !== null && (
          <p className="mt-2 text-[10px] text-muted-foreground/60">
            Last scan: {scannedDirCount} {scannedDirCount === 1 ? "package.json" : "package.jsons"}{" "}
            inspected.
          </p>
        )}
      </div>

      {hasDiagnostics && (
        <div className="w-full max-w-sm rounded-md border border-border/60 bg-card/40 text-left">
          <div className="border-b border-border/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            What the scanner saw
          </div>
          <ul className="max-h-48 divide-y divide-border/40 overflow-y-auto text-[11px]">
            {diagnostics.map((diag, i) => (
              <li
                key={`${diag.relativePath}-${i}`}
                className="flex items-start justify-between gap-2 px-3 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-mono text-[10.5px] text-foreground/80"
                    title={diag.relativePath}
                  >
                    {diag.relativePath}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground/70">{diag.detail}</div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {reasonLabel(diag.reason)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? (
          <Loader2Icon className="mr-1 size-3 animate-spin" />
        ) : (
          <RefreshCwIcon className="mr-1 size-3" />
        )}
        Re-scan project
      </Button>
      <p className="max-w-sm text-[10px] text-muted-foreground/60">
        Still empty? Open the Preview panel and start your dev server manually — once it's running,
        re-open this panel and the app should appear here.
      </p>
    </div>
  );
}

interface CanvasAreaProps {
  readonly projectId: string | null;
  readonly appId: string | null;
  readonly sessionStatus: "starting" | "running" | "stopped" | "error" | null;
  readonly sessionError: string | null;
  readonly primeStatus: PrimeStatus;
  readonly previewUrl: string | null;
  readonly iframeRef: React.MutableRefObject<HTMLIFrameElement | null>;
  readonly onStart: () => void;
  readonly onRetryPrime: () => void;
}

function CanvasArea({
  projectId,
  appId,
  sessionStatus,
  sessionError,
  primeStatus,
  previewUrl,
  iframeRef,
  onStart,
  onRetryPrime,
}: CanvasAreaProps) {
  if (!projectId || !appId) {
    return <CenterMessage>Select an app to begin designing.</CenterMessage>;
  }

  if (sessionStatus === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-destructive">Couldn't start the dev server</p>
        {sessionError && <p className="max-w-sm text-xs text-muted-foreground">{sessionError}</p>}
        <Button variant="outline" size="sm" onClick={onStart}>
          <PlayIcon className="mr-1 size-3" />
          Try again
        </Button>
      </div>
    );
  }

  if (sessionStatus === null || sessionStatus === "stopped") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">The dev server isn't running.</p>
        <Button variant="default" size="sm" onClick={onStart}>
          <PlayIcon className="mr-1 size-3" />
          Start dev server
        </Button>
      </div>
    );
  }

  if (sessionStatus === "starting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Loader2Icon className="size-5 animate-spin text-amber-500" />
        <p className="text-xs text-muted-foreground">Starting dev server…</p>
        <p className="max-w-xs text-[10px] text-muted-foreground/60">
          This can take a few seconds on first run.
        </p>
      </div>
    );
  }

  // running
  if (primeStatus.kind === "priming" || primeStatus.kind === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Preparing editor…</p>
        <p className="max-w-xs text-[10px] text-muted-foreground/60">
          Scanning your components so elements become clickable.
        </p>
      </div>
    );
  }

  if (primeStatus.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-destructive">Couldn't prepare the editor</p>
        <p className="max-w-sm text-xs text-muted-foreground">{primeStatus.message}</p>
        <Button variant="outline" size="sm" onClick={onRetryPrime}>
          <RefreshCwIcon className="mr-1 size-3" />
          Try again
        </Button>
      </div>
    );
  }

  if (!previewUrl) return <CenterMessage>Preparing preview…</CenterMessage>;

  return (
    <iframe
      ref={iframeRef}
      src={previewUrl}
      title="Design preview"
      className="size-full border-0"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

interface AppSelectorProps {
  readonly projectId: ProjectId;
  readonly apps: readonly {
    readonly id: string;
    readonly label: string;
    readonly cwd: string;
    readonly relativePath: string;
  }[];
  readonly selectedApp: {
    readonly id: string;
    readonly label: string;
    readonly cwd: string;
    readonly relativePath: string;
  } | null;
  readonly onSelect: (id: string) => void;
  readonly sessionStatus: "starting" | "running" | "stopped" | "error" | null;
}

function AppSelector({ projectId, apps, selectedApp, onSelect, sessionStatus }: AppSelectorProps) {
  const [open, setOpen] = useState(false);
  const label = selectedApp?.label ?? "Select app";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex min-w-0 shrink items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] hover:bg-card">
        <StatusDot status={sessionStatus} />
        <span className="truncate font-medium text-foreground">{label}</span>
        <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground/60" />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-80 p-0">
        <div className="flex flex-col">
          <div className="border-b border-border/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Choose an app to design
          </div>
          <div className="max-h-60 overflow-y-auto">
            {apps.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No runnable React apps detected.
              </div>
            ) : (
              apps.map((app) => {
                const isSelected = selectedApp?.id === app.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      onSelect(app.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] hover:bg-accent/60",
                      isSelected && "bg-accent/40",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium text-foreground">{app.label}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                        {app.relativePath}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        Active
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {selectedApp && (
            <ManualOverrideForm
              projectId={projectId}
              appId={selectedApp.id}
              appLabel={selectedApp.label}
              appCwd={selectedApp.cwd}
              onSaved={() => setOpen(false)}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ManualOverrideFormProps {
  readonly projectId: ProjectId;
  readonly appId: string;
  readonly appLabel: string;
  readonly appCwd: string;
  readonly onSaved: () => void;
}

function ManualOverrideForm({
  projectId,
  appId,
  appLabel,
  appCwd,
  onSaved,
}: ManualOverrideFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(appLabel);
  const [command, setCommand] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(appLabel);
  }, [appLabel]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: { label?: string; command?: string } = {};
      if (label.trim() && label.trim() !== appLabel) patch.label = label.trim();
      if (command.trim()) patch.command = command.trim();
      if (Object.keys(patch).length === 0) {
        setSaving(false);
        return;
      }
      await getWsRpcClient().preview.updateApp({ projectId, appId, patch });
      setSaving(false);
      onSaved();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  return (
    <div className="border-t border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:bg-accent/40"
      >
        <span>Advanced settings</span>
        <ChevronDownIcon
          className={cn("size-3 transition-transform", expanded ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Display name
            </label>
            <Input
              size="sm"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={appLabel}
              className="h-7 text-[11px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
              Custom dev command
            </label>
            <Input
              size="sm"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. pnpm dev — blank uses detected"
              className="h-7 font-mono text-[11px]"
            />

            <span
              className="truncate font-mono text-[10px] text-muted-foreground/60"
              title={appCwd}
            >
              Runs in: {appCwd}
            </span>
          </div>
          {error && <p className="text-[10px] text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-7 px-3 text-[11px]"
            >
              {saving ? <Loader2Icon className="mr-1 size-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
