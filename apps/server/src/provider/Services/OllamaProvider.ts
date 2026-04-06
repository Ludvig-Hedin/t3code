/**
 * OllamaProvider - Ollama HTTP server snapshot service.
 *
 * Probes the local Ollama server (GET /api/tags) to discover
 * installed models and report health status.
 *
 * @module OllamaProvider
 */
import { ServiceMap } from "effect";

import type { ServerProvider } from "@t3tools/contracts";

export interface OllamaProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class OllamaProvider extends ServiceMap.Service<OllamaProvider, OllamaProviderShape>()(
  "t3/provider/Services/OllamaProvider",
) {}
