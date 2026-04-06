/**
 * OllamaAdapter - Ollama session adapter service tag.
 *
 * Implements ProviderAdapterShape via HTTP calls to the local Ollama server.
 * Full multi-turn conversation history is maintained in-memory per session.
 *
 * @module OllamaAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterShape } from "./ProviderAdapter.ts";
import type { ProviderAdapterError } from "../Errors.ts";

export type OllamaAdapterShape = ProviderAdapterShape<ProviderAdapterError>;

export class OllamaAdapter extends ServiceMap.Service<OllamaAdapter, OllamaAdapterShape>()(
  "t3/provider/Services/OllamaAdapter",
) {}
