/**
 * MemoryReactor - Memory storage reaction service interface.
 *
 * Owns a background worker that reacts to provider turn completion events
 * and fire-and-forgets conversation storage to Mem0. Mirrors the shape of
 * CheckpointReactor for consistency.
 *
 * @module MemoryReactor
 */
import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

/**
 * MemoryReactorShape - Service API for memory reactor lifecycle.
 */
export interface MemoryReactorShape {
  /**
   * Start the memory reactor.
   *
   * The returned effect must be run in a scope so all forked fibers can be
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
}

/**
 * MemoryReactor - Service tag for memory storage reactor workers.
 */
export class MemoryReactor extends ServiceMap.Service<MemoryReactor, MemoryReactorShape>()(
  "t3/memory/Services/MemoryReactor",
) {}
