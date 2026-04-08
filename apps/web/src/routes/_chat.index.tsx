import { createFileRoute } from "@tanstack/react-router";
import { FolderPlusIcon } from "lucide-react";
import { useCallback, useEffect } from "react";

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
import { newCommandId } from "../lib/utils";
import { ProjectId } from "@t3tools/contracts";

function ChatIndexRouteView() {
  const projects = useStore((store) =>
    store.projects.filter((project) => project.deletedAt === null),
  );
  const { defaultProjectId, handleNewThread } = useHandleNewThread();
  const appSettings = useSettings();

  // When projects exist, immediately navigate into a draft thread.
  // ChatView already renders the "New thread in [Project]" heading, suggestion cards,
  // and the real composer at the bottom — no need to duplicate any of that here.
  useEffect(() => {
    if (projects.length > 0 && defaultProjectId) {
      void handleNewThread(defaultProjectId);
    }
  }, [projects.length, defaultProjectId, handleNewThread]);

  const handleCreateProject = useCallback(async () => {
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Project creation is unavailable",
        description: "Open the desktop app to create a project.",
      });
      return;
    }

    const cwd = await api.dialogs.pickFolder().catch(() => null);
    if (!cwd) return;

    try {
      const result = await createProjectFromPath({
        cwd,
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
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to create project",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
      });
    }
  }, [appSettings.defaultThreadEnvMode, handleNewThread, projects]);

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
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
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
            <Button onClick={() => void handleCreateProject()} size="lg">
              Create project
            </Button>
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
