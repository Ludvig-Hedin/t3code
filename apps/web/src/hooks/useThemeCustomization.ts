/**
 * useThemeCustomization
 *
 * Reads per-theme color, font, and size customizations from client settings
 * and injects them as CSS custom properties on :root in real-time.
 *
 * Called once at app root level — provides live preview of appearance settings
 * across the whole app without requiring a page reload.
 */
import { useEffect } from "react";
import { useSettings } from "./useSettings";
import { useTheme } from "./useTheme";

// ── Preset definitions ────────────────────────────────────────────────────────

export type ThemePreset = {
  label: string;
  accentLight: string;
  accentDark: string;
  bgLight?: string;
  bgDark?: string;
  fgLight?: string;
  fgDark?: string;
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    label: "Default",
    accentLight: "",
    accentDark: "",
    bgLight: "",
    bgDark: "",
    fgLight: "",
    fgDark: "",
  },
  {
    label: "Ocean Blue",
    accentLight: "oklch(0.488 0.217 264)",
    accentDark: "oklch(0.588 0.217 264)",
  },
  {
    label: "Forest Green",
    accentLight: "oklch(0.55 0.18 145)",
    accentDark: "oklch(0.65 0.18 145)",
  },
  {
    label: "Warm Amber",
    accentLight: "oklch(0.68 0.18 70)",
    accentDark: "oklch(0.75 0.18 70)",
  },
  {
    label: "Rose",
    accentLight: "oklch(0.60 0.22 10)",
    accentDark: "oklch(0.68 0.22 10)",
  },
  {
    label: "Violet",
    accentLight: "oklch(0.55 0.25 295)",
    accentDark: "oklch(0.65 0.25 295)",
  },
];

// ── Font options ──────────────────────────────────────────────────────────────

export const UI_FONT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "System default" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: "SF Pro" },
  { value: "Geist, sans-serif", label: "Geist" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
];

export const CODE_FONT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "System default" },
  { value: "Menlo, Monaco, monospace", label: "Menlo" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'SF Mono', monospace", label: "SF Mono" },
  { value: "Consolas, monospace", label: "Consolas" },
];

// ── CSS variable helpers ──────────────────────────────────────────────────────

/**
 * Applies or removes a CSS custom property on :root.
 * Passing an empty string removes the override so the base theme value applies.
 */
function applyVar(name: string, value: string) {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  } else {
    document.documentElement.style.removeProperty(name);
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useThemeCustomization() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const settings = useSettings();

  useEffect(() => {
    // Font sizes — only override when different from hardcoded defaults (14/13)
    applyVar("--t3-ui-font-size", settings.uiFontSize !== 14 ? `${settings.uiFontSize}px` : "");
    applyVar(
      "--t3-code-font-size",
      settings.codeFontSize !== 13 ? `${settings.codeFontSize}px` : "",
    );

    // Font families
    applyVar("--t3-ui-font", settings.uiFont);
    applyVar("--t3-code-font", settings.codeFont);

    // Pointer cursors — toggles a class on <html> that enables cursor:pointer on interactive elements
    document.documentElement.classList.toggle("pointer-cursors", settings.usePointerCursors);

    // Theme colors — use light or dark value based on resolved theme
    applyVar("--primary", isDark ? settings.themeAccentColorDark : settings.themeAccentColor);
    applyVar("--ring", isDark ? settings.themeAccentColorDark : settings.themeAccentColor);
    applyVar(
      "--background",
      isDark ? settings.themeBackgroundColorDark : settings.themeBackgroundColor,
    );
    applyVar(
      "--foreground",
      isDark ? settings.themeForegroundColorDark : settings.themeForegroundColor,
    );
  }, [settings, isDark]);
}
