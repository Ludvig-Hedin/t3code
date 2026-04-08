/**
 * PluginDetailDialog — Modal for installing an integration on any provider.
 *
 * Design goals:
 * - Show per-provider install state (not a single boolean for the whole app)
 * - Group multiple integration types per provider (e.g. Figma on Codex has
 *   both a Plugin and an MCP Server entry)
 * - "Install" = one-click: copies the command to clipboard AND marks as
 *   installed in local state, so the flow is click → paste in terminal → done
 * - Config-only providers (Cursor, Gemini) show a JSON snippet to copy into
 *   the relevant config file instead of a shell command
 */
import { useMemo, useState } from "react";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, XIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import {
  INTEGRATION_TYPE_LABELS,
  PROVIDER_LABELS,
  type IntegrationType,
  type PluginCatalogItem,
  type PluginProvider,
  type ProviderInstruction,
} from "./pluginCatalog";
import { PluginIcon, ProviderLogo } from "./PluginIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PluginDetailDialogProps {
  item: PluginCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Returns true if this provider is marked installed for the current item. */
  isProviderInstalled: (provider: PluginProvider) => boolean;
  /** Mark a provider as installed for the current item. */
  onMarkInstalled: (provider: PluginProvider) => void;
  /** Unmark a provider as installed. */
  onMarkUninstalled: (provider: PluginProvider) => void;
}

// ---------------------------------------------------------------------------
// IntegrationTypeBadge — "MCP Server" / "Plugin" / "Extension" pill
// ---------------------------------------------------------------------------

