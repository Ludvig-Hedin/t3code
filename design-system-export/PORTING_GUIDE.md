# Porting Guide

A step-by-step rebuild path plus framework-specific cheatsheets. The goal: any language or stack ends up with the same visual identity.

---

## The universal 9-step rebuild

Do these in order. Don't skip ahead.

### 1. Define the raw palette

Constants in your language for the base colors. Names match Tailwind's neutral / red / blue / emerald / amber scales:

```
white                #FFFFFF
black                #000000
neutral-100          #F5F5F5
neutral-500          #737373
neutral-800          #262626
neutral-950          #0A0A0A
red-400              #F87171
red-500              #EF4444
red-700              #B91C1C
blue-400             #60A5FA
blue-500             #3B82F6
blue-700             #1D4ED8
emerald-400          #34D399
emerald-500          #10B981
emerald-700          #047857
amber-400            #FBBF24
amber-500            #F59E0B
amber-700            #B45309
primary (light)      oklch(0.488 0.217 264)   approx #3457D5
primary (dark)       oklch(0.588 0.217 264)   approx #5B7CE6
```

Convert OKLCH to whatever your platform supports — sRGB is fine. The exact value of `primary` is the only "brand" pick; everything else is plain palette.

### 2. Set radius base = 10

A single source of truth. Derive: sm = base - 4, md = base - 2, lg = base, xl = base + 4, 2xl = base + 8, 3xl = base + 12, 4xl = base + 16.

### 3. Build two theme dictionaries

Light and dark. Same semantic keys (`background`, `foreground`, `primary`, `border`, `input`, `muted`, `accent`, `secondary`, `card`, `popover`, `destructive`, `info`, `success`, `warning`, and `*-foreground` variants).

Use **alpha composition at runtime**, not pre-baked grays:

```
border (light) = alpha(black, 0.08)
border (dark)  = alpha(white, 0.06)
muted  (light) = alpha(black, 0.04)
muted  (dark)  = alpha(white, 0.04)
```

### 4. Theme switching at the root

One class/attribute toggles the active theme. Component code is theme-agnostic.

### 5. Components reference semantic tokens only

No raw hex anywhere in component files. If you need a new shade, add a semantic token, don't open a Pantone book in a component.

### 6. Implement the surface recipe

A reusable mixin / view modifier / composable:

- Solid fill
- 1px border in `border`
- Drop shadow: `0 1px 2px rgba(0, 0, 0, 0.05)`
- Inset highlight:
  - Light: `inset 0 1px 0 rgba(0, 0, 0, 0.04)`
  - Dark: `inset 0 -1px 0 rgba(255, 255, 255, 0.06)`

Use it on Card, Popover, Button (default/outline), Input, Sheet.

### 7. Ship fonts

DM Sans + SF Mono (or platform mono fallback). Root size 14px. Weights 400 / 500 / 600 only.

### 8. Spacing scale

Use a 4px-base scale. Pre-name common steps (4, 6, 8, 10, 12, 14, 16, 24). Card padding = 24, button heights = 32–36 desktop / 28–32 dense.

### 9. Add the noise overlay

Fixed full-viewport layer at 3.5% opacity. Use SVG turbulence if your stack supports it; otherwise a 256×256 PNG tile of monochrome noise.

---

## Framework cheatsheets

### Tailwind v4 / CSS

Drop this into your global stylesheet. (This is essentially what the reference app does.)

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-border: var(--border);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-destructive: var(--destructive);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}

:root {
  --radius: 0.625rem;
  --background: #ffffff;
  --foreground: #262626;
  --card: #ffffff;
  --primary: oklch(0.488 0.217 264);
  --primary-foreground: #ffffff;
  --secondary: rgba(0, 0, 0, 0.04);
  --muted: rgba(0, 0, 0, 0.04);
  --muted-foreground: #686868;
  --accent: rgba(0, 0, 0, 0.04);
  --border: rgba(0, 0, 0, 0.08);
  --input: rgba(0, 0, 0, 0.10);
  --ring: oklch(0.488 0.217 264);
  --destructive: #ef4444;
}

.dark {
  --background: #141414;
  --foreground: #f5f5f5;
  --card: #1a1a1a;
  --primary: oklch(0.588 0.217 264);
  --secondary: rgba(255, 255, 255, 0.04);
  --muted: rgba(255, 255, 255, 0.04);
  --muted-foreground: #828282;
  --accent: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.06);
  --input: rgba(255, 255, 255, 0.08);
  --ring: oklch(0.588 0.217 264);
}

body {
  font-family: "DM Sans", system-ui, sans-serif;
  font-size: 14px;
}
```

Surface recipe as a utility class:

```css
.surface {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(0, 0, 0, 0.04);
}

.dark .surface {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    inset 0 -1px 0 rgba(255, 255, 255, 0.06);
}
```

---

### Plain CSS (no framework)

Same as above. Drop the `@theme` block; just use the CSS custom properties directly: `color: var(--foreground); background: var(--card);` etc.

---

### SwiftUI (iOS / macOS)

```swift
import SwiftUI

extension Color {
    static let background = Color("background")
    static let foreground = Color("foreground")
    static let card       = Color("card")
    static let primary_   = Color("primary")
    static let border     = Color.black.opacity(0.08)   // light; override for dark
    static let muted      = Color.black.opacity(0.04)
    static let accent_    = Color.black.opacity(0.04)
}

struct Surface<Content: View>: View {
    @Environment(\.colorScheme) var scheme
    let content: Content

    init(@ViewBuilder _ content: () -> Content) { self.content = content() }

