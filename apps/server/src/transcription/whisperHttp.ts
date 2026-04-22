import { Effect } from "effect";
import { TranscriptionError, type ServerTranscribeAudioResult } from "@t3tools/contracts";

const WHISPER_FALLBACK_PATHS = ["/v1/audio/transcriptions", "/inference", "/transcribe"];

export interface WhisperTranscriptionConfig {
  readonly endpoint: string;
  readonly model: string;
  readonly authHeader: string;
  readonly authToken: string;
}

export interface WhisperUploadInput {
  readonly binary: Uint8Array;
  readonly mimeType: string;
  readonly fileName: string;
}

export const resolveWhisperConfig = (): WhisperTranscriptionConfig => {
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

export const requestWhisperTranscription = ({
  config,
  upload,
}: {
  readonly config: WhisperTranscriptionConfig;
  readonly upload: WhisperUploadInput;
}) =>
  Effect.gen(function* () {
    if (!config.endpoint) {
      return yield* Effect.fail(
        new TranscriptionError({
          code: "unavailable",
          message:
            "No Whisper HTTP endpoint is configured. Set T3_TRANSCRIPTION_WHISPER_URL to use a local server, or keep the browser-local model fallback enabled.",
        }),
      );
    }

    const formData = new FormData();
    formData.append(
      "file",
      new File([upload.binary], upload.fileName, {
        type: upload.mimeType,
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
  });
