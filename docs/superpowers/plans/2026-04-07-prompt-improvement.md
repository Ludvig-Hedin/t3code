# Prompt Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a spark "Improve" button to the chat input that rewrites the user's prompt using their configured provider, with version navigation, shimmer loading state, cancel support, and a settings panel.

**Architecture:** Extend the existing `TextGenerationShape` service (same layer as commit message generation) with a `generateImprovedPrompt` method, wire it via a new `prompts.improve` Effect RPC endpoint, and build a self-contained `usePromptImprover` hook + `ComposerImproveButton` component in the web app. Settings fields are added to `ServerSettings` alongside the existing `textGenerationModelSelection`. Context trimming is done client-side before the RPC call.

**Tech Stack:** Effect (service, RPC, streaming), Zod/Effect Schema, React (hooks, useState, useRef, useCallback), TanStack Router (settings route), Tailwind CSS, Lucide icons, shadcn/ui Button + Skeleton, Lexical (composer is controlled — updating `prompt` via `setPrompt` is enough).

---

## File Map

| File                                                      | Action     | What changes                                                                                        |
| --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/promptImprovement.ts`             | **Create** | Input / result / error types for the RPC                                                            |
| `packages/contracts/src/index.ts`                         | **Modify** | Re-export new file                                                                                  |
| `packages/contracts/src/settings.ts`                      | **Modify** | 3 new fields in `ServerSettings` + `ServerSettingsPatch`                                            |
| `packages/contracts/src/rpc.ts`                           | **Modify** | `WS_METHODS.promptsImprove`, `WsPromptImproveRpc`, `WsRpcGroup` entry                               |
| `apps/server/src/git/Prompts.ts`                          | **Modify** | `buildPromptImprovementPrompt` prompt builder                                                       |
| `apps/server/src/git/Services/TextGeneration.ts`          | **Modify** | `PromptImprovementGenerationInput/Result` types + `generateImprovedPrompt` in `TextGenerationShape` |
| `apps/server/src/git/Layers/ClaudeTextGeneration.ts`      | **Modify** | `generateImprovedPrompt` Claude implementation                                                      |
| `apps/server/src/git/Layers/CodexTextGeneration.ts`       | **Modify** | `generateImprovedPrompt` Codex implementation                                                       |
| `apps/server/src/git/Layers/RoutingTextGeneration.ts`     | **Modify** | Route new method                                                                                    |
| `apps/server/src/ws.ts`                                   | **Modify** | Register `promptsImprove` handler                                                                   |
| `apps/web/src/wsRpcClient.ts`                             | **Modify** | `prompts.improve` client method                                                                     |
| `apps/web/src/hooks/usePromptImprover.ts`                 | **Create** | Version stack state + RPC call + context trimming                                                   |
| `apps/web/src/components/chat/ComposerImproveButton.tsx`  | **Create** | Presentational: Improve btn, Cancel btn, version arrows, error                                      |
| `apps/web/src/components/ChatView.tsx`                    | **Modify** | Call hook, wrap editor in relative div + shimmer, render button                                     |
| `apps/web/src/components/settings/SettingsPanels.tsx`     | **Modify** | `PromptImprovementSettingsPanel` export                                                             |
| `apps/web/src/components/settings/SettingsSidebarNav.tsx` | **Modify** | Add nav item + extend `SettingsSectionPath` union                                                   |
| `apps/web/src/routes/settings.prompt-improvement.tsx`     | **Create** | TanStack route                                                                                      |

---

## Task 1: Contract types

**Files:**

- Create: `packages/contracts/src/promptImprovement.ts`
- Modify: `packages/contracts/src/index.ts` (add export)

- [ ] **Step 1.1 — Create contract types file**

```typescript
// packages/contracts/src/promptImprovement.ts
import { Schema } from "effect";

// ── RPC Input ────────────────────────────────────────────────────────────────

export class PromptImprovementInput extends Schema.Class<PromptImprovementInput>(
  "PromptImprovementInput",
)({
  /** The prompt text to improve. */
  prompt: Schema.String.check(Schema.isNonEmpty()),
  /** Conversation history, already trimmed to fit the model's context window. */
  threadMessages: Schema.Array(Schema.Struct({ role: Schema.String, text: Schema.String })),
}) {}

// ── RPC Result ───────────────────────────────────────────────────────────────

export const PromptImprovementResult = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("improved"),
    improvedPrompt: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("too_vague"),
    /** Human-readable explanation from the model. */
    message: Schema.String,
  }),
);
export type PromptImprovementResult = typeof PromptImprovementResult.Type;

// ── RPC Error ────────────────────────────────────────────────────────────────

