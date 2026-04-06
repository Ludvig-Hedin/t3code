/**
 * OpenCodeProvider - Service tag for OpenCode provider snapshot.
 * Mirrors GeminiProvider/ClaudeProvider/CodexProvider service contracts.
 *
 * @module OpenCodeProvider
 */
import { ServiceMap } from "effect";
import type { ServerProvider } from "@t3tools/contracts";

export interface OpenCodeProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class OpenCodeProvider extends ServiceMap.Service<OpenCodeProvider, OpenCodeProviderShape>()(
  "t3/provider/Services/OpenCodeProvider",
) {}
