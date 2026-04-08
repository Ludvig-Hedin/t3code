import { DEFAULT_MODEL_BY_PROVIDER } from "@t3tools/contracts";
import type { ProjectId } from "@t3tools/contracts";
import type { DraftThreadEnvMode } from "../composerDraftStore";
import { newProjectId } from "./utils";
import { isNonEmpty as isNonEmptyString } from "effect/String";

type CreateProjectInput = {
  cwd: string;
  projects: {
    cwd: string;
    deletedAt?: string | null | undefined;
    id: ProjectId;
    name: string;
  }[];
  defaultThreadEnvMode: DraftThreadEnvMode;
  handleNewThread: (
    projectId: ProjectId,
    options?: {
      envMode?: DraftThreadEnvMode;
    },
  ) => Promise<void>;
  dispatchProjectCreate: (input: {
    projectId: ProjectId;
    title: string;
    workspaceRoot: string;
    defaultModelSelection: {
      provider: "codex";
      model: string;
    };
    createdAt: string;
  }) => Promise<void>;
};

export async function createProjectFromPath(input: CreateProjectInput): Promise<{
  kind: "created" | "existing";
  projectId: ProjectId;
}> {
  const cwd = input.cwd.trim();
  if (!cwd) {
    throw new Error("Project path cannot be empty.");
  }

  const existing = input.projects.find((project) => project.cwd === cwd);
  if (existing) {
    if (existing.deletedAt) {
      const createdAt = new Date().toISOString();
      await input.dispatchProjectCreate({
        projectId: existing.id,
        title: existing.name,
        workspaceRoot: cwd,
        defaultModelSelection: {
          provider: "codex",
          model: DEFAULT_MODEL_BY_PROVIDER.codex,
        },
        createdAt,
      });
    }
    return { kind: "existing", projectId: existing.id };
  }

  const projectId = newProjectId();
  const createdAt = new Date().toISOString();
  const title = cwd.split(/[/\\]/).findLast(isNonEmptyString) ?? cwd;

  await input.dispatchProjectCreate({
    projectId,
    title,
    workspaceRoot: cwd,
    defaultModelSelection: {
      provider: "codex",
      model: DEFAULT_MODEL_BY_PROVIDER.codex,
    },
    createdAt,
  });

  await input.handleNewThread(projectId, {
    envMode: input.defaultThreadEnvMode,
  });

  return { kind: "created", projectId };
}
