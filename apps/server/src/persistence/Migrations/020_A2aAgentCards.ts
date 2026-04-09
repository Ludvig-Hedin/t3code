/**
 * Migration 020: Create A2A agent cards table.
 *
 * Stores discovered and local A2A Agent Card metadata for the
 * Agent-to-Agent protocol integration.
 */
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS a2a_agent_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      version TEXT,
      source TEXT NOT NULL,
      provider_kind TEXT,
      skills_json TEXT NOT NULL DEFAULT '[]',
      security_schemes_json TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '{"streaming":false,"pushNotifications":false}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_a2a_agent_cards_source
    ON a2a_agent_cards(source)
  `;
});
