/**
 * ManifestProvider - Manifest router provider snapshot service.
 *
 * Handles provider discovery (health check) for the Manifest smart router.
 * Follows the same snapshot contract as the other providers so the registry
 * can surface status (ready/error/disabled) in the UI.
 *
 * @module ManifestProvider
 */
import { ServiceMap } from "effect";

import type { ServerProvider } from "@t3tools/contracts";

export interface ManifestProviderShape {
  readonly getSnapshot: import("effect").Effect.Effect<ServerProvider>;
  readonly refresh: import("effect").Effect.Effect<ServerProvider>;
  readonly streamChanges: import("effect").Stream.Stream<ServerProvider>;
}

export class ManifestProvider extends ServiceMap.Service<ManifestProvider, ManifestProviderShape>()(
  "t3/provider/Services/ManifestProvider",
) {}
