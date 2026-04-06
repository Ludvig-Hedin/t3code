import { Effect } from "effect";
import * as Schema from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";
import { TrimmedNonEmptyString, TrimmedString } from "./baseSchemas";
import {
  ClaudeModelOptions,
  CodexModelOptions,
  DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER,
} from "./model";
import { ModelSelection } from "./orchestration";

// ── Client Settings (local-only) ───────────────────────────────

export const TimestampFormat = Schema.Literals(["locale", "12-hour", "24-hour"]);
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";

export const EnterKeyBehavior = Schema.Literals(["send", "newline"]);
export type EnterKeyBehavior = typeof EnterKeyBehavior.Type;
export const DEFAULT_ENTER_KEY_BEHAVIOR: EnterKeyBehavior = "newline";

export const SidebarProjectSortOrder = Schema.Literals(["updated_at", "created_at", "manual"]);
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "updated_at";

export const SidebarThreadSortOrder = Schema.Literals(["updated_at", "created_at"]);
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";

export const ClientSettingsSchema = Schema.Struct({
  confirmThreadArchive: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  confirmThreadDelete: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  diffWordWrap: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  sidebarProjectSortOrder: SidebarProjectSortOrder.pipe(
    Schema.withDecodingDefault(() => DEFAULT_SIDEBAR_PROJECT_SORT_ORDER),
  ),
  sidebarThreadSortOrder: SidebarThreadSortOrder.pipe(
    Schema.withDecodingDefault(() => DEFAULT_SIDEBAR_THREAD_SORT_ORDER),
  ),
  timestampFormat: TimestampFormat.pipe(Schema.withDecodingDefault(() => DEFAULT_TIMESTAMP_FORMAT)),
  enterKeyBehavior: EnterKeyBehavior.pipe(
    Schema.withDecodingDefault(() => DEFAULT_ENTER_KEY_BEHAVIOR),
  ),
  // Plugin names the user has explicitly disabled; defaults to empty (all plugins active)
  disabledPlugins: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),

  // Appearance
  // Enabled by default — pointer cursors are generally preferred UX
  usePointerCursors: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  uiFontSize: Schema.Number.pipe(Schema.withDecodingDefault(() => 14)),
  codeFontSize: Schema.Number.pipe(Schema.withDecodingDefault(() => 13)),
  uiFont: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  codeFont: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeAccentColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeAccentColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeBackgroundColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeBackgroundColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeForegroundColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  themeForegroundColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),

  // Notifications
  turnCompletionNotifications: Schema.Literals(["always", "never", "unfocused"]).pipe(
    Schema.withDecodingDefault(() => "unfocused" as const),
  ),
  enablePermissionNotifications: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  enableQuestionNotifications: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),

  // Personalization
  customInstructions: Schema.String.pipe(Schema.withDecodingDefault(() => "")),

  // Default provider for new chats
  defaultProvider: Schema.Literals(["use-latest", "codex", "claudeAgent", "gemini"]).pipe(
    Schema.withDecodingDefault(() => "use-latest" as const),
  ),
});
export type ClientSettings = typeof ClientSettingsSchema.Type;

export type TurnCompletionNotifications = "always" | "never" | "unfocused";
export type DefaultProvider = "use-latest" | "codex" | "claudeAgent" | "gemini";

export const DEFAULT_CLIENT_SETTINGS: ClientSettings = Schema.decodeSync(ClientSettingsSchema)({});

// ── Server Settings (server-authoritative) ────────────────────

export const ThreadEnvMode = Schema.Literals(["local", "worktree"]);
export type ThreadEnvMode = typeof ThreadEnvMode.Type;

const makeBinaryPathSetting = (fallback: string) =>
  TrimmedString.pipe(
    Schema.decodeTo(
      Schema.String,
      SchemaTransformation.transformOrFail({
        decode: (value) => Effect.succeed(value || fallback),
        encode: (value) => Effect.succeed(value),
      }),
    ),
    Schema.withDecodingDefault(() => fallback),
  );

export const CodexSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: makeBinaryPathSetting("codex"),
  homePath: TrimmedString.pipe(Schema.withDecodingDefault(() => "")),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),
});
export type CodexSettings = typeof CodexSettings.Type;

export const ClaudeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: makeBinaryPathSetting("claude"),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),
});
export type ClaudeSettings = typeof ClaudeSettings.Type;

export const GeminiSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: makeBinaryPathSetting("gemini"),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),
});
export type GeminiSettings = typeof GeminiSettings.Type;

export const OpenCodeSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: makeBinaryPathSetting("opencode"),
  customModels: Schema.Array(Schema.String).pipe(Schema.withDecodingDefault(() => [])),
});
export type OpenCodeSettings = typeof OpenCodeSettings.Type;

export const OllamaSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  baseUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "http://localhost:11434")),
});
export type OllamaSettings = typeof OllamaSettings.Type;

/**
 * ManifestSettings: configures the "Auto" provider.
 *
 * By default (baseUrl = "") the server auto-detects the first ready provider
 * (Ollama → Codex → Claude Code → Gemini) and routes the request to it.
 *
 * Set baseUrl to a non-empty OpenAI-compatible endpoint (e.g. a custom router)
 * to override auto-detection and call that endpoint directly.
 */
export const ManifestSettings = Schema.Struct({
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  // baseUrl: empty = auto-detect local providers; non-empty = use as OpenAI-compatible endpoint
  baseUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "")),
  // apiKey: bearer token for the custom endpoint (only used when baseUrl is set)
  apiKey: TrimmedString.pipe(Schema.withDecodingDefault(() => "")),
});
export type ManifestSettings = typeof ManifestSettings.Type;

