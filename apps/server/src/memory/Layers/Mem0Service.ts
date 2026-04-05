/**
 * Mem0ServiceLive - Live implementation of Mem0Service.
 *
 * Reads MEM0_API_KEY and MEM0_USER_ID from environment variables via Effect
 * Config. When MEM0_API_KEY is absent the layer provides a no-op
 * implementation so the rest of the system is unaffected.
 *
 * Retrieval calls are capped at 2 seconds and all errors are swallowed —
 * memory is a best-effort enhancement, never a hard dependency.
 *
 * @module Mem0ServiceLive
 */
import { Cause, Config, Duration, Effect, Layer, Option } from "effect";
import { MemoryClient } from "mem0ai";
import * as os from "node:os";

import { Mem0Service, type Mem0Memory, type Mem0ServiceShape } from "../Services/Mem0Service.ts";

// ---------------------------------------------------------------------------
// Environment config — read once at layer startup
// ---------------------------------------------------------------------------

const Mem0EnvConfig = Config.all({
  apiKey: Config.string("MEM0_API_KEY").pipe(Config.option, Config.map(Option.getOrUndefined)),
  userId: Config.string("MEM0_USER_ID").pipe(Config.option, Config.map(Option.getOrUndefined)),
});

// ---------------------------------------------------------------------------
// No-op implementation (used when MEM0_API_KEY is absent)
// ---------------------------------------------------------------------------

const noopImpl = (defaultUserId: string): Mem0ServiceShape => ({
  defaultUserId,
  search: (_query, _options) => Effect.succeed([]),
  add: (_messages, _options) => Effect.void,
});

// ---------------------------------------------------------------------------
// Live implementation helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw mem0ai Memory object to our internal Mem0Memory shape.
 * The SDK types are all optional — we guard against missing values here.
 */
const toMem0Memory = (raw: { id?: string; memory?: string; score?: number }): Mem0Memory | null => {
  if (!raw.id || !raw.memory) return null;
  return {
    id: raw.id,
    memory: raw.memory,
    score: raw.score ?? 0,
  };
};

/**
 * Suppress non-interrupt causes and return a fallback value.
 *
 * Effect.promise() converts Promise rejections into defects (not typed
 * errors), so we use catchCause to handle them. Interrupts are re-raised.
 */
const suppressNonInterrupt =
  <A>(fallback: A) =>
  (cause: Cause.Cause<never>): Effect.Effect<A> => {
    if (Cause.hasInterruptsOnly(cause)) {
      return Effect.failCause(cause);
    }
    return Effect.logWarning("Mem0Service: call failed", {
      error: Cause.pretty(cause),
    }).pipe(Effect.as(fallback));
  };

// ---------------------------------------------------------------------------
// Layer factory
// ---------------------------------------------------------------------------

const make = Effect.gen(function* () {
  const envConfig = yield* Mem0EnvConfig.asEffect();

  const defaultUserId = envConfig.userId ?? os.userInfo().username ?? "default";

  // Graceful degradation: if no API key is set, return the no-op service
  if (!envConfig.apiKey) {
    yield* Effect.logDebug("Mem0Service: MEM0_API_KEY not set — memory disabled");
    return noopImpl(defaultUserId);
  }

  const client = new MemoryClient({ apiKey: envConfig.apiKey });

  yield* Effect.logInfo("Mem0Service: memory enabled", { defaultUserId });

  /**
   * Search for memories relevant to the given query.
   * Global search (no run_id) or project-scoped (with run_id).
   * Timeout: 2 seconds. All errors suppressed → empty array.
   */
  const search = (
    query: string,
    options: { userId: string; projectId?: string },
  ): Effect.Effect<ReadonlyArray<Mem0Memory>> =>
    Effect.promise(() =>
      client.search(query, {
        user_id: options.userId,
        ...(options.projectId ? { run_id: options.projectId } : {}),
      }),
    ).pipe(
      Effect.map((results) =>
        results.flatMap((r) => {
          const mapped = toMem0Memory(r);
          return mapped ? [mapped] : [];
        }),
      ),
      // catchCause handles both typed errors and defects (promise rejections)
      Effect.catchCause(suppressNonInterrupt([] as ReadonlyArray<Mem0Memory>)),
      Effect.timeoutOption(Duration.millis(2000)),
      Effect.map(Option.getOrElse(() => [] as ReadonlyArray<Mem0Memory>)),
    );

  /**
   * Store a conversation for Mem0 to extract durable facts from.
   * Global (no run_id) or project-scoped (with run_id).
   * All errors suppressed → void.
   */
  const add = (
    messages: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
    options: { userId: string; projectId?: string },
  ): Effect.Effect<void> =>
    Effect.promise(() =>
      client.add(messages as Array<{ role: "user" | "assistant"; content: string }>, {
        user_id: options.userId,
        ...(options.projectId ? { run_id: options.projectId } : {}),
      }),
    ).pipe(
      Effect.asVoid,
      // catchCause handles both typed errors and defects (promise rejections)
      Effect.catchCause(suppressNonInterrupt(undefined as void)),
    );

  return { defaultUserId, search, add } satisfies Mem0ServiceShape;
});

export const Mem0ServiceLive = Layer.effect(Mem0Service, make);
