import { Effect, Exit, ManagedRuntime, Option, Scope, Stream } from "effect";
import * as Duration from "effect/Duration";

import {
  createWsRpcProtocolLayer,
  makeWsRpcProtocolClient,
  type WsRpcProtocolClient,
} from "./rpc/protocol";
import { RpcClient } from "effect/unstable/rpc";

interface SubscribeOptions {
  readonly retryDelay?: Duration.Input;
}

interface RequestOptions {
  readonly timeout?: Option.Option<Duration.Input>;
}

interface WsTransportOptions {
  /** Invoked once when the transport decides the connection is dead. */
  readonly onDead?: (reason: string) => void;
}

const DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS = Duration.millis(250);
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const CLIENT_ACQUISITION_TIMEOUT_MS = 30_000;

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

export class WsTransport {
  private readonly runtime: ManagedRuntime.ManagedRuntime<RpcClient.Protocol, never>;
  private readonly clientScope: Scope.Closeable;
  private readonly clientPromise: Promise<WsRpcProtocolClient>;
  private disposed = false;
  private readonly onDead: ((reason: string) => void) | null;
  private deadSignaled = false;

  constructor(url?: string, options?: WsTransportOptions) {
    this.runtime = ManagedRuntime.make(createWsRpcProtocolLayer(url));
    this.clientScope = this.runtime.runSync(Scope.make());
    this.clientPromise = this.runtime.runPromise(
      Scope.provide(this.clientScope)(makeWsRpcProtocolClient),
    );
    this.onDead = options?.onDead ?? null;
    if (this.onDead) {
      // Swallow rejections from the clientPromise itself — we surface them via onDead instead,
      // otherwise an unhandled rejection floods devtools.
      this.clientPromise.catch((error) => {
        this.markDead(`client acquisition failed: ${formatErrorMessage(error)}`);
      });
    }
  }

  get isDead(): boolean {
    return this.deadSignaled || this.disposed;
  }

  private markDead(reason: string) {
    if (this.deadSignaled || this.disposed) return;
    this.deadSignaled = true;
    console.warn("[WsTransport] connection declared dead:", reason);
    try {
      this.onDead?.(reason);
    } catch {
      // never let consumer errors prevent shutdown
    }
  }

  async request<TSuccess>(
    execute: (client: WsRpcProtocolClient) => Effect.Effect<TSuccess, Error, never>,
    options?: RequestOptions,
  ): Promise<TSuccess> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    // Bound the wait for the initial client so a hung handshake can't pin a request forever.
    const client = await this.withTimeout(
      this.clientPromise,
      CLIENT_ACQUISITION_TIMEOUT_MS,
      "WebSocket client acquisition timed out",
    );

    const timeoutMs = this.resolveRequestTimeoutMs(options);
    const effectPromise = this.runtime.runPromise(Effect.suspend(() => execute(client)));
    if (timeoutMs === null) {
      return await effectPromise;
    }
    return await this.withTimeout(
      effectPromise,
      timeoutMs,
      `WebSocket RPC request timed out after ${timeoutMs}ms`,
    );
  }

  private resolveRequestTimeoutMs(options: RequestOptions | undefined): number | null {
    if (!options || options.timeout === undefined) {
      return DEFAULT_REQUEST_TIMEOUT_MS;
    }
    return Option.match(options.timeout, {
      onNone: () => null,
      onSome: (input) => Duration.toMillis(Duration.fromInputUnsafe(input)),
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  async requestStream<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
  ): Promise<void> {
    if (this.disposed) {
      throw new Error("Transport disposed");
    }

    const client = await this.withTimeout(
      this.clientPromise,
      CLIENT_ACQUISITION_TIMEOUT_MS,
      "WebSocket client acquisition timed out",
    );
    await this.runtime.runPromise(
      Stream.runForEach(connect(client), (value) =>
        Effect.sync(() => {
          try {
            listener(value);
          } catch {
            // Swallow listener errors so the stream can finish cleanly.
          }
        }),
      ),
    );
  }

  subscribe<TValue>(
    connect: (client: WsRpcProtocolClient) => Stream.Stream<TValue, Error, never>,
    listener: (value: TValue) => void,
    options?: SubscribeOptions,
  ): () => void {
    if (this.disposed) {
      return () => undefined;
    }

    let active = true;
    const retryDelayMs = options?.retryDelay ?? DEFAULT_SUBSCRIPTION_RETRY_DELAY_MS;
    const cancel = this.runtime.runCallback(
      Effect.promise(() => this.clientPromise).pipe(
        Effect.flatMap((client) =>
          Stream.runForEach(connect(client), (value) =>
            Effect.sync(() => {
              if (!active) {
                return;
              }
              try {
                listener(value);
              } catch {
                // Swallow listener errors so the stream stays live.
              }
            }),
          ),
        ),
        Effect.catch((error) => {
          if (!active || this.disposed) {
            return Effect.interrupt;
          }
          return Effect.sync(() => {
            console.warn("[WsTransport] subscription disconnected, retrying", {
              error: formatErrorMessage(error),
            });
          }).pipe(Effect.andThen(Effect.sleep(retryDelayMs)));
        }),
        Effect.forever,
      ),
    );

    return () => {
      active = false;
      cancel();
    };
  }

  /**
   * Run `ping` on an interval; if it fails `failureThreshold` times in a row
   * (or a single ping exceeds `perPingTimeout`), declare the transport dead
   * and invoke `onDead`. Returns a stop function for cleanup.
   */
  startHeartbeat(config: {
    readonly ping: () => Promise<unknown>;
    readonly intervalMs?: number;
    readonly perPingTimeoutMs?: number;
    readonly failureThreshold?: number;
  }): () => void {
    const intervalMs = config.intervalMs ?? 20_000;
    const perPingTimeoutMs = config.perPingTimeoutMs ?? 10_000;
    const failureThreshold = config.failureThreshold ?? 2;
    let consecutiveFailures = 0;
    let stopped = false;

    const runOnce = async () => {
      if (stopped || this.disposed) return;
      try {
        await this.withTimeout(
          Promise.resolve().then(() => config.ping()),
          perPingTimeoutMs,
          `heartbeat ping timed out after ${perPingTimeoutMs}ms`,
        );
        if (consecutiveFailures > 0) {
          console.info("[WsTransport] heartbeat recovered");
        }
        consecutiveFailures = 0;
      } catch (error) {
        consecutiveFailures += 1;
        console.warn(
          `[WsTransport] heartbeat failed (${consecutiveFailures}/${failureThreshold})`,
          { error: formatErrorMessage(error) },
        );
        if (consecutiveFailures >= failureThreshold) {
          this.markDead(
            `heartbeat failed ${failureThreshold} times in a row: ${formatErrorMessage(error)}`,
          );
        }
      }
    };

    const timer = setInterval(() => {
      void runOnce();
    }, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.runtime.runPromise(Scope.close(this.clientScope, Exit.void)).finally(() => {
      this.runtime.dispose();
    });
  }
}
