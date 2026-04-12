import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TranscriptionError } from "@t3tools/contracts";

import { TranscriptionService } from "../TranscriptionService";
import { TranscriptionServiceLive } from "./TranscriptionService";

const SAMPLE_INPUT = {
  audioBase64: Buffer.from("audio").toString("base64"),
  mimeType: "audio/webm",
  fileName: "recording.webm",
} as const;

async function runTranscription() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* TranscriptionService;
      return yield* service.transcribeAudio(SAMPLE_INPUT);
    }).pipe(Effect.provide(TranscriptionServiceLive)),
  );
}

describe("TranscriptionServiceLive", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...previousEnv };
  });

  it("returns an unavailable error when no local endpoint is configured", async () => {
    delete process.env.T3_TRANSCRIPTION_WHISPER_URL;

    await expect(runTranscription()).rejects.toMatchObject({
      code: "unavailable",
    } satisfies Partial<TranscriptionError>);
  });

  it("forwards audio to the configured whisper endpoint and returns text", async () => {
    process.env.T3_TRANSCRIPTION_WHISPER_URL = "http://127.0.0.1:8080/transcribe";
    process.env.T3_TRANSCRIPTION_WHISPER_MODEL = "whisper-small";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "transcribed text" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(runTranscription()).resolves.toEqual({ text: "transcribed text" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8080/transcribe",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });

  it("accepts plain-text transcription responses", async () => {
    process.env.T3_TRANSCRIPTION_WHISPER_URL = "http://127.0.0.1:8080/transcribe";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("plain text transcript", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(runTranscription()).resolves.toEqual({ text: "plain text transcript" });
  });

  it("falls back to a common whisper endpoint when the configured path returns 404", async () => {
    process.env.T3_TRANSCRIPTION_WHISPER_URL = "http://127.0.0.1:8080";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "fallback path transcript" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(runTranscription()).resolves.toEqual({ text: "fallback path transcript" });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8080",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8080/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
  });
});
