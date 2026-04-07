/**
 * PluginIcon — Brand icon for a plugin catalog item.
 *
 * Load cascade:
 *   1. item.iconUrl (explicit override, e.g. Wikimedia SVGs for Google products)
 *   2. Google Favicon API  (https://www.google.com/s2/favicons?domain=…&sz=64)
 *   3. Colored initial tile (item.fallbackColor + item.fallbackInitial ?? name[0])
 *
 * ProviderLogo — Same approach but for AI provider pills and dialog rows.
 * Uses PROVIDER_DOMAINS to map provider id → favicon domain.
 */
import { useState } from "react";

import { cn } from "~/lib/utils";
import {
  PROVIDER_DOMAINS,
  PROVIDER_LABELS,
  type PluginCatalogItem,
  type PluginProvider,
} from "./pluginCatalog";

// ---------------------------------------------------------------------------
// PluginIcon
// ---------------------------------------------------------------------------

interface PluginIconProps {
  item: PluginCatalogItem;
  /** Override size. Defaults to "size-10". */
  className?: string;
}

export function PluginIcon({ item, className }: PluginIconProps) {
  // phase 0 = try iconUrl (if any), phase 1 = try favicon API, phase 2 = fallback tile
  const [phase, setPhase] = useState<0 | 1 | 2>(item.iconUrl ? 0 : 1);

  const sizeClass = className ?? "size-10";

  if (phase === 2) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white text-sm",
          sizeClass,
          item.fallbackColor,
        )}
      >
        {item.fallbackInitial ?? item.name[0]}
      </div>
    );
  }

  const src =
    phase === 0 && item.iconUrl
      ? item.iconUrl
      : `https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`;

  return (
    <img
      src={src}
      alt={item.name}
      // bg-white + p-1 ensures transparent/dark favicons look clean on dark surface
      className={cn("shrink-0 rounded-lg object-contain bg-white p-1", sizeClass)}
      onError={() => setPhase((prev) => (prev < 2 ? ((prev + 1) as 1 | 2) : 2))}
    />
  );
}

// ---------------------------------------------------------------------------
// ProviderLogo — small logo for AI provider filter pills and dialog rows
// ---------------------------------------------------------------------------

interface ProviderLogoProps {
  provider: PluginProvider;
  /** Override size. Defaults to "size-4". */
  className?: string;
}

export function ProviderLogo({ provider, className }: ProviderLogoProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = className ?? "size-4";

  if (failed) {
    // Minimal grey fallback when favicon is unavailable
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground font-medium",
          sizeClass,
        )}
        style={{ fontSize: "0.5rem" }}
      >
        {PROVIDER_LABELS[provider][0]}
      </div>
    );
  }

  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${PROVIDER_DOMAINS[provider]}&sz=32`}
      alt={PROVIDER_LABELS[provider]}
      className={cn("shrink-0 rounded object-contain bg-white p-px", sizeClass)}
      onError={() => setFailed(true)}
    />
  );
}
