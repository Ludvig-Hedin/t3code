import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";
import type { ProviderKind } from "./orchestration";

export const CODEX_REASONING_EFFORT_OPTIONS = ["xhigh", "high", "medium", "low"] as const;
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORT_OPTIONS)[number];
export const CLAUDE_CODE_EFFORT_OPTIONS = ["low", "medium", "high", "max", "ultrathink"] as const;
export type ClaudeCodeEffort = (typeof CLAUDE_CODE_EFFORT_OPTIONS)[number];
export type ProviderReasoningEffort = CodexReasoningEffort | ClaudeCodeEffort;

export const CodexModelOptions = Schema.Struct({
  reasoningEffort: Schema.optional(Schema.Literals(CODEX_REASONING_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
});
export type CodexModelOptions = typeof CodexModelOptions.Type;

export const ClaudeModelOptions = Schema.Struct({
  thinking: Schema.optional(Schema.Boolean),
  effort: Schema.optional(Schema.Literals(CLAUDE_CODE_EFFORT_OPTIONS)),
  fastMode: Schema.optional(Schema.Boolean),
  contextWindow: Schema.optional(Schema.String),
});
export type ClaudeModelOptions = typeof ClaudeModelOptions.Type;

export const GeminiModelOptions = Schema.Struct({});
export type GeminiModelOptions = typeof GeminiModelOptions.Type;

export const OpenCodeModelOptions = Schema.Struct({});
export type OpenCodeModelOptions = typeof OpenCodeModelOptions.Type;

export const OllamaModelOptions = Schema.Struct({});
export type OllamaModelOptions = typeof OllamaModelOptions.Type;

// ManifestModelOptions: no per-request options — routing decisions are made server-side
export const ManifestModelOptions = Schema.Struct({});
export type ManifestModelOptions = typeof ManifestModelOptions.Type;

export const ProviderModelOptions = Schema.Struct({
  codex: Schema.optional(CodexModelOptions),
  claudeAgent: Schema.optional(ClaudeModelOptions),
  gemini: Schema.optional(GeminiModelOptions),
  opencode: Schema.optional(OpenCodeModelOptions),
  ollama: Schema.optional(OllamaModelOptions),
  manifest: Schema.optional(ManifestModelOptions),
});
export type ProviderModelOptions = typeof ProviderModelOptions.Type;

export const EffortOption = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  isDefault: Schema.optional(Schema.Boolean),
});
export type EffortOption = typeof EffortOption.Type;

export const ContextWindowOption = Schema.Struct({
  value: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString,
  isDefault: Schema.optional(Schema.Boolean),
});
export type ContextWindowOption = typeof ContextWindowOption.Type;

export const ModelCapabilities = Schema.Struct({
  reasoningEffortLevels: Schema.Array(EffortOption),
  supportsFastMode: Schema.Boolean,
  supportsThinkingToggle: Schema.Boolean,
  contextWindowOptions: Schema.Array(ContextWindowOption),
  promptInjectedEffortLevels: Schema.Array(TrimmedNonEmptyString),
});
export type ModelCapabilities = typeof ModelCapabilities.Type;

export const DEFAULT_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.4",
  claudeAgent: "claude-sonnet-4-6",
  gemini: "gemini-2.5-pro",
  opencode: "moonshot/kimi-k2-5",
  ollama: "llama3.2",
  // manifest always uses "auto" — the router picks the actual model internally
  manifest: "auto",
};

export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.codex;

/** Per-provider text generation model defaults. */
export const DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER: Record<ProviderKind, string> = {
  codex: "gpt-5.4-mini",
  claudeAgent: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash",
  opencode: "moonshot/kimi-k2-5",
  ollama: "llama3.2",
  manifest: "auto",
};

export const MODEL_SLUG_ALIASES_BY_PROVIDER: Record<ProviderKind, Record<string, string>> = {
  codex: {
    "5.4": "gpt-5.4",
    "5.3": "gpt-5.3-codex",
    "gpt-5.3": "gpt-5.3-codex",
    "5.3-spark": "gpt-5.3-codex-spark",
    "gpt-5.3-spark": "gpt-5.3-codex-spark",
    // GPT-5.1 Codex generation aliases
    "5.1-mini": "gpt-5.1-codex-mini",
    "gpt-5.1-mini": "gpt-5.1-codex-mini",
    "5.1-codex-mini": "gpt-5.1-codex-mini",
    "5.1-max": "gpt-5.1-codex-max",
    "gpt-5.1-max": "gpt-5.1-codex-max",
    "5.1-codex-max": "gpt-5.1-codex-max",
  },
  claudeAgent: {
    opus: "claude-opus-4-6",
    "opus-4.6": "claude-opus-4-6",
    "claude-opus-4.6": "claude-opus-4-6",
    "claude-opus-4-6-20251117": "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    "sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4.6": "claude-sonnet-4-6",
    "claude-sonnet-4-6-20251117": "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
    "haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4.5": "claude-haiku-4-5",
    "claude-haiku-4-5-20251001": "claude-haiku-4-5",
  },
  gemini: {
    pro: "gemini-2.5-pro",
    "2.5-pro": "gemini-2.5-pro",
    "gemini-pro": "gemini-2.5-pro",
    flash: "gemini-2.5-flash",
    "2.5-flash": "gemini-2.5-flash",
    "gemini-flash": "gemini-2.5-flash",
    "2.5-flash-lite": "gemini-2.5-flash-lite",
    "flash-lite": "gemini-2.5-flash-lite",
    "gemini-flash-lite": "gemini-2.5-flash-lite",
    "3": "gemini-3-pro-preview",
    "3-pro": "gemini-3-pro-preview",
    "gemini-3": "gemini-3-pro-preview",
    "gemini-3-pro": "gemini-3-pro-preview",
    "gemini-3-pro-preview": "gemini-3-pro-preview",
    "3.1": "gemini-3.1-pro-preview",
    "3.1-pro": "gemini-3.1-pro-preview",
    "gemini-3.1": "gemini-3.1-pro-preview",
    "gemini-3.1-pro": "gemini-3.1-pro-preview",
    "gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
    "3-flash": "gemini-3-flash-preview",
    "gemini-3-flash": "gemini-3-flash-preview",
    "gemini-3-flash-preview": "gemini-3-flash-preview",
  },
  opencode: {},
  ollama: {
    llama3: "llama3.2",
    qwen: "qwen2.5-coder",
    mistral: "mistral",
  },
  // manifest has no aliases — "auto" is the only slug and always maps to itself
  manifest: {},
};

// ── Provider display names ────────────────────────────────────────────

export const PROVIDER_DISPLAY_NAMES: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  gemini: "Gemini",
  opencode: "OpenCode",
  ollama: "Ollama",
  // "Auto" is the user-facing name — Manifest is the implementation detail
  manifest: "Auto",
};
