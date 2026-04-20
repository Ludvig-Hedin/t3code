import { describe, expect, it } from "vitest";

import {
  isComposerListShortcutPrefix,
  normalizeComposerPromptText,
  parseComposerPromptLine,
} from "./composerPromptRichText";

describe("composerPromptRichText", () => {
  it("normalizes CRLF newlines to LF", () => {
    expect(normalizeComposerPromptText("first\r\nsecond\r\n")).toBe("first\nsecond\n");
  });

  it("parses bullet and numbered list lines", () => {
    expect(parseComposerPromptLine("- first")).toEqual({ kind: "bullet", content: "first" });
    expect(parseComposerPromptLine("  * second")).toEqual({ kind: "bullet", content: "second" });
    expect(parseComposerPromptLine("1. third")).toEqual({ kind: "number", content: "third" });
    expect(parseComposerPromptLine("plain text")).toEqual({
      kind: "paragraph",
      content: "plain text",
    });
  });

  it("detects list shortcuts after the marker is typed", () => {
    expect(isComposerListShortcutPrefix("-")).toBe("bullet");
    expect(isComposerListShortcutPrefix("  *")).toBe("bullet");
    expect(isComposerListShortcutPrefix("1.")).toBe("number");
    expect(isComposerListShortcutPrefix("hello")).toBeNull();
  });
});
