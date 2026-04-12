/**
 * A2aClientService - Outbound A2A protocol client.
 *
 * Discovers external agents, sends messages, and manages tasks
 * on remote A2A servers via HTTP JSON-RPC 2.0 + SSE.
 *
 * @module A2aClientService
 */
import type {
  A2aAgentCard,
  A2aAgentCardId,
  A2aClientError,
  A2aMessage,
  A2aServiceError,
  A2aSseEvent,
  A2aTask,
  A2aTaskId,
} from "@t3tools/contracts";
import type { Effect, Stream } from "effect";
import { ServiceMap } from "effect";

export interface A2aClientServiceShape {
  /** Discover a remote agent by fetching its agent card from URL. */
  discover(url: string): Effect.Effect<A2aAgentCard, A2aClientError>;

  /** Send a message to a remote A2A agent (synchronous response). */
  sendMessage(input: {
    readonly agentCardId: A2aAgentCardId;
    readonly message: A2aMessage;
    readonly taskId?: A2aTaskId;
  }): Effect.Effect<A2aTask, A2aClientError | A2aServiceError>;

  /** Send a message to a remote A2A agent with SSE streaming. */
  sendMessageStream(input: {
    readonly agentCardId: A2aAgentCardId;
    readonly message: A2aMessage;
    readonly taskId?: A2aTaskId;
  }): Stream.Stream<A2aSseEvent, A2aClientError | A2aServiceError>;

  /** Get task status from a remote agent. */
  getTask(
    agentCardId: A2aAgentCardId,
    taskId: A2aTaskId,
  ): Effect.Effect<A2aTask, A2aClientError | A2aServiceError>;

  /** Cancel a task on a remote agent. */
  cancelTask(
    agentCardId: A2aAgentCardId,
    taskId: A2aTaskId,
  ): Effect.Effect<A2aTask, A2aClientError | A2aServiceError>;
}

export class A2aClientService extends ServiceMap.Service<A2aClientService, A2aClientServiceShape>()(
  "t3/a2a/Services/A2aClientService",
) {}