    var body: some View {
        content
            .padding(24)
            .background(Color.card)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 1, x: 0, y: 1)
            // Inset highlight: top dark in light, bottom light in dark
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .inset(by: 0.5)
                    .stroke(
                        scheme == .dark
                            ? Color.white.opacity(0.06)
                            : Color.black.opacity(0.04),
                        lineWidth: 1
                    )
                    .mask(scheme == .dark
                          ? LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
                          : LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom))
                    .allowsHitTesting(false)
            )
    }
}
```

Put base colors in an Asset Catalog with light/dark appearances. Use SF Pro (system) or ship DM Sans via `.font(.custom("DM Sans", size: 14))`.

---

### Flutter

```dart
class AppTheme {
  static ThemeData light() => _build(brightness: Brightness.light);
  static ThemeData dark()  => _build(brightness: Brightness.dark);

  static ThemeData _build({required Brightness brightness}) {
    final isDark = brightness == Brightness.dark;
    final bg          = isDark ? const Color(0xFF141414) : Colors.white;
    final fg          = isDark ? const Color(0xFFF5F5F5) : const Color(0xFF262626);
    final cardBg      = isDark ? const Color(0xFF1A1A1A) : Colors.white;
    final primary     = isDark ? const Color(0xFF5B7CE6) : const Color(0xFF3457D5);
    final border      = isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.08);

    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: primary,
        onPrimary: Colors.white,
        secondary: isDark ? Colors.white.withOpacity(0.04) : Colors.black.withOpacity(0.04),
        onSecondary: fg,
        surface: cardBg,
        onSurface: fg,
        error: const Color(0xFFEF4444),
        onError: Colors.white,
      ),
      textTheme: const TextTheme(
        bodyMedium: TextStyle(fontFamily: 'DMSans', fontSize: 14),
      ),
    );
  }
}

class Surface extends StatelessWidget {
  final Widget child;
  const Surface({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.08),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: child,
    );
  }
}
```

---

### React Native

```ts
export const tokens = {
  light: {
    background:        '#FFFFFF',
    foreground:        '#262626',
    card:              '#FFFFFF',
    primary:           '#3457D5',
    primaryForeground: '#FFFFFF',
    border:            'rgba(0,0,0,0.08)',
    input:             'rgba(0,0,0,0.10)',
    muted:             'rgba(0,0,0,0.04)',
    mutedForeground:   '#686868',
    destructive:       '#EF4444',
  },
  dark: {
    background:        '#141414',
    foreground:        '#F5F5F5',
    card:              '#1A1A1A',
    primary:           '#5B7CE6',
    primaryForeground: '#FFFFFF',
    border:            'rgba(255,255,255,0.06)',
    input:             'rgba(255,255,255,0.08)',
    muted:             'rgba(255,255,255,0.04)',
    mutedForeground:   '#828282',
    destructive:       '#F15858',
  },
} as const;

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, '2xl': 18, '3xl': 22, '4xl': 26 };

export const surfaceStyle = (theme: 'light' | 'dark') => ({
  backgroundColor: tokens[theme].card,
  borderRadius: radius['2xl'],
  borderWidth: 1,
  borderColor: tokens[theme].border,
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 1,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
});
```

For the inset highlight, layer a 1px-tall absolutely-positioned `View` at the top (light mode) or bottom (dark mode) of the surface with the appropriate alpha color.

---

### Kotlin / Jetpack Compose

```kotlin
data class AppColors(
    val background: Color,
    val foreground: Color,
    val card: Color,
    val primary: Color,
    val border: Color,
    val muted: Color,
    val mutedForeground: Color,
    val destructive: Color,
)

val LightColors = AppColors(
    background      = Color(0xFFFFFFFF),
    foreground      = Color(0xFF262626),
    card            = Color(0xFFFFFFFF),
    primary         = Color(0xFF3457D5),
    border          = Color.Black.copy(alpha = 0.08f),
    muted           = Color.Black.copy(alpha = 0.04f),
    mutedForeground = Color(0xFF686868),
    destructive     = Color(0xFFEF4444),
)

val DarkColors = LightColors.copy(
    background      = Color(0xFF141414),
    foreground      = Color(0xFFF5F5F5),
    card            = Color(0xFF1A1A1A),
    primary         = Color(0xFF5B7CE6),
    border          = Color.White.copy(alpha = 0.06f),
    muted           = Color.White.copy(alpha = 0.04f),
    mutedForeground = Color(0xFF828282),
    destructive     = Color(0xFFF15858),
)

@Composable
fun Surface(content: @Composable () -> Unit) {
    val colors = LocalAppColors.current
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(18.dp))
            .background(colors.card)
            .border(1.dp, colors.border, RoundedCornerShape(18.dp))
            .padding(24.dp)
    ) { content() }
}
```

---

### Backend / non-UI languages

If you're building a server-rendered email, PDF, or other static surface in Python / Go / Ruby / etc., just inline the values as a constants module and pass them into your template engine. The semantic-token discipline still applies — define a `Theme` struct/dataclass and use it everywhere instead of literal hex strings.

---

## Verification checklist

Before declaring the port done, the receiving agent should confirm:

- [ ] Every component uses semantic tokens, no raw hex
- [ ] Light and dark themes share component code; only token values change
- [ ] All surfaces use the four-layer recipe (fill + border + drop shadow + inset highlight)
- [ ] Radii derive from `radius = 10` base; no hand-picked values
- [ ] Heights of buttons/inputs tighten ~4px at the desktop breakpoint
- [ ] DM Sans + mono fallback are loaded and applied
- [ ] Noise overlay at 3.5% opacity is visible across the app
- [ ] Focus rings render correctly (2px ring + 1px offset)
- [ ] Disabled state is `opacity 0.64`, not gray-overrides
- [ ] No mid-gray opaque borders or fills exist — all surface chrome is alpha-tinted
