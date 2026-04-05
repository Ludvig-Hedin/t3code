/**
 * MemoryReactorLive - Live implementation of the MemoryReactor.
 *
 * Subscribes to the provider runtime event stream. On each `turn.completed`
 * event it stores the recent conversation to Mem0 in two scopes:
 *   1. Global — user_id only (memories visible across all projects)
 *   2. Project-scoped — user_id + run_id=projectId
 *
 * The last 10 non-empty messages from the thread are sent to Mem0, which
 * extracts durable facts automatically.
 *
 * Storage runs within the stream handler fiber (post-turn, so no user-facing
 * latency impact). All errors are caught and logged — memory storage must
 * never affect turn processing.
 *
 * @module MemoryReactorLive
 */
import type { ProviderRuntimeEvent } from "@t3tools/contracts";
import { Cause, Effect, Layer, Stream } from "effect";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ProviderService } from "../../provider/Services/ProviderService.ts";
import { Mem0Service } from "../Services/Mem0Service.ts";
import { MemoryReactor, type MemoryReactorShape } from "../Services/MemoryReactor.ts";

// ---------------------------------------------------------------------------
// Turn completion handler
// ---------------------------------------------------------------------------

const make = Effect.gen(function* () {
  const mem0 = yield* Mem0Service;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const providerService = yield* ProviderService;

  /**
   * Store recent conversation messages to Mem0 after a turn completes.
   *
   * Called directly inside the stream handler (not forked) so it runs
   * in the background stream fiber that `start()` launches via `forkScoped`.
   * The storage completes before the handler processes the next event, but
   * since this happens after turn completion the user is never blocked.
   */
  const storeMemoriesForTurn = Effect.fn("storeMemoriesForTurn")(function* (
    event: Extract<ProviderRuntimeEvent, { type: "turn.completed" }>,
  ) {
    const readModel = yield* orchestrationEngine.getReadModel();
    const thread = readModel.threads.find((t) => t.id === event.threadId);
    if (!thread) {
      yield* Effect.logDebug("MemoryReactor: thread not found for turn.completed", {
        threadId: event.threadId,
      });
      return;
    }

    // Take up to the last 10 non-empty messages for Mem0 context extraction
    const recentMessages = thread.messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.text.trim().length > 0)
      .slice(-10)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      }));

    if (recentMessages.length === 0) {
      return;
    }

    const projectId = thread.projectId;
    const userId = mem0.defaultUserId;

    // Store globally and project-scoped in parallel.
    // Mem0Service.add already suppresses all errors internally.
    yield* Effect.all(
      [
        // Global memories — visible across all projects for this user
        mem0.add(recentMessages, { userId }),
        // Project-scoped memories — isolated to this project (run_id = projectId)
        mem0.add(recentMessages, { userId, projectId }),
      ],
      { concurrency: 2 },
    ).pipe(Effect.asVoid);
  });

  const start: MemoryReactorShape["start"] = Effect.fn("start")(function* () {
    // Fork a long-lived stream fiber scoped to the reactor's scope.
    // This mirrors the pattern used in CheckpointReactor.
    yield* Effect.forkScoped(
      Stream.runForEach(providerService.streamEvents, (event) => {
        if (event.type !== "turn.completed") {
          return Effect.void;
        }
        return storeMemoriesForTurn(
          event as Extract<ProviderRuntimeEvent, { type: "turn.completed" }>,
        ).pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              return Effect.failCause(cause);
            }
            // Log and discard non-interrupt errors — storage must never kill the stream
            return Effect.logWarning("MemoryReactor: failed to store memories", {
              threadId: (event as Extract<ProviderRuntimeEvent, { type: "turn.completed" }>)
                .threadId,
              cause: Cause.pretty(cause),
            });
          }),
        );
      }),
    );
  });

  return { start } satisfies MemoryReactorShape;
});

export const MemoryReactorLive = Layer.effect(MemoryReactor, make);
