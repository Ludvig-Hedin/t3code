/**
 * A2aTaskServiceLive - SQLite-backed implementation of A2aTaskService.
 *
 * Bridges A2A task lifecycle to the orchestration engine:
 * - Inbound messages create/continue tasks and map to orchestration threads
 * - Task state changes are broadcast via PubSub for SSE streaming
 *
 * @module A2aTaskServiceLive
 */
import {
  type A2aAgentCardId,
  type A2aMessage,
  A2aServiceError,
  type A2aSseEvent,
  type A2aTask,
  type A2aTaskId,
  type A2aTaskState,
} from "@t3tools/contracts";
import { Effect, Layer, PubSub, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { A2aTaskService, type A2aTaskServiceShape } from "../Services/A2aTaskService.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

const make = Effect.gen(function* () {
  const eventPubSub = yield* PubSub.unbounded<A2aSseEvent>();

  // ── Helpers ────────────────────────────────────────────────────────────

  const rowDebugId = (row: Record<string, unknown>) => String(row.id ?? "?");

  const parseTaskJsonField = <T>(
    row: Record<string, unknown>,
    raw: string | null | undefined,
    field: string,
    fallback: T,
  ): T => {
    if (raw == null || raw === "") return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      console.error(
        `[A2aTaskService] Invalid ${field} JSON for task ${rowDebugId(row)} (thread ${String(row.thread_id ?? "?")}):`,
        e,
      );
      return fallback;
    }
  };

  const taskFromRow = (row: Record<string, unknown>): A2aTask => ({
    id: row.id as A2aTaskId,
    agentCardId: row.agent_card_id as A2aAgentCardId,
    threadId: (row.thread_id as string) || undefined,
    status: {
      status: row.status as A2aTaskState["status"],
      timestamp: row.updated_at as string,
    },
    history: parseTaskJsonField<A2aMessage[]>(
      row,
      row.messages_json as string | undefined,
      "messages_json",
      [],
    ),
    artifacts: row.artifacts_json
      ? parseTaskJsonField<A2aTask["artifacts"]>(
          row,
          row.artifacts_json as string,
          "artifacts_json",
          undefined,
        )
      : undefined,
    metadata: row.metadata_json
      ? parseTaskJsonField<A2aTask["metadata"]>(
          row,
          row.metadata_json as string,
          "metadata_json",
          undefined,
        )
      : undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  });

  const publishEvent = (event: A2aSseEvent) =>
    PubSub.publish(eventPubSub, event).pipe(Effect.asVoid);

  // ── Service methods ────────────────────────────────────────────────────

  const handleInboundMessage: A2aTaskServiceShape["handleInboundMessage"] = (input) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const now = nowIso();

      if (input.taskId) {
        // Continue existing task — append message and update status
        const rows =
          yield* sql`SELECT * FROM a2a_tasks WHERE id = ${input.taskId}`;
        if (rows.length === 0) {
          return yield* Effect.fail(
            new A2aServiceError({ message: `Task not found: ${input.taskId}` }),
          );
        }
        const existing = taskFromRow(rows[0]!);
        const messages = [...(existing.history || []), input.message];

        yield* sql`
          UPDATE a2a_tasks SET
            status = 'working',
            messages_json = ${JSON.stringify(messages)},
            updated_at = ${now}
          WHERE id = ${input.taskId}
        `;

        const updatedTask: A2aTask = {
          ...existing,
          status: { status: "working", timestamp: now },
          history: messages,
          updatedAt: now,
        };

        yield* publishEvent({
          type: "task-status-update",
          taskId: input.taskId,
          status: updatedTask.status,
        });

        return updatedTask;
      }

      // Create new task
      const taskId = newId() as A2aTaskId;
      const messages: A2aMessage[] = [input.message];

      yield* sql`
        INSERT INTO a2a_tasks (
          id, agent_card_id, thread_id, status, messages_json, created_at, updated_at
        ) VALUES (
          ${taskId}, ${input.agentCardId}, ${null}, 'submitted',
          ${JSON.stringify(messages)}, ${now}, ${now}
        )
      `;

      const task: A2aTask = {
        id: taskId,
        agentCardId: input.agentCardId,
        status: { status: "submitted", timestamp: now },
        history: messages,
        createdAt: now,
        updatedAt: now,
      };

      yield* publishEvent({
        type: "task-status-update",
        taskId,
        status: task.status,
      });

      return task;
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to handle inbound message: ${cause}` }),
        );
      }),
    );

  const getTask: A2aTaskServiceShape["getTask"] = (taskId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql`SELECT * FROM a2a_tasks WHERE id = ${taskId}`;
      if (rows.length === 0) {
        return yield* Effect.fail(
          new A2aServiceError({ message: `Task not found: ${taskId}` }),
        );
      }
      return taskFromRow(rows[0]!);
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to get task: ${cause}` }),
        );
      }),
    );

  const listTasks: A2aTaskServiceShape["listTasks"] = (agentCardId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = agentCardId
        ? yield* sql`SELECT * FROM a2a_tasks WHERE agent_card_id = ${agentCardId} ORDER BY created_at DESC`
        : yield* sql`SELECT * FROM a2a_tasks ORDER BY created_at DESC`;
      return rows.map(taskFromRow);
    }).pipe(
      Effect.catch((cause) =>
        Effect.fail(new A2aServiceError({ message: `Failed to list tasks: ${cause}` })),
      ),
    );

  const cancelTask: A2aTaskServiceShape["cancelTask"] = (taskId) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const now = nowIso();
      const rows = yield* sql`SELECT * FROM a2a_tasks WHERE id = ${taskId}`;
      if (rows.length === 0) {
        return yield* Effect.fail(
          new A2aServiceError({ message: `Task not found: ${taskId}` }),
        );
      }

      yield* sql`
        UPDATE a2a_tasks SET status = 'canceled', updated_at = ${now}
        WHERE id = ${taskId}
      `;

      const task = taskFromRow(rows[0]!);
      const canceledTask: A2aTask = {
        ...task,
        status: { status: "canceled", timestamp: now },
        updatedAt: now,
      };

      yield* publishEvent({
        type: "task-status-update",
        taskId,
        status: canceledTask.status,
        final: true,
      });

      return canceledTask;
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to cancel task: ${cause}` }),
        );
      }),
    );

  const streamEvents: A2aTaskServiceShape["streamEvents"] =
    Stream.fromPubSub(eventPubSub);

  return {
    handleInboundMessage,
    getTask,
    listTasks,
    cancelTask,
    streamEvents,
  } satisfies A2aTaskServiceShape;
});

export const A2aTaskServiceLive = Layer.effect(A2aTaskService, make);
