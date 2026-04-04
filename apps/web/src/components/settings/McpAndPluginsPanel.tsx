import {
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  LoaderIcon,
  PackageIcon,
  PlugIcon,
  PlusIcon,
  ServerIcon,
  Trash2Icon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  type McpServer,
  type McpServerInput,
  type McpServerTransport,
  type PluginInfo,
  type ProviderKind,
  PROVIDER_DISPLAY_NAMES,
} from "@t3tools/contracts";

import { cn } from "../../lib/utils";
import { getWsRpcClient } from "../../wsRpcClient";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { toastManager } from "../ui/toast";

// ── Local helper components (mirrors SettingsPanels.tsx internals) ──────────

function SettingsSection({
  title,
  icon,
  headerAction,
  children,
}: {
  title: string;
  icon?: ReactNode;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {icon}
          {title}
        </h2>
        {headerAction}
      </div>
      <div className="relative overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xs/5 not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-border px-4 py-4 first:border-t-0 sm:px-5", className)}>
      {children}
    </div>
  );
}

function SettingsPageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">{children}</div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

// Per-provider state for MCP servers list
interface ProviderMcpState {
  servers: McpServer[];
  loading: boolean;
  // null means no error, string means an error message
  error: string | null;
  // Whether this provider supports MCP (codex and gemini do not yet)
  unsupported: boolean;
}

// Inline add/edit form state
interface McpFormState {
  name: string;
  transport: McpServerTransport;
  command: string;
  args: string; // comma-separated
  url: string;
}

const EMPTY_FORM: McpFormState = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  url: "",
};

// ── MCP Provider Accordion ───────────────────────────────────────────────────

