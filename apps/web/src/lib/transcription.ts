import {
  type ServerTranscribeAudioInput,
  type ServerTranscribeAudioResult,
  type TranscriptionError,
} from "@t3tools/contracts";
import { ensureNativeApi } from "~/nativeApi";

const DEFAULT_RECORDING_FILE_NAME = "voice-input.webm";
const DEFAULT_LOCAL_MODEL_ID = "Xenova/whisper-small";

type LocalTranscriber = (input: string) => Promise<unknown>;

let localTranscriberPromise: Promise<LocalTranscriber> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function extractTranscriptionText(output: unknown): string | null {
  if (typeof output === "string") {
    return output.trim() || null;
  }

  if (Array.isArray(output)) {
    for (const item of output) {
      const text = extractTranscriptionText(item);
      if (text) return text;
    }
    return null;
  }

  if (output && typeof output === "object") {
    const candidate = (output as { text?: unknown }).text;
    if (typeof candidate === "string") {
      return candidate.trim() || null;
    }
  }

  return null;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "Unknown transcription error";
}

async function getLocalTranscriber(): Promise<LocalTranscriber> {
  if (!localTranscriberPromise) {
    localTranscriberPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      const transcriber = await pipeline("automatic-speech-recognition", DEFAULT_LOCAL_MODEL_ID);
      return transcriber as LocalTranscriber;
    })().catch((error) => {
      localTranscriberPromise = null;
      throw error;
    });
  }

  return localTranscriberPromise;
}

async function transcribeLocally(audioBlob: Blob): Promise<string> {
  const transcriber = await getLocalTranscriber();
  const objectUrl = URL.createObjectURL(audioBlob);

  try {
    const output = await transcriber(objectUrl);
    const text = extractTranscriptionText(output);
    if (!text) {
      throw new Error(
        `Local transcription model ${DEFAULT_LOCAL_MODEL_ID} returned an empty transcript.`,
      );
    }
    return text;
  } catch (error) {
    throw new Error(
      `Local transcription model ${DEFAULT_LOCAL_MODEL_ID} failed: ${describeError(error)}`,
      { cause: error instanceof Error ? error : undefined },
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function transcribeViaServer(audioBlob: Blob): Promise<string> {
  const request = await buildTranscriptionRequest(audioBlob);
  const result = await ensureNativeApi().server.transcribeAudio(request);
  const text = result.text.trim();
  if (!text) {
    throw new Error("Local Whisper server returned an empty transcript.");
  }
  return text;
}

function buildCombinedTranscriptionError(localError: unknown, serverError: unknown): Error {
  return new Error(
    [
      `Local model ${DEFAULT_LOCAL_MODEL_ID} failed: ${describeError(localError)}`,
      `Whisper server fallback failed: ${describeError(serverError)}`,
    ].join(" "),
    { cause: localError instanceof Error ? localError : undefined },
  );
}

export async function buildTranscriptionRequest(
  audioBlob: Blob,
): Promise<ServerTranscribeAudioInput> {
  const audioBuffer = await audioBlob.arrayBuffer();
  return {
    audioBase64: arrayBufferToBase64(audioBuffer),
    mimeType: audioBlob.type || "audio/webm",
    fileName: DEFAULT_RECORDING_FILE_NAME,
  };
}

export async function transcribeAudio(audioBlob: Blob): Promise<ServerTranscribeAudioResult> {
  try {
    const text = await transcribeLocally(audioBlob);
    return { text };
  } catch (localError) {
    try {
      const text = await transcribeViaServer(audioBlob);
      return { text };
    } catch (serverError) {
      throw buildCombinedTranscriptionError(localError, serverError);
    }
  }
}

export function isUnavailableTranscriptionError(error: unknown): error is TranscriptionError {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "unavailable",
  );
}

export function getTranscriptionErrorMessage(error: unknown): string {
  if (isUnavailableTranscriptionError(error)) {
    return "Local transcription service is unavailable.";
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "Couldn’t transcribe audio. Try again.";
}
