/**
 * ProviderRegistryLive - Aggregates provider-specific snapshot services.
 *
 * @module ProviderRegistryLive
 */
import type { ProviderKind, ServerProvider } from "@t3tools/contracts";
import { Effect, Equal, Layer, PubSub, Ref, Stream } from "effect";

import { ClaudeProviderLive } from "./ClaudeProvider";
import { CodexProviderLive } from "./CodexProvider";
import { CursorProviderLive } from "./CursorProvider";
import { GeminiProviderLive } from "./GeminiProvider";
import { ManifestProviderLive } from "./ManifestProvider";
import { OllamaProviderLive } from "./OllamaProvider";
import { OpenCodeProviderLive } from "./OpenCodeProvider";
import type { ClaudeProviderShape } from "../Services/ClaudeProvider";
import { ClaudeProvider } from "../Services/ClaudeProvider";
import type { CodexProviderShape } from "../Services/CodexProvider";
import { CodexProvider } from "../Services/CodexProvider";
import type { CursorProviderShape } from "../Services/CursorProvider";
import { CursorProvider } from "../Services/CursorProvider";
import type { GeminiProviderShape } from "../Services/GeminiProvider";
import { GeminiProvider } from "../Services/GeminiProvider";
import type { ManifestProviderShape } from "../Services/ManifestProvider";
import { ManifestProvider } from "../Services/ManifestProvider";
import type { OllamaProviderShape } from "../Services/OllamaProvider";
import { OllamaProvider } from "../Services/OllamaProvider";
import type { OpenCodeProviderShape } from "../Services/OpenCodeProvider";
import { OpenCodeProvider } from "../Services/OpenCodeProvider";
import { ProviderRegistry, type ProviderRegistryShape } from "../Services/ProviderRegistry";

const loadProviders = (
  codexProvider: CodexProviderShape,
  claudeProvider: ClaudeProviderShape,
  cursorProvider: CursorProviderShape,
  geminiProvider: GeminiProviderShape,
  openCodeProvider: OpenCodeProviderShape,
  ollamaProvider: OllamaProviderShape,
  manifestProvider: ManifestProviderShape,
): Effect.Effect<
  readonly [
    ServerProvider,
    ServerProvider,
    ServerProvider,
    ServerProvider,
    ServerProvider,
    ServerProvider,
    ServerProvider,
  ]
> =>
  Effect.all(
    [
      codexProvider.getSnapshot,
      claudeProvider.getSnapshot,
      cursorProvider.getSnapshot,
      geminiProvider.getSnapshot,
      openCodeProvider.getSnapshot,
      ollamaProvider.getSnapshot,
      manifestProvider.getSnapshot,
    ],
    {
      concurrency: "unbounded",
    },
  );

export const haveProvidersChanged = (
  previousProviders: ReadonlyArray<ServerProvider>,
  nextProviders: ReadonlyArray<ServerProvider>,
): boolean => !Equal.equals(previousProviders, nextProviders);

export const ProviderRegistryLive = Layer.effect(
  ProviderRegistry,
  Effect.gen(function* () {
    const codexProvider = yield* CodexProvider;
    const claudeProvider = yield* ClaudeProvider;
    const cursorProvider = yield* CursorProvider;
    const geminiProvider = yield* GeminiProvider;
    const openCodeProvider = yield* OpenCodeProvider;
    const ollamaProvider = yield* OllamaProvider;
    const manifestProvider = yield* ManifestProvider;
    const changesPubSub = yield* Effect.acquireRelease(
      PubSub.unbounded<ReadonlyArray<ServerProvider>>(),
      PubSub.shutdown,
    );
    const providersRef = yield* Ref.make<ReadonlyArray<ServerProvider>>(
      yield* loadProviders(
        codexProvider,
        claudeProvider,
        cursorProvider,
        geminiProvider,
        openCodeProvider,
        ollamaProvider,
        manifestProvider,
      ),
    );

    const syncProviders = Effect.fn("syncProviders")(function* (options?: {
      readonly publish?: boolean;
    }) {
      const previousProviders = yield* Ref.get(providersRef);
      const providers = yield* loadProviders(
        codexProvider,
        claudeProvider,
        cursorProvider,
        geminiProvider,
        openCodeProvider,
        ollamaProvider,
        manifestProvider,
      );
      yield* Ref.set(providersRef, providers);

      if (options?.publish !== false && haveProvidersChanged(previousProviders, providers)) {
        yield* PubSub.publish(changesPubSub, providers);
      }

      return providers;
    });

    yield* Stream.runForEach(codexProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(claudeProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(cursorProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(geminiProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(openCodeProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(ollamaProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );
    yield* Stream.runForEach(manifestProvider.streamChanges, () => syncProviders()).pipe(
      Effect.forkScoped,
    );

    const refresh = Effect.fn("refresh")(function* (provider?: ProviderKind) {
      switch (provider) {
        case "codex":
          yield* codexProvider.refresh;
          break;
        case "claudeAgent":
          yield* claudeProvider.refresh;
          break;
        case "cursor":
          yield* cursorProvider.refresh;
          break;
        case "gemini":
          yield* geminiProvider.refresh;
          break;
        case "opencode":
          yield* openCodeProvider.refresh;
          break;
        case "ollama":
          yield* ollamaProvider.refresh;
          break;
        case "manifest":
          yield* manifestProvider.refresh;
          break;
        default:
          yield* Effect.all(
            [
              codexProvider.refresh,
              claudeProvider.refresh,
              cursorProvider.refresh,
              geminiProvider.refresh,
              openCodeProvider.refresh,
              ollamaProvider.refresh,
              manifestProvider.refresh,
            ],
            {
              concurrency: "unbounded",
            },
          );
          break;
      }
      return yield* syncProviders();
    });

    return {
      getProviders: syncProviders({ publish: false }).pipe(
        Effect.tapError(Effect.logError),
        Effect.orElseSucceed(() => []),
      ),
      refresh: (provider?: ProviderKind) =>
        refresh(provider).pipe(
          Effect.tapError(Effect.logError),
          Effect.orElseSucceed(() => []),
        ),
      get streamChanges() {
        return Stream.fromPubSub(changesPubSub);
      },
    } satisfies ProviderRegistryShape;
  }),
).pipe(
  Layer.provideMerge(CodexProviderLive),
  Layer.provideMerge(ClaudeProviderLive),
  Layer.provideMerge(CursorProviderLive),
  Layer.provideMerge(GeminiProviderLive),
  Layer.provideMerge(OpenCodeProviderLive),
  Layer.provideMerge(OllamaProviderLive),
  Layer.provideMerge(ManifestProviderLive),
);
