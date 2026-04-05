import { Schema } from "effect";
import { TrimmedNonEmptyString } from "./baseSchemas";

// ── MCP Server Transport ────────────────────────────────────────────────

// Supported transport modes for MCP servers
export const McpServerTransport = Schema.Literals(["stdio", "sse"]);
export type McpServerTransport = typeof McpServerTransport.Type;

// ── MCP Server Input ────────────────────────────────────────────────────

// Input for create/update operations — same shape as McpServer but without name
// (name is passed separately as a route/payload parameter).
// Defined first so McpServer can spread its fields to avoid duplication.
export const McpServerInput = Schema.Struct({
  transport: McpServerTransport,
  // stdio transport fields — command must not be empty when provided
  command: Schema.optional(TrimmedNonEmptyString),
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  // sse transport fields — url must not be empty when provided
  url: Schema.optional(TrimmedNonEmptyString),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type McpServerInput = typeof McpServerInput.Type;

// ── MCP Server ──────────────────────────────────────────────────────────

// A single MCP server entry as stored in provider config.
// Using Schema.Struct (not Schema.Class) because these survive JSON round-trips.
// Spreads McpServerInput.fields so the two types stay in sync without duplication.
export const McpServer = Schema.Struct({
  // Server identity key — must not be empty or whitespace-only
  name: TrimmedNonEmptyString,
  ...McpServerInput.fields,
});
export type McpServer = typeof McpServer.Type;

// ── MCP Server Error ────────────────────────────────────────────────────

export class McpServerError extends Schema.TaggedErrorClass<McpServerError>()("McpServerError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {
  override get message(): string {
    return this.detail;
  }
}