export class PromptImprovementError extends Schema.TaggedErrorClass<PromptImprovementError>()(
  "PromptImprovementError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return this.detail;
  }
}
```

- [ ] **Step 1.2 — Add export to contracts index**

In `packages/contracts/src/index.ts`, add after line 17 (`export * from "./skills";`):

```typescript
export * from "./promptImprovement";
```

- [ ] **Step 1.3 — Verify types compile**

```bash
cd /path/to/repo && bun typecheck --filter @t3tools/contracts
```

Expected: no errors.

- [ ] **Step 1.4 — Commit**

```bash
git add packages/contracts/src/promptImprovement.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add PromptImprovementInput/Result/Error types"
```

---

## Task 2: Settings schema fields

**Files:**

- Modify: `packages/contracts/src/settings.ts`

- [ ] **Step 2.1 — Add three fields to `ServerSettings`**

In `packages/contracts/src/settings.ts`, after the `commitInstructions` field (line 200), add before the closing `})` of `ServerSettings`:

```typescript
  /** Whether the Improve prompt button is enabled in the composer. */
  promptImprovementEnabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  /** Model used for improving prompts (defaults to the text generation model). */
  promptImprovementModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(() => ({
      provider: "codex" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex,
    })),
  ),
  /** Optional user instructions injected into the improver system prompt. */
  promptImprovementInstructions: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
```

- [ ] **Step 2.2 — Add corresponding patch fields to `ServerSettingsPatch`**

In `ServerSettingsPatch` (around line 341, after `commitInstructions`):

```typescript
  promptImprovementEnabled: Schema.optionalKey(Schema.Boolean),
  promptImprovementModelSelection: Schema.optionalKey(ModelSelectionPatch),
  promptImprovementInstructions: Schema.optionalKey(Schema.String),
```

- [ ] **Step 2.3 — Verify**

```bash
bun typecheck --filter @t3tools/contracts
```

Expected: no errors.

- [ ] **Step 2.4 — Commit**

```bash
git add packages/contracts/src/settings.ts
git commit -m "feat(contracts): add promptImprovement fields to ServerSettings"
```

---

## Task 3: RPC method contract

**Files:**

- Modify: `packages/contracts/src/rpc.ts`

- [ ] **Step 3.1 — Add import for new types**

In `packages/contracts/src/rpc.ts`, near the existing skill imports (around line 85–88), add:

```typescript
import {
  PromptImprovementInput,
  PromptImprovementResult,
  PromptImprovementError,
} from "./promptImprovement";
```

- [ ] **Step 3.2 — Add method key to `WS_METHODS`**

In the `WS_METHODS` object (after line 177 — the end of the preview methods), add before `} as const;`:

```typescript
  // Prompt improvement
  promptsImprove: "prompts.improve",
```

- [ ] **Step 3.3 — Add `Rpc.make` declaration**

After `WsSkillsGenerateRpc` (around line 430), add:

```typescript
export const WsPromptImproveRpc = Rpc.make(WS_METHODS.promptsImprove, {
  payload: PromptImprovementInput,
  success: PromptImprovementResult,
  error: PromptImprovementError,
});
```

- [ ] **Step 3.4 — Add to `WsRpcGroup`**

In the `WsRpcGroup = RpcGroup.make(...)` call (after `WsOllamaQuitServerRpc` around line 581), add:

```typescript
  WsPromptImproveRpc,
```

- [ ] **Step 3.5 — Verify**

```bash
bun typecheck --filter @t3tools/contracts
```

- [ ] **Step 3.6 — Commit**

```bash
git add packages/contracts/src/rpc.ts
git commit -m "feat(contracts): add prompts.improve RPC method"
```

---

## Task 4: Prompt builder

**Files:**

- Modify: `apps/server/src/git/Prompts.ts`

- [ ] **Step 4.1 — Add `buildPromptImprovementPrompt` function**

At the end of `apps/server/src/git/Prompts.ts`, append:

```typescript
// ---------------------------------------------------------------------------
// Prompt improvement
// ---------------------------------------------------------------------------

export interface PromptImprovementPromptInput {
  prompt: string;
  messages: ReadonlyArray<{ readonly role: string; readonly text: string }>;
  instructions: string;
}

/** Raw LLM output shape for prompt improvement. */
export const PromptImprovementOutputSchema = Schema.Struct({
  improvedPrompt: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
});

