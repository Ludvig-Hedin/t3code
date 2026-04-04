/**
 * McpService - Reads and writes MCP server configurations from provider on-disk config files.
 *
 * Each provider stores MCP servers in a different format and location.
 * Currently supported:
 *   - claudeAgent: ~/.claude.json (mcpServers key), maps "type" → "transport" on read
 *   - codex: not yet supported (TODO: implement once Codex config format is confirmed)
 *
 * Follows the same ServiceMap.Service pattern as ProviderService.
 *
 * @module McpService
 */
import { type McpServer, type McpServerInput, McpServerError, type ProviderKind } from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path, ServiceMap } from "effect";
import * as os from "node:os";

// ── Service interface ────────────────────────────────────────────────────────

export interface McpServiceShape {
  /** List all MCP servers configured for the given provider. */
  list(provider: ProviderKind): Effect.Effect<McpServer[], McpServerError>;

  /** Add a new MCP server entry for the given provider. */
  add(
    provider: ProviderKind,
    name: string,
    server: McpServerInput,
  ): Effect.Effect<McpServer, McpServerError>;

  /** Update an existing MCP server entry for the given provider. */
  update(
    provider: ProviderKind,
    name: string,
    patch: McpServerInput,
  ): Effect.Effect<McpServer, McpServerError>;

  /** Delete an MCP server entry for the given provider. */
  delete(provider: ProviderKind, name: string): Effect.Effect<void, McpServerError>;
}

// ── Service tag ──────────────────────────────────────────────────────────────

export class McpService extends ServiceMap.Service<McpService, McpServiceShape>()(
  "t3/mcp/McpService",
) {}

// ── Claude ~/.claude.json helpers ────────────────────────────────────────────

/**
 * The on-disk shape of a single MCP server in ~/.claude.json.
 * Claude uses "type" instead of "transport" — we map during read/write.
 */
interface ClaudeConfigMcpEntry {
  type: "stdio" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers?: Record<string, ClaudeConfigMcpEntry>;
  [key: string]: unknown;
}

/**
 * Read and JSON-parse ~/.claude.json, returning an empty object if the file
 * does not exist. Fails with McpServerError if the file exists but is malformed.
 */
const readClaudeConfig = (
  fs: FileSystem.FileSystem,
  configPath: string,
): Effect.Effect<ClaudeConfig, McpServerError> =>
  Effect.gen(function* () {
    // Map PlatformError → McpServerError so the error channel stays uniform.
    const exists = yield* fs.exists(configPath).pipe(
      Effect.mapError(
        (e) =>
          new McpServerError({
            detail: `Failed to check existence of ${configPath}: ${String(e)}`,
            cause: e,
          }),
      ),
    );

    if (!exists) {
      return {} as ClaudeConfig;
    }

    const raw = yield* fs.readFileString(configPath, "utf8").pipe(
      Effect.mapError(
        (e) =>
          new McpServerError({
            detail: `Failed to read ${configPath}: ${String(e)}`,
            cause: e,
          }),
      ),
    );

    // Use Effect.try to safely parse JSON without a try/catch inside the generator.
    const parsed = yield* Effect.try({
      try: () => JSON.parse(raw) as unknown,
      catch: (e) =>
        new McpServerError({
          detail: `Failed to parse ${configPath} as JSON: ${String(e)}`,
          cause: e,
        }),
    });

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      // Return yield* signals a definitive exit point for type narrowing (Effect plugin rule).
      return yield* new McpServerError({
        detail: `${configPath} does not contain a JSON object at the root`,
      });
    }

    return parsed as ClaudeConfig;
  });

/**
 * Persist the updated config back to disk, preserving all existing fields.
 * Writes prettily (2-space indent) to keep the file human-readable.
 */
const writeClaudeConfig = (
  fs: FileSystem.FileSystem,
  configPath: string,
  config: ClaudeConfig,
): Effect.Effect<void, McpServerError> =>
  fs.writeFileString(configPath, JSON.stringify(config, null, 2), { flag: "w" }).pipe(
    Effect.mapError(
      (e) =>
        new McpServerError({
          detail: `Failed to write ${configPath}: ${String(e)}`,
          cause: e,
        }),
    ),
  );

/**
 * Convert a raw Claude config entry + name into the canonical McpServer shape.
 * Maps Claude's "type" field to our internal "transport" field.
 */
function claudeEntryToMcpServer(name: string, entry: ClaudeConfigMcpEntry): McpServer {
  return {
    name,
    // Map "type" (Claude's on-disk field) → "transport" (T3 Code's canonical field)
    transport: entry.type,
    ...(entry.command !== undefined ? { command: entry.command } : {}),
    ...(entry.args !== undefined ? { args: entry.args } : {}),
    ...(entry.env !== undefined ? { env: entry.env } : {}),
    ...(entry.url !== undefined ? { url: entry.url } : {}),
    ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
  };
}

/**
 * Convert a McpServerInput into the on-disk Claude config entry shape.
 * Maps our internal "transport" field → "type" (Claude's on-disk field).
 */
