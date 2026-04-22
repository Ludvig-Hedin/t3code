import { Effect, Layer } from "effect";
import { TranscriptionError } from "@t3tools/contracts";

import { TranscriptionService } from "../TranscriptionService";
import { requestWhisperTranscription, resolveWhisperConfig } from "../whisperHttp";

export const TranscriptionServiceLive = Layer.succeed(
  TranscriptionService,
  TranscriptionService.of({
    transcribeAudio: (input) =>
      Effect.gen(function* () {
        const config = resolveWhisperConfig();
        const binary = Buffer.from(input.audioBase64, "base64");

        return yield* requestWhisperTranscription({
          config,
          upload: {
            binary,
            mimeType: input.mimeType,
            fileName: input.fileName ?? "recording.webm",
          },
        }).pipe(
          Effect.tapError((error) =>
            Effect.logDebug("transcription.server.rpc.failed", {
              code: error.code,
              message: error.message,
            }),
          ),
        );
      }),
  }),
);