export function buildPromptImprovementPrompt(input: PromptImprovementPromptInput) {
  const instructionsSection = input.instructions.trim()
    ? `\nStyle preferences: ${input.instructions.trim()}\n`
    : "";

  const conversationSection =
    input.messages.length > 0
      ? [
          "Recent conversation (context only — do not summarize or respond to it):",
          ...input.messages.map((m) => `[${m.role}]: ${limitSection(m.text, 800)}`),
          "",
        ].join("\n")
      : "";

  const systemPrompt = [
    "You are an expert at rewriting AI coding-assistant prompts to be clearer, more specific, and more actionable.",
    "",
    "Rules:",
    "- Preserve the user's original intent exactly — do not change what they are asking for.",
    "- Add specificity: include file paths, function names, or exact expected behavior when inferable from context.",
    "- Structure complex tasks with numbered steps when helpful.",
    "- Keep the improved prompt concise — do not pad it.",
    "- Write in the same natural voice as the original (imperative, first-person, etc.).",
    '- If the prompt is too vague to improve meaningfully, return JSON: {"error":"too_vague","message":"<brief reason>"}',
    '- Otherwise return JSON: {"improvedPrompt":"<rewritten prompt>"}',
    instructionsSection,
    conversationSection,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prompt: `${systemPrompt}\n\nPrompt to improve:\n${limitSection(input.prompt, 4_000)}`,
    outputSchema: PromptImprovementOutputSchema,
  };
}
```

- [ ] **Step 4.2 — Verify build**

```bash
bun typecheck --filter @t3tools/server
```

- [ ] **Step 4.3 — Commit**

```bash
git add apps/server/src/git/Prompts.ts
git commit -m "feat(server): add buildPromptImprovementPrompt builder"
```

---

## Task 5: TextGenerationShape extension

**Files:**

- Modify: `apps/server/src/git/Services/TextGeneration.ts`

- [ ] **Step 5.1 — Add input/result types and method to the shape**

In `apps/server/src/git/Services/TextGeneration.ts`, after `ThreadTitleGenerationResult` (line 81), add:

```typescript
export interface PromptImprovementGenerationInput {
  /** Working directory — use process.cwd() when no git context is needed. */
  cwd: string;
  prompt: string;
  threadMessages: ReadonlyArray<{ readonly role: string; readonly text: string }>;
  /** Provider + model to use for improvement. */
  modelSelection: ModelSelection;
  /** Optional user style instructions injected into the system prompt. */
  instructions: string;
}

export interface PromptImprovementGenerationResult {
  kind: "improved" | "too_vague";
  /** Present when kind === "improved". */
  improvedPrompt?: string;
  /** Present when kind === "too_vague". */
  message?: string;
}
```

Then in `TextGenerationShape` (after `generateThreadTitle`, before the closing `}`):

```typescript
  /**
   * Rewrite a user's chat prompt to be clearer and more specific.
   * Returns an improved prompt or a "too_vague" signal.
   */
  readonly generateImprovedPrompt: (
    input: PromptImprovementGenerationInput,
  ) => Effect.Effect<PromptImprovementGenerationResult, TextGenerationError>;
```

- [ ] **Step 5.2 — Verify (will fail until implementations are added — that's expected)**

```bash
bun typecheck --filter @t3tools/server 2>&1 | grep -c "error" || true
```

Expected: errors about missing implementation in Claude/Codex/Routing — that's fine.

- [ ] **Step 5.3 — Commit**

```bash
git add apps/server/src/git/Services/TextGeneration.ts
git commit -m "feat(server): add generateImprovedPrompt to TextGenerationShape"
```

---

## Task 6: Claude implementation

**Files:**

- Modify: `apps/server/src/git/Layers/ClaudeTextGeneration.ts`

- [ ] **Step 6.1 — Add imports**

At the top of `ClaudeTextGeneration.ts`, add to the existing import from `../Prompts.ts`:

```typescript
  buildPromptImprovementPrompt,
  type PromptImprovementOutputSchema,
```

And in the import from `../Services/TextGeneration.ts`, add:

```typescript
  type PromptImprovementGenerationInput,
  type PromptImprovementGenerationResult,
