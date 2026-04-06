# Settings Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the settings page into dedicated tabs (Appearance, Providers, Git & Code Review, Notifications, Personalization), reorganize the General tab into focused cards, and add a rich set of new settings including theme customization with live preview, font sizing, default provider, notifications, and personalization with agent instruction file editing.

**Architecture:** New settings fields are added to `ClientSettings` (localStorage) and `ServerSettings` (server-persisted). New tab panels are added as named exports in `SettingsPanels.tsx`. New route files follow the existing pattern. A `useThemeCustomization` hook applies custom CSS variables to `:root` in real-time. The existing `usePreferredEditor` localStorage key is surfaced as a user-facing selector in General settings.

**Tech Stack:** React, TanStack Router, Tailwind CSS v4, Effect Schema, `useSettings`/`useUpdateSettings` hooks, existing `SettingsSection`/`SettingsRow`/`SettingsPanels` primitives.

---

## File Map

**Modified:**

- `packages/contracts/src/settings.ts` — new ClientSettings + ServerSettings fields
- `apps/web/src/components/settings/SettingsSidebarNav.tsx` — new nav items
- `apps/web/src/components/settings/SettingsPanels.tsx` — refactor GeneralSettingsPanel + add new panel exports
- `apps/web/src/routes/settings.tsx` — keep redirect to /settings/general

**Created:**

- `apps/web/src/routes/settings.appearance.tsx`
- `apps/web/src/routes/settings.providers.tsx`
- `apps/web/src/routes/settings.git.tsx`
- `apps/web/src/routes/settings.notifications.tsx`
- `apps/web/src/routes/settings.personalization.tsx`
- `apps/web/src/hooks/useThemeCustomization.ts`

---

### Task 1: Extend settings contracts

**Files:**

- Modify: `packages/contracts/src/settings.ts`

- [ ] **Step 1: Add new ClientSettings fields**

Open `packages/contracts/src/settings.ts`. After the `disabledPlugins` field in `ClientSettingsSchema`, add:

```typescript
// Appearance
usePointerCursors: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
uiFontSize: Schema.Number.pipe(Schema.withDecodingDefault(() => 14)),
codeFontSize: Schema.Number.pipe(Schema.withDecodingDefault(() => 13)),
uiFont: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
codeFont: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeAccentColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeAccentColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeBackgroundColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeBackgroundColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeForegroundColor: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
themeForegroundColorDark: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
// Notifications
turnCompletionNotifications: Schema.Literals(["always", "never", "unfocused"]).pipe(
  Schema.withDecodingDefault(() => "unfocused" as const),
),
enablePermissionNotifications: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
enableQuestionNotifications: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
// Personalization
customInstructions: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
// Default provider
defaultProvider: Schema.Union(
  Schema.Literal("use-latest"),
  Schema.Literal("codex"),
  Schema.Literal("claudeAgent"),
  Schema.Literal("gemini"),
).pipe(Schema.withDecodingDefault(() => "use-latest" as const)),
```

- [ ] **Step 2: Export new type aliases**

After the `ClientSettings` type export, add:

```typescript
export type TurnCompletionNotifications = "always" | "never" | "unfocused";
export type DefaultProvider = "use-latest" | "codex" | "claudeAgent" | "gemini";
```

- [ ] **Step 3: Add commitInstructions to ServerSettings**

In `ServerSettings` Schema.Struct, add:

```typescript
commitInstructions: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
```

In `ServerSettingsPatch`, add:

```typescript
commitInstructions: Schema.optionalKey(Schema.String),
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -40
```

Expected: no new errors (there may be pre-existing errors unrelated to our changes).

- [ ] **Step 5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add packages/contracts/src/settings.ts
git commit -m "feat(contracts): add appearance, notifications, personalization, and defaultProvider settings fields"
```

---

### Task 2: useThemeCustomization hook

**Files:**

- Create: `apps/web/src/hooks/useThemeCustomization.ts`

- [ ] **Step 1: Create the hook**

```typescript
/**
 * useThemeCustomization
 *
 * Reads per-theme color, font, and size customizations from client settings
 * and injects them as CSS custom properties on :root in real-time.
 *
 * Called once at app root level — provides live preview across the whole app.
 */
import { useEffect } from "react";
import { useSettings } from "./useSettings";
import { useTheme } from "./useTheme";

// Preset definitions — each preset provides light and dark values
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

