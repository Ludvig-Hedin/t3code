/**
 * A2A (Agent-to-Agent) Protocol contracts.
 *
 * Defines Effect Schema types for the A2A protocol, enabling interoperable
 * agent-to-agent communication over HTTP JSON-RPC 2.0 + SSE streaming.
 *
 * Spec reference: https://a2a-protocol.org/latest/specification/
 *
 * @module a2a
 */
import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas";

// ── Branded IDs ──────────────────────────────────────────────────────────

const makeA2aId = <Brand extends string>(brand: Brand) =>
  TrimmedNonEmptyString.pipe(Schema.brand(brand));

export const A2aTaskId = makeA2aId("A2aTaskId");
export type A2aTaskId = typeof A2aTaskId.Type;

export const A2aAgentCardId = makeA2aId("A2aAgentCardId");
export type A2aAgentCardId = typeof A2aAgentCardId.Type;

export const A2aMessageId = makeA2aId("A2aMessageId");
export type A2aMessageId = typeof A2aMessageId.Type;

export const A2aArtifactId = makeA2aId("A2aArtifactId");
export type A2aArtifactId = typeof A2aArtifactId.Type;

// ── Agent Card ───────────────────────────────────────────────────────────

/** A2A protocol content mode (text, file, or structured data). */
export const A2aContentMode = Schema.Union([
  Schema.Literal("text"),
  Schema.Literal("file"),
  Schema.Literal("data"),
]);
export type A2aContentMode = typeof A2aContentMode.Type;

/** A skill advertised by an A2A agent in its Agent Card. */
export const A2aSkill = Schema.Struct({
  id: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  tags: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  inputModes: Schema.Array(A2aContentMode),
  outputModes: Schema.Array(A2aContentMode),
});
export type A2aSkill = typeof A2aSkill.Type;

/** Security scheme types supported by A2A agent cards. */
export const A2aSecuritySchemeType = Schema.Union([
  Schema.Literal("http"),
  Schema.Literal("apiKey"),
  Schema.Literal("oauth2"),
  Schema.Literal("openIdConnect"),
]);
export type A2aSecuritySchemeType = typeof A2aSecuritySchemeType.Type;

/** An individual security scheme declared by an agent card. */
export const A2aSecurityScheme = Schema.Struct({
  type: A2aSecuritySchemeType,
  scheme: Schema.optional(TrimmedNonEmptyString), // e.g. "bearer"
  name: Schema.optional(TrimmedNonEmptyString), // for apiKey: header/query name
  in: Schema.optional(
    Schema.Union([
      Schema.Literal("header"),
      Schema.Literal("query"),
      Schema.Literal("cookie"),
    ]),
  ),
  // OAuth2/OIDC fields stored as opaque JSON for flexibility
  flows: Schema.optional(Schema.Unknown),
  openIdConnectUrl: Schema.optional(TrimmedNonEmptyString),
});
export type A2aSecurityScheme = typeof A2aSecurityScheme.Type;

/** Capabilities advertised by an A2A agent. */
export const A2aCapabilities = Schema.Struct({
  streaming: Schema.Boolean,
  pushNotifications: Schema.Boolean,
});
export type A2aCapabilities = typeof A2aCapabilities.Type;

/** Where the agent card was sourced from. */
export const A2aAgentCardSource = Schema.Union([
  Schema.Literal("local"),
  Schema.Literal("remote"),
]);
export type A2aAgentCardSource = typeof A2aAgentCardSource.Type;

/** An A2A Agent Card — the discovery/metadata document for an agent. */
export const A2aAgentCard = Schema.Struct({
  id: A2aAgentCardId,
  name: TrimmedNonEmptyString,
  description: Schema.optional(TrimmedNonEmptyString),
  url: TrimmedNonEmptyString, // service endpoint URL
  version: Schema.optional(TrimmedNonEmptyString),
  skills: Schema.Array(A2aSkill),
  securitySchemes: Schema.optional(
    Schema.Record(TrimmedNonEmptyString, A2aSecurityScheme),
  ),
  capabilities: A2aCapabilities,
  defaultInputModes: Schema.optional(Schema.Array(A2aContentMode)),
  defaultOutputModes: Schema.optional(Schema.Array(A2aContentMode)),
  // Bird Code metadata (not part of A2A spec)
  source: A2aAgentCardSource,
  providerKind: Schema.optional(TrimmedNonEmptyString), // links local agents to ProviderKind
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  lastSeenAt: Schema.optional(IsoDateTime),
});
export type A2aAgentCard = typeof A2aAgentCard.Type;

