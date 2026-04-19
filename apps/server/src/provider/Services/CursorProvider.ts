/**
 * CursorProvider - Cursor CLI provider snapshot service.
 *
 * Mirrors the other provider snapshot services so the server can report
 * Cursor installation, authentication, and model availability through the
 * shared provider registry.
 *
 * @module CursorProvider
 */
import { ServiceMap } from "effect";

import type { ServerProvider } from "@t3tools/contracts";

export interface CursorProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class CursorProvider extends ServiceMap.Service<CursorProvider, CursorProviderShape>()(
  "t3/provider/Services/CursorProvider",
) {}
