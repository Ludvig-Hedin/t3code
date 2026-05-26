import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppLoadingScreen } from "../components/AppLoadingScreen";

import { isElectron } from "../env";
import { SidebarTrigger } from "../components/ui/sidebar";
import { AppPageHeader } from "../components/AppPageHeader";
import { Button } from "../components/ui/button";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useStore } from "../store";
import { readNativeApi } from "../nativeApi";
import { useSettings } from "../hooks/useSettings";
import { createProjectFromPath } from "../lib/createProject";
import { toastManager } from "../components/ui/toast";
import { newCommandId, cn } from "../lib/utils";
import { ProjectId } from "@t3tools/contracts";

function ChatIndexRouteView() {
  // Read raw projects array from store (stable reference) then filter in useMemo.
  // IMPORTANT: .filter() inside a Zustand selector creates a new array on every call,
  // which breaks useSyncExternalStore's Object.is check and causes an infinite re-render loop.
  const allProjects = useStore((store) => store.projects);
  const projects = useMemo(
    () => allProjects.filter((project) => project.deletedAt === null),
    [allProjects],
  );
  const { defaultProjectId, handleNewThread } = useHandleNewThread();
  const appSettings = useSettings();

  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFolderPicker = typeof window !== "undefined" && Boolean(window.desktopBridge);

  // When projects exist, immediately navigate into a draft thread.
  // ChatView already renders the "New thread in [Project]" heading, suggestion cards,
  // and the real composer at the bottom — no need to duplicate any of that here.
  useEffect(() => {
    if (projects.length > 0 && defaultProjectId) {
      void handleNewThread(defaultProjectId);
    }
  }, [projects.length, defaultProjectId, handleNewThread]);

  const createFromPath = useCallback(
    async (cwd: string) => {
      const trimmed = cwd.trim();
      if (!trimmed) return;
      const api = readNativeApi();
      if (!api) {
        setError("Project creation isn't available in this environment.");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        const result = await createProjectFromPath({
          cwd: trimmed,
          projects,
          defaultThreadEnvMode: appSettings.defaultThreadEnvMode,
          handleNewThread: async (projectId, options) => {
            await handleNewThread(ProjectId.makeUnsafe(projectId), options);
          },
          dispatchProjectCreate: async (input) => {
            await api.orchestration.dispatchCommand({
              type: "project.create",
              commandId: newCommandId(),
              ...input,
              projectId: ProjectId.makeUnsafe(input.projectId),
            });
          },
        });

        if (result.kind === "existing") {
          toastManager.add({
            type: "success",
            title: "Project already exists",
            description: "Opened the existing project.",
          });
        }
        setPathInput("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add project.");
      } finally {
        setBusy(false);
      }
    },
    [appSettings.defaultThreadEnvMode, handleNewThread, projects],
  );

  const handleCreateProject = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      setError("Open the desktop app to use the folder picker.");
      return;
    }
    const cwd = await api.dialogs.pickFolder().catch(() => null);
    if (!cwd) return;
    await createFromPath(cwd);
  }, [createFromPath]);

  const submitPath = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void createFromPath(pathInput);
    },
    [createFromPath, pathInput],
  );

  // ---------- No projects: show the "Get started" empty state ----------
  if (projects.length === 0) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 md:hidden">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0" />
              <span className="text-sm font-medium text-foreground">Threads</span>
            </div>
          </header>
        )}

        <AppPageHeader>
          <span className="text-xs text-muted-foreground/50">No active thread</span>
        </AppPageHeader>

        <div className="flex flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm">
              <FolderPlusIcon className="size-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-balance text-xl font-semibold text-foreground">
                Get started with a project
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                Add a workspace to create your first project and start a new thread from the center
                of the app.
              </p>
            </div>

            <div className="w-full space-y-3 rounded-xl border bg-card p-4 text-left">
              {hasFolderPicker && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCreateProject()}
                  disabled={busy}
                  className="w-full"
                >
                  <FolderPlusIcon className="size-3.5 mr-1.5" />
                  Pick a folder…
                </Button>
              )}

              <form onSubmit={submitPath} className="space-y-2">
                <label
                  htmlFor="project-path-input"
                  className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {hasFolderPicker ? "Or paste an absolute path" : "Absolute path"}
                </label>
                <div className="flex gap-2">
                  <input
                    id="project-path-input"
                    type="text"
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    placeholder="/Users/you/code/my-project"
                    disabled={busy}
                    className={cn(
                      "flex-1 rounded-md border bg-background px-3 py-1.5 font-mono text-xs",
                      "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring",
                      "disabled:opacity-50",
                    )}
                  />
                  <Button type="submit" size="sm" disabled={busy || !pathInput.trim()}>
                    Add
                  </Button>
                </div>
              </form>

              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Projects exist — show loading screen while useEffect navigates to the draft thread.
  return <AppLoadingScreen />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