// ── Message Parts ────────────────────────────────────────────────────────

export const A2aTextPart = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
});
export type A2aTextPart = typeof A2aTextPart.Type;

export const A2aFilePart = Schema.Struct({
  type: Schema.Literal("file"),
  file: Schema.Struct({
    name: Schema.optional(TrimmedNonEmptyString),
    mimeType: Schema.optional(TrimmedNonEmptyString),
    // Either inline bytes (base64) or a URI
    bytes: Schema.optional(Schema.String),
    uri: Schema.optional(TrimmedNonEmptyString),
  }),
});
export type A2aFilePart = typeof A2aFilePart.Type;

export const A2aDataPart = Schema.Struct({
  type: Schema.Literal("data"),
  data: Schema.Unknown,
});
export type A2aDataPart = typeof A2aDataPart.Type;

/** A single content part in an A2A message (text, file, or structured data). */
export const A2aMessagePart = Schema.Union([A2aTextPart, A2aFilePart, A2aDataPart]);
export type A2aMessagePart = typeof A2aMessagePart.Type;

// ── Messages ─────────────────────────────────────────────────────────────

/** Role of a message sender in the A2A protocol. */
export const A2aMessageRole = Schema.Union([
  Schema.Literal("user"),
  Schema.Literal("agent"),
]);
export type A2aMessageRole = typeof A2aMessageRole.Type;

