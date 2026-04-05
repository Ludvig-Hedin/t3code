import { describe, expect, it } from "vitest";

import { buildPackageJsonScriptRecommendations } from "./projectScriptRecommendations";

describe("buildPackageJsonScriptRecommendations", () => {
  it("turns package scripts into recommended actions", () => {
    const recommendations = buildPackageJsonScriptRecommendations({
      packageJsonText: JSON.stringify({
        scripts: {
          lint: "bun run lint",
          test: "bun test",
          build: "bun run build",
        },
      }),
      existingScripts: [],
    });

    expect(recommendations).toEqual([
      {
        key: "test",
        name: "Test",
        command: "bun test",
        icon: "test",
      },
      {
        key: "lint",
        name: "Lint",
        command: "bun run lint",
        icon: "lint",
      },
      {
        key: "build",
        name: "Build",
        command: "bun run build",
        icon: "build",
      },
    ]);
  });

  it("filters out scripts that already exist", () => {
    const recommendations = buildPackageJsonScriptRecommendations({
      packageJsonText: JSON.stringify({
        scripts: {
          lint: "bun run lint",
          test: "bun test",
        },
      }),
      existingScripts: [
        {
          id: "lint",
          name: "Lint",
          command: "bun run lint",
          icon: "lint",
          runOnWorktreeCreate: false,
        },
      ],
    });

    expect(recommendations).toEqual([
      {
        key: "test",
        name: "Test",
        command: "bun test",
        icon: "test",
      },
    ]);
  });
});
