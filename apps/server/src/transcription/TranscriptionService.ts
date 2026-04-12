import { Effect, ServiceMap } from "effect";
import type {
  ServerTranscribeAudioInput,
  ServerTranscribeAudioResult,
  TranscriptionError,
} from "@t3tools/contracts";

export interface TranscriptionServiceShape {
  readonly transcribeAudio: (
    input: ServerTranscribeAudioInput,
  ) => Effect.Effect<ServerTranscribeAudioResult, TranscriptionError>;
}

export class TranscriptionService extends ServiceMap.Service<
  TranscriptionService,
  TranscriptionServiceShape
>()("t3/transcription/TranscriptionService") {}
