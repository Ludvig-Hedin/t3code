import { describe, expect, it } from "vitest";

import { appendVoiceTranscript } from "./voiceInput";

describe("appendVoiceTranscript", () => {
  it("sets the transcript when the prompt is empty", () => {
    expect(appendVoiceTranscript("", "hello world")).toBe("hello world");
  });

  it("appends the transcript with one separating space", () => {
    expect(appendVoiceTranscript("Existing prompt", "hello world")).toBe(
      "Existing prompt hello world",
    );
  });

  it("ignores blank transcripts", () => {
    expect(appendVoiceTranscript("Existing prompt", "   ")).toBe("Existing prompt");
  });
});
