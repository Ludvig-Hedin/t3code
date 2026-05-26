import { useCallback, useMemo, useState } from "react";
import { CheckIcon, FolderIcon, FolderPlusIcon } from "lucide-react";
import { ProjectId } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { useStore } from "../../../store";
import { useHandleNewThread } from "../../../hooks/useHandleNewThread";
import { useSettings } from "../../../hooks/useSettings";
import { readNativeApi } from "../../../nativeApi";
import { createProjectFromPath } from "../../../lib/createProject";
import { newCommandId } from "../../../lib/utils";
import { cn } from "~/lib/utils";

/**
 * First onboarding step: have at least one project before sending users to
 * provider setup. Without a project, the rest of the app's empty states are
 * confusing for new users (per UX audit).
 */
export function ProjectSetupStep() {
  const allProjects = useStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.deletedAt === null), [allProjects]);
  const { handleNewThread } = useHandleNewThread();
  const settings = useSettings();
  const [pathInput, setPathInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // H11: surface a non-error notice when the typed path matches a project
  // that already exists. Without this the input simply cleared and the user
  // had no signal that anything happened.
  const [notice, setNotice] = useState<string | null>(null);

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
      setNotice(null);
      try {
        const result = await createProjectFromPath({
          cwd: trimmed,
          projects,
          defaultThreadEnvMode: settings.defaultThreadEnvMode,
          handleNewThread: async (projectId, options) => {
            await handleNewThread(ProjectId.makeUnsafe(projectId), options).catch(() => undefined);
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
        setPathInput("");
        // H11: when the path resolves to an already-registered project,
        // `createProjectFromPath` returns `kind: "existing"` without invoking
        // the `handleNewThread` callback above. Open a fresh thread on that
        // project here so the click does something visible — and surface a
        // small notice so the user knows the path was a duplicate, not a
        // silent failure.
        if (result.kind === "existing") {
          setNotice("Project already added — opening it.");
          await handleNewThread(result.projectId, {
            envMode: settings.defaultThreadEnvMode,
          }).catch(() => undefined);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add project.");
      } finally {
        setBusy(false);
      }
    },
    [handleNewThread, projects, settings.defaultThreadEnvMode],
  );

  const pickFolder = useCallback(async () => {
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

  const hasProject = projects.length > 0;
  const hasFolderPicker = typeof window !== "undefined" && Boolean(window.desktopBridge);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Pick your project</h2>
        <p className="text-sm text-muted-foreground">
          Bird Code works on one project (a Git repo or directory) at a time. Add at least one to
          start chatting with an agent.
        </p>
      </div>

      {hasProject && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CheckIcon className="size-3.5 text-green-500" />
            <span>
              {projects.length === 1 ? "1 project ready" : `${projects.length} projects ready`}
            </span>
          </div>
          <ul className="space-y-1.5">
            {projects.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
              >
                <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {p.cwd}
                  </div>
                </div>
              </li>
            ))}
            {projects.length > 5 && (
              <li className="px-3 text-xs text-muted-foreground">+ {projects.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {hasProject ? "Add another project" : "Add your first project"}
          </h3>
          <p className="text-xs text-muted-foreground">
            We'll create a fresh thread inside the project so you can start chatting right away.
          </p>
        </div>

        {hasFolderPicker && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void pickFolder()}
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
        {!error && notice && (
          <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
