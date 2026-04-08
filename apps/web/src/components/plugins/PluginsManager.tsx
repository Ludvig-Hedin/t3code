/**
 * PluginsManager — "Make Bird Code work your way" catalog page.
 *
 * Install state is tracked per-provider per-item using a Set of
 * "{itemId}:{provider}" keys (e.g. "figma:claude", "github:cursor").
 * Clicking "Install" in the detail dialog copies the command to clipboard
 * and marks that provider as installed in one action.
 *
 * State can be migrated to Zustand + localStorage in a follow-up.
 */
import { useCallback, useMemo, useState } from "react";
import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react";

import { badgeVariants } from "~/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

import {
  PLUGIN_CATALOG,
  SECTION_ORDER,
  type PluginCatalogItem,
  type PluginProvider,
} from "./pluginCatalog";
import { PluginDetailDialog } from "./PluginDetailDialog";
import { PluginIcon, ProviderLogo } from "./PluginIcon";

// ---------------------------------------------------------------------------
// Provider filter pills data
// ---------------------------------------------------------------------------

const PROVIDERS: { id: PluginProvider | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "codex", label: "Codex" },
  { id: "claude", label: "Claude" },
  { id: "opencode", label: "OpenCode" },
  { id: "cursor", label: "Cursor" },
  { id: "gemini", label: "Gemini" },
  { id: "ollama", label: "Ollama" },
];

// ---------------------------------------------------------------------------
// Install state helpers
// ---------------------------------------------------------------------------

/** State key combining item id and provider: "figma:claude" */
type InstalledKey = `${string}:${PluginProvider}`;

function makeKey(itemId: string, provider: PluginProvider): InstalledKey {
  return `${itemId}:${provider}` as InstalledKey;
}

// ---------------------------------------------------------------------------
// PluginCard — individual catalog card
// ---------------------------------------------------------------------------

interface PluginCardProps {
  item: PluginCatalogItem;
  installedProviders: PluginProvider[];
  onOpen: (item: PluginCatalogItem) => void;
}

