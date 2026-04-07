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
const HEALTH_POLL_INTERVAL_MS = 500;
// opencode initialises its DB and plugins on the first request, which can
// take 8-10 seconds on a cold start. Allow up to 45s total.
const HEALTH_POLL_MAX_MS = 45_000;
// Each individual fetch probe is allowed 12s (the first request can be slow).
const HEALTH_FETCH_TIMEOUT_MS = 12_000;

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
      const res = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
      });
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
    // Capture stderr so we can surface startup errors to the caller.
    stdio: ["ignore", "ignore", "pipe"],
    detached: false,
  });

  const stderrChunks: Buffer[] = [];
  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  }

  child.on("error", (err) => {
    console.error("[OpenCodeAppServerManager] child process error:", err);
  });

  // Race health polling against early process exit
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    child.on("exit", (code) => {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const detail = stderr ? `\nProcess output:\n${stderr}` : "";
      settle(() =>
        reject(new Error(`opencode serve exited early with code ${code ?? "unknown"}${detail}`)),
      );
    });

    waitForHealth(baseUrl)
      .then(() => settle(resolve))
      .catch((err: unknown) =>
        settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
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
    const startingRef = yield* Ref.make<
      import("effect").Deferred.Deferred<OpenCodeServerHandle, Error> | null
    >(null);

    const getOrStart: Effect.Effect<OpenCodeServerHandle, Error> = Effect.gen(function* () {
      // Fast path: already running
      const existing = yield* Ref.get(handleRef);
      if (existing) return existing;

      // Check if a start is already in flight — if so, await it
      const inflight = yield* Ref.get(startingRef);
      if (inflight !== null) {
        return yield* Deferred.await(inflight) as Effect.Effect<OpenCodeServerHandle, Error>;
      }

      // Create deferred and claim the "starting" slot
      const deferred = yield* Deferred.make<OpenCodeServerHandle, Error>();
      yield* Ref.set(startingRef, deferred);

      // Start the server and resolve/reject the deferred
      const started = yield* Effect.tryPromise({
        try: () => startOpenCodeServer(binaryPath),
        catch: (e) => (e instanceof Error ? e : new Error(String(e))),
      }).pipe(
        Effect.tap((handle) =>
          Effect.all([Ref.set(handleRef, handle), Deferred.succeed(deferred, handle)]),
        ),
        Effect.tapError((err) =>
          Effect.all([Deferred.fail(deferred, err), Ref.set(startingRef, null)]),
        ),
        Effect.ensuring(Ref.set(startingRef, null)),
      );

      return started;
    });

    const stop: Effect.Effect<void> = Effect.gen(function* () {
      const handle = yield* Ref.get(handleRef);
      handle?.stop();
      yield* Ref.set(handleRef, null);
    });

    return { getOrStart, stop };
  });
