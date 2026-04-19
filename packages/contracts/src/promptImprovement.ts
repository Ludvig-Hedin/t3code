import { Schema } from "effect";

export class PromptImprovementInput extends Schema.Class<PromptImprovementInput>(
  "PromptImprovementInput",
)({
  prompt: Schema.String.check(Schema.isNonEmpty()),
  threadMessages: Schema.Array(Schema.Struct({ role: Schema.String, text: Schema.String })),
}) {}

export const PromptImprovementResult = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("improved"),
    improvedPrompt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("too_vague"),
    message: Schema.String,
  }),
]);
export type PromptImprovementResult = typeof PromptImprovementResult.Type;

export class PromptImprovementError extends Schema.TaggedErrorClass<PromptImprovementError>()(
  "PromptImprovementError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}