```

- [ ] **Step 6.2 — Add implementation function**

Before `return { generateCommitMessage, generatePrContent, generateBranchName, generateThreadTitle }`, add:

```typescript
const generateImprovedPrompt: TextGenerationShape["generateImprovedPrompt"] = Effect.fn(
  "ClaudeTextGeneration.generateImprovedPrompt",
)(function* (
  input: PromptImprovementGenerationInput,
): Effect.Effect<PromptImprovementGenerationResult, TextGenerationError> {
  const { prompt, outputSchema } = buildPromptImprovementPrompt({
    prompt: input.prompt,
    messages: input.threadMessages,
    instructions: input.instructions,
  });

  if (input.modelSelection.provider !== "claudeAgent") {
    return yield* new TextGenerationError({
      operation: "generateImprovedPrompt",
      detail: "Invalid model selection for Claude provider.",
    });
  }

  const generated = yield* runClaudeJson({
    operation: "generateImprovedPrompt",
    cwd: input.cwd,
    prompt,
    outputSchemaJson: outputSchema,
    modelSelection: input.modelSelection,
  });

  if (generated.error === "too_vague") {
    return {
      kind: "too_vague",
      message: generated.message ?? "Prompt is too vague to improve. Add more details.",
    };
  }

  if (!generated.improvedPrompt) {
    return yield* new TextGenerationError({
      operation: "generateImprovedPrompt",
      detail: "Model returned an empty improved prompt.",
    });
  }

  return { kind: "improved", improvedPrompt: generated.improvedPrompt };
});
```

- [ ] **Step 6.3 — Add to return object**

Change the return statement to:

```typescript
return {
  generateCommitMessage,
  generatePrContent,
  generateBranchName,
  generateThreadTitle,
  generateImprovedPrompt,
} satisfies TextGenerationShape;
```

- [ ] **Step 6.4 — Verify**

```bash
bun typecheck --filter @t3tools/server
```

Expected: errors only about Codex and Routing not yet implementing the method.

- [ ] **Step 6.5 — Commit**

```bash
git add apps/server/src/git/Layers/ClaudeTextGeneration.ts
git commit -m "feat(server): implement generateImprovedPrompt in ClaudeTextGeneration"
```

---

## Task 7: Codex implementation

**Files:**

- Modify: `apps/server/src/git/Layers/CodexTextGeneration.ts`

- [ ] **Step 7.1 — Add imports**

In the import from `../Prompts.ts`, add `buildPromptImprovementPrompt`.

In the import from `../Services/TextGeneration.ts`, add `PromptImprovementGenerationInput` and `PromptImprovementGenerationResult`.

- [ ] **Step 7.2 — Add implementation before the return statement**

```typescript
const generateImprovedPrompt: TextGenerationShape["generateImprovedPrompt"] = Effect.fn(
  "CodexTextGeneration.generateImprovedPrompt",
)(function* (
  input: PromptImprovementGenerationInput,
): Effect.Effect<PromptImprovementGenerationResult, TextGenerationError> {
  const { prompt, outputSchema } = buildPromptImprovementPrompt({
    prompt: input.prompt,
    messages: input.threadMessages,
    instructions: input.instructions,
  });

  const generated = yield* runCodexJson({
    operation: "generateImprovedPrompt",
    cwd: input.cwd,
    prompt,
    outputSchema,
    modelSelection: input.modelSelection,
    reasoningEffort: CODEX_GIT_TEXT_GENERATION_REASONING_EFFORT,
  });

  if (generated.error === "too_vague") {
    return {
      kind: "too_vague",
      message: generated.message ?? "Prompt is too vague to improve. Add more details.",
    };
  }

  if (!generated.improvedPrompt) {
    return yield* new TextGenerationError({
      operation: "generateImprovedPrompt",
      detail: "Model returned an empty improved prompt.",
    });
  }

  return { kind: "improved", improvedPrompt: generated.improvedPrompt };
});
```

> Note: Find `runCodexJson` in the file — it's the local helper used by other methods (e.g. `generateCommitMessage`). The exact call signature mirrors `generateBranchName` or `generateThreadTitle` which also don't need image attachments.

- [ ] **Step 7.3 — Add to return object**

Add `generateImprovedPrompt` to the returned object alongside the other methods.

- [ ] **Step 7.4 — Verify**

```bash
bun typecheck --filter @t3tools/server
```

Expected: only Routing error remaining.

- [ ] **Step 7.5 — Commit**

```bash
git add apps/server/src/git/Layers/CodexTextGeneration.ts
git commit -m "feat(server): implement generateImprovedPrompt in CodexTextGeneration"
```

---

## Task 8: Routing

**Files:**

- Modify: `apps/server/src/git/Layers/RoutingTextGeneration.ts`

- [ ] **Step 8.1 — Add route for `generateImprovedPrompt`**

In `RoutingTextGeneration.ts`, inside the returned object (after the existing method routes), add:

```typescript
generateImprovedPrompt: (input) =>
  route(input.modelSelection.provider).generateImprovedPrompt(input),
```

- [ ] **Step 8.2 — Verify**

```bash
bun typecheck --filter @t3tools/server
```

Expected: no errors.

- [ ] **Step 8.3 — Commit**

```bash
git add apps/server/src/git/Layers/RoutingTextGeneration.ts
git commit -m "feat(server): route generateImprovedPrompt in RoutingTextGeneration"
```

---

## Task 9: ws.ts handler

**Files:**

- Modify: `apps/server/src/ws.ts`

- [ ] **Step 9.1 — Add imports**

In `apps/server/src/ws.ts`, add to the contracts import:

```typescript
import { PromptImprovementError } from "@t3tools/contracts";
```

Add import for the TextGeneration service (near the other git service imports around line 30):

```typescript
import { TextGeneration } from "./git/Services/TextGeneration";
```

- [ ] **Step 9.2 — Register handler**

In the large handler object in ws.ts (after the skills handlers around line 1003, before the preview or MCP block), add:

```typescript
      // ── Prompt improvement ──────────────────────────────────────────────
      [WS_METHODS.promptsImprove]: (input: {
        readonly prompt: string;
        readonly threadMessages: ReadonlyArray<{ readonly role: string; readonly text: string }>;
      }) =>
        observeRpcEffect(
          WS_METHODS.promptsImprove,
          Effect.gen(function* () {
            const settings = yield* serverSettings.getSettings;
            if (!settings.promptImprovementEnabled) {
              return yield* new PromptImprovementError({
                detail: "Prompt improvement is disabled in settings.",
              });
            }
            const textGen = yield* TextGeneration;
            const result = yield* textGen.generateImprovedPrompt({
              cwd: process.cwd(),
              prompt: input.prompt,
              threadMessages: input.threadMessages,
              modelSelection: settings.promptImprovementModelSelection,
              instructions: settings.promptImprovementInstructions,
            });
            // Map internal result to contract result shape
            if (result.kind === "too_vague") {
              return {
                kind: "too_vague" as const,
                message: result.message ?? "Prompt is too vague to improve.",
              };
            }
            return {
              kind: "improved" as const,
              improvedPrompt: result.improvedPrompt ?? "",
            };
          }).pipe(
            Effect.mapError(
              (cause) =>
                new PromptImprovementError({
                  detail: cause instanceof Error ? cause.message : String(cause),
                }),
            ),
          ),
          { "rpc.aggregate": "prompts" },
        ),
