import { describe, expect, it } from "vitest";
import type { ServerProvider } from "@t3tools/contracts";
import { getProviderModelsByProvider, getProviderModelsForProvider } from "./providerModels";

describe("providerModels", () => {
  const providersWithoutGemini = [
    {
      provider: "codex",
      enabled: true,
      installed: true,
      models: [{ slug: "codex-1", name: "Codex 1" }],
    },
  ] as unknown as ReadonlyArray<ServerProvider>;

  const providers = [
    ...providersWithoutGemini,
    {
      provider: "gemini",
      enabled: true,
      installed: true,
      models: [{ slug: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" }],
    },
  ] as unknown as ReadonlyArray<ServerProvider>;

  it("returns an empty list for providers that are missing from the snapshot", () => {
    expect(
      getProviderModelsForProvider(getProviderModelsByProvider(providersWithoutGemini), "gemini"),
    ).toEqual([]);
  });

  it("keeps existing provider model lists intact", () => {
    expect(getProviderModelsByProvider(providers).codex).toEqual([
      { slug: "codex-1", name: "Codex 1" },
    ]);
    expect(getProviderModelsByProvider(providers).gemini).toEqual([
      { slug: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview" },
    ]);
  });
});
