import { truncate } from "@t3tools/shared/String";

import type { AutomItem } from "~/automationsStore";
import type { Project } from "~/types";

export function resolveAutomationProject(
  projects: ReadonlyArray<Project>,
  automationProject: string,
): Project | null {
  const target = automationProject.trim();
  if (target.length === 0) {
    return null;
  }

  return (
    projects.find((project) => {
      const cwdLabel = project.cwd.split("/").at(-1) ?? project.cwd;
      return project.id === target || project.name === target || cwdLabel === target;
    }) ?? null
  );
}

export function buildAutomationRunTitle(automation: AutomItem): string {
  return truncate(
    automation.name.trim() || automation.prompt.trim().split("\n")[0] || "Automation run",
  );
}
