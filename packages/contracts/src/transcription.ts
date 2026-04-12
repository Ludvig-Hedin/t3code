import * as Schema from "effect/Schema";

export const TranscriptionErrorCode = Schema.Literals(["unavailable", "request_failed"]);
export type TranscriptionErrorCode = typeof TranscriptionErrorCode.Type;

export const ServerTranscribeAudioInput = Schema.Struct({
  audioBase64: Schema.String,
  mimeType: Schema.String,
  fileName: Schema.optionalKey(Schema.String),
});
export type ServerTranscribeAudioInput = typeof ServerTranscribeAudioInput.Type;

export const ServerTranscribeAudioResult = Schema.Struct({
  text: Schema.String,
});
export type ServerTranscribeAudioResult = typeof ServerTranscribeAudioResult.Type;

export class TranscriptionError extends Schema.TaggedErrorClass<TranscriptionError>()(
  "TranscriptionError",
  {
    code: TranscriptionErrorCode,
    message: Schema.String,
  },
) {}