```

- [ ] **Step 9.3 — Verify**

```bash
bun typecheck --filter @t3tools/server
```

Expected: no errors.

- [ ] **Step 9.4 — Commit**

```bash
git add apps/server/src/ws.ts
git commit -m "feat(server): register prompts.improve RPC handler in ws.ts"
```

---

## Task 10: Web client method

**Files:**

- Modify: `apps/web/src/wsRpcClient.ts`

- [ ] **Step 10.1 — Add `prompts` namespace to the client type**

In `wsRpcClient.ts`, find the `WsRpcClient` type definition (around line 111 where `skills` is declared). Add:

```typescript
  readonly prompts: {
    readonly improve: RpcUnaryMethod<typeof WS_METHODS.promptsImprove>;
  };
```

- [ ] **Step 10.2 — Add implementation in `createWsRpcClient`**

In the `createWsRpcClient` function (near the skills implementation around line 273), add:

```typescript
    prompts: {
      improve: (input) =>
        transport.request((client) => client[WS_METHODS.promptsImprove](input)),
    },
```

- [ ] **Step 10.3 — Verify**

```bash
bun typecheck --filter @t3tools/web
```

- [ ] **Step 10.4 — Commit**

```bash
git add apps/web/src/wsRpcClient.ts
git commit -m "feat(web): add prompts.improve to wsRpcClient"
```

---

## Task 11: `usePromptImprover` hook

**Files:**

- Create: `apps/web/src/hooks/usePromptImprover.ts`

- [ ] **Step 11.1 — Create the hook**

```typescript
// apps/web/src/hooks/usePromptImprover.ts
/**
 * usePromptImprover
 *
 * Manages prompt version history and calls the server-side prompt improvement RPC.
 * Keeps a version stack: v0 = original typed text, v1/v2/... = improved versions.
 * When the user manually types after an improvement, the history is cleared.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getWsRpcClient } from "../wsRpcClient";
import { useSettings } from "./useSettings";
import type { ChatMessage } from "../types";

// Approximate context-window sizes in tokens per model slug.
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-5": 200_000,
  "gpt-5.4-mini": 128_000,
  "gpt-5.4": 128_000,
  "gemini-2.5-flash": 1_000_000,
  "gemini-2.5-pro": 2_000_000,
  "llama3.2": 128_000,
};
const DEFAULT_CONTEXT_WINDOW = 128_000;

function getModelContextWindow(model: string): number {
  return MODEL_CONTEXT_WINDOWS[model] ?? DEFAULT_CONTEXT_WINDOW;
}

/**
 * Trims messages from oldest to newest so the total char count fits within
 * 75 % of the model's context window minus 3 000 tokens of overhead.
 */
function trimMessagesForContext(
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "text">>,
  model: string,
): Array<{ role: string; text: string }> {
  // 4 chars ≈ 1 token; reserve 3 000 tokens for system prompt + output
  const maxChars = (getModelContextWindow(model) * 0.75 - 3_000) * 4;
  const selected: Array<{ role: string; text: string }> = [];
  let totalChars = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const chars = messages[i].text.length + 50; // +50 for role prefix overhead
    if (totalChars + chars > maxChars) break;
    selected.unshift({ role: messages[i].role, text: messages[i].text });
    totalChars += chars;
  }
  return selected;
}

export interface PromptImproverState {
  versions: string[];
  versionIndex: number;
  isImproving: boolean;
  error: string | null;
  canGoPrev: boolean;
  canGoNext: boolean;
  improve: () => Promise<void>;
  cancel: () => void;
  goToPrevVersion: () => void;
  goToNextVersion: () => void;
}

