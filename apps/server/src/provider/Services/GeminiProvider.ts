/**
 * GeminiProvider - Gemini CLI provider snapshot service.
 *
 * Mirrors the Codex/Claude provider snapshot contracts so the server can
 * discover Gemini installation, version, and model metadata through the
 * existing provider registry path.
 *
 * @module GeminiProvider
 */
import { ServiceMap } from "effect";

import type { ServerProvider } from "@t3tools/contracts";

export interface GeminiProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class GeminiProvider extends ServiceMap.Service<GeminiProvider, GeminiProviderShape>()(
  "t3/provider/Services/GeminiProvider",
) {}
