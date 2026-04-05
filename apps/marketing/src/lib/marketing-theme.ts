/** Persisted theme for marketing pages — mirrors apps/web light/dark intent (class on <html>). */
export type MarketingThemeMode = "light" | "dark" | "system";

export const MARKETING_THEME_STORAGE_KEY = "birdcode-marketing-theme";

export function getStoredThemeMode(): MarketingThemeMode {
  if (typeof window === "undefined") return "system";
  const v = localStorage.getItem(MARKETING_THEME_STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function resolveDarkClass(mode: MarketingThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeMode(mode: MarketingThemeMode): void {
  document.documentElement.classList.toggle("dark", resolveDarkClass(mode));
}
