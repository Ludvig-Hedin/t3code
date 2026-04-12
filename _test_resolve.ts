import { resolveAppModelSelection } from "./apps/web/src/modelSelection";
import { resolveSelectableProvider } from "./apps/web/src/providerModels";
import type { ServerProvider } from "@t3tools/contracts";

const mockProviders: ServerProvider[] = [
  { provider: "codex", enabled: true, status: "ready" } as any,
  { provider: "manifest", enabled: true, status: "ready" } as any,
];

console.log("resolvedProvider:", resolveSelectableProvider(mockProviders, "manifest"));

console.log(
  "resolveAppModelSelection:",
  resolveAppModelSelection("manifest", {} as any, mockProviders, "auto"),
);