export function usePromptImprover({
  prompt,
  onPromptChange,
  threadMessages,
}: {
  prompt: string;
  onPromptChange: (text: string) => void;
  threadMessages: ReadonlyArray<Pick<ChatMessage, "role" | "text">>;
}): PromptImproverState {
  const settings = useSettings();

  const [versions, setVersions] = useState<string[]>([]);
  const [versionIndex, setVersionIndex] = useState(0);
  const [isImproving, setIsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures and skip reset on navigation-driven changes.
  const cancelledRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const versionsRef = useRef<string[]>([]);

  // Keep versionsRef in sync with state.
  useEffect(() => {
    versionsRef.current = versions;
  }, [versions]);

  // Detect user-typed edits and clear version history.
  useEffect(() => {
    if (isNavigatingRef.current) return;
    const vs = versionsRef.current;
    if (vs.length > 0 && vs[versionIndex] !== prompt) {
      setVersions([]);
      setVersionIndex(0);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const improve = useCallback(async () => {
    if (!prompt.trim() || isImproving) return;

    setIsImproving(true);
    setError(null);
    cancelledRef.current = false;

    const currentModel = settings.promptImprovementModelSelection.model;
    const trimmedMessages = trimMessagesForContext(threadMessages, currentModel);

    try {
      const result = await getWsRpcClient().prompts.improve({
        prompt,
        threadMessages: trimmedMessages,
      });

      if (cancelledRef.current) return;

      if (result.kind === "too_vague") {
        setError(result.message);
        return;
      }

      if (result.kind === "improved") {
        const currentVersions = versionsRef.current;
        // Capture original as v0 on first improvement
        const base = currentVersions.length === 0 ? [prompt] : currentVersions;
        // Don't push if identical to last version
        if (base[base.length - 1] === result.improvedPrompt) return;
        const next = [...base, result.improvedPrompt];
        const nextIndex = next.length - 1;

        isNavigatingRef.current = true;
        setVersions(next);
        setVersionIndex(nextIndex);
        onPromptChange(result.improvedPrompt);
        // Clear navigation flag after React flushes the state update
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 0);
      }
    } catch {
      if (!cancelledRef.current) {
        setError("Prompt improvement failed. Please try again.");
      }
    } finally {
      if (!cancelledRef.current) {
        setIsImproving(false);
      }
    }
  }, [
    prompt,
    isImproving,
    settings.promptImprovementModelSelection.model,
    threadMessages,
    onPromptChange,
  ]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setIsImproving(false);
  }, []);

  const goToPrevVersion = useCallback(() => {
    setVersionIndex((i) => {
      const next = Math.max(0, i - 1);
      if (next !== i) {
        isNavigatingRef.current = true;
        onPromptChange(versionsRef.current[next]);
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 0);
      }
      return next;
    });
  }, [onPromptChange]);

  const goToNextVersion = useCallback(() => {
    setVersionIndex((i) => {
      const next = Math.min(versionsRef.current.length - 1, i + 1);
      if (next !== i) {
        isNavigatingRef.current = true;
        onPromptChange(versionsRef.current[next]);
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 0);
      }
      return next;
    });
  }, [onPromptChange]);

  return {
    versions,
    versionIndex,
    isImproving,
    error,
    canGoPrev: versionIndex > 0,
    canGoNext: versionIndex < versions.length - 1,
    improve,
    cancel,
    goToPrevVersion,
    goToNextVersion,
  };
}
```

- [ ] **Step 11.2 — Verify**

```bash
bun typecheck --filter @t3tools/web
```

- [ ] **Step 11.3 — Commit**

```bash
git add apps/web/src/hooks/usePromptImprover.ts
git commit -m "feat(web): add usePromptImprover hook"
```

---

## Task 12: ComposerImproveButton component

**Files:**

- Create: `apps/web/src/components/chat/ComposerImproveButton.tsx`

- [ ] **Step 12.1 — Create presentational component**

```tsx
// apps/web/src/components/chat/ComposerImproveButton.tsx
/**
 * ComposerImproveButton
 *
 * Renders the spark "Improve" button, Cancel button (while improving),
 * version navigation arrows, and inline error message.
 * All state is owned by the parent via the `improver` prop from usePromptImprover.
 */
import { ChevronLeftIcon, ChevronRightIcon, SparklesIcon, XIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { PromptImproverState } from "../../hooks/usePromptImprover";

interface ComposerImproveButtonProps {
  improver: PromptImproverState;
  /** Whether the composer has non-empty text (controls the Improve button's disabled state). */
  hasText: boolean;
  className?: string;
}

export function ComposerImproveButton({
  improver,
  hasText,
  className,
}: ComposerImproveButtonProps) {
  const {
    versions,
    versionIndex,
    isImproving,
    error,
    canGoPrev,
    canGoNext,
    improve,
    cancel,
    goToPrevVersion,
    goToNextVersion,
  } = improver;

  const showVersions = versions.length > 1;

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {/* Version navigation — only shown once there are multiple versions */}
      {showVersions && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToPrevVersion}
            disabled={!canGoPrev}
            title="Previous version"
          >
            <ChevronLeftIcon className="h-3 w-3" />
          </Button>
          <span className="min-w-[2.5rem] text-center text-xs tabular-nums text-muted-foreground">
            {versionIndex + 1}/{versions.length}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={goToNextVersion}
            disabled={!canGoNext}
            title="Next version"
          >
            <ChevronRightIcon className="h-3 w-3" />
          </Button>
        </>
      )}

      {/* Inline error — truncated with full text in title tooltip */}
      {error && !isImproving && (
        <span className="max-w-[180px] truncate text-xs text-destructive" title={error}>
          {error}
        </span>
      )}

      {/* Improve / Cancel toggle */}
      {isImproving ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={cancel}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
          title="Cancel improvement"
        >
          <XIcon className="h-3.5 w-3.5" />
          Cancel
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void improve()}
          disabled={!hasText}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          title="Rewrite this prompt to be clearer and more specific"
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          Improve
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 12.2 — Verify**

```bash
bun typecheck --filter @t3tools/web
```

- [ ] **Step 12.3 — Commit**

```bash
git add apps/web/src/components/chat/ComposerImproveButton.tsx
git commit -m "feat(web): add ComposerImproveButton component"
```

---

