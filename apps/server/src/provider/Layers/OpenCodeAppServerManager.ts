/**
 * OpenCodeAppServerManager - Manages the `opencode serve` subprocess and
 * provides a typed HTTP client for communicating with its REST API.
 *
 * One server process is shared across all OpenCode threads in a single
 * Bird Code server session. The port is resolved dynamically starting from
 * 4096 and incrementing on conflict.
 *
 * @module OpenCodeAppServerManager
 */
import { Deferred, Effect, Ref } from "effect";
import { type ChildProcess as NodeChildProcess, spawn } from "node:child_process";

const STARTING_PORT = 4096;
const MAX_PORT_ATTEMPTS = 20;
const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_MAX_MS = 10_000;

export interface OpenCodeHttpClient {
  readonly baseUrl: string;
  readonly get: <T>(path: string) => Promise<T>;
  readonly post: <T>(path: string, body?: unknown) => Promise<T>;
  readonly delete: (path: string) => Promise<void>;
  readonly patch: <T>(path: string, body?: unknown) => Promise<T>;
}

async function isPortFree(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(300),
    });
    // Something already responds on this port — it's taken
    return !res.ok;
  } catch {
    // ECONNREFUSED — port is free
    return true;
  }
}

async function findFreePort(): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = STARTING_PORT + i;
    if (await isPortFree(port)) return port;
  }
  throw new Error("Could not find a free port for opencode serve");
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_POLL_MAX_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise<void>((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(
    `opencode server at ${baseUrl} did not become healthy within ${HEALTH_POLL_MAX_MS}ms`,
  );
}

function makeHttpClient(baseUrl: string): OpenCodeHttpClient {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`opencode HTTP ${method} ${path} → ${res.status}: ${text}`);
    }
    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    baseUrl,
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    delete: (path) => request<void>("DELETE", path),
    patch: (path, body) => request("PATCH", path, body ?? {}),
  };
}

export interface OpenCodeServerHandle {
  readonly client: OpenCodeHttpClient;
  readonly stop: () => void;
}

/**
 * Spawns `opencode serve` and waits until healthy.
 * Returns a handle with an HTTP client and a stop function.
 */
export async function startOpenCodeServer(binaryPath: string): Promise<OpenCodeServerHandle> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child: NodeChildProcess = spawn(binaryPath, ["serve", "--port", String(port)], {
    stdio: "ignore",
    detached: false,
  });

  child.on("error", (err) => {
    console.error("[OpenCodeAppServerManager] child process error:", err);
  });

  // Race health polling against early process exit
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) { settled = true; fn(); }
    };

    child.on("exit", (code) => {
      settle(() => reject(new Error(`opencode serve exited early with code ${code ?? "unknown"}`)));
    });

    waitForHealth(baseUrl)
      .then(() => settle(resolve))
      .catch((err: unknown) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))));
  });

  return {
    client: makeHttpClient(baseUrl),
    stop: () => {
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may have already exited
      }
    },
  };
}

export interface OpenCodeServerHandleManager {
  readonly getOrStart: Effect.Effect<OpenCodeServerHandle, Error>;
  readonly stop: Effect.Effect<void>;
}

/**
 * Effect-managed singleton handle. Acquired once per server session scope.
 * Exposes a Ref so adapters can obtain the client without re-spawning.
 *
 * Concurrency safety: uses a Deferred as a one-shot lock so concurrent fibers
 * calling getOrStart simultaneously only ever spawn one child process.
 */
export const makeOpenCodeServerHandleRef = (
  binaryPath: string,
): Effect.Effect<OpenCodeServerHandleManager> =>
  Effect.gen(function* () {
    const handleRef = yield* Ref.make<OpenCodeServerHandle | null>(null);
    // Deferred used as a one-shot lock: first caller races to complete it,
    // subsequent callers await its result without spawning a second process.
    const startingRef = yield* Ref.make<import("effect").Deferred.Deferred<OpenCodeServerHandle, Error> | null>(null);

    const getOrStart: Effect.Effect<OpenCodeServerHandle, Error> = Effect.gen(function* () {
      // Fast path: already running
      const existing = yield* Ref.get(handleRef);
      if (existing) return existing;

      // Check if a start is already in flight
      const existingDeferred = yield* Ref.get(startingRef);
      if (existingDeferred) {
        return yield* Deferred.await(existingDeferred);
      }

      // We are the first — create a deferred and race to set it
      const deferred = yield* Deferred.make<OpenCodeServerHandle, Error>();
      const won = yield* Ref.compareAndSet(startingRef, null, deferred);

      if (!won) {
        // Another fiber beat us to it — await their deferred
        const raceDeferred = yield* Ref.get(startingRef);
        if (raceDeferred) return yield* Deferred.await(raceDeferred);
        // Fallback: just get the handle (should be ready now)
        const handle = yield* Ref.get(handleRef);
        if (handle) return handle;
        return yield* Effect.fail(new Error("opencode server start race condition fallback"));
      }

      // We won the race — start the server
      const startEffect = Effect.tryPromise({
        try: () => startOpenCodeServer(binaryPath),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      });

      const result = yield* Effect.exit(startEffect);
      if (result._tag === "Failure") {
        const err = result.cause._tag === "Fail" ? result.cause.error : new Error("opencode start failed");
        yield* Deferred.fail(deferred, err);
        yield* Ref.set(startingRef, null);
        return yield* Effect.fail(err);
      }

      const handle = result.value;
      yield* Ref.set(handleRef, handle);
      yield* Deferred.succeed(deferred, handle);
      yield* Ref.set(startingRef, null);
      return handle;
    });

    const stop: Effect.Effect<void> = Effect.gen(function* () {
      const handle = yield* Ref.get(handleRef);
      handle?.stop();
      yield* Ref.set(handleRef, null);
    });

    return { getOrStart, stop };
  });
