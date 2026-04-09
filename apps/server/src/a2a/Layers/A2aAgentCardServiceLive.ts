/**
 * A2aAgentCardServiceLive - SQLite-backed implementation of A2aAgentCardService.
 *
 * Persists agent cards to the a2a_agent_cards table and supports
 * remote discovery via /.well-known/agent-card.json HTTP fetch.
 *
 * @module A2aAgentCardServiceLive
 */
import {
  type A2aAgentCard,
  type A2aAgentCardId,
  A2aClientError,
  A2aServiceError,
} from "@t3tools/contracts";
import { Cause, Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  A2aAgentCardService,
  type A2aAgentCardServiceShape,
} from "../Services/A2aAgentCardService.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

const make = Effect.gen(function* () {
  // ── Helpers ────────────────────────────────────────────────────────────

  const cardFromRow = (row: Record<string, unknown>): A2aAgentCard => ({
    id: row.id as A2aAgentCardId,
    name: row.name as string,
    description: (row.description as string) || undefined,
    url: row.url as string,
    version: (row.version as string) || undefined,
    skills: JSON.parse((row.skills_json as string) || "[]"),
    securitySchemes: row.security_schemes_json
      ? JSON.parse(row.security_schemes_json as string)
      : undefined,
    capabilities: JSON.parse(
      (row.capabilities_json as string) ||
        '{"streaming":false,"pushNotifications":false}',
    ),
    source: row.source as "local" | "remote",
    providerKind: (row.provider_kind as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastSeenAt: (row.last_seen_at as string) || undefined,
  });

  // ── Service methods ────────────────────────────────────────────────────

  const list: A2aAgentCardServiceShape["list"] = () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql`SELECT * FROM a2a_agent_cards ORDER BY name`;
      return rows.map(cardFromRow);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.fail(
          new A2aServiceError({
            message: `Failed to list agent cards: ${Cause.pretty(cause)}`,
          }),
        ),
      ),
    );

  const get: A2aAgentCardServiceShape["get"] = (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql`SELECT * FROM a2a_agent_cards WHERE id = ${id}`;
      if (rows.length === 0) {
        return yield* Effect.fail(
          new A2aServiceError({ message: `Agent card not found: ${id}` }),
        );
      }
      return cardFromRow(rows[0]!);
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to get agent card: ${cause}` }),
        );
      }),
    );

  const register: A2aAgentCardServiceShape["register"] = (input) =>
    Effect.gen(function* () {
      // Discover the agent card from the URL first
      const card = yield* discover(input.url);
      // Override name if provided
      if (input.name) {
        (card as { name: string }).name = input.name;
      }
      return card;
    });

  const remove: A2aAgentCardServiceShape["remove"] = (id) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Remove associated tasks first (cascading delete)
      yield* sql`DELETE FROM a2a_tasks WHERE agent_card_id = ${id}`;
      const result = yield* sql`DELETE FROM a2a_agent_cards WHERE id = ${id}`;
      if ((result as unknown as { changes?: number }).changes === 0) {
        return yield* Effect.fail(
          new A2aServiceError({ message: `Agent card not found: ${id}` }),
        );
      }
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to remove agent card: ${cause}` }),
        );
      }),
    );

  const discover: A2aAgentCardServiceShape["discover"] = (rawUrl) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      // Normalize URL: append /.well-known/agent-card.json if not present
      let url = rawUrl.replace(/\/+$/, "");
      if (!url.endsWith("/agent-card.json")) {
        url = `${url}/.well-known/agent-card.json`;
      }

      // Fetch the agent card (failures become Effect failures via tryPromise; no JS throw)
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers: { Accept: "application/json" } }),
        catch: (error) =>
          new A2aClientError({
            message: `Failed to fetch agent card from ${url}: ${error}`,
            url,
          }),
      });

      if (!response.ok) {
        return yield* Effect.fail(
          new A2aClientError({
            message: `Agent card fetch failed with status ${response.status}`,
            url,
            statusCode: response.status,
          }),
        );
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new A2aClientError({ message: `Invalid JSON in agent card: ${error}`, url }),
      });

      // Parse the remote agent card into our schema
      const now = nowIso();
      const id = newId() as A2aAgentCardId;
      const baseUrl = rawUrl.replace(/\/+$/, "").replace(/\/.well-known\/agent-card\.json$/, "");

      const card: A2aAgentCard = {
        id,
        name: (json as Record<string, unknown>).name as string || "Unknown Agent",
        description: (json as Record<string, unknown>).description as string || undefined,
        url: (json as Record<string, unknown>).serviceEndpoint as string || baseUrl,
        version: (json as Record<string, unknown>).version as string || undefined,
        skills: Array.isArray((json as Record<string, unknown>).skills)
          ? ((json as Record<string, unknown>).skills as unknown[]).map((s: unknown) => {
              const skill = s as Record<string, unknown>;
              return {
                id: (skill.id as string) || newId(),
                name: (skill.name as string) || "unnamed",
                description: skill.description as string | undefined,
                tags: skill.tags as string[] | undefined,
                inputModes: (skill.inputModes as string[]) || ["text"],
                outputModes: (skill.outputModes as string[]) || ["text"],
              };
            })
          : [],
        securitySchemes: (json as Record<string, unknown>).securitySchemes as
          | Record<string, unknown>
          | undefined,
        capabilities: {
          streaming: !!(json as Record<string, unknown>).capabilities &&
            !!((json as Record<string, unknown>).capabilities as Record<string, unknown>).streaming,
          pushNotifications: !!(json as Record<string, unknown>).capabilities &&
            !!((json as Record<string, unknown>).capabilities as Record<string, unknown>)
              .pushNotifications,
        },
        source: "remote",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };

      // Upsert into database (check if URL already exists)
      const existing =
        yield* sql`SELECT id FROM a2a_agent_cards WHERE url = ${card.url} AND source = 'remote'`;
      if (existing.length > 0) {
        // Update existing card
        const existingId = existing[0]!.id as string;
        yield* sql`
          UPDATE a2a_agent_cards SET
            name = ${card.name},
            description = ${card.description || null},
            version = ${card.version || null},
            skills_json = ${JSON.stringify(card.skills)},
            security_schemes_json = ${card.securitySchemes ? JSON.stringify(card.securitySchemes) : null},
            capabilities_json = ${JSON.stringify(card.capabilities)},
            updated_at = ${now},
            last_seen_at = ${now}
          WHERE id = ${existingId}
        `;
        return { ...card, id: existingId as A2aAgentCardId };
      }

      // Insert new card
      yield* sql`
        INSERT INTO a2a_agent_cards (
          id, name, description, url, version, source, provider_kind,
          skills_json, security_schemes_json, capabilities_json,
          created_at, updated_at, last_seen_at
        ) VALUES (
          ${card.id}, ${card.name}, ${card.description || null},
          ${card.url}, ${card.version || null}, ${card.source}, ${null},
          ${JSON.stringify(card.skills)},
          ${card.securitySchemes ? JSON.stringify(card.securitySchemes) : null},
          ${JSON.stringify(card.capabilities)},
          ${card.createdAt}, ${card.updatedAt}, ${card.lastSeenAt || null}
        )
      `;

      return card;
    });

  const getOwnCard: A2aAgentCardServiceShape["getOwnCard"] = () =>
    Effect.gen(function* () {
      const now = nowIso();
      // Generate a composite card representing this Bird Code instance
      const card: A2aAgentCard = {
        id: "bird-code-local" as A2aAgentCardId,
        name: "Bird Code",
        description: "Multi-provider AI coding agent orchestration platform",
        url: "/a2a", // relative — the HTTP server binds this
        version: "1.0.0",
        skills: [
          {
            id: "code-assistant",
            name: "Code Assistant",
            description: "AI-powered code generation, review, and debugging",
            inputModes: ["text"],
            outputModes: ["text"],
          },
        ],
        capabilities: {
          streaming: true,
          pushNotifications: false,
        },
        source: "local",
        createdAt: now,
        updatedAt: now,
      };
      return card;
    });

  return {
    list,
    get,
    register,
    remove,
    discover,
    getOwnCard,
  } satisfies A2aAgentCardServiceShape;
});

export const A2aAgentCardServiceLive = Layer.effect(A2aAgentCardService, make);