## Task 13: Wire into ChatView

**Files:**

- Modify: `apps/web/src/components/ChatView.tsx`

This task makes **three minimal, surgical changes** to ChatView.tsx.

- [ ] **Step 13.1 — Add imports**

Near the other chat component imports (around line 171–190), add:

```typescript
import { usePromptImprover } from "../hooks/usePromptImprover";
import { ComposerImproveButton } from "./chat/ComposerImproveButton";
import { Skeleton } from "./ui/skeleton";
```

- [ ] **Step 13.2 — Call the hook**

Near the other composer state declarations (around line 860, near `isComposerPrimaryActionsCompact`), add:

```typescript
const activeThreadMessages =
  (activeThread as { messages?: import("../types").ChatMessage[] } | null)?.messages ?? [];

const improver = usePromptImprover({
  prompt,
  onPromptChange: setPrompt,
  threadMessages: activeThreadMessages,
});
```

> Tip: `activeThread` is already in scope in ChatView — check whether it's typed as `Thread | null` and adjust the cast if needed. You want `activeThread?.messages ?? []`.

- [ ] **Step 13.3 — Wrap editor with shimmer overlay**

Find the `<ComposerPromptEditor` JSX (around line 4822). It's currently NOT inside a relative wrapper. Wrap it:

**Before (line ~4822):**

```tsx
<ComposerPromptEditor
  ref={composerEditorRef}
  ...
  disabled={isConnecting || isComposerApprovalState}
/>
```

**After:**

```tsx
<div className="relative">
  <ComposerPromptEditor
    ref={composerEditorRef}
    ...
    disabled={isConnecting || isComposerApprovalState || improver.isImproving}
  />
  {improver.isImproving && (
    <Skeleton className="pointer-events-none absolute inset-0 rounded-[inherit]" />
  )}
</div>
```

- [ ] **Step 13.4 — Render ComposerImproveButton in the bottom toolbar**

Find the `{/* Bottom toolbar */}` section (around line 4857). Inside the non-approval branch — the `<div className="flex min-w-0 flex-nowrap items-center justify-between ...">` — add the button as the **first child** (left-aligned):

```tsx
{
  /* Prompt improvement controls — left side of the footer */
}
{
  !isComposerApprovalState && !activePendingProgress && (
    <ComposerImproveButton improver={improver} hasText={prompt.trim().length > 0} />
  );
}
```

Place it before the existing children of that flex div so it appears on the left and the existing controls remain on the right.

- [ ] **Step 13.5 — Verify**

```bash
bun typecheck --filter @t3tools/web
bun lint --filter @t3tools/web
```

- [ ] **Step 13.6 — Commit**

```bash
git add apps/web/src/components/ChatView.tsx
git commit -m "feat(web): integrate usePromptImprover and ComposerImproveButton into ChatView"
```

---

## Task 14: Settings panel, route, and nav

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`
- Modify: `apps/web/src/components/settings/SettingsSidebarNav.tsx`
- Create: `apps/web/src/routes/settings.prompt-improvement.tsx`

- [ ] **Step 14.1 — Add `PromptImprovementSettingsPanel` to SettingsPanels.tsx**

At the bottom of `SettingsPanels.tsx` (after the last panel export), add:

```tsx
// ── Prompt Improvement Settings ──────────────────────────────────────────────

