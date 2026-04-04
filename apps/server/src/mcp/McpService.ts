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
import {
  type McpServer,
  McpServerInput,
  McpServerError,
  type ProviderKind,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Path, Schema, ServiceMap } from "effect";
import * as Semaphore from "effect/Semaphore";
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
 *
 * The type field is `string` (not a union) because Claude's config may contain
 * transport types we do not recognize (e.g. "streamableHttp"). Unknown types
 * are filtered out in claudeEntryToMcpServer rather than causing a parse error.
 */
interface ClaudeConfigMcpEntry {
  type: string;
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
      // yield* on a TaggedError is shorthand for Effect.fail(new Error(...)). Enabled by the Effect TS plugin.
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
 *
 * Returns null for entries whose "type" is not a transport we support (e.g.
 * "streamableHttp"). Callers must filter nulls. We skip rather than error so
 * that an unknown transport in the file does not break listing all other servers.
 */
function claudeEntryToMcpServer(name: string, entry: ClaudeConfigMcpEntry): McpServer | null {
  if (entry.type !== "stdio" && entry.type !== "sse") {
    // Unknown transport type — skip silently so future Claude transport types
    // don't break the list operation for all other entries.
    return null;
  }
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

// ── Input validation helpers ─────────────────────────────────────────────────

/**
 * Validate that a raw name string is non-empty and trimmed.
 * Returns McpServerError if validation fails, matching the SkillService.save() pattern.
 */
const validateName = (name: string): Effect.Effect<string, McpServerError> =>
  Schema.decodeEffect(TrimmedNonEmptyString)(name).pipe(
    Effect.mapError(
      (cause) =>
        new McpServerError({
          detail: `Invalid MCP server name: ${String(cause)}`,
          cause,
        }),
    ),
  );

/**
 * Validate a McpServerInput value against the contracts schema.
 * Returns McpServerError if any field is invalid.
 */
const validateServerInput = (server: McpServerInput): Effect.Effect<McpServerInput, McpServerError> =>
  Schema.decodeEffect(McpServerInput)(server).pipe(
    Effect.mapError(
      (cause) =>
        new McpServerError({
          detail: `Invalid MCP server input: ${String(cause)}`,
          cause,
        }),
    ),
  );

// ── Service factory ──────────────────────────────────────────────────────────

export const makeMcpService = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;

  // Resolve the Claude config file path once at construction time.
  // os.homedir() is synchronous and stable for the process lifetime.
  const claudeConfigPath = pathService.join(os.homedir(), ".claude.json");

  // Single-permit semaphore to prevent concurrent read-modify-write corruption on
  // ~/.claude.json. All mutating operations (add, update, delete) acquire this lock
  // around their R-M-W section before touching disk.
  const claudeConfigMutex = yield* Semaphore.make(1);

  // ── list ───────────────────────────────────────────────────────────────────

  const list = (provider: ProviderKind): Effect.Effect<McpServer[], McpServerError> => {
    if (provider === "claudeAgent") {
      return Effect.gen(function* () {
        const config = yield* readClaudeConfig(fs, claudeConfigPath);
        const mcpServers = config.mcpServers ?? {};
        return Object.entries(mcpServers)
          .map(([name, entry]) => claudeEntryToMcpServer(name, entry))
          .filter((s): s is McpServer => s !== null);
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
        // Validate inputs at the service boundary before touching disk.
        const validName = yield* validateName(name);
        const validServer = yield* validateServerInput(server);

        // Acquire the mutex only around the R-M-W section to prevent concurrent writes.
        const result = yield* claudeConfigMutex.withPermits(1)(
          Effect.gen(function* () {
            const config = yield* readClaudeConfig(fs, claudeConfigPath);
            const mcpServers = config.mcpServers ?? {};

            if (validName in mcpServers) {
              // yield* on a TaggedError is shorthand for Effect.fail(new Error(...)). Enabled by the Effect TS plugin.
              return yield* new McpServerError({
                detail: `MCP server "${validName}" already exists for provider "${provider}"`,
              });
            }

            // Convert once and reuse to avoid double-calling mcpServerInputToClaudeEntry.
            const claudeEntry = mcpServerInputToClaudeEntry(validServer);

            const updated: ClaudeConfig = {
              ...config,
              mcpServers: {
                ...mcpServers,
                [validName]: claudeEntry,
              },
            };

            yield* writeClaudeConfig(fs, claudeConfigPath, updated);
            // claudeEntryToMcpServer cannot return null here because we just wrote
            // a validated entry with a known transport ("stdio" | "sse").
            return claudeEntryToMcpServer(validName, claudeEntry) as McpServer;
          }),
        );
        return result;
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
        // Validate inputs at the service boundary before touching disk.
        const validName = yield* validateName(name);
        const validPatch = yield* validateServerInput(patch);

        // Acquire the mutex only around the R-M-W section to prevent concurrent writes.
        const result = yield* claudeConfigMutex.withPermits(1)(
          Effect.gen(function* () {
            const config = yield* readClaudeConfig(fs, claudeConfigPath);
            const mcpServers = config.mcpServers ?? {};

            if (!(validName in mcpServers)) {
              // yield* on a TaggedError is shorthand for Effect.fail(new Error(...)). Enabled by the Effect TS plugin.
              return yield* new McpServerError({
                detail: `MCP server "${validName}" not found for provider "${provider}"`,
              });
            }

            // Convert once and reuse to avoid double-calling mcpServerInputToClaudeEntry.
            const claudeEntry = mcpServerInputToClaudeEntry(validPatch);

            const updated: ClaudeConfig = {
              ...config,
              mcpServers: {
                ...mcpServers,
                [validName]: claudeEntry,
              },
            };

            yield* writeClaudeConfig(fs, claudeConfigPath, updated);
            // claudeEntryToMcpServer cannot return null here because we just wrote
            // a validated entry with a known transport ("stdio" | "sse").
            return claudeEntryToMcpServer(validName, claudeEntry) as McpServer;
          }),
        );
        return result;
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
        // Validate name at the service boundary before touching disk.
        const validName = yield* validateName(name);

        // Acquire the mutex only around the R-M-W section to prevent concurrent writes.
        yield* claudeConfigMutex.withPermits(1)(
          Effect.gen(function* () {
            const config = yield* readClaudeConfig(fs, claudeConfigPath);
            const mcpServers = config.mcpServers ?? {};

            if (!(validName in mcpServers)) {
              // yield* on a TaggedError is shorthand for Effect.fail(new Error(...)). Enabled by the Effect TS plugin.
              return yield* new McpServerError({
                detail: `MCP server "${validName}" not found for provider "${provider}"`,
              });
            }

            // Build a new mcpServers object without the deleted entry.
            const { [validName]: _removed, ...remaining } = mcpServers;
            const updated: ClaudeConfig = {
              ...config,
              mcpServers: remaining,
            };

            yield* writeClaudeConfig(fs, claudeConfigPath, updated);
          }),
        );
      });
    }

    return Effect.fail(unsupportedProvider(provider));
  };

  return { list, add, update, delete: deleteServer } satisfies McpServiceShape;
});

// ── Live layer ───────────────────────────────────────────────────────────────

export const McpServiceLive = Layer.effect(McpService, makeMcpService);