function McpProviderSection({
  provider,
  state,
  onRefresh,
}: {
  provider: ProviderKind;
  state: ProviderMcpState;
  onRefresh: (provider: ProviderKind) => void;
}) {
  const [open, setOpen] = useState(false);
  // editingName = null means "add mode", string means "edit mode for that server"
  const [editingName, setEditingName] = useState<string | null | "add">(null);
  const [form, setForm] = useState<McpFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const displayName = PROVIDER_DISPLAY_NAMES[provider];

  function openAddForm() {
    setEditingName("add");
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function openEditForm(server: McpServer) {
    setEditingName(server.name);
    setForm({
      name: server.name,
      transport: server.transport,
      command: server.command ?? "",
      args: server.args ? server.args.join(", ") : "",
      url: server.url ?? "",
    });
    setFormError(null);
  }

  function cancelForm() {
    setEditingName(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (form.transport === "stdio" && !form.command.trim()) {
      setFormError("Command is required for stdio transport.");
      return;
    }
    if (form.transport === "sse" && !form.url.trim()) {
      setFormError("URL is required for SSE transport.");
      return;
    }

    const serverInput: McpServerInput = {
      transport: form.transport,
      ...(form.transport === "stdio"
        ? {
            command: form.command.trim(),
            args: form.args
              ? form.args
                  .split(",")
                  .map((a) => a.trim())
                  .filter(Boolean)
              : [],
          }
        : {
            url: form.url.trim(),
          }),
    };

    setSaving(true);
    setFormError(null);
    try {
      const client = getWsRpcClient();
      if (editingName === "add") {
        await client.mcp.addServer({ provider, name: form.name.trim(), server: serverInput });
      } else if (editingName !== null) {
        await client.mcp.updateServer({
          provider,
          name: editingName,
          patch: serverInput,
        });
      }
      cancelForm();
      onRefresh(provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setFormError(message);
      toastManager.add({ type: "error", title: "Failed to save MCP server", description: message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(serverName: string) {
    if (!window.confirm(`Delete MCP server "${serverName}"?`)) return;
    try {
      await getWsRpcClient().mcp.deleteServer({ provider, name: serverName });
      onRefresh(provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({
        type: "error",
        title: "Failed to delete MCP server",
        description: message,
      });
    }
  }

  return (
    <SettingsRow>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Provider header row */}
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-foreground">
            {open ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            )}
            {displayName}
            {state.loading && (
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </CollapsibleTrigger>

          {/* Only show Add button for supported providers */}
          {!state.unsupported && !state.loading && (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                if (!open) setOpen(true);
                openAddForm();
              }}
            >
              <PlusIcon className="size-3.5" />
              Add server
            </Button>
          )}
        </div>

        <CollapsiblePanel>
          <div className="mt-3 space-y-2">
            {/* Unsupported provider notice */}
            {state.unsupported && (
              <p className="text-xs text-muted-foreground">
                MCP configuration for this provider is not yet supported.
              </p>
            )}

            {/* Error state */}
            {!state.unsupported && state.error && (
              <p className="text-xs text-destructive">{state.error}</p>
            )}

            {/* Empty state */}
            {!state.unsupported && !state.loading && !state.error && state.servers.length === 0 && (
              <p className="text-xs text-muted-foreground">No MCP servers configured.</p>
            )}

            {/* Server list */}
            {!state.unsupported &&
              state.servers.map((server) => (
                <div
                  key={server.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{server.name}</span>
                      {/* Transport badge */}
                      <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                        {server.transport}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {server.transport === "stdio"
                        ? [server.command, ...(server.args ?? [])].filter(Boolean).join(" ")
                        : server.url}
                    </p>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Edit ${server.name}`}
                      onClick={() => openEditForm(server)}
                    >
                      <EditIcon className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Delete ${server.name}`}
                      className="text-destructive hover:text-destructive"
                      onClick={() => void handleDelete(server.name)}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

            {/* Inline add/edit form */}
            {!state.unsupported && editingName !== null && (
              <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
                <p className="text-xs font-medium text-foreground">
                  {editingName === "add" ? "Add MCP Server" : `Edit "${editingName}"`}
                </p>

                {/* Name field — only shown in add mode */}
                {editingName === "add" && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      size="sm"
                      placeholder="my-server"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                )}

                {/* Transport selector */}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Transport</label>
                  <Select
                    value={form.transport}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, transport: v as McpServerTransport }))
                    }
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="stdio">stdio</SelectItem>
                      <SelectItem value="sse">sse</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>

                {/* stdio fields */}
                {form.transport === "stdio" && (
                  <>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Command</label>
                      <Input
                        size="sm"
                        placeholder="npx"
                        value={form.command}
                        onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Args <span className="text-muted-foreground/60">(comma-separated)</span>
                      </label>
                      <Input
                        size="sm"
                        placeholder="-y, @modelcontextprotocol/server-filesystem, /path"
                        value={form.args}
                        onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {/* sse fields */}
                {form.transport === "sse" && (
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">URL</label>
                    <Input
                      size="sm"
                      placeholder="http://localhost:3000/sse"
                      value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                    />
                  </div>
                )}

                {formError && <p className="text-xs text-destructive">{formError}</p>}

                <div className="flex items-center gap-2">
                  <Button size="xs" onClick={() => void handleSave()} disabled={saving}>
                    {saving && <LoaderIcon className="size-3.5 animate-spin" />}
                    Save
                  </Button>
                  <Button size="xs" variant="ghost" onClick={cancelForm} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </SettingsRow>
  );
}

// ── Plugins Section ──────────────────────────────────────────────────────────

function PluginsSection() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [installing, setInstalling] = useState(false);

  // `disabledPlugins` is a client-only setting (part of UnifiedSettings via ClientSettings)
  // stored as an array of plugin locations. Reading the full settings object avoids the
  // generic constraint on useSettings which requires the selector to return UnifiedSettings.
  const settings = useSettings();
  const disabledPlugins = settings.disabledPlugins;
  const { updateSettings } = useUpdateSettings();

  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getWsRpcClient().plugins.list();
      setPlugins([...result]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);

  function isDisabled(plugin: PluginInfo) {
    return disabledPlugins.includes(plugin.location);
  }

  function togglePlugin(plugin: PluginInfo, enabled: boolean) {
    const next = enabled
      ? disabledPlugins.filter((loc) => loc !== plugin.location)
      : [...disabledPlugins, plugin.location];
    // Fire-and-forget settings update — routes to clientPatch automatically since
    // `disabledPlugins` is a client-only key in ClientSettings.
    updateSettings({ disabledPlugins: next });
  }

  async function handleDelete(plugin: PluginInfo) {
    if (!window.confirm(`Remove plugin "${plugin.name}"?`)) return;
    try {
      await getWsRpcClient().plugins.remove({ location: plugin.location });
      void fetchPlugins();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({ type: "error", title: "Failed to remove plugin", description: message });
    }
  }

  async function handleInstall() {
    if (!installSource.trim()) return;
    setInstalling(true);
    try {
      await getWsRpcClient().plugins.install({ source: installSource.trim() });
      setInstallSource("");
      void fetchPlugins();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({ type: "error", title: "Failed to install plugin", description: message });
    } finally {
      setInstalling(false);
    }
  }

  return (
    <SettingsSection title="Plugins" icon={<PackageIcon className="size-3.5" />}>
      {/* Description row */}
      <SettingsRow>
        <p className="text-xs text-muted-foreground">
          Claude Code plugins installed on this machine.
        </p>
      </SettingsRow>

      {/* Loading state */}
      {loading && (
        <SettingsRow>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderIcon className="size-4 animate-spin" />
            Loading plugins…
          </div>
        </SettingsRow>
      )}

      {/* Error state */}
      {!loading && loadError && (
        <SettingsRow>
          <p className="text-xs text-destructive">{loadError}</p>
        </SettingsRow>
      )}

      {/* Empty state */}
      {!loading && !loadError && plugins.length === 0 && (
        <SettingsRow>
          <p className="text-xs text-muted-foreground">No plugins installed.</p>
        </SettingsRow>
      )}

      {/* Plugin list */}
      {!loading &&
        plugins.map((plugin) => {
          const disabled = isDisabled(plugin);
          return (
            <SettingsRow key={plugin.location}>
              <div className="flex items-center gap-3">
                {/* Enable/disable toggle */}
                <Switch
                  checked={!disabled}
                  onCheckedChange={(checked) => togglePlugin(plugin, checked)}
                  aria-label={`${disabled ? "Enable" : "Disable"} ${plugin.name}`}
                />

                {/* Plugin info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{plugin.name}</span>
                    {plugin.version && plugin.version !== "unknown" && (
                      <span className="text-xs text-muted-foreground">{plugin.version}</span>
                    )}
                  </div>
                  {plugin.description && (
                    <p className="text-xs text-muted-foreground">{plugin.description}</p>
                  )}
                </div>

                {/* Delete button */}
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${plugin.name}`}
                  className="shrink-0 text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(plugin)}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            </SettingsRow>
          );
        })}

      {/* Install plugin row */}
      <SettingsRow>
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Install Plugin</p>
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              size="sm"
              placeholder="Local path or git URL"
              value={installSource}
              onChange={(e) => setInstallSource(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleInstall();
              }}
            />
            <Button
              size="sm"
              onClick={() => void handleInstall()}
              disabled={installing || !installSource.trim()}
            >
              {installing && <LoaderIcon className="size-3.5 animate-spin" />}
              Install
            </Button>
          </div>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}

// ── MCP Servers Section ──────────────────────────────────────────────────────

// Providers in the order we want to display them.
// Cast needed because some web-app types still derive ProviderKind from an older
// two-provider subset; the contracts have three providers.
const MCP_PROVIDERS = ["codex", "claudeAgent", "gemini"] as ProviderKind[];

// Providers that don't yet support MCP config — show a notice instead of the list
const UNSUPPORTED_MCP_PROVIDERS = new Set<string>(["codex", "gemini"]);

function McpServersSection() {
  const [providerState, setProviderState] = useState<Record<ProviderKind, ProviderMcpState>>(() => {
    const initial: Partial<Record<ProviderKind, ProviderMcpState>> = {};
    for (const p of MCP_PROVIDERS) {
      initial[p] = {
        servers: [],
        loading: true,
        error: null,
        unsupported: UNSUPPORTED_MCP_PROVIDERS.has(p),
      };
    }
    return initial as Record<ProviderKind, ProviderMcpState>;
  });

  const fetchProvider = useCallback(async (provider: ProviderKind) => {
    // Skip network call for unsupported providers — just mark as loaded
    if (UNSUPPORTED_MCP_PROVIDERS.has(provider)) {
      setProviderState((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], loading: false, unsupported: true },
      }));
      return;
    }

    setProviderState((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], loading: true, error: null },
    }));
    try {
      const servers = await getWsRpcClient().mcp.listServers({ provider });
      setProviderState((prev) => ({
        ...prev,
        [provider]: { servers: [...servers], loading: false, error: null, unsupported: false },
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProviderState((prev) => ({
        ...prev,
        [provider]: { servers: [], loading: false, error: message, unsupported: false },
      }));
    }
  }, []);

  useEffect(() => {
    // Fetch all providers in parallel on mount
    void Promise.all(MCP_PROVIDERS.map(fetchProvider));
  }, [fetchProvider]);

  return (
    <SettingsSection title="MCP Servers" icon={<ServerIcon className="size-3.5" />}>
      {/* Description row */}
      <SettingsRow>
        <p className="text-xs text-muted-foreground">
          Manage MCP servers for each provider. Changes are saved directly to each provider&apos;s
          configuration file.
        </p>
      </SettingsRow>

      {/* One accordion per provider */}
      {MCP_PROVIDERS.map((provider) => (
        <McpProviderSection
          key={provider}
          provider={provider}
          state={providerState[provider]}
          onRefresh={fetchProvider}
        />
      ))}
    </SettingsSection>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export function McpAndPluginsPanel() {
  return (
    <SettingsPageContainer>
      {/* Page header */}
      <div className="flex items-center gap-2">
        <PlugIcon className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">MCP &amp; Plugins</h1>
      </div>

      <McpServersSection />
      <PluginsSection />
    </SettingsPageContainer>
  );
}
