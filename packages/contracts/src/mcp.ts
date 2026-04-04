import * as Schema from "effect/Schema";

// ── MCP Server Transport ────────────────────────────────────────────────

// Supported transport modes for MCP servers
export const McpServerTransport = Schema.Literals(["stdio", "sse"]);
export type McpServerTransport = typeof McpServerTransport.Type;

// ── MCP Server ──────────────────────────────────────────────────────────

// A single MCP server entry as stored in provider config.
// Using Schema.Struct (not Schema.Class) because these survive JSON round-trips.
export const McpServer = Schema.Struct({
  name: Schema.String,
  transport: McpServerTransport,
  // stdio transport fields
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  // sse transport fields
  url: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type McpServer = typeof McpServer.Type;

// ── MCP Server Input ────────────────────────────────────────────────────

// Input for create/update operations — same shape as McpServer but without name
// (name is passed separately as a route/payload parameter).
export const McpServerInput = Schema.Struct({
  transport: McpServerTransport,
  command: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  url: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type McpServerInput = typeof McpServerInput.Type;

// ── MCP Server Error ────────────────────────────────────────────────────

export class McpServerError extends Schema.TaggedErrorClass<McpServerError>()(
  "McpServerError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}
