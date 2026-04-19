/**
 * A2A HTTP routes - JSON-RPC 2.0 endpoint and Agent Card discovery.
 *
 * Exposes Bird Code as an A2A-compatible agent server:
 * - GET /.well-known/agent-card.json — Agent Card discovery endpoint (public per spec)
 * - POST /a2a — JSON-RPC 2.0 handler for message/send, tasks/get, tasks/cancel (auth-protected)
 *
 * Authentication:
 * - Inbound A2A requests check for Bearer token or API key in the Authorization header
 * - Controlled by A2A_INBOUND_AUTH_TOKEN env var (if set, all inbound requests must authenticate)
 * - Agent Card discovery is always public (A2A spec requirement)
 *
 * @module a2a/routes
 */
import { type A2aTaskId } from "@t3tools/contracts";
import { Effect } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { A2aAgentCardService } from "./Services/A2aAgentCardService.ts";
import { A2aTaskService } from "./Services/A2aTaskService.ts";

// ── Auth helper ──────────────────────────────────────────────────────────

/**
 * Validate inbound A2A request authentication.
 * If A2A_INBOUND_AUTH_TOKEN is set, requires Bearer or API key match.
 * Returns null if auth passes, or an error response if it fails.
 */
function validateA2aAuth(
  request: HttpServerRequest.HttpServerRequest,
): HttpServerResponse.HttpServerResponse | null {
  const requiredToken = process.env["A2A_INBOUND_AUTH_TOKEN"];
  if (!requiredToken) {
    // No auth configured — allow all inbound A2A requests
    return null;
  }

  const headers = request.headers;
  const authHeader = headers.authorization || headers.Authorization;

  if (typeof authHeader === "string") {
    // Check Bearer token
    if (authHeader.startsWith("Bearer ") && authHeader.slice(7) === requiredToken) {
      return null;
    }
    // Check direct token match (for API key style)
    if (authHeader === requiredToken) {
      return null;
    }
  }

  // Check X-API-Key header as fallback
  const apiKey = headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey === requiredToken) {
    return null;
  }

  return HttpServerResponse.jsonUnsafe(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Unauthorized: invalid or missing authentication" },
    },
    { status: 401 },
  );
}

function asTaskId(value: unknown): A2aTaskId | undefined {
  return typeof value === "string" && value.length > 0 ? (value as A2aTaskId) : undefined;
}

function asMessageParts(value: unknown): ReadonlyArray<
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "file";
      readonly file: {
        readonly name?: string | undefined;
        readonly mimeType?: string | undefined;
        readonly bytes?: string | undefined;
        readonly uri?: string | undefined;
      };
    }
  | { readonly type: "data"; readonly data: unknown }
> {
  if (!Array.isArray(value)) {
    return [];
  }

  const validParts: Array<
    | { readonly type: "text"; readonly text: string }
    | {
        readonly type: "file";
        readonly file: {
          readonly name?: string | undefined;
          readonly mimeType?: string | undefined;
          readonly bytes?: string | undefined;
          readonly uri?: string | undefined;
        };
      }
    | { readonly type: "data"; readonly data: unknown }
  > = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      validParts.push({ type: "text", text: record.text });
    } else if (record.type === "file" && record.file && typeof record.file === "object") {
      const fileRecord = record.file as Record<string, unknown>;
      validParts.push({
        type: "file",
        file: {
          name: typeof fileRecord.name === "string" ? fileRecord.name : undefined,
          mimeType: typeof fileRecord.mimeType === "string" ? fileRecord.mimeType : undefined,
          bytes: typeof fileRecord.bytes === "string" ? fileRecord.bytes : undefined,
          uri: typeof fileRecord.uri === "string" ? fileRecord.uri : undefined,
        },
      });
    } else if (record.type === "data" && "data" in record) {
      validParts.push({ type: "data", data: record.data });
    }
  }

  return validParts;
}

// ── Agent Card discovery endpoint ────────────────────────────────────────

