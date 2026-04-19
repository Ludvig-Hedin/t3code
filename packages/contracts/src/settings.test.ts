import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ClientSettingsSchema } from "./settings";

describe("ClientSettingsSchema", () => {
  it("defaults autoSendVoiceTranscripts to false", () => {
    const decoded = Schema.decodeSync(ClientSettingsSchema)({});

    expect(decoded.autoSendVoiceTranscripts).toBe(false);
  });

  it("defaults collapseChangedFilesByDefault to true", () => {
    const decoded = Schema.decodeSync(ClientSettingsSchema)({});

    expect(decoded.collapseChangedFilesByDefault).toBe(true);
  });
});
