/**
 * ManifestAdapter - Service tag for the Manifest smart router adapter.
 *
 * The Manifest router sits between Bird Code and the underlying LLM providers
 * (OpenAI, Anthropic, Gemini, etc.). It scores each request and dispatches to
 * the cheapest model capable of handling it — fully transparent to Bird Code.
 *
 * @module ManifestAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface ManifestAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "manifest";
}

export class ManifestAdapter extends ServiceMap.Service<ManifestAdapter, ManifestAdapterShape>()(
  "t3/provider/Services/ManifestAdapter",
) {}