export const a2aAgentCardRoute = HttpRouter.add(
  "GET",
  "/.well-known/agent-card.json",
  Effect.gen(function* () {
    const cardServiceOption = yield* Effect.serviceOption(A2aAgentCardService);
    const cardService = cardServiceOption._tag === "Some" ? cardServiceOption.value : undefined;
    if (!cardService) {
      return HttpServerResponse.jsonUnsafe(
        {
          error: {
            code: -32603,
            message: "A2A agent card service unavailable",
          },
        },
        { status: 503 },
      );
    }
    const card = yield* cardService.getOwnCard();

    // Format as spec-compliant A2A Agent Card
    const hasAuth = !!process.env["A2A_INBOUND_AUTH_TOKEN"];
    const specCard: Record<string, unknown> = {
      name: card.name,
      description: card.description,
      serviceEndpoint: card.url,
      version: card.version,
      skills: card.skills,
      capabilities: card.capabilities,
      // Advertise security schemes when auth is configured
      ...(hasAuth
        ? {
            securitySchemes: {
              bearerAuth: { type: "http", scheme: "bearer" },
              apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
            },
          }
        : {}),
    };

    return HttpServerResponse.jsonUnsafe(specCard, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
      },
    });
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          { error: { code: -32603, message: String(error) } },
          { status: 500 },
        ),
      ),
    ),
  ),
);

// ── JSON-RPC 2.0 endpoint ────────────────────────────────────────────────

export const a2aJsonRpcRoute = HttpRouter.add(
  "POST",
  "/a2a",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    // Authenticate inbound A2A request
    const authError = validateA2aAuth(request);
    if (authError) return authError;

    const taskServiceOption = yield* Effect.serviceOption(A2aTaskService);
    const cardServiceOption = yield* Effect.serviceOption(A2aAgentCardService);
    const taskService = taskServiceOption._tag === "Some" ? taskServiceOption.value : undefined;
    const cardService = cardServiceOption._tag === "Some" ? cardServiceOption.value : undefined;
    if (!taskService || !cardService) {
      return HttpServerResponse.jsonUnsafe(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32603, message: "A2A services unavailable" },
        },
        { status: 503 },
      );
    }

    // Parse request body — request.json is an Effect; failures exit as JSON-RPC parse error (-32700)
    const bodyExit = yield* Effect.exit(request.json);
    if (bodyExit._tag === "Failure") {
      return HttpServerResponse.jsonUnsafe(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        },
        { status: 400 },
      );
    }
    const body = bodyExit.value as unknown;

    const rpc = body as { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
    if (rpc.jsonrpc !== "2.0" || !rpc.method) {
      return HttpServerResponse.jsonUnsafe(
        {
          jsonrpc: "2.0",
          id: rpc.id ?? null,
          error: { code: -32600, message: "Invalid Request" },
        },
        { status: 400 },
      );
    }

    const params = (rpc.params || {}) as Record<string, unknown>;

    const taskId = asTaskId(params.id);

    // Route to handler by method
    switch (rpc.method) {
      case "message/send": {
        // Get the local agent card ID for inbound messages
        const ownCard = yield* cardService.getOwnCard();
        const message = params.message as { role: string; parts: unknown[] };
        const task = yield* taskService.handleInboundMessage({
          agentCardId: ownCard.id,
          message: {
            role: (message?.role as "user" | "agent") || "user",
            parts:
              asMessageParts(message?.parts).length > 0
                ? asMessageParts(message?.parts)
                : [{ type: "text" as const, text: String(params.text || "") }],
          },
          ...(taskId ? { taskId } : {}),
        });
        return HttpServerResponse.jsonUnsafe(
          { jsonrpc: "2.0", id: rpc.id, result: task },
          { status: 200 },
        );
      }

      case "tasks/get": {
        if (!taskId) {
          return HttpServerResponse.jsonUnsafe(
            { jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: "Missing task id" } },
            { status: 400 },
          );
        }
        const task = yield* taskService.getTask(taskId);
        return HttpServerResponse.jsonUnsafe(
          { jsonrpc: "2.0", id: rpc.id, result: task },
          { status: 200 },
        );
      }

      case "tasks/cancel": {
        if (!taskId) {
          return HttpServerResponse.jsonUnsafe(
            { jsonrpc: "2.0", id: rpc.id, error: { code: -32602, message: "Missing task id" } },
            { status: 400 },
          );
        }
        const task = yield* taskService.cancelTask(taskId);
        return HttpServerResponse.jsonUnsafe(
          { jsonrpc: "2.0", id: rpc.id, result: task },
          { status: 200 },
        );
      }

      case "agent-card": {
        const card = yield* cardService.getOwnCard();
        return HttpServerResponse.jsonUnsafe(
          { jsonrpc: "2.0", id: rpc.id, result: card },
          { status: 200 },
        );
      }

      default:
        return HttpServerResponse.jsonUnsafe(
          {
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32601, message: `Method not found: ${rpc.method}` },
          },
          { status: 404 },
        );
    }
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed(
        HttpServerResponse.jsonUnsafe(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: `Internal error: ${error}` },
          },
          { status: 500 },
        ),
      ),
    ),
  ),
);
