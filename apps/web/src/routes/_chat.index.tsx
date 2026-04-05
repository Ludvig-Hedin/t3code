import { createFileRoute } from "@tanstack/react-router";
import {
  BugIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  PlusIcon,
  SearchCodeIcon,
  SparklesIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useMemo, type ComponentType } from "react";

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
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../components/ui/menu";
import { useUiStateStore } from "../uiStateStore";
import { orderItemsByPreferredIds } from "../components/Sidebar.logic";
import { useComposerDraftStore } from "../composerDraftStore";

/** Prompt suggestion cards displayed on the empty chat page */
const PROMPT_SUGGESTIONS: readonly {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  prompt: string;
}[] = [
  {
    title: "Code review",
    description: "Review recent changes for issues",
    icon: SearchCodeIcon,
    prompt:
      "Review the recent changes in this project for bugs, security issues, and code quality improvements.",
  },
  {
    title: "New feature",
    description: "Plan and build something new",
    icon: SparklesIcon,
    prompt: "Help me plan and implement a new feature. I want to add ",
  },
  {
    title: "Fix a bug",
    description: "Debug and resolve an issue",
    icon: BugIcon,
    prompt: "Help me debug and fix an issue I'm experiencing. ",
  },
  {
    title: "Refactor",
    description: "Improve code quality",
    icon: WrenchIcon,
    prompt:
      "Analyze this codebase and suggest refactoring improvements for better maintainability, performance, and code organization.",
  },
];

function ChatIndexRouteView() {
  const projects = useStore((store) => store.projects);
  const { defaultProjectId, handleNewThread } = useHandleNewThread();
  const appSettings = useSettings();
  const projectOrder = useUiStateStore((store) => store.projectOrder);

  // Ordered projects for the project picker menu (same pattern as useHandleNewThread)
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: (project) => project.id,
    });
  }, [projects, projectOrder]);

  // The project shown in the "New chat in {name}" heading — defaults to the first ordered project
  const activeProject = useMemo(() => {
    if (!defaultProjectId) return null;
    return projects.find((project) => project.id === defaultProjectId) ?? null;
  }, [defaultProjectId, projects]);

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

  /** Create a new thread in the given project and pre-fill the composer with the prompt */
  const handlePromptSuggestion = useCallback(
    async (projectId: ProjectId, prompt: string) => {
      await handleNewThread(projectId);
      // handleNewThread synchronously writes the draft before navigating, so the draft is available
      const draft = useComposerDraftStore.getState().getDraftThreadByProjectId(projectId);
      if (draft) {
        useComposerDraftStore.getState().setPrompt(draft.threadId, prompt);
      }
    },
    [handleNewThread],
  );

  /** Navigate to a new thread in the selected project (from the project picker menu) */
  const handleProjectSelect = useCallback(
    (projectId: ProjectId) => {
      void handleNewThread(projectId);
    },
    [handleNewThread],
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

  // ---------- Has projects: show "New chat in {project}" + prompt suggestions ----------
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {!isElectron && (
        <header className="border-b border-border px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">Threads</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
          <span className="text-xs text-muted-foreground/50">No active thread</span>
        </div>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-12 px-6">
        {/* Title + project picker */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-3xl font-semibold text-foreground">New chat in</h1>
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-3xl font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {activeProject?.name ?? "Select project"}
                  <ChevronRightIcon className="size-6 opacity-50" />
                </button>
              }
            />
            <MenuPopup align="start" side="bottom" sideOffset={6}>
              {orderedProjects.map((project) => (
                <MenuItem key={project.id} onClick={() => handleProjectSelect(project.id)}>
                  {project.name}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onClick={() => void handleCreateProject()}>
                <PlusIcon />
                New project...
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>

        {/* Prompt suggestion cards */}
        <div className="grid w-full max-w-lg grid-cols-2 gap-3">
          {PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.title}
              type="button"
              className="flex cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-xs/5 transition-colors hover:bg-accent"
              onClick={() => {
                const projectId = activeProject?.id ?? defaultProjectId;
                if (projectId) {
                  void handlePromptSuggestion(projectId, suggestion.prompt);
                }
              }}
            >
              <suggestion.icon className="size-5 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{suggestion.title}</span>
                <span className="text-xs text-muted-foreground">{suggestion.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
