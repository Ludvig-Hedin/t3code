/**
 * A2aAgentCardService - Manages A2A Agent Card registration and discovery.
 *
 * Handles CRUD for agent cards (both locally-generated and remotely-discovered),
 * agent discovery via /.well-known/agent-card.json, and generates local cards
 * for Bird Code's own providers.
 *
 * @module A2aAgentCardService
 */
import type {
  A2aAgentCard,
  A2aAgentCardId,
  A2aClientError,
  A2aServiceError,
} from "@t3tools/contracts";
import type { Effect } from "effect";
import { ServiceMap } from "effect";

/** Service surface implemented by `A2aAgentCardServiceLive` (explicit alias for layer typing). */
export type IA2aAgentCardService = A2aAgentCardServiceShape;

export interface A2aAgentCardServiceShape {
  /** List all registered agent cards (local + remote). */
  list(): Effect.Effect<ReadonlyArray<A2aAgentCard>, A2aServiceError>;

  /** Get a single agent card by ID. */
  get(id: A2aAgentCardId): Effect.Effect<A2aAgentCard, A2aServiceError>;

  /** Register or update an agent card. */
  register(input: {
    readonly url: string;
    readonly name?: string;
  }): Effect.Effect<A2aAgentCard, A2aServiceError | A2aClientError>;

  /** Remove a registered agent card by ID. */
  remove(id: A2aAgentCardId): Effect.Effect<void, A2aServiceError>;

  /** Discover a remote agent card from a URL (fetches /.well-known/agent-card.json). */
  discover(url: string): Effect.Effect<A2aAgentCard, A2aServiceError | A2aClientError>;

  /** Get this Bird Code instance's own composite agent card. */
  getOwnCard(): Effect.Effect<A2aAgentCard, A2aServiceError>;
}

export class A2aAgentCardService extends ServiceMap.Service<
  A2aAgentCardService,
  A2aAgentCardServiceShape
>()("t3/a2a/Services/A2aAgentCardService") {}