function mcpServerInputToClaudeEntry(server: McpServerInput): ClaudeConfigMcpEntry {
  return {
    // Map "transport" (T3 Code's canonical field) → "type" (Claude's on-disk field)
    type: server.transport,
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args !== undefined ? { args: [...server.args] } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {}),
  };
}

// ── Unsupported provider error helper ────────────────────────────────────────

const unsupportedProvider = (provider: ProviderKind): McpServerError =>
  new McpServerError({
    // TODO: implement once Codex config format is confirmed
    detail: `${provider} MCP config format is not yet supported`,
  });

// ── Service factory ──────────────────────────────────────────────────────────

export const makeMcpService = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  // Resolve the Claude config file path once at construction time.
  // os.homedir() is synchronous and stable for the process lifetime.
  const claudeConfigPath = pathService.join(os.homedir(), ".claude.json");

  // ── list ───────────────────────────────────────────────────────────────────

  const list = (provider: ProviderKind): Effect.Effect<McpServer[], McpServerError> => {
    if (provider === "claudeAgent") {
      return Effect.gen(function* () {
        const config = yield* readClaudeConfig(fs, claudeConfigPath);
        const mcpServers = config.mcpServers ?? {};
        return Object.entries(mcpServers).map(([name, entry]) =>
          claudeEntryToMcpServer(name, entry),
        );
      });
    }

    // codex: not yet supported
    return Effect.fail(unsupportedProvider(provider));
  };

  // ── add ────────────────────────────────────────────────────────────────────

  const add = (
    provider: ProviderKind,
    name: string,
    server: McpServerInput,
  ): Effect.Effect<McpServer, McpServerError> => {
    if (provider === "claudeAgent") {
      return Effect.gen(function* () {
        const config = yield* readClaudeConfig(fs, claudeConfigPath);
        const mcpServers = config.mcpServers ?? {};

        if (name in mcpServers) {
          // Return yield* signals a definitive exit point for type narrowing (Effect plugin rule).
          return yield* new McpServerError({
            detail: `MCP server "${name}" already exists for provider "${provider}"`,
          });
        }

        const updated: ClaudeConfig = {
          ...config,
          mcpServers: {
            ...mcpServers,
            [name]: mcpServerInputToClaudeEntry(server),
          },
        };

        yield* writeClaudeConfig(fs, claudeConfigPath, updated);
        return claudeEntryToMcpServer(name, mcpServerInputToClaudeEntry(server));
      });
    }

    return Effect.fail(unsupportedProvider(provider));
  };

  // ── update ─────────────────────────────────────────────────────────────────

  const update = (
    provider: ProviderKind,
    name: string,
    patch: McpServerInput,
  ): Effect.Effect<McpServer, McpServerError> => {
    if (provider === "claudeAgent") {
      return Effect.gen(function* () {
        const config = yield* readClaudeConfig(fs, claudeConfigPath);
        const mcpServers = config.mcpServers ?? {};

        if (!(name in mcpServers)) {
          // Return yield* signals a definitive exit point for type narrowing (Effect plugin rule).
          return yield* new McpServerError({
            detail: `MCP server "${name}" not found for provider "${provider}"`,
          });
        }

        const updated: ClaudeConfig = {
          ...config,
          mcpServers: {
            ...mcpServers,
            [name]: mcpServerInputToClaudeEntry(patch),
          },
        };

        yield* writeClaudeConfig(fs, claudeConfigPath, updated);
        return claudeEntryToMcpServer(name, mcpServerInputToClaudeEntry(patch));
      });
    }

    return Effect.fail(unsupportedProvider(provider));
  };

  // ── delete ─────────────────────────────────────────────────────────────────

  // Named deleteServer because "delete" is a reserved keyword in JavaScript/TypeScript.
  const deleteServer = (
    provider: ProviderKind,
    name: string,
  ): Effect.Effect<void, McpServerError> => {
    if (provider === "claudeAgent") {
      return Effect.gen(function* () {
        const config = yield* readClaudeConfig(fs, claudeConfigPath);
        const mcpServers = config.mcpServers ?? {};

        if (!(name in mcpServers)) {
          // Return yield* signals a definitive exit point for type narrowing (Effect plugin rule).
          return yield* new McpServerError({
            detail: `MCP server "${name}" not found for provider "${provider}"`,
          });
        }

        // Build a new mcpServers object without the deleted entry.
        const { [name]: _removed, ...remaining } = mcpServers;
        const updated: ClaudeConfig = {
          ...config,
          mcpServers: remaining,
        };

        yield* writeClaudeConfig(fs, claudeConfigPath, updated);
      });
    }

    return Effect.fail(unsupportedProvider(provider));
  };

  return { list, add, update, delete: deleteServer } satisfies McpServiceShape;
});

// ── Live layer ───────────────────────────────────────────────────────────────

export const McpServiceLive = Layer.effect(McpService, makeMcpService);
