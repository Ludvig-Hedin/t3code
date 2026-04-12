import { describe, expect, it } from "vitest";

import { getTranscriptionErrorMessage } from "./transcription";

describe("getTranscriptionErrorMessage", () => {
  it("returns the error message when one is available", () => {
    expect(
      getTranscriptionErrorMessage(new Error("Local transcription model failed to load.")),
    ).toBe("Local transcription model failed to load.");
  });

  it("falls back to a generic message for unknown failures", () => {
    expect(getTranscriptionErrorMessage({})).toBe("Couldn’t transcribe audio. Try again.");
  });
});
