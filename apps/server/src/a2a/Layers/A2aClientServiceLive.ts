/**
 * A2aClientServiceLive - HTTP-based A2A protocol client.
 *
 * Implements outbound A2A communication: discovers remote agents,
 * sends JSON-RPC 2.0 messages, parses SSE streams, and resolves
 * authentication from agent card security schemes.
 *
 * @module A2aClientServiceLive
 */
import {
  type A2aAgentCard,
  type A2aAgentCardId,
  A2aClientError,
  type A2aMessage,
  A2aServiceError,
  type A2aSseEvent,
  type A2aTask,
  type A2aTaskId,
} from "@t3tools/contracts";
import { Effect, Layer, Stream } from "effect";

import { A2aClientService, type A2aClientServiceShape } from "../Services/A2aClientService.ts";
import { A2aAgentCardService } from "../Services/A2aAgentCardService.ts";

function newJsonRpcId(): string {
  return globalThis.crypto.randomUUID();
}

const make = Effect.gen(function* () {
  const agentCardService = yield* A2aAgentCardService;

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Resolve agent card URL from ID (looks up in DB). */
  const resolveAgentUrl = (agentCardId: A2aAgentCardId) =>
    Effect.gen(function* () {
      const card = yield* agentCardService.get(agentCardId);
      return card.url;
    });

  /** Build auth headers based on agent card security schemes. */
  const buildAuthHeaders = (
    _card: A2aAgentCard,
  ): Record<string, string> => {
    // TODO Phase 8: Resolve credentials from securitySchemes + env vars
    // For now, check for A2A_AUTH_TOKEN environment variable
    const token = process.env["A2A_AUTH_TOKEN"];
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  };

  /** Send a JSON-RPC 2.0 request to a remote A2A endpoint. */
  const sendJsonRpc = (url: string, method: string, params: unknown, authHeaders: Record<string, string>) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...authHeaders,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: newJsonRpcId(),
            method,
            params,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json = await response.json();
        if (json.error) {
          throw new Error(`JSON-RPC error ${json.error.code}: ${json.error.message}`);
        }
        return json.result;
      },
      catch: (error) =>
        new A2aClientError({
          message: `JSON-RPC request failed: ${error}`,
          url,
        }),
    });

  // ── Service methods ────────────────────────────────────────────────────

  const discover: A2aClientServiceShape["discover"] = (url) =>
    agentCardService.discover(url).pipe(
      Effect.mapError((cause) => {
        if (cause instanceof A2aClientError) return cause;
        return new A2aClientError({
          message: `Discovery failed: ${cause instanceof Error ? cause.message : String(cause)}`,
          url,
        });
      }),
    );

  const sendMessage: A2aClientServiceShape["sendMessage"] = (input) =>
    Effect.gen(function* () {
      const card = yield* agentCardService.get(input.agentCardId);
      const authHeaders = buildAuthHeaders(card);

      const params: Record<string, unknown> = {
        message: input.message,
      };
      if (input.taskId) {
        params.id = input.taskId;
      }

      const result = yield* sendJsonRpc(card.url, "message/send", params, authHeaders);

      // Parse result into A2aTask shape
      const taskResult = result as Record<string, unknown>;
      const now = new Date().toISOString();
      return {
        id: (taskResult.id as A2aTaskId) || (crypto.randomUUID() as A2aTaskId),
        agentCardId: input.agentCardId,
        status: (taskResult.status as A2aTask["status"] | undefined) ?? {
          status: "submitted" as const,
          timestamp: now,
        },
        history: taskResult.history as A2aTask["history"],
        artifacts: taskResult.artifacts as A2aTask["artifacts"],
        metadata: taskResult.metadata as A2aTask["metadata"],
        createdAt: (taskResult.createdAt as string) || now,
        updatedAt: now,
      } satisfies A2aTask;
    });

  const sendMessageStream: A2aClientServiceShape["sendMessageStream"] = (input) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const card = yield* agentCardService.get(input.agentCardId);
        const authHeaders = buildAuthHeaders(card);

        const params: Record<string, unknown> = {
          message: input.message,
        };
        if (input.taskId) {
          params.id = input.taskId;
        }

        // Return a stream that connects to the SSE endpoint
        return Stream.async<A2aSseEvent, A2aClientError | A2aServiceError>((emit) => {
          const controller = new AbortController();

          fetch(card.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              ...authHeaders,
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: newJsonRpcId(),
              method: "message/stream",
              params,
            }),
            signal: controller.signal,
          })
            .then(async (response) => {
              if (!response.ok || !response.body) {
                emit.fail(
                  new A2aClientError({
                    message: `SSE connection failed: HTTP ${response.status}`,
                    url: card.url,
                    statusCode: response.status,
                  }),
                );
                return;
              }

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";

              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const event = JSON.parse(line.slice(6)) as A2aSseEvent;
                      emit.single(event);
                    } catch {
                      // Skip malformed SSE data lines
                    }
                  }
                }
              }

              emit.end();
            })
            .catch((error) => {
              if (controller.signal.aborted) return;
              emit.fail(
                new A2aClientError({
                  message: `SSE stream error: ${error}`,
                  url: card.url,
                }),
              );
            });

          // Cleanup on stream finalization
          return Effect.sync(() => controller.abort());
        });
      }),
    );

  const getTask: A2aClientServiceShape["getTask"] = (agentCardId, taskId) =>
    Effect.gen(function* () {
      const card = yield* agentCardService.get(agentCardId);
      const authHeaders = buildAuthHeaders(card);
      const result = yield* sendJsonRpc(card.url, "tasks/get", { id: taskId }, authHeaders);
      const taskResult = result as Record<string, unknown>;
      const now = new Date().toISOString();
      return {
        id: (taskResult.id as A2aTaskId) || taskId,
        agentCardId,
        status: taskResult.status as A2aTask["status"] || { status: "completed" as const, timestamp: now },
        history: taskResult.history as A2aTask["history"],
        artifacts: taskResult.artifacts as A2aTask["artifacts"],
        metadata: taskResult.metadata as A2aTask["metadata"],
        createdAt: (taskResult.createdAt as string) || now,
        updatedAt: now,
      } satisfies A2aTask;
    });

  const cancelTask: A2aClientServiceShape["cancelTask"] = (agentCardId, taskId) =>
    Effect.gen(function* () {
      const card = yield* agentCardService.get(agentCardId);
      const authHeaders = buildAuthHeaders(card);
      const result = yield* sendJsonRpc(card.url, "tasks/cancel", { id: taskId }, authHeaders);
      const taskResult = result as Record<string, unknown>;
      const now = new Date().toISOString();
      return {
        id: (taskResult.id as A2aTaskId) || taskId,
        agentCardId,
        status: taskResult.status as A2aTask["status"] || { status: "canceled" as const, timestamp: now },
        history: taskResult.history as A2aTask["history"],
        artifacts: taskResult.artifacts as A2aTask["artifacts"],
        metadata: taskResult.metadata as A2aTask["metadata"],
        createdAt: (taskResult.createdAt as string) || now,
        updatedAt: now,
      } satisfies A2aTask;
    });

  return {
    discover,
    sendMessage,
    sendMessageStream,
    getTask,
    cancelTask,
  } satisfies A2aClientServiceShape;
});

export const A2aClientServiceLive = Layer.effect(A2aClientService, make);