export const ObservabilitySettings = Schema.Struct({
  otlpTracesUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "")),
  otlpMetricsUrl: TrimmedString.pipe(Schema.withDecodingDefault(() => "")),
});
export type ObservabilitySettings = typeof ObservabilitySettings.Type;

// ── Code Review Settings ─────────────────────────────────────────────

/**
 * How the agent should respond after completing a review turn.
 * - review-only: list findings, do not touch files
 * - auto-fix: list findings, then a second turn auto-triggers to fix them
 * - agent-decides: review AND fix in a single full-access turn
 */
export const CodeReviewFixMode = Schema.Literals(["review-only", "auto-fix", "agent-decides"]);
export type CodeReviewFixMode = typeof CodeReviewFixMode.Type;
export const DEFAULT_CODE_REVIEW_FIX_MODE: CodeReviewFixMode = "review-only";

export const CodeReviewSettings = Schema.Struct({
  autoReviewOnPush: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  fixMode: CodeReviewFixMode.pipe(Schema.withDecodingDefault(() => DEFAULT_CODE_REVIEW_FIX_MODE)),
});
export type CodeReviewSettings = typeof CodeReviewSettings.Type;

export const ServerSettings = Schema.Struct({
  enableAssistantStreaming: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  defaultThreadEnvMode: ThreadEnvMode.pipe(
    Schema.withDecodingDefault(() => "local" as const satisfies ThreadEnvMode),
  ),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(() => ({
      provider: "codex" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL_BY_PROVIDER.codex,
    })),
  ),

  // Provider specific settings
  providers: Schema.Struct({
    codex: CodexSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    claudeAgent: ClaudeSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    gemini: GeminiSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    opencode: OpenCodeSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    ollama: OllamaSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    manifest: ManifestSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  }).pipe(Schema.withDecodingDefault(() => ({}))),
  observability: ObservabilitySettings.pipe(Schema.withDecodingDefault(() => ({}))),
  codeReview: CodeReviewSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  commitInstructions: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
});
export type ServerSettings = typeof ServerSettings.Type;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

export class ServerSettingsError extends Schema.TaggedErrorClass<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}

// ── Unified type ─────────────────────────────────────────────────────

export type UnifiedSettings = ServerSettings & ClientSettings;
export const DEFAULT_UNIFIED_SETTINGS: UnifiedSettings = {
  ...DEFAULT_SERVER_SETTINGS,
  ...DEFAULT_CLIENT_SETTINGS,
};

// ── Server Settings Patch (replace with a Schema.deepPartial if available) ──────────────────────────────────────────

const CodexModelOptionsPatch = Schema.Struct({
  reasoningEffort: Schema.optionalKey(CodexModelOptions.fields.reasoningEffort),
  fastMode: Schema.optionalKey(CodexModelOptions.fields.fastMode),
});

const ClaudeModelOptionsPatch = Schema.Struct({
  thinking: Schema.optionalKey(ClaudeModelOptions.fields.thinking),
  effort: Schema.optionalKey(ClaudeModelOptions.fields.effort),
  fastMode: Schema.optionalKey(ClaudeModelOptions.fields.fastMode),
  contextWindow: Schema.optionalKey(ClaudeModelOptions.fields.contextWindow),
});

const GeminiModelOptionsPatch = Schema.Struct({});

const OllamaModelOptionsPatch = Schema.Struct({});

const ModelSelectionPatch = Schema.Union([
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("codex")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(CodexModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("claudeAgent")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(ClaudeModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("gemini")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(GeminiModelOptionsPatch),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("opencode")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(Schema.Struct({})),
  }),
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("ollama")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(OllamaModelOptionsPatch),
  }),
  // manifest has no configurable model options
  Schema.Struct({
    provider: Schema.optionalKey(Schema.Literal("manifest")),
    model: Schema.optionalKey(TrimmedNonEmptyString),
    options: Schema.optionalKey(Schema.Struct({})),
  }),
]);

const CodexSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  homePath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const ClaudeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const GeminiSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

const OllamaSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  baseUrl: Schema.optionalKey(Schema.String),
});

const ManifestSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  baseUrl: Schema.optionalKey(Schema.String),
  apiKey: Schema.optionalKey(Schema.String),
});

const OpenCodeSettingsPatch = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(Schema.String),
  customModels: Schema.optionalKey(Schema.Array(Schema.String)),
});

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optionalKey(Schema.Boolean),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvMode),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  observability: Schema.optionalKey(
    Schema.Struct({
      otlpTracesUrl: Schema.optionalKey(Schema.String),
      otlpMetricsUrl: Schema.optionalKey(Schema.String),
    }),
  ),
  providers: Schema.optionalKey(
    Schema.Struct({
      codex: Schema.optionalKey(CodexSettingsPatch),
      claudeAgent: Schema.optionalKey(ClaudeSettingsPatch),
      gemini: Schema.optionalKey(GeminiSettingsPatch),
      opencode: Schema.optionalKey(OpenCodeSettingsPatch),
      ollama: Schema.optionalKey(OllamaSettingsPatch),
      manifest: Schema.optionalKey(ManifestSettingsPatch),
    }),
  ),
  codeReview: Schema.optionalKey(
    Schema.Struct({
      autoReviewOnPush: Schema.optionalKey(Schema.Boolean),
      fixMode: Schema.optionalKey(CodeReviewFixMode),
    }),
  ),
  commitInstructions: Schema.optionalKey(Schema.String),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;
