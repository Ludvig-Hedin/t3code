import { describe, expect, it } from "vitest";
import type { ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

import {
  resolveAppModelSelection,
  resolveAppModelSelectionState,
  resolveConfiguredModelSelectionState,
} from "./modelSelection";

const GEMINI_PROVIDER: ServerProvider = {
  provider: "gemini",
  enabled: true,
  installed: true,
  version: "0.35.3",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: new Date().toISOString(),
  models: [
    {
      slug: "gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      isCustom: false,
      capabilities: {
        reasoningEffortLevels: [],
        supportsFastMode: false,
        supportsThinkingToggle: false,
        contextWindowOptions: [],
        promptInjectedEffortLevels: [],
      },
    },
  ],
};

const PROVIDERS = [GEMINI_PROVIDER] as const;

describe("modelSelection", () => {
  it("preserves an explicit Gemini model even when it is not in the current provider snapshot", () => {
    expect(
      resolveAppModelSelection(
        "gemini",
        DEFAULT_UNIFIED_SETTINGS,
        PROVIDERS,
        "gemini-3.1-pro-preview",
      ),
    ).toBe("gemini-3.1-pro-preview");
  });

  it("normalizes Gemini aliases while still preserving the explicit selection", () => {
    expect(resolveAppModelSelection("gemini", DEFAULT_UNIFIED_SETTINGS, PROVIDERS, "3.1")).toBe(
      "gemini-3.1-pro-preview",
    );
  });

  it('keeps manifest model as "auto" even when manifest is absent from the provider snapshot', () => {
    expect(resolveAppModelSelection("manifest", DEFAULT_UNIFIED_SETTINGS, PROVIDERS, "auto")).toBe(
      "auto",
    );
  });

  it("keeps Gemini text-generation settings on the requested model", () => {
    expect(
      resolveAppModelSelectionState(
        {
          ...DEFAULT_UNIFIED_SETTINGS,
          textGenerationModelSelection: {
            provider: "gemini",
            model: "gemini-3-flash-preview",
          },
        },
        PROVIDERS,
      ),
    ).toMatchObject({
      provider: "gemini",
      model: "gemini-3-flash-preview",
    });
  });

  it("resolves an explicit prompt-improvement selection independently of text generation", () => {
    expect(
      resolveConfiguredModelSelectionState(
        {
          provider: "gemini",
          model: "gemini-3-flash-preview",
        },
        DEFAULT_UNIFIED_SETTINGS,
        PROVIDERS,
      ),
    ).toMatchObject({
      provider: "gemini",
      model: "gemini-3-flash-preview",
    });
  });
});