/** An A2A protocol message: a single communication turn between client and agent. */
export const A2aMessage = Schema.Struct({
  role: A2aMessageRole,
  parts: Schema.Array(A2aMessagePart),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type A2aMessage = typeof A2aMessage.Type;

// ── Artifacts ────────────────────────────────────────────────────────────

/** A tangible output produced by an agent during task execution. */
export const A2aArtifact = Schema.Struct({
  name: Schema.optional(TrimmedNonEmptyString),
  description: Schema.optional(TrimmedNonEmptyString),
  parts: Schema.Array(A2aMessagePart),
  index: Schema.optional(Schema.Int),
  append: Schema.optional(Schema.Boolean),
  lastChunk: Schema.optional(Schema.Boolean),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type A2aArtifact = typeof A2aArtifact.Type;

// ── Tasks ────────────────────────────────────────────────────────────────

/** A2A task lifecycle status. */
export const A2aTaskStatus = Schema.Union([
  Schema.Literal("submitted"),
  Schema.Literal("working"),
  Schema.Literal("input-required"),
  Schema.Literal("completed"),
  Schema.Literal("failed"),
  Schema.Literal("canceled"),
]);
export type A2aTaskStatus = typeof A2aTaskStatus.Type;

/** A2A task state: status + optional message/artifacts context. */
export const A2aTaskState = Schema.Struct({
  status: A2aTaskStatus,
  message: Schema.optional(A2aMessage),
  timestamp: Schema.optional(IsoDateTime),
});
export type A2aTaskState = typeof A2aTaskState.Type;

/** A full A2A task with its history and artifacts. */
export const A2aTask = Schema.Struct({
  id: A2aTaskId,
  agentCardId: A2aAgentCardId,
  threadId: Schema.optional(TrimmedNonEmptyString), // links to orchestration thread
  status: A2aTaskState,
  history: Schema.optional(Schema.Array(A2aMessage)),
  artifacts: Schema.optional(Schema.Array(A2aArtifact)),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type A2aTask = typeof A2aTask.Type;

// ── JSON-RPC 2.0 Envelope ────────────────────────────────────────────────

/** A2A JSON-RPC 2.0 request envelope. */
export const A2aJsonRpcRequest = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Number]),
  method: TrimmedNonEmptyString,
  params: Schema.optional(Schema.Unknown),
});
export type A2aJsonRpcRequest = typeof A2aJsonRpcRequest.Type;

/** A2A JSON-RPC 2.0 error object. */
export const A2aJsonRpcError = Schema.Struct({
  code: Schema.Int,
  message: Schema.String,
  data: Schema.optional(Schema.Unknown),
});
export type A2aJsonRpcError = typeof A2aJsonRpcError.Type;

/** A2A JSON-RPC 2.0 response envelope. */
export const A2aJsonRpcResponse = Schema.Struct({
  jsonrpc: Schema.Literal("2.0"),
  id: Schema.Union([Schema.String, Schema.Number, Schema.Null]),
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(A2aJsonRpcError),
});
export type A2aJsonRpcResponse = typeof A2aJsonRpcResponse.Type;

// ── SSE Event Types ──────────────────────────────────────────────────────

/** Event types emitted over SSE during streaming A2A interactions. */
export const A2aSseEventType = Schema.Union([
  Schema.Literal("task-status-update"),
  Schema.Literal("task-artifact-update"),
  Schema.Literal("task-error"),
]);
export type A2aSseEventType = typeof A2aSseEventType.Type;

export const A2aTaskStatusUpdateEvent = Schema.Struct({
  type: Schema.Literal("task-status-update"),
  taskId: A2aTaskId,
  status: A2aTaskState,
  final: Schema.optional(Schema.Boolean),
});
export type A2aTaskStatusUpdateEvent = typeof A2aTaskStatusUpdateEvent.Type;

export const A2aTaskArtifactUpdateEvent = Schema.Struct({
  type: Schema.Literal("task-artifact-update"),
  taskId: A2aTaskId,
  artifact: A2aArtifact,
});
export type A2aTaskArtifactUpdateEvent = typeof A2aTaskArtifactUpdateEvent.Type;

export const A2aTaskErrorEvent = Schema.Struct({
  type: Schema.Literal("task-error"),
  taskId: A2aTaskId,
  error: A2aJsonRpcError,
});
export type A2aTaskErrorEvent = typeof A2aTaskErrorEvent.Type;

/** Union of all A2A SSE event types. */
export const A2aSseEvent = Schema.Union([
  A2aTaskStatusUpdateEvent,
  A2aTaskArtifactUpdateEvent,
  A2aTaskErrorEvent,
]);
export type A2aSseEvent = typeof A2aSseEvent.Type;

// ── RPC Input/Output Schemas ─────────────────────────────────────────────

/** Input for message/send and message/stream methods. */
export const A2aMessageSendInput = Schema.Struct({
  agentCardId: A2aAgentCardId,
  message: A2aMessage,
  taskId: Schema.optional(A2aTaskId), // continue existing task
});
export type A2aMessageSendInput = typeof A2aMessageSendInput.Type;

export const A2aMessageSendResult = Schema.Struct({
  task: A2aTask,
});
export type A2aMessageSendResult = typeof A2aMessageSendResult.Type;

/** Input for registering/discovering an agent by URL. */
export const A2aRegisterAgentInput = Schema.Struct({
  url: TrimmedNonEmptyString,
  name: Schema.optional(TrimmedNonEmptyString),
});
export type A2aRegisterAgentInput = typeof A2aRegisterAgentInput.Type;

/** Input for removing a registered agent. */
export const A2aRemoveAgentInput = Schema.Struct({
  agentCardId: A2aAgentCardId,
});
export type A2aRemoveAgentInput = typeof A2aRemoveAgentInput.Type;

/** Input for fetching task details. */
export const A2aGetTaskInput = Schema.Struct({
  taskId: A2aTaskId,
});
export type A2aGetTaskInput = typeof A2aGetTaskInput.Type;

/** Input for canceling a task. */
export const A2aCancelTaskInput = Schema.Struct({
  taskId: A2aTaskId,
});
export type A2aCancelTaskInput = typeof A2aCancelTaskInput.Type;

// ── Error Classes ────────────────────────────────────────────────────────

export class A2aServiceError extends Schema.TaggedErrorClass<A2aServiceError>()(
  "A2aServiceError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export class A2aClientError extends Schema.TaggedErrorClass<A2aClientError>()(
  "A2aClientError",
  {
    message: TrimmedNonEmptyString,
    url: Schema.optional(TrimmedNonEmptyString),
    statusCode: Schema.optional(Schema.Int),
    cause: Schema.optional(Schema.Defect),
  },
) {}

// ── WS Method Keys ───────────────────────────────────────────────────────

export const A2A_WS_METHODS = {
  listAgents: "a2a.listAgents",
  registerAgent: "a2a.registerAgent",
  removeAgent: "a2a.removeAgent",
  discoverAgent: "a2a.discoverAgent",
  sendMessage: "a2a.sendMessage",
  getTask: "a2a.getTask",
  listTasks: "a2a.listTasks",
  cancelTask: "a2a.cancelTask",
  subscribeEvents: "a2a.subscribeEvents",
} as const;
