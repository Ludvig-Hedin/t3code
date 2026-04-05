/**
 * GeminiAdapter - Gemini CLI implementation of the generic provider adapter contract.
 *
 * This service owns Gemini session/runtime semantics and emits canonical
 * provider runtime events. It intentionally starts with a simple headless CLI
 * execution model so the provider can be wired into the app without needing
 * Gemini-specific interactive protocol parsing first.
 *
 * @module GeminiAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface GeminiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "gemini";
}

export class GeminiAdapter extends ServiceMap.Service<GeminiAdapter, GeminiAdapterShape>()(
  "t3/provider/Services/GeminiAdapter",
) {}
