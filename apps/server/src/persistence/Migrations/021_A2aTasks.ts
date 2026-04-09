/**
 * Migration 021: Create A2A tasks table.
 *
 * Tracks stateful A2A protocol tasks with their messages,
 * artifacts, and lifecycle status.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      id TEXT PRIMARY KEY,
      agent_card_id TEXT NOT NULL REFERENCES a2a_agent_cards(id),
      thread_id TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      messages_json TEXT NOT NULL DEFAULT '[]',
      artifacts_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_a2a_tasks_agent_card
    ON a2a_tasks(agent_card_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_a2a_tasks_thread
    ON a2a_tasks(thread_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_a2a_tasks_status
    ON a2a_tasks(status)
  `;
});
