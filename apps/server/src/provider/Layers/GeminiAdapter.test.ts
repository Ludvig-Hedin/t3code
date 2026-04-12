import { describe, expect, it } from "vitest";

import { buildGeminiAutoAcceptStdin } from "./GeminiAdapter";

describe("buildGeminiAutoAcceptStdin", () => {
  it("returns repeated affirmative answers for interactive prompts", () => {
    const stdin = buildGeminiAutoAcceptStdin();
    const lines = stdin.trim().split("\n");

    expect(lines).toHaveLength(32);
    expect(new Set(lines)).toEqual(new Set(["y"]));
  });
});
