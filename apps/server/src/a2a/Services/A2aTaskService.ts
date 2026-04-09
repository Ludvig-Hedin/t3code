/**
 * A2aTaskService - Manages A2A task lifecycle and event streaming.
 *
 * Handles inbound A2A messages (from external clients), bridges them
 * to the orchestration engine, and provides task CRUD + event streaming.
 *
 * @module A2aTaskService
 */
import type {
  A2aAgentCardId,
  A2aMessage,
  A2aServiceError,
  A2aSseEvent,
  A2aTask,
  A2aTaskId,
} from "@t3tools/contracts";
import type { Effect, Stream } from "effect";
import { ServiceMap } from "effect";

export interface A2aTaskServiceShape {
  /** Process an inbound A2A message — create or continue a task. */
  handleInboundMessage(input: {
    readonly agentCardId: A2aAgentCardId;
    readonly message: A2aMessage;
    readonly taskId?: A2aTaskId;
  }): Effect.Effect<A2aTask, A2aServiceError>;

  /** Get a task by ID. */
  getTask(taskId: A2aTaskId): Effect.Effect<A2aTask, A2aServiceError>;

  /** List all tasks, optionally filtered by agent card. */
  listTasks(agentCardId?: A2aAgentCardId): Effect.Effect<ReadonlyArray<A2aTask>, A2aServiceError>;

  /** Cancel a running task. */
  cancelTask(taskId: A2aTaskId): Effect.Effect<A2aTask, A2aServiceError>;

  /** Stream of all A2A task events for real-time subscriptions. */
  readonly streamEvents: Stream.Stream<A2aSseEvent>;
}

export class A2aTaskService extends ServiceMap.Service<A2aTaskService, A2aTaskServiceShape>()(
  "t3/a2a/Services/A2aTaskService",
) {}