function PluginCard({ item, installedProviders, onOpen }: PluginCardProps) {
  const anyInstalled = installedProviders.length > 0;

  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border p-4 text-left hover:bg-accent/30 transition-colors group"
      onClick={() => onOpen(item)}
    >
      {/* Brand icon */}
      <PluginIcon item={item} className="size-10 shrink-0 mt-0.5" />

      {/* Name + description + installed badges */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 leading-tight">
          <p className="text-sm font-medium text-foreground">{item.name}</p>
          {item.status === "coming-soon" && (
            <span
              className={cn(
                badgeVariants({ variant: "outline" }),
                "text-[0.6rem] px-1 py-0 border-dashed text-muted-foreground shrink-0",
              )}
            >
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-snug">
          {item.description}
        </p>

        {/* Show installed provider logos when at least one is installed */}
        {anyInstalled && (
          <div className="mt-1.5 flex items-center gap-1">
            {installedProviders.map((p) => (
              <ProviderLogo key={p} provider={p} className="size-3.5" />
            ))}
            <span className="text-[0.625rem] text-green-600 dark:text-green-400 font-medium ml-0.5">
              {installedProviders.length === 1
                ? "1 provider"
                : `${installedProviders.length} providers`}
            </span>
          </div>
        )}
      </div>

      {/* Action affordance — hide the plus/check for coming-soon items */}
      <div className="shrink-0 mt-0.5">
        {item.status === "coming-soon" ? null : anyInstalled ? (
          <CheckIcon className="size-4 text-green-500" />
        ) : (
          <PlusIcon className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PluginsManager — exported page component
// ---------------------------------------------------------------------------

export function PluginsManager() {
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState<PluginProvider | "all">("all");

  // Per-provider install state. Key = "itemId:provider".
  const [installedKeys, setInstalledKeys] = useState<Set<InstalledKey>>(new Set());

  const [selectedItem, setSelectedItem] = useState<PluginCatalogItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Derived: items passing search + provider filter
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return PLUGIN_CATALOG.filter((item) => {
      const matchesSearch =
        !q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      const matchesProvider = activeProvider === "all" || item.providers.includes(activeProvider);
      return matchesSearch && matchesProvider;
    });
  }, [search, activeProvider]);

  // Derived: sections with visible items only
  const sections = useMemo(
    () =>
      SECTION_ORDER.map(({ key, label }) => ({
        key,
        label,
        items: filteredItems.filter((i) => i.category === key),
      })).filter((s) => s.items.length > 0),
    [filteredItems],
  );

  // Which providers are marked installed for a given item
  const getInstalledProviders = useCallback(
    (itemId: string): PluginProvider[] => {
      return (PLUGIN_CATALOG.find((i) => i.id === itemId)?.providers ?? []).filter((p) =>
        installedKeys.has(makeKey(itemId, p)),
      );
    },
    [installedKeys],
  );

  // Dialog install-state helpers (closed over selectedItem.id)
  const isProviderInstalled = useCallback(
    (provider: PluginProvider) =>
      selectedItem ? installedKeys.has(makeKey(selectedItem.id, provider)) : false,
    [installedKeys, selectedItem],
  );

  const markInstalled = useCallback(
    (provider: PluginProvider) => {
      if (!selectedItem) return;
      setInstalledKeys((prev) => new Set([...prev, makeKey(selectedItem.id, provider)]));
    },
    [selectedItem],
  );

  const markUninstalled = useCallback(
    (provider: PluginProvider) => {
      if (!selectedItem) return;
      setInstalledKeys((prev) => {
        const next = new Set(prev);
        next.delete(makeKey(selectedItem.id, provider));
        return next;
      });
    },
    [selectedItem],
  );

  function openDetail(item: PluginCatalogItem) {
    setSelectedItem(item);
    setDialogOpen(true);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-6 pt-4">
      {/* ------------------------------------------------------------------ */}
      {/* Hero                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="pb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Make Bird Code work your way
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your tools — browse MCP servers, plugins, and extensions across all AI providers.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sticky toolbar: search + provider filter pills                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background/90 py-3 backdrop-blur-sm">
        <InputGroup>
          <InputGroupAddon align="inline-start">
            <SearchIcon className="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search apps & integrations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>

        {/* Provider pills with logos */}
        <div className="flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProvider(p.id)}
              className={cn(
                badgeVariants({
                  variant: p.id === activeProvider ? "secondary" : "outline",
                }),
                "flex cursor-pointer items-center gap-1.5",
              )}
            >
              {p.id !== "all" && (
                <ProviderLogo provider={p.id as PluginProvider} className="size-3.5" />
              )}
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Catalog                                                             */}
      {/* ------------------------------------------------------------------ */}
      <ScrollArea className="flex-1">
        <div className="space-y-10 py-6">
          {sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-sm text-muted-foreground">No integrations match your search.</p>
              {search && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                  onClick={() => setSearch("")}
                >
                  Clear search
                </button>
              )}
            </div>
          )}

          {sections.map((section) => (
            <section key={section.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
                {section.label}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <PluginCard
                    key={item.id}
                    item={item}
                    installedProviders={getInstalledProviders(item.id)}
                    onOpen={openDetail}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* Footer browse links */}
          <div className="border-t border-border pt-4 pb-2 text-center">
            <p className="text-xs text-muted-foreground/60">
              Discover more at the{" "}
              <a
                href="https://github.com/modelcontextprotocol/servers"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-muted-foreground transition-colors"
              >
                MCP server registry
              </a>
              {", "}
              <a
                href="https://cursor.com/marketplace"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-muted-foreground transition-colors"
              >
                Cursor marketplace
              </a>
              {", or "}
              <a
                href="https://developers.openai.com/codex/plugins"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-muted-foreground transition-colors"
              >
                Codex plugins
              </a>
              .
            </p>
          </div>
        </div>
      </ScrollArea>

      {/* Detail dialog — outside ScrollArea to avoid z-index issues */}
      <PluginDetailDialog
        item={selectedItem}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isProviderInstalled={isProviderInstalled}
        onMarkInstalled={markInstalled}
        onMarkUninstalled={markUninstalled}
      />
    </div>
  );
}
