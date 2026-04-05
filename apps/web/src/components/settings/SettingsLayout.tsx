/**
 * Shared layout primitives for settings panels.
 *
 * Extracted here to avoid duplicating the same structural components across
 * SettingsPanels.tsx (main settings) and McpAndPluginsPanel.tsx (MCP / plugins).
 */

import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * A titled section card with an optional icon and header action button.
 * Used as the top-level grouping container inside a settings page.
 */
export function SettingsSection({
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

/**
 * A simple bordered row inside a SettingsSection.
 *
 * This is the lightweight variant (children + optional className).
 * SettingsPanels.tsx uses a richer variant (SettingsSettingRow) that accepts
 * named title/description/control props — that variant lives locally there.
 */
export function SettingsRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-border px-4 py-4 first:border-t-0 sm:px-5", className)}>
      {children}
    </div>
  );
}

/**
 * Outer scrollable page wrapper for a settings panel.
 * Centers content and constrains max width.
 */
export function SettingsPageContainer({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">{children}</div>
    </div>
  );
}
