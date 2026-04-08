import { ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import type { Project } from "./types";
import { resolveAutomationProject } from "./automationsRunner";

describe("resolveAutomationProject", () => {
  it("matches projects by id, display name, or cwd basename", () => {
    const projects = [
      {
        id: ProjectId.makeUnsafe("proj-1"),
        name: "Bird Code",
        cwd: "/Users/me/Bird-Code",
        defaultModelSelection: null,
        scripts: [],
      },
      {
        id: ProjectId.makeUnsafe("proj-2"),
        name: "API",
        cwd: "/Users/me/api-service",
        defaultModelSelection: null,
        scripts: [],
      },
    ] satisfies readonly Project[];

    expect(resolveAutomationProject(projects, "proj-1")?.id).toBe("proj-1");
    expect(resolveAutomationProject(projects, "Bird Code")?.id).toBe("proj-1");
    expect(resolveAutomationProject(projects, "api-service")?.id).toBe("proj-2");
  });

  it("returns null when the project label cannot be resolved", () => {
    const projects = [
      {
        id: ProjectId.makeUnsafe("proj-1"),
        name: "Bird Code",
        cwd: "/Users/me/Bird-Code",
        defaultModelSelection: null,
        scripts: [],
      },
    ] satisfies readonly Project[];

    expect(resolveAutomationProject(projects, "missing")).toBeNull();
  });
});
