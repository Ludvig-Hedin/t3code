/**
 * A2aAdapter - A2A protocol implementation of the generic provider adapter contract.
 *
 * This service enables A2A-connected agents to participate in Bird Code
 * as a first-class provider. It translates between the ProviderAdapter
 * interface and the A2A client service.
 *
 * @module A2aAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface A2aAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "a2a";
}

export class A2aAdapter extends ServiceMap.Service<A2aAdapter, A2aAdapterShape>()(
  "t3/provider/Services/A2aAdapter",
) {}