function IntegrationTypeBadge({ type }: { type: IntegrationType }) {
  const colors: Record<IntegrationType, string> = {
    mcp: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    plugin: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    extension: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide",
        colors[type],
      )}
    >
      {INTEGRATION_TYPE_LABELS[type]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// InstructionRow — one integration (plugin / mcp / extension) within a provider
// ---------------------------------------------------------------------------

interface InstructionRowProps {
  instr: ProviderInstruction;
  /** Key to detect which row just had its content copied. */
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
  /** Installs = copies text + marks provider installed. */
  onInstall: (instr: ProviderInstruction) => void;
  installed: boolean;
  onUninstall: () => void;
}

function InstructionRow({
  instr,
  copiedKey,
  onCopy,
  onInstall,
  installed,
  onUninstall,
}: InstructionRowProps) {
  const rowKey = `${instr.provider}:${instr.integrationType}`;
  const justCopied = copiedKey === rowKey;
  const copyText = instr.cliCommand ?? instr.configSnippet ?? null;

  return (
    <div className="space-y-2.5">
      {/* Type badge + install status */}
      <div className="flex items-center gap-2">
        <IntegrationTypeBadge type={instr.integrationType} />
        {installed && (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
            <CheckIcon className="size-3" />
            Installed
          </span>
        )}
      </div>

      {/* Command or config snippet */}
      {instr.cliCommand && (
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-3 py-1.5 text-xs font-mono text-foreground">
            {instr.cliCommand}
          </code>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onCopy(rowKey, instr.cliCommand!)}
            aria-label="Copy command"
            title="Copy to clipboard"
          >
            {justCopied ? (
              <CheckIcon className="size-3.5 text-green-500" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
          </Button>
        </div>
      )}

      {instr.configSnippet && !instr.cliCommand && (
        <div className="space-y-1.5">
          {instr.cliLabel && <p className="text-xs text-muted-foreground">{instr.cliLabel}</p>}
          <div className="relative">
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs font-mono text-foreground leading-relaxed max-h-40">
              {instr.configSnippet}
            </pre>
            <Button
              size="icon-sm"
              variant="ghost"
              className="absolute right-1.5 top-1.5"
              onClick={() => onCopy(rowKey, instr.configSnippet!)}
              aria-label="Copy config"
              title="Copy config snippet"
            >
              {justCopied ? (
                <CheckIcon className="size-3.5 text-green-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {!instr.cliCommand && !instr.configSnippet && (
        <p className="text-xs text-muted-foreground">
          Follow the provider documentation to complete setup.
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {copyText ? (
          installed ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground gap-1.5 h-7 text-xs"
              onClick={onUninstall}
            >
              <XIcon className="size-3.5" />
              Unmark installed
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => onInstall(instr)}
              title="Copy command and mark as installed"
            >
              <DownloadIcon className="size-3.5" />
              {instr.configSnippet && !instr.cliCommand ? "Copy Config & Install" : "Install"}
            </Button>
          )
        ) : (
          <a href={instr.docsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
              <ExternalLinkIcon className="size-3.5" />
              View Setup Guide
            </Button>
          </a>
        )}

        {copyText && (
          <a
            href={instr.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
            <ExternalLinkIcon className="size-3" />
          </a>
        )}

        {justCopied && (
          <span className="text-xs text-green-600 dark:text-green-400">
            {/* Config-only snippets go into a config file, not the terminal. */}✓ Copied!{" "}
            {instr.configSnippet && !instr.cliCommand
              ? "Paste into your config file."
              : "Paste in your terminal to install."}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PluginDetailDialog
// ---------------------------------------------------------------------------

export function PluginDetailDialog({
  item,
  open,
  onOpenChange,
  isProviderInstalled,
  onMarkInstalled,
  onMarkUninstalled,
}: PluginDetailDialogProps) {
  // Key = "provider:integrationType" of most-recently copied instruction
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function handleCopy(key: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  }

  function handleInstall(instr: ProviderInstruction) {
    const text = instr.cliCommand ?? instr.configSnippet;
    if (text) void navigator.clipboard.writeText(text);
    const key = `${instr.provider}:${instr.integrationType}`;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
    // Optimistically mark the whole provider as installed
    onMarkInstalled(instr.provider);
  }

  // Group instructions by provider so multiple integration types (e.g.
  // Figma's Plugin + MCP Server on Codex) are rendered together.
  const byProvider = useMemo(() => {
    if (!item) return [];
    const map = new Map<PluginProvider, ProviderInstruction[]>();
    for (const instr of item.instructions) {
      if (!map.has(instr.provider)) map.set(instr.provider, []);
      map.get(instr.provider)!.push(instr);
    }
    return [...map.entries()];
  }, [item]);

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl" showCloseButton>
        {/* Header — icon + name + description */}
        <DialogHeader>
          <div className="flex items-center gap-4">
            <PluginIcon item={item} className="size-12 shrink-0" />
            <div className="min-w-0">
              <DialogTitle>{item.name}</DialogTitle>
              <DialogDescription className="mt-0.5 line-clamp-2">
                {item.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body — one section per provider */}
        <DialogPanel>
          <div className="space-y-4">
            {byProvider.map(([provider, instrs]) => {
              const installed = isProviderInstalled(provider);
              return (
                <div
                  key={provider}
                  className={cn(
                    "rounded-xl border p-4 space-y-4 transition-colors",
                    installed ? "border-green-500/30 bg-green-500/5" : "border-border",
                  )}
                >
                  {/* Provider header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ProviderLogo provider={provider} className="size-5" />
                      <span className="text-sm font-medium text-foreground">
                        {PROVIDER_LABELS[provider]}
                      </span>
                    </div>
                    {installed && (
                      <Badge variant="success" className="text-xs">
                        Installed
                      </Badge>
                    )}
                  </div>

                  {/* One row per integration type */}
                  <div className="space-y-4 divide-y divide-border/60">
                    {instrs.map((instr, idx) => (
                      <div key={instr.integrationType} className={idx > 0 ? "pt-4" : ""}>
                        <InstructionRow
                          instr={instr}
                          copiedKey={copiedKey}
                          onCopy={handleCopy}
                          onInstall={handleInstall}
                          installed={installed}
                          onUninstall={() => onMarkUninstalled(provider)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button size="sm" variant="ghost" />}>Close</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
