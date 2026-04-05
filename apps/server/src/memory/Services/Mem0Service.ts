/**
 * Mem0Service - Service interface for persistent memory operations.
 *
 * Provides a uniform interface for storing and retrieving memories via the
 * Mem0 cloud API. When MEM0_API_KEY is absent the live layer returns a no-op
 * implementation so the rest of the system behaves identically.
 *
 * Memories are scoped at two levels:
 *  - Global: keyed only by user_id — shared across all projects.
 *  - Project: keyed by user_id + run_id (projectId) — isolated per project.
 *
 * @module Mem0Service
 */
import { ServiceMap } from "effect";
import type { Effect } from "effect";

/**
 * A single memory entry returned from Mem0.
 */
export interface Mem0Memory {
  readonly id: string;
  readonly memory: string;
  readonly score: number;
}

/**
 * Mem0ServiceShape - Service API for memory retrieval and storage.
 */
export interface Mem0ServiceShape {
  /**
   * The resolved user identity used when no explicit userId is supplied.
   * Reads MEM0_USER_ID env var, falling back to the OS username.
   */
  readonly defaultUserId: string;

  /**
   * Search for memories relevant to a query.
   *
   * Always succeeds (errors are suppressed internally). Returns an empty
   * array when memory is disabled or when the call fails / times out.
   */
  readonly search: (
    query: string,
    options: { userId: string; projectId?: string },
  ) => Effect.Effect<ReadonlyArray<Mem0Memory>>;

  /**
   * Store a conversation so Mem0 can extract durable facts.
   *
   * Always succeeds (fire-and-forget safe). Errors are suppressed internally.
   */
  readonly add: (
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    options: { userId: string; projectId?: string },
  ) => Effect.Effect<void>;
}

/**
 * Mem0Service - Service tag for persistent memory access.
 */
export class Mem0Service extends ServiceMap.Service<Mem0Service, Mem0ServiceShape>()(
  "t3/memory/Services/Mem0Service",
) {}
