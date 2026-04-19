/**
 * CursorAdapter - Cursor CLI implementation of the generic provider adapter contract.
 *
 * Wraps `cursor-agent --print --output-format stream-json` behind the shared
 * provider runtime interface and emits canonical runtime events.
 *
 * @module CursorAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface CursorAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "cursor";
}

export class CursorAdapter extends ServiceMap.Service<CursorAdapter, CursorAdapterShape>()(
  "t3/provider/Services/CursorAdapter",
) {}