export function PromptImprovementSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const serverProviders = useServerProviders();

  const resolvedSelection = useMemo(
    () =>
      resolveModelSelection(
        settings.promptImprovementModelSelection ?? null,
        DEFAULT_UNIFIED_SETTINGS.promptImprovementModelSelection ?? null,
      ),
    [settings.promptImprovementModelSelection],
  );

  const modelOptionsByProvider = useMemo(
    () =>
      buildModelOptionsByProvider(
        settings,
        serverProviders,
        resolvedSelection.provider,
        resolvedSelection.model,
      ),
    [settings, serverProviders, resolvedSelection.provider, resolvedSelection.model],
  );

  const handleModelChange = useCallback(
    (provider: ProviderKind, model: string) => {
      updateSettings({ promptImprovementModelSelection: { provider, model } });
    },
    [updateSettings],
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Prompt Improvement">
        <SettingsRow
          title="Enable"
          description="Show the Improve button in the chat composer to rewrite prompts."
          control={
            <Switch
              checked={settings.promptImprovementEnabled}
              onCheckedChange={(checked) => updateSettings({ promptImprovementEnabled: checked })}
            />
          }
        />

        <SettingsRow
          title="Model"
          description="Model used for rewriting prompts. Smaller/faster models work well here."
          resetAction={
            settings.promptImprovementModelSelection !==
            DEFAULT_UNIFIED_SETTINGS.promptImprovementModelSelection ? (
              <SettingResetButton
                label="prompt improvement model"
                onClick={() =>
                  updateSettings({
                    promptImprovementModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.promptImprovementModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            <ProviderModelPicker
              provider={resolvedSelection.provider}
              model={resolvedSelection.model}
              lockedProvider={null}
              providers={serverProviders}
              modelOptionsByProvider={modelOptionsByProvider}
              onProviderModelChange={handleModelChange}
              compact
              onOllamaPullModel={async (model) => {
                try {
                  const result = await getWsRpcClient().ollama.pullModel({ model });
                  return {
                    success: result.success,
                    ...(result.error !== undefined ? { error: result.error } : {}),
                  };
                } catch (err) {
                  return { success: false, error: String(err) };
                }
              }}
              onOllamaQuitServer={() => {
                void getWsRpcClient().ollama.quitServer().catch(console.error);
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Style Preferences">
        <SettingsRow
          title="Instructions"
          description="Optional guidance injected into every improvement request. E.g. 'Always use numbered steps. Keep it under 3 sentences.'"
          resetAction={
            settings.promptImprovementInstructions !==
            DEFAULT_UNIFIED_SETTINGS.promptImprovementInstructions ? (
              <SettingResetButton
                label="instructions"
                onClick={() => updateSettings({ promptImprovementInstructions: "" })}
              />
            ) : null
          }
        >
          <Textarea
            className="mt-2 min-h-[80px] resize-none font-mono text-xs"
            placeholder="e.g. Always use numbered steps. Be concise. Include edge cases."
            value={settings.promptImprovementInstructions}
            onChange={(e) => updateSettings({ promptImprovementInstructions: e.target.value })}
          />
        </SettingsRow>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
```

> Note: `Textarea`, `Switch`, `ProviderModelPicker`, `SettingResetButton`, `resolveModelSelection`, `buildModelOptionsByProvider`, `useServerProviders`, `DEFAULT_UNIFIED_SETTINGS` are all already imported or defined in `SettingsPanels.tsx`. Verify each import exists at the top of the file before running typecheck; add any missing ones by copying from the `GitSettingsPanel` block which uses the exact same pattern.

- [ ] **Step 14.2 — Add nav item and path to SettingsSidebarNav.tsx**

**a. Extend `SettingsSectionPath` union** (line 26–35):

```typescript
  | "/settings/prompt-improvement"
```

**b. Add nav item** to `SETTINGS_NAV_ITEMS` array (after Personalization):

```typescript
  { label: "Prompt Improvement", to: "/settings/prompt-improvement", icon: SparklesIcon },
```

**c. Add `SparklesIcon` import** from `lucide-react` at the top of the file.

- [ ] **Step 14.3 — Create settings route file**

```typescript
// apps/web/src/routes/settings.prompt-improvement.tsx
import { createFileRoute } from "@tanstack/react-router";
import { PromptImprovementSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/prompt-improvement")({
  component: PromptImprovementSettingsPanel,
});
```

- [ ] **Step 14.4 — Verify**

```bash
bun typecheck --filter @t3tools/web
bun lint --filter @t3tools/web
```

Expected: no errors.

- [ ] **Step 14.5 — Commit**

```bash
git add apps/web/src/components/settings/SettingsPanels.tsx \
        apps/web/src/components/settings/SettingsSidebarNav.tsx \
        apps/web/src/routes/settings.prompt-improvement.tsx
git commit -m "feat(web): add Prompt Improvement settings panel"
```

---

## Verification

After all tasks complete, do a full end-to-end check:

- [ ] **Build passes**

```bash
bun run build
```

- [ ] **Type-check passes across all packages**

```bash
bun typecheck
```

- [ ] **Lint passes**

```bash
bun lint
```

- [ ] **Manual smoke test (dev server)**

1. `bun run dev`
2. Open a thread with some messages in the chat.
3. Type a short prompt in the composer — verify the ✨ **Improve** button appears.
4. Click **Improve** — verify:
   - The text area becomes read-only with the shimmer skeleton overlay.
   - A **Cancel** button appears.
   - After the call completes, the input text changes to the improved version.
   - Version counter shows **1/2** with ← → arrows.
5. Click ← — verify the original prompt is restored.
6. Click → — verify the improved version is restored.
7. Click **Improve** again — counter shows **1/3**, navigate between all 3 versions.
8. Manually type in the input after improving — verify the version history clears.
9. Type a single character prompt (e.g. "x") and click **Improve** — verify a "too vague" error message appears inline.
10. Start an improvement and click **Cancel** — verify `isImproving` resets and the input is editable again.
11. Open **Settings → Prompt Improvement** — verify the toggle, model picker, and instructions textarea all render and persist correctly.

---

## Notes for implementer

- **ChatView.tsx is large (~5 000 lines).** Changes are surgical: 1 import block, 1 hook call, 1 wrapper div, 1 button render. Search for the exact strings in the plan rather than relying on line numbers which may drift.
- **`runCodexJson` internal helper** in `CodexTextGeneration.ts` — search the file for its definition and match the exact call signature used by `generateBranchName` (the most similar method — no image attachments).
- **`satisfies TextGenerationShape`** on the return object in both Claude and Codex layers will enforce that the new method is correctly implemented before the build succeeds.
- **Context trimming is client-side.** The server receives pre-trimmed messages; no server-side truncation is needed.
- **Cancellation is best-effort.** The server call continues after Cancel, but the result is ignored on the client.
