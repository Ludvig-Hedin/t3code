import { Effect, Layer } from "effect";
import { TranscriptionError, type ServerTranscribeAudioResult } from "@t3tools/contracts";

import { TranscriptionService } from "../TranscriptionService";

const WHISPER_FALLBACK_PATHS = ["/v1/audio/transcriptions", "/inference", "/transcribe"];

const resolveWhisperConfig = () => {
  const endpoint = process.env["T3_TRANSCRIPTION_WHISPER_URL"]?.trim() ?? "";
  const model = process.env["T3_TRANSCRIPTION_WHISPER_MODEL"]?.trim() ?? "";
  const authHeader = process.env["T3_TRANSCRIPTION_WHISPER_AUTH_HEADER"]?.trim() || "Authorization";
  const authToken = process.env["T3_TRANSCRIPTION_WHISPER_AUTH_TOKEN"]?.trim() ?? "";

  return {
    endpoint,
    model,
    authHeader,
    authToken,
  };
};

const parseWhisperResponse = (payload: unknown): ServerTranscribeAudioResult | null => {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return { text: payload.trim() };
  }

  if (
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
  ) {
    return { text: payload.text.trim() };
  }
  return null;
};

const describeFetchFailure = (candidate: string, error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `Transcription request to ${candidate} failed: ${error.message.trim()}`;
  }

  return `Transcription request to ${candidate} failed.`;
};

const buildTranscriptionCandidates = (endpoint: string): ReadonlyArray<string> => {
  const normalized = endpoint.replace(/\/+$/, "");
  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    const hasKnownPath = WHISPER_FALLBACK_PATHS.some((path) => parsed.pathname.endsWith(path));
    if (!hasKnownPath) {
      for (const path of WHISPER_FALLBACK_PATHS) {
        candidates.push(new URL(path, `${parsed.origin}/`).toString());
      }
    }
  } catch {
    // Keep the exact endpoint as-is; invalid URLs are handled by fetch below.
  }

  return [...new Set(candidates)];
};

export const TranscriptionServiceLive = Layer.succeed(
  TranscriptionService,
  TranscriptionService.of({
    transcribeAudio: (input) =>
      Effect.gen(function* () {
        const config = resolveWhisperConfig();
        if (!config.endpoint) {
          return yield* Effect.fail(
            new TranscriptionError({
              code: "unavailable",
              message:
                "No Whisper HTTP endpoint is configured. Set T3_TRANSCRIPTION_WHISPER_URL to use a local server, or keep the browser-local model fallback enabled.",
            }),
          );
        }

        const binary = Buffer.from(input.audioBase64, "base64");
        const formData = new FormData();
        formData.append(
          "file",
          new File([binary], input.fileName ?? "recording.webm", {
            type: input.mimeType,
          }),
        );
        if (config.model) {
          formData.append("model", config.model);
        }

        const headers = new Headers();
        if (config.authToken) {
          headers.set(config.authHeader, config.authToken);
        }

        for (const candidate of buildTranscriptionCandidates(config.endpoint)) {
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(candidate, {
                method: "POST",
                headers,
                body: formData,
              }),
            catch: (err) =>
              new TranscriptionError({
                code: "unavailable",
                message: describeFetchFailure(candidate, err),
              }),
          });

          if (!response.ok) {
            if (response.status === 404 || response.status === 405) {
              continue;
            }

            return yield* Effect.fail(
              new TranscriptionError({
                code: "request_failed",
                message: `Transcription endpoint ${candidate} returned HTTP ${response.status}.`,
              }),
            );
          }

          const rawText = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: () =>
              new TranscriptionError({
                code: "request_failed",
                message: "Transcription service returned unreadable content.",
              }),
          });

          const result = parseWhisperResponse(
            (() => {
              try {
                return JSON.parse(rawText);
              } catch {
                return rawText;
              }
            })(),
          );
          if (!result) {
            return yield* Effect.fail(
              new TranscriptionError({
                code: "request_failed",
                message:
                  "Transcription endpoint returned a response without usable text. Expected plain text or JSON with a text field.",
              }),
            );
          }

          return result;
        }

        return yield* Effect.fail(
          new TranscriptionError({
            code: "request_failed",
            message: `No supported Whisper endpoint responded successfully. Tried ${[
              ...buildTranscriptionCandidates(config.endpoint),
            ].join(", ")}.`,
          }),
        );
      }),
  }),
);
