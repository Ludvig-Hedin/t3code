import * as Schema from "effect/Schema";

// ── Plugin Info ─────────────────────────────────────────────────────────

// Plugin metadata returned by the server when listing installed plugins.
// Using Schema.Struct because these objects survive JSON round-trips.
export const PluginInfo = Schema.Struct({
  name: Schema.String,           // plugin directory name
  version: Schema.String,        // from package.json or "unknown"
  description: Schema.String,    // from package.json or ""
  location: Schema.String,       // absolute path to plugin directory
  marketplace: Schema.String,    // marketplace name (directory under marketplaces/)
});
export type PluginInfo = typeof PluginInfo.Type;

// ── Plugin Install Input ────────────────────────────────────────────────

// Input payload to install a plugin from a local path or git URL.
export const PluginInstallInput = Schema.Struct({
  source: Schema.String,
});
export type PluginInstallInput = typeof PluginInstallInput.Type;

// ── Plugin Error ────────────────────────────────────────────────────────

export class PluginError extends Schema.TaggedErrorClass<PluginError>()(
  "PluginError",
  {
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}