export const UI_FONT_OPTIONS = [
  { value: "", label: "System default" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: "SF Pro" },
  { value: "Geist, sans-serif", label: "Geist" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
];

export const CODE_FONT_OPTIONS = [
  { value: "", label: "System default" },
  { value: "Menlo, Monaco, monospace", label: "Menlo" },
  { value: "'Fira Code', monospace", label: "Fira Code" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'SF Mono', monospace", label: "SF Mono" },
  { value: "Consolas, monospace", label: "Consolas" },
];

/**
 * Applies or removes a CSS variable on :root.
 * If value is empty string, removes the custom property so the base theme value takes over.
 */
function applyVar(name: string, value: string) {
  if (value) {
    document.documentElement.style.setProperty(name, value);
  } else {
    document.documentElement.style.removeProperty(name);
  }
}

export function useThemeCustomization() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const settings = useSettings((s) => ({
    uiFontSize: s.uiFontSize,
    codeFontSize: s.codeFontSize,
    uiFont: s.uiFont,
    codeFont: s.codeFont,
    usePointerCursors: s.usePointerCursors,
    themeAccentColor: s.themeAccentColor,
    themeAccentColorDark: s.themeAccentColorDark,
    themeBackgroundColor: s.themeBackgroundColor,
    themeBackgroundColorDark: s.themeBackgroundColorDark,
    themeForegroundColor: s.themeForegroundColor,
    themeForegroundColorDark: s.themeForegroundColorDark,
  }));

  useEffect(() => {
    // Font sizes
    applyVar("--t3-ui-font-size", settings.uiFontSize !== 14 ? `${settings.uiFontSize}px` : "");
    applyVar(
      "--t3-code-font-size",
      settings.codeFontSize !== 13 ? `${settings.codeFontSize}px` : "",
    );

    // Font families
    applyVar("--t3-ui-font", settings.uiFont);
    applyVar("--t3-code-font", settings.codeFont);

    // Pointer cursors
    document.documentElement.classList.toggle("pointer-cursors", settings.usePointerCursors);

    // Theme colors — apply the correct light/dark value
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
  }, [
    settings.uiFontSize,
    settings.codeFontSize,
    settings.uiFont,
    settings.codeFont,
    settings.usePointerCursors,
    settings.themeAccentColor,
    settings.themeAccentColorDark,
    settings.themeBackgroundColor,
    settings.themeBackgroundColorDark,
    settings.themeForegroundColor,
    settings.themeForegroundColorDark,
    isDark,
  ]);
}
```

- [ ] **Step 2: Add CSS for custom vars and pointer-cursors in index.css**

In `apps/web/src/index.css`, after the `.no-transitions` block, add:

```css
/* Custom font size / family from user settings */
:root {
  font-size: var(--t3-ui-font-size, 14px);
  font-family: var(--t3-ui-font, inherit);
}

/* Code font applied to code/pre elements */
code,
pre,
kbd,
samp {
  font-family: var(--t3-code-font, inherit);
  font-size: var(--t3-code-font-size, 13px);
}

/* Pointer cursor mode */
.pointer-cursors button,
.pointer-cursors [role="button"],
.pointer-cursors a,
.pointer-cursors label,
.pointer-cursors select,
.pointer-cursors [role="checkbox"],
.pointer-cursors [role="switch"],
.pointer-cursors [role="radio"],
.pointer-cursors [role="tab"],
.pointer-cursors [role="option"],
.pointer-cursors [role="menuitem"] {
  cursor: pointer !important;
}
```

- [ ] **Step 3: Mount the hook in App root**

Find the top-level App component. Run:

```bash
grep -r "useTheme\b" apps/web/src --include="*.tsx" -l | head -5
grep -r "function App\b\|export default function\|createRootRoute\|RouterProvider" apps/web/src --include="*.tsx" -l | head -5
```

Then add `useThemeCustomization()` call in the root component (alongside existing `useTheme` call if any).

- [ ] **Step 4: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/hooks/useThemeCustomization.ts apps/web/src/index.css
git commit -m "feat: add useThemeCustomization hook for live CSS variable injection"
```

---

### Task 3: Add new route files

**Files:**

- Create: `apps/web/src/routes/settings.appearance.tsx`
- Create: `apps/web/src/routes/settings.providers.tsx`
- Create: `apps/web/src/routes/settings.git.tsx`
- Create: `apps/web/src/routes/settings.notifications.tsx`
- Create: `apps/web/src/routes/settings.personalization.tsx`

- [ ] **Step 1: Create all 5 route files**

`apps/web/src/routes/settings.appearance.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/appearance")({
  component: AppearanceSettingsPanel,
});
```

`apps/web/src/routes/settings.providers.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { ProvidersSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/providers")({
  component: ProvidersSettingsPanel,
});
```

`apps/web/src/routes/settings.git.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { GitSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/git")({
  component: GitSettingsPanel,
});
```

`apps/web/src/routes/settings.notifications.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { NotificationsSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationsSettingsPanel,
});
```

`apps/web/src/routes/settings.personalization.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { PersonalizationSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/personalization")({
  component: PersonalizationSettingsPanel,
});
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/routes/settings.appearance.tsx apps/web/src/routes/settings.providers.tsx apps/web/src/routes/settings.git.tsx apps/web/src/routes/settings.notifications.tsx apps/web/src/routes/settings.personalization.tsx
git commit -m "feat: add route files for new settings tabs"
```

---

### Task 4: Update SettingsSidebarNav

**Files:**

- Modify: `apps/web/src/components/settings/SettingsSidebarNav.tsx`

- [ ] **Step 1: Update nav items and type**

Replace the file contents with:

```typescript
import type { ComponentType } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BellIcon,
  CodeIcon,
  GitBranchIcon,
  PaletteIcon,
  PlugIcon,
  QrCodeIcon,
  Settings2Icon,
  UserIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "../ui/sidebar";

export type SettingsSectionPath =
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/providers"
  | "/settings/git"
  | "/settings/notifications"
  | "/settings/personalization"
  | "/settings/mobile"
  | "/settings/mcp"
  | "/settings/archived";

export const SETTINGS_NAV_ITEMS: ReadonlyArray<{
  label: string;
  to: SettingsSectionPath;
  icon: ComponentType<{ className?: string }>;
}> = [
  { label: "General", to: "/settings/general", icon: Settings2Icon },
  { label: "Appearance", to: "/settings/appearance", icon: PaletteIcon },
  { label: "Providers", to: "/settings/providers", icon: CodeIcon },
  { label: "Git & Code Review", to: "/settings/git", icon: GitBranchIcon },
  { label: "Notifications", to: "/settings/notifications", icon: BellIcon },
  { label: "Personalization", to: "/settings/personalization", icon: UserIcon },
  { label: "Mobile", to: "/settings/mobile", icon: QrCodeIcon },
  { label: "MCP & Plugins", to: "/settings/mcp", icon: PlugIcon },
  { label: "Archive", to: "/settings/archived", icon: ArchiveIcon },
];

export function SettingsSidebarNav({ pathname }: { pathname: string }) {
  const navigate = useNavigate();

  return (
    <>
      <SidebarContent className="overflow-x-hidden">
        <SidebarGroup className="px-2 py-3">
          <SidebarMenu>
            {SETTINGS_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.to;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    size="sm"
                    isActive={isActive}
                    className={
                      isActive
                        ? "gap-2 px-2 py-2 text-left text-xs text-foreground"
                        : "gap-2 px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground/80"
                    }
                    onClick={() => void navigate({ to: item.to, replace: true })}
                  >
                    <Icon
                      className={
                        isActive
                          ? "size-4 shrink-0 text-foreground"
                          : "size-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <span className="truncate">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />
      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="sm"
              className="gap-2 px-2 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => window.history.back()}
            >
              <ArrowLeftIcon className="size-4" />
              <span>Back</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsSidebarNav.tsx
git commit -m "feat: add new settings tabs to sidebar nav"
```

---

### Task 5: Refactor GeneralSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

The General tab currently has a single large "General" SettingsSection with 9 rows, plus Providers, Code Review, Advanced, About sections. We need to:

1. Remove Theme row (→ Appearance tab)
2. Remove Text generation model row (→ Git tab)
3. Remove Providers section (→ Providers tab)
4. Remove Code Review section (→ Git tab)
5. Add Default open destination + Default provider rows (new "Defaults" section)
6. Reorganize remaining rows into focused smaller sections: "Behavior", "Display", "Confirmations"

- [ ] **Step 1: Add imports for new hooks at top of SettingsPanels.tsx**

Add to the existing imports:

- `usePreferredEditor` from `"../../editorPreferences"`
- `EDITORS` from `"@t3tools/contracts"`

- [ ] **Step 2: Replace the GeneralSettingsPanel function**

The `GeneralSettingsPanel` function currently starts at line ~500. Replace the entire function (everything from `export function GeneralSettingsPanel()` through the closing `}` that ends the function, before `export function ArchivedThreadsPanel`) with the new version below. Keep all helper functions and constants above it.

The new `GeneralSettingsPanel` should have these sections:

- **"Defaults"** card: Default open destination (editor picker), Default provider
- **"Chat"** card: Enter key behavior, Assistant output, New threads mode
- **"Display"** card: Time format, Diff line wrapping
- **"Confirmations"** card: Archive confirmation, Delete confirmation
- **"Advanced"** card: Keybindings
- **"About"** card: Version, Diagnostics

Write the full function with all rows using the existing `SettingsRow`, `SettingResetButton`, `Select`, `Switch` components exactly as used elsewhere in the file.

The Default open destination row uses `usePreferredEditor(availableEditors ?? [])` to get `[effectiveEditor, setLastEditor]`, shows a dropdown of editors from `availableEditors ?? []`, and calls `setLastEditor` on change.

The Default provider row uses `settings.defaultProvider` from `useSettings()` and shows a select with options: `"use-latest"` (label: "Last used"), plus one option per enabled provider from `serverProviders` (use `PROVIDER_DISPLAY_NAMES[p.provider]`).

- [ ] **Step 3: Update useSettingsRestore to include new settings in changedSettingLabels**

Add to the `changedSettingLabels` useMemo array:

```typescript
...(settings.defaultProvider !== DEFAULT_UNIFIED_SETTINGS.defaultProvider
  ? ["Default provider"]
  : []),
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -40
```

- [ ] **Step 5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "refactor: reorganize GeneralSettingsPanel into focused section cards"
```

---

### Task 6: Add NotificationsSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx` (add export at bottom)

- [ ] **Step 1: Add NotificationsSettingsPanel export**

Add this new exported function before `ArchivedThreadsPanel`:

```tsx
export function NotificationsSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Notifications">
        <SettingsRow
          title="Turn completion notifications"
          description="Set when Bird Code alerts you that an agent turn has finished."
          resetAction={
            settings.turnCompletionNotifications !==
            DEFAULT_UNIFIED_SETTINGS.turnCompletionNotifications ? (
              <SettingResetButton
                label="turn completion notifications"
                onClick={() =>
                  updateSettings({
                    turnCompletionNotifications:
                      DEFAULT_UNIFIED_SETTINGS.turnCompletionNotifications,
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.turnCompletionNotifications}
              onValueChange={(value) => {
                if (value === "always" || value === "never" || value === "unfocused") {
                  updateSettings({ turnCompletionNotifications: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Turn completion notifications">
                <SelectValue>
                  {settings.turnCompletionNotifications === "always" && "Always"}
                  {settings.turnCompletionNotifications === "never" && "Never"}
                  {settings.turnCompletionNotifications === "unfocused" && "When unfocused"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="always">
                  Always
                </SelectItem>
                <SelectItem hideIndicator value="never">
                  Never
                </SelectItem>
                <SelectItem hideIndicator value="unfocused">
                  When unfocused
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Permission notifications"
          description="Show alerts when notification permissions are required to continue."
          resetAction={
            settings.enablePermissionNotifications !==
            DEFAULT_UNIFIED_SETTINGS.enablePermissionNotifications ? (
              <SettingResetButton
                label="permission notifications"
                onClick={() =>
                  updateSettings({
                    enablePermissionNotifications:
                      DEFAULT_UNIFIED_SETTINGS.enablePermissionNotifications,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.enablePermissionNotifications}
              onCheckedChange={(checked) =>
                updateSettings({ enablePermissionNotifications: Boolean(checked) })
              }
              aria-label="Enable permission notifications"
            />
          }
        />

        <SettingsRow
          title="Question notifications"
          description="Show alerts when agent input is needed to continue a turn."
          resetAction={
            settings.enableQuestionNotifications !==
            DEFAULT_UNIFIED_SETTINGS.enableQuestionNotifications ? (
              <SettingResetButton
                label="question notifications"
                onClick={() =>
                  updateSettings({
                    enableQuestionNotifications:
                      DEFAULT_UNIFIED_SETTINGS.enableQuestionNotifications,
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.enableQuestionNotifications}
              onCheckedChange={(checked) =>
                updateSettings({ enableQuestionNotifications: Boolean(checked) })
              }
              aria-label="Enable question notifications"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "feat: add NotificationsSettingsPanel with turn/permission/question settings"
```

---

### Task 7: Add ProvidersSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

- [ ] **Step 1: Add ProvidersSettingsPanel export**

Extract the entire Providers SettingsSection from GeneralSettingsPanel (including the collapsible provider cards with binary paths, custom models, and enable switches) into a new `ProvidersSettingsPanel` export. Add a "Usage" section below it that renders the rate limits content.

The rate limits content can be inlined by importing `RateLimitsButton`'s internal data logic. However, since that component is a self-contained button+popover, the cleanest approach is to extract the `ProviderRateLimitSection` and data-fetching logic into a shared location or just re-implement a simple version inline.

For the Providers panel, add a "Usage" SettingsSection after the Providers section. Inside it, render a `UsageSection` component that subscribes to `provider.onRateLimitUpdate` (same as `RateLimitsButton`) and shows the rate limit bars for each active provider in a full-width card layout instead of a popover.

The `UsageSection` component should be defined locally in SettingsPanels.tsx and reuse the same `RateLimitBar` component logic (either by importing from RateLimitsButton.tsx or duplicating the small bar component).

Import from `~/components/chat/RateLimitsButton` if that file exports `ProviderRateLimitSection` and related helpers, otherwise inline the bar component.

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx apps/web/src/components/chat/RateLimitsButton.tsx
git commit -m "feat: add ProvidersSettingsPanel with provider config and usage section"
```

---

### Task 8: Add GitSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

- [ ] **Step 1: Add GitSettingsPanel export**

Extract the "Text generation model" row and the "Code Review" SettingsSection from GeneralSettingsPanel into a new `GitSettingsPanel`. Add a "Commit" SettingsSection with a "Commit instructions" row.

```tsx
export function GitSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const serverProviders = useServerProviders();

  const textGenerationModelSelection = resolveAppModelSelectionState(settings, serverProviders);
  const textGenProvider = textGenerationModelSelection.provider;
  const textGenModel = textGenerationModelSelection.model;
  const textGenModelOptions = textGenerationModelSelection.options;
  const gitModelOptionsByProvider = getCustomModelOptionsByProvider(
    settings,
    serverProviders,
    textGenProvider,
    textGenModel,
  );
  const isGitWritingModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Text Generation">
        <SettingsRow
          title="Text generation model"
          description="Configure the model used for generated commit messages, PR titles, and similar Git text."
          resetAction={
            isGitWritingModelDirty ? (
              <SettingResetButton
                label="text generation model"
                onClick={() =>
                  updateSettings({
                    textGenerationModelSelection:
                      DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <ProviderModelPicker
                provider={textGenProvider}
                model={textGenModel}
                lockedProvider={null}
                providers={serverProviders}
                modelOptionsByProvider={gitModelOptionsByProvider}
                triggerVariant="outline"
                triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
                onProviderModelChange={(provider, model) => {
                  updateSettings({
                    textGenerationModelSelection: resolveAppModelSelectionState(
                      {
                        ...settings,
                        textGenerationModelSelection: { provider, model },
                      },
                      serverProviders,
                    ),
                  });
                }}
              />
              <TraitsPicker
                provider={textGenProvider}
                models={serverProviders.find((p) => p.provider === textGenProvider)?.models ?? []}
                model={textGenModel}
                prompt=""
                onPromptChange={() => {}}
                modelOptions={textGenModelOptions}
                allowPromptInjectedEffort={false}
                triggerVariant="outline"
                triggerClassName="min-w-0 max-w-none shrink-0 text-foreground/90 hover:text-foreground"
                onModelOptionsChange={(nextOptions) => {
                  updateSettings({
                    textGenerationModelSelection: resolveAppModelSelectionState(
                      {
                        ...settings,
                        textGenerationModelSelection: {
                          provider: textGenProvider,
                          model: textGenModel,
                          ...(nextOptions ? { options: nextOptions } : {}),
                        },
                      },
                      serverProviders,
                    ),
                  });
                }}
              />
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection title="Commit">
        <SettingsRow
          title="Commit instructions"
          description="Custom instructions sent to the agent when using the commit button. Describe your preferred commit message style or any conventions."
        >
          <textarea
            className="mt-3 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 min-h-[80px]"
            value={settings.commitInstructions}
            onChange={(e) => updateSettings({ commitInstructions: e.target.value })}
            placeholder="e.g. Use conventional commits format. Keep subject under 72 characters."
            spellCheck={false}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Code Review">
        {/* Auto-review before push row */}
        <SettingsRow
          title="Auto-review before push"
          description="Automatically run a code review agent turn before any push, commit+push, or PR action."
          resetAction={
            settings.codeReview.autoReviewOnPush !==
            DEFAULT_UNIFIED_SETTINGS.codeReview.autoReviewOnPush ? (
              <SettingResetButton
                label="auto-review before push"
                onClick={() =>
                  updateSettings({
                    codeReview: {
                      ...settings.codeReview,
                      autoReviewOnPush: DEFAULT_UNIFIED_SETTINGS.codeReview.autoReviewOnPush,
                    },
                  })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.codeReview.autoReviewOnPush}
              onCheckedChange={(checked) =>
                updateSettings({
                  codeReview: { ...settings.codeReview, autoReviewOnPush: Boolean(checked) },
                })
              }
              aria-label="Auto-review before push"
            />
          }
        />
        {/* Fix mode row */}
        <SettingsRow
          title="Fix mode"
          description="Choose how the agent responds when it finds issues during a code review."
          resetAction={
            settings.codeReview.fixMode !== DEFAULT_UNIFIED_SETTINGS.codeReview.fixMode ? (
              <SettingResetButton
                label="fix mode"
                onClick={() =>
                  updateSettings({
                    codeReview: {
                      ...settings.codeReview,
                      fixMode: DEFAULT_UNIFIED_SETTINGS.codeReview.fixMode,
                    },
                  })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeReview.fixMode}
              onValueChange={(value) => {
                if (value === "review-only" || value === "auto-fix" || value === "agent-decides") {
                  updateSettings({
                    codeReview: { ...settings.codeReview, fixMode: value as CodeReviewFixMode },
                  });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Code review fix mode">
                <SelectValue>
                  {settings.codeReview.fixMode === "review-only" && "Review only"}
                  {settings.codeReview.fixMode === "auto-fix" && "Auto-fix"}
                  {settings.codeReview.fixMode === "agent-decides" && "Agent decides"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="review-only">
                  Review only
                </SelectItem>
                <SelectItem hideIndicator value="auto-fix">
                  Auto-fix
                </SelectItem>
                <SelectItem hideIndicator value="agent-decides">
                  Agent decides
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "feat: add GitSettingsPanel with text gen model, commit instructions, code review"
```

---

### Task 9: Add AppearanceSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

- [ ] **Step 1: Add AppearanceSettingsPanel export**

Add the following panel. It includes:

1. **Theme** section: theme selector (moved from General) + pointer cursors switch
2. **Typography** section: UI font select, Code font select, UI font size number input, Code font size number input
3. **Colors** section: Accent color (light + dark), Background color (light + dark), Foreground color (light + dark) — each is a color input + text input
4. **Presets** section: preset buttons that populate the color fields

Import `THEME_PRESETS, UI_FONT_OPTIONS, CODE_FONT_OPTIONS` from `"../../hooks/useThemeCustomization"`.

```tsx
export function AppearanceSettingsPanel() {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  function applyPreset(preset: ThemePreset) {
    updateSettings({
      themeAccentColor: preset.accentLight,
      themeAccentColorDark: preset.accentDark,
      themeBackgroundColor: preset.bgLight ?? "",
      themeBackgroundColorDark: preset.bgDark ?? "",
      themeForegroundColor: preset.fgLight ?? "",
      themeForegroundColorDark: preset.fgDark ?? "",
    });
  }

  return (
    <SettingsPageContainer>
      <SettingsSection title="Theme">
        {/* Theme selector row (moved from General) */}
        <SettingsRow
          title="Color scheme"
          description={`Choose how the app looks. System follows your OS preference.`}
          resetAction={
            theme !== "system" ? (
              <SettingResetButton label="theme" onClick={() => setTheme("system")} />
            ) : null
          }
          control={
            <Select
              value={theme}
              onValueChange={(value) => {
                if (value === "system" || value === "light" || value === "dark") setTheme(value);
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Theme preference">
                <SelectValue>
                  {THEME_OPTIONS.find((o) => o.value === theme)?.label ?? "System"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem hideIndicator key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        {/* Pointer cursors */}
        <SettingsRow
          title="Use pointer cursors"
          description="Change the cursor to a pointer when hovering over interactive elements."
          resetAction={
            settings.usePointerCursors !== DEFAULT_UNIFIED_SETTINGS.usePointerCursors ? (
              <SettingResetButton
                label="pointer cursors"
                onClick={() =>
                  updateSettings({ usePointerCursors: DEFAULT_UNIFIED_SETTINGS.usePointerCursors })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.usePointerCursors}
              onCheckedChange={(checked) => updateSettings({ usePointerCursors: Boolean(checked) })}
              aria-label="Use pointer cursors"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Typography">
        {/* UI font */}
        <SettingsRow
          title="UI font"
          description="Font family used across the interface."
          resetAction={
            settings.uiFont !== DEFAULT_UNIFIED_SETTINGS.uiFont ? (
              <SettingResetButton
                label="UI font"
                onClick={() => updateSettings({ uiFont: DEFAULT_UNIFIED_SETTINGS.uiFont })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.uiFont}
              onValueChange={(value) => updateSettings({ uiFont: value })}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="UI font">
                <SelectValue>
                  {UI_FONT_OPTIONS.find((o) => o.value === settings.uiFont)?.label ??
                    "System default"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {UI_FONT_OPTIONS.map((opt) => (
                  <SelectItem hideIndicator key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        {/* Code font */}
        <SettingsRow
          title="Code font"
          description="Font family used for code across chats and diffs."
          resetAction={
            settings.codeFont !== DEFAULT_UNIFIED_SETTINGS.codeFont ? (
              <SettingResetButton
                label="code font"
                onClick={() => updateSettings({ codeFont: DEFAULT_UNIFIED_SETTINGS.codeFont })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeFont}
              onValueChange={(value) => updateSettings({ codeFont: value })}
            >
              <SelectTrigger className="w-full sm:w-44" aria-label="Code font">
                <SelectValue>
                  {CODE_FONT_OPTIONS.find((o) => o.value === settings.codeFont)?.label ??
                    "System default"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {CODE_FONT_OPTIONS.map((opt) => (
                  <SelectItem hideIndicator key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          }
        />

        {/* UI font size */}
        <SettingsRow
          title="UI font size"
          description="Base font size used across the interface (px)."
          resetAction={
            settings.uiFontSize !== DEFAULT_UNIFIED_SETTINGS.uiFontSize ? (
              <SettingResetButton
                label="UI font size"
                onClick={() => updateSettings({ uiFontSize: DEFAULT_UNIFIED_SETTINGS.uiFontSize })}
              />
            ) : null
          }
          control={
            <input
              type="number"
              min={10}
              max={24}
              step={1}
              className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/50"
              value={settings.uiFontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 10 && v <= 24) updateSettings({ uiFontSize: v });
              }}
              aria-label="UI font size in pixels"
            />
          }
        />

        {/* Code font size */}
        <SettingsRow
          title="Code font size"
          description="Base font size used for code across chats and diffs (px)."
          resetAction={
            settings.codeFontSize !== DEFAULT_UNIFIED_SETTINGS.codeFontSize ? (
              <SettingResetButton
                label="code font size"
                onClick={() =>
                  updateSettings({ codeFontSize: DEFAULT_UNIFIED_SETTINGS.codeFontSize })
                }
              />
            ) : null
          }
          control={
            <input
              type="number"
              min={10}
              max={24}
              step={1}
              className="w-20 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring/50"
              value={settings.codeFontSize}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 10 && v <= 24) updateSettings({ codeFontSize: v });
              }}
              aria-label="Code font size in pixels"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Colors">
        {/* Preset buttons */}
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="mb-3 text-sm font-medium text-foreground">Presets</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Quick-apply a color preset to both light and dark themes. Changes apply live.
          </p>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
              >
                {preset.accentLight && (
                  <span
                    className="size-3 rounded-full shrink-0"
                    style={{ background: preset.accentLight }}
                  />
                )}
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Accent color light */}
        <SettingsRow
          title="Accent color — light"
          description="Primary/accent color used for buttons and highlights in light mode."
          resetAction={
            settings.themeAccentColor !== DEFAULT_UNIFIED_SETTINGS.themeAccentColor ? (
              <SettingResetButton
                label="accent color (light)"
                onClick={() =>
                  updateSettings({ themeAccentColor: DEFAULT_UNIFIED_SETTINGS.themeAccentColor })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeAccentColor || "#7c5cfc"}
                onChange={(e) => updateSettings({ themeAccentColor: e.target.value })}
                aria-label="Accent color for light mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeAccentColor}
                onChange={(e) => updateSettings({ themeAccentColor: e.target.value })}
                placeholder="oklch(…) or #hex"
                spellCheck={false}
              />
            </div>
          }
        />

        {/* Accent color dark */}
        <SettingsRow
          title="Accent color — dark"
          description="Primary/accent color used for buttons and highlights in dark mode."
          resetAction={
            settings.themeAccentColorDark !== DEFAULT_UNIFIED_SETTINGS.themeAccentColorDark ? (
              <SettingResetButton
                label="accent color (dark)"
                onClick={() =>
                  updateSettings({
                    themeAccentColorDark: DEFAULT_UNIFIED_SETTINGS.themeAccentColorDark,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeAccentColorDark || "#8b6cff"}
                onChange={(e) => updateSettings({ themeAccentColorDark: e.target.value })}
                aria-label="Accent color for dark mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeAccentColorDark}
                onChange={(e) => updateSettings({ themeAccentColorDark: e.target.value })}
                placeholder="oklch(…) or #hex"
                spellCheck={false}
              />
            </div>
          }
        />

        {/* Background light */}
        <SettingsRow
          title="Background color — light"
          description="App background color in light mode. Leave empty to use theme default."
          resetAction={
            settings.themeBackgroundColor !== DEFAULT_UNIFIED_SETTINGS.themeBackgroundColor ? (
              <SettingResetButton
                label="background (light)"
                onClick={() =>
                  updateSettings({
                    themeBackgroundColor: DEFAULT_UNIFIED_SETTINGS.themeBackgroundColor,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeBackgroundColor || "#ffffff"}
                onChange={(e) => updateSettings({ themeBackgroundColor: e.target.value })}
                aria-label="Background color for light mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeBackgroundColor}
                onChange={(e) => updateSettings({ themeBackgroundColor: e.target.value })}
                placeholder="#ffffff"
                spellCheck={false}
              />
            </div>
          }
        />

        {/* Background dark */}
        <SettingsRow
          title="Background color — dark"
          description="App background color in dark mode. Leave empty to use theme default."
          resetAction={
            settings.themeBackgroundColorDark !==
            DEFAULT_UNIFIED_SETTINGS.themeBackgroundColorDark ? (
              <SettingResetButton
                label="background (dark)"
                onClick={() =>
                  updateSettings({
                    themeBackgroundColorDark: DEFAULT_UNIFIED_SETTINGS.themeBackgroundColorDark,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeBackgroundColorDark || "#0d0d0d"}
                onChange={(e) => updateSettings({ themeBackgroundColorDark: e.target.value })}
                aria-label="Background color for dark mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeBackgroundColorDark}
                onChange={(e) => updateSettings({ themeBackgroundColorDark: e.target.value })}
                placeholder="#0d0d0d"
                spellCheck={false}
              />
            </div>
          }
        />

        {/* Foreground light */}
        <SettingsRow
          title="Foreground color — light"
          description="Primary text color in light mode. Leave empty to use theme default."
          resetAction={
            settings.themeForegroundColor !== DEFAULT_UNIFIED_SETTINGS.themeForegroundColor ? (
              <SettingResetButton
                label="foreground (light)"
                onClick={() =>
                  updateSettings({
                    themeForegroundColor: DEFAULT_UNIFIED_SETTINGS.themeForegroundColor,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeForegroundColor || "#1a1a1a"}
                onChange={(e) => updateSettings({ themeForegroundColor: e.target.value })}
                aria-label="Foreground color for light mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeForegroundColor}
                onChange={(e) => updateSettings({ themeForegroundColor: e.target.value })}
                placeholder="#1a1a1a"
                spellCheck={false}
              />
            </div>
          }
        />

        {/* Foreground dark */}
        <SettingsRow
          title="Foreground color — dark"
          description="Primary text color in dark mode. Leave empty to use theme default."
          resetAction={
            settings.themeForegroundColorDark !==
            DEFAULT_UNIFIED_SETTINGS.themeForegroundColorDark ? (
              <SettingResetButton
                label="foreground (dark)"
                onClick={() =>
                  updateSettings({
                    themeForegroundColorDark: DEFAULT_UNIFIED_SETTINGS.themeForegroundColorDark,
                  })
                }
              />
            ) : null
          }
          control={
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="size-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
                value={settings.themeForegroundColorDark || "#f0f0f0"}
                onChange={(e) => updateSettings({ themeForegroundColorDark: e.target.value })}
                aria-label="Foreground color for dark mode"
              />
              <Input
                className="w-28 font-mono text-xs"
                value={settings.themeForegroundColorDark}
                onChange={(e) => updateSettings({ themeForegroundColorDark: e.target.value })}
                placeholder="#f0f0f0"
                spellCheck={false}
              />
            </div>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
```

Note: Import `ThemePreset, THEME_PRESETS, UI_FONT_OPTIONS, CODE_FONT_OPTIONS` from `"../../hooks/useThemeCustomization"` at the top of SettingsPanels.tsx.

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "feat: add AppearanceSettingsPanel with theme, typography, and color customization"
```

---

### Task 10: Add PersonalizationSettingsPanel

**Files:**

- Modify: `apps/web/src/components/settings/SettingsPanels.tsx`

- [ ] **Step 1: Add PersonalizationSettingsPanel export**

The panel has two sections:

1. **"Custom Instructions"** — a large textarea for `settings.customInstructions`
2. **"Agent Instructions Files"** — shows AGENTS.md, CLAUDE.md, GEMINI.md with read+edit in a textarea. Uses `ensureNativeApi().projects.readFile({ cwd, relativePath })` and `writeFile` to load and save content. The `cwd` comes from `useServerKeybindingsConfigPath()` parent directory, or better from a server config. Actually `useServerObservability()` has `logsDirectoryPath` which is inside the project, so we can derive `cwd` from server config.

Use `useStore` to get the current project path, or use the observability `logsDirectoryPath` and strip the `.t3/logs` suffix to get the cwd.

Actually the cleanest approach: add a `useServerCwd` selector derived from `useServerObservability` or from reading server state. Look at `useServerKeybindingsConfigPath` — it returns the full path to keybindings.json. We can derive cwd from it by stripping the filename.

For each of the 3 files (AGENTS.md, CLAUDE.md, GEMINI.md), show:

- A collapsible section with the filename as header
- Load button (or auto-load on expand) that calls `projects.readFile`
- A textarea showing the content
- A Save button that calls `projects.writeFile`
- Error/success feedback

```tsx
export function PersonalizationSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const keybindingsConfigPath = useServerKeybindingsConfigPath();

  // Derive cwd from the keybindings config path (strip filename)
  const cwd = keybindingsConfigPath ? keybindingsConfigPath.replace(/\/[^/]+$/, "") : null;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Custom Instructions">
        <SettingsRow
          title="Custom instructions"
          description="Instructions added to every agent session in this app. Use this to set tone, preferred languages, or coding style."
          resetAction={
            settings.customInstructions !== DEFAULT_UNIFIED_SETTINGS.customInstructions ? (
              <SettingResetButton
                label="custom instructions"
                onClick={() =>
                  updateSettings({
                    customInstructions: DEFAULT_UNIFIED_SETTINGS.customInstructions,
                  })
                }
              />
            ) : null
          }
        >
          <textarea
            className="mt-3 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 min-h-[120px]"
            value={settings.customInstructions}
            onChange={(e) => updateSettings({ customInstructions: e.target.value })}
            placeholder="You are a senior engineer. Always prefer functional patterns. Write concise, readable code."
            spellCheck={false}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Agent Instructions Files">
        <div className="px-4 py-4 sm:px-5 border-b border-border text-xs text-muted-foreground">
          View and edit the global agent instruction files in your project root. Changes are saved
          directly to disk.
        </div>
        {(["AGENTS.md", "CLAUDE.md", "GEMINI.md"] as const).map((filename) => (
          <AgentInstructionsFileEditor key={filename} filename={filename} cwd={cwd} />
        ))}
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function AgentInstructionsFileEditor({ filename, cwd }: { filename: string; cwd: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  const load = useCallback(async () => {
    if (!cwd) {
      setError("Project directory not available.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await ensureNativeApi().projects.readFile({ cwd, relativePath: filename });
      setContent(result.contents);
    } catch {
      setContent("");
    } finally {
      setIsLoading(false);
    }
  }, [cwd, filename]);

  const save = useCallback(async () => {
    if (!cwd || content === null) return;
    setIsSaving(true);
    setError(null);
    try {
      await ensureNativeApi().projects.writeFile({
        cwd,
        relativePath: filename,
        contents: content,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setIsSaving(false);
    }
  }, [cwd, content, filename]);

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      setIsOpen(open);
      if (open && content === null) {
        await load();
      }
    },
    [content, load],
  );

  return (
    <Collapsible open={isOpen} onOpenChange={(open) => void handleOpenChange(open)}>
      <div className="border-t border-border first:border-t-0 px-4 py-3 sm:px-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground font-mono">{filename}</span>
          <Button
            size="xs"
            variant="ghost"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => void handleOpenChange(!isOpen)}
          >
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
            />
          </Button>
        </div>
      </div>
      <CollapsibleContent>
        <div className="border-t border-border/60 px-4 pb-4 sm:px-5">
          {isLoading ? (
            <p className="py-2 text-xs text-muted-foreground animate-pulse">Loading…</p>
          ) : (
            <>
              <textarea
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 min-h-[160px]"
                value={content ?? ""}
                onChange={(e) => {
                  setContent(e.target.value);
                  setSaveStatus("idle");
                }}
                placeholder={`# ${filename}\n\nAdd instructions for the ${filename.replace(".md", "")} agent here.`}
                spellCheck={false}
              />
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
              <div className="mt-2 flex items-center gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={isSaving || content === null}
                  onClick={() => void save()}
                >
                  {isSaving ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => void load()} disabled={isLoading}>
                  Reload
                </Button>
              </div>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/web/src/components/settings/SettingsPanels.tsx
git commit -m "feat: add PersonalizationSettingsPanel with custom instructions and file editors"
```

---

### Task 11: Mount useThemeCustomization in app root

**Files:**

- Modify: the root app component (find via grep)

- [ ] **Step 1: Find the root component and add the hook**

```bash
grep -r "useTheme\b" apps/web/src --include="*.tsx" | grep -v "test\|spec" | head -10
```

Find the top-level component that mounts and add:

```typescript
import { useThemeCustomization } from "./hooks/useThemeCustomization";
// inside the component:
useThemeCustomization();
```

- [ ] **Step 2: Typecheck and commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | head -40
```

```bash
git add -A
git commit -m "feat: mount useThemeCustomization at app root for live CSS variable injection"
```

---

### Task 12: Final lint + typecheck pass

- [ ] **Step 1: Run lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun lint 2>&1 | tail -30
```

Fix any lint errors.

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code && bun typecheck 2>&1 | tail -40
```

Fix any type errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: fix lint and type errors from settings overhaul"
```
