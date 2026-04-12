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
  type A2aContentMode,
  A2aClientError,
  A2aSecurityScheme,
  A2aServiceError,
} from "@t3tools/contracts";
import { Cause, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  A2aAgentCardService,
  type A2aAgentCardServiceShape,
  type IA2aAgentCardService,
} from "../Services/A2aAgentCardService.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function readOptionalString(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" ? v : undefined;
}

function readRequiredString(row: Record<string, unknown>, key: string): string | undefined {
  const v = readOptionalString(row, key);
  return v !== undefined && v.length > 0 ? v : undefined;
}

function parseJsonArray(raw: string | undefined, fallback: unknown[] = []): unknown[] {
  if (raw === undefined || raw.length === 0) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(
  raw: string | undefined,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  if (raw === undefined || raw.length === 0) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fallback;
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

const CONTENT_MODES = new Set<string>(["text", "file", "data"]);

function normalizeContentModes(modes: unknown[]): ReadonlyArray<A2aContentMode> {
  if (
    modes.length > 0 &&
    modes.every((m): m is A2aContentMode => typeof m === "string" && CONTENT_MODES.has(m))
  ) {
    return modes;
  }
  return ["text"];
}

const SecuritySchemesSchema = Schema.Record(Schema.String, A2aSecurityScheme);

function normalizeSecuritySchemes(raw: unknown): A2aAgentCard["securitySchemes"] {
  if (raw === undefined || raw === null) return undefined;
  try {
    return Schema.decodeUnknownSync(SecuritySchemesSchema)(raw);
  } catch {
    return undefined;
  }
}

function cardFromRow(row: Record<string, unknown>): A2aAgentCard {
  const id = readRequiredString(row, "id");
  const name = readRequiredString(row, "name");
  const url = readRequiredString(row, "url");
  const source = row.source;
  const createdAt = readRequiredString(row, "created_at");
  const updatedAt = readRequiredString(row, "updated_at");
  if (
    id === undefined ||
    name === undefined ||
    url === undefined ||
    (source !== "local" && source !== "remote") ||
    createdAt === undefined ||
    updatedAt === undefined
  ) {
    throw new Error("Invalid a2a_agent_cards row shape");
  }

  return {
    id: id as A2aAgentCardId,
    name,
    description: readOptionalString(row, "description") || undefined,
    url,
    version: readOptionalString(row, "version") || undefined,
    skills: parseJsonArray(readOptionalString(row, "skills_json")).map((s) => {
      const skill = asRecord(s) ?? {};
      const sid = readOptionalString(skill, "id") ?? newId();
      const sname = readOptionalString(skill, "name") ?? "unnamed";
      const inputModesRaw = skill["inputModes"];
      const outputModesRaw = skill["outputModes"];
      return {
        id: sid,
        name: sname,
        description: readOptionalString(skill, "description"),
        tags: Array.isArray(skill["tags"])
          ? (skill["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
          : undefined,
        inputModes: normalizeContentModes(Array.isArray(inputModesRaw) ? inputModesRaw : []),
        outputModes: normalizeContentModes(Array.isArray(outputModesRaw) ? outputModesRaw : []),
      };
    }),
    securitySchemes: (() => {
      const raw = readOptionalString(row, "security_schemes_json");
      if (raw === undefined) return undefined;
      try {
        return normalizeSecuritySchemes(JSON.parse(raw));
      } catch {
        return undefined;
      }
    })(),
    capabilities: parseJsonObject(readOptionalString(row, "capabilities_json"), {
      streaming: false,
      pushNotifications: false,
    }) as A2aAgentCard["capabilities"],
    source,
    providerKind: readOptionalString(row, "provider_kind") || undefined,
    createdAt,
    updatedAt,
    lastSeenAt: readOptionalString(row, "last_seen_at") || undefined,
  };
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const list: A2aAgentCardServiceShape["list"] = () =>
    Effect.gen(function* () {
      const rows = yield* sql`SELECT * FROM a2a_agent_cards ORDER BY name`;
      return rows.map((row) => cardFromRow(row as Record<string, unknown>));
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
      const rows = yield* sql`SELECT * FROM a2a_agent_cards WHERE id = ${id}`;
      if (rows.length === 0) {
        return yield* new A2aServiceError({ message: `Agent card not found: ${id}` });
      }
      return cardFromRow(rows[0]! as Record<string, unknown>);
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(new A2aServiceError({ message: `Failed to get agent card: ${cause}` }));
      }),
    );

  const discover: A2aAgentCardServiceShape["discover"] = (rawUrl) =>
    Effect.gen(function* () {
      let url = rawUrl.replace(/\/+$/, "");
      if (!url.endsWith("/agent-card.json")) {
        url = `${url}/.well-known/agent-card.json`;
      }

      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers: { Accept: "application/json" } }),
        catch: (error) =>
          new A2aClientError({
            message: `Failed to fetch agent card from ${url}: ${error}`,
            url,
          }),
      });

      if (!response.ok) {
        return yield* new A2aClientError({
          message: `Agent card fetch failed with status ${response.status}`,
          url,
          statusCode: response.status,
        });
      }

      const json = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (error) =>
          new A2aClientError({ message: `Invalid JSON in agent card: ${error}`, url }),
      });

      const root = asRecord(json);
      if (root === null) {
        return yield* new A2aClientError({ message: "Agent card JSON must be an object", url });
      }

      const now = nowIso();
      const id = newId() as A2aAgentCardId;
      const baseUrl = rawUrl.replace(/\/+$/, "").replace(/\/.well-known\/agent-card\.json$/, "");

      const name = readOptionalString(root, "name") ?? "Unknown Agent";
      const description = readOptionalString(root, "description");
      const serviceEndpoint = readOptionalString(root, "serviceEndpoint");
      const cardUrl = serviceEndpoint ?? baseUrl;
      const version = readOptionalString(root, "version");
      const skillsRaw = root["skills"];
      const skills = Array.isArray(skillsRaw)
        ? skillsRaw.map((s) => {
            const skill = asRecord(s) ?? {};
            return {
              id: readOptionalString(skill, "id") ?? newId(),
              name: readOptionalString(skill, "name") ?? "unnamed",
              description: readOptionalString(skill, "description"),
              tags: Array.isArray(skill["tags"])
                ? (skill["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
                : undefined,
              inputModes: normalizeContentModes(
                Array.isArray(skill["inputModes"]) ? skill["inputModes"] : [],
              ),
              outputModes: normalizeContentModes(
                Array.isArray(skill["outputModes"]) ? skill["outputModes"] : [],
              ),
            };
          })
        : [];

      const cap = asRecord(root["capabilities"]);
      const capabilities: A2aAgentCard["capabilities"] = {
        streaming: Boolean(cap && cap["streaming"] === true),
        pushNotifications: Boolean(cap && cap["pushNotifications"] === true),
      };

      const card: A2aAgentCard = {
        id,
        name,
        description,
        url: cardUrl,
        version,
        skills,
        securitySchemes: normalizeSecuritySchemes(root["securitySchemes"]),
        capabilities,
        source: "remote",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      };

      const existing =
        yield* sql`SELECT id FROM a2a_agent_cards WHERE url = ${card.url} AND source = 'remote'`;
      if (existing.length > 0) {
        const existingRow = existing[0] as Record<string, unknown>;
        const existingIdRaw = existingRow["id"];
        const existingId =
          typeof existingIdRaw === "string" && existingIdRaw.length > 0 ? existingIdRaw : undefined;
        if (existingId === undefined) {
          return yield* new A2aServiceError({ message: "Invalid existing remote agent card id" });
        }
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
    }).pipe(
      Effect.mapError((err): A2aClientError | A2aServiceError => {
        if (err instanceof A2aClientError) return err;
        if (err instanceof A2aServiceError) return err;
        return new A2aServiceError({
          message: `Agent card discover failed: ${String(err)}`,
        });
      }),
    );

  const register: A2aAgentCardServiceShape["register"] = (input) =>
    Effect.gen(function* () {
      const card = yield* discover(input.url);
      if (!input.name) {
        return card;
      }
      const now = nowIso();
      const finalCard: A2aAgentCard = { ...card, name: input.name, updatedAt: now };
      yield* sql`
        UPDATE a2a_agent_cards SET
          name = ${finalCard.name},
          updated_at = ${now}
        WHERE id = ${finalCard.id}
      `;
      return finalCard;
    }).pipe(
      Effect.mapError((err): A2aClientError | A2aServiceError => {
        if (err instanceof A2aClientError) return err;
        if (err instanceof A2aServiceError) return err;
        return new A2aServiceError({
          message: `Agent card register failed: ${String(err)}`,
        });
      }),
    );

  const remove: A2aAgentCardServiceShape["remove"] = (id) =>
    Effect.gen(function* () {
      const found = yield* sql`SELECT id FROM a2a_agent_cards WHERE id = ${id} LIMIT 1`;
      if (found.length === 0) {
        return yield* new A2aServiceError({ message: `Agent card not found: ${id}` });
      }
      yield* sql`DELETE FROM a2a_tasks WHERE agent_card_id = ${id}`;
      yield* sql`DELETE FROM a2a_agent_cards WHERE id = ${id}`;
    }).pipe(
      Effect.catch((cause) => {
        if (cause instanceof A2aServiceError) return Effect.fail(cause);
        return Effect.fail(
          new A2aServiceError({ message: `Failed to remove agent card: ${cause}` }),
        );
      }),
    );

  const getOwnCard: A2aAgentCardServiceShape["getOwnCard"] = () =>
    Effect.gen(function* () {
      const now = nowIso();
      const card: A2aAgentCard = {
        id: "bird-code-local" as A2aAgentCardId,
        name: "Bird Code",
        description: "Multi-provider AI coding agent orchestration platform",
        url: "/a2a",
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
  } satisfies IA2aAgentCardService;
});

export const A2aAgentCardServiceLive: Layer.Layer<
  A2aAgentCardService,
  never,
  SqlClient.SqlClient
> = Layer.effect(A2aAgentCardService, make);
