# Design Tokens

All values are framework-agnostic. Map them to whatever your stack uses (CSS custom properties, Swift `Color` extensions, Flutter `ThemeData`, Kotlin `Color`, etc.).

---

## 1. Color tokens (semantic)

Two themes, identical semantic names, different values. Switch by toggling a single root class/attribute.

### Light theme

| Token | Value (CSS-style) | Notes |
|---|---|---|
| `background` | `#FFFFFF` | App canvas |
| `foreground` | `#262626` (neutral-800) | Body text |
| `card` | `#FFFFFF` | Card surface |
| `card-foreground` | `#262626` | Card text |
| `popover` | `#FFFFFF` | Floating menu surface |
| `popover-foreground` | `#262626` | |
| `primary` | `oklch(0.488 0.217 264)` ≈ `#3457D5` | Action color (indigo/blue) |
| `primary-foreground` | `#FFFFFF` | Text on primary |
| `secondary` | `rgba(0,0,0,0.04)` | Secondary fill (alpha black) |
| `secondary-foreground` | `#262626` | |
| `muted` | `rgba(0,0,0,0.04)` | Muted surface |
| `muted-foreground` | mix(`#737373`, black, 10%) ≈ `#686868` | De-emphasized text |
| `accent` | `rgba(0,0,0,0.04)` | Hover / selected fill |
| `accent-foreground` | `#262626` | |
| `border` | `rgba(0,0,0,0.08)` | All borders |
| `input` | `rgba(0,0,0,0.10)` | Input borders |
| `ring` | `oklch(0.488 0.217 264)` | Focus ring = primary |
| `destructive` | `#EF4444` (red-500) | Errors, delete |
| `destructive-foreground` | `#B91C1C` (red-700) | |
| `info` | `#3B82F6` (blue-500) | Info icons |
| `info-foreground` | `#1D4ED8` (blue-700) | Info text + links |
| `success` | `#10B981` (emerald-500) | |
| `success-foreground` | `#047857` (emerald-700) | |
| `warning` | `#F59E0B` (amber-500) | |
| `warning-foreground` | `#B45309` (amber-700) | |

### Dark theme

| Token | Value | Notes |
|---|---|---|
| `background` | mix(`#0A0A0A` neutral-950, white, 5%) ≈ `#141414` | App canvas |
| `foreground` | `#F5F5F5` (neutral-100) | Body text |
| `card` | mix(background, white, 2%) ≈ `#1A1A1A` | Slightly lifted |
| `card-foreground` | `#F5F5F5` | |
| `popover` | mix(background, white, 2%) | |
| `popover-foreground` | `#F5F5F5` | |
| `primary` | `oklch(0.588 0.217 264)` ≈ `#5B7CE6` | Lighter indigo for dark |
| `primary-foreground` | `#FFFFFF` | |
| `secondary` | `rgba(255,255,255,0.04)` | Alpha white |
| `secondary-foreground` | `#F5F5F5` | |
| `muted` | `rgba(255,255,255,0.04)` | |
| `muted-foreground` | mix(`#737373`, white, 10%) ≈ `#828282` | |
| `accent` | `rgba(255,255,255,0.04)` | |
| `accent-foreground` | `#F5F5F5` | |
| `border` | `rgba(255,255,255,0.06)` | |
| `input` | `rgba(255,255,255,0.08)` | |
| `ring` | `oklch(0.588 0.217 264)` | |
| `destructive` | mix(`#EF4444`, white, 10%) ≈ `#F15858` | Lifted toward white |
| `destructive-foreground` | `#F87171` (red-400) | |
| `info` | `#3B82F6` | |
| `info-foreground` | `#60A5FA` (blue-400) | |
| `success` | `#10B981` | |
| `success-foreground` | `#34D399` (emerald-400) | |
| `warning` | `#F59E0B` | |
| `warning-foreground` | `#FBBF24` (amber-400) | |

### The critical rule

`secondary`, `muted`, `accent`, `border`, `input` are **always alpha-tinted**:
- Light → black with 4–10% alpha
- Dark → white with 4–8% alpha

Never opaque grays. This makes surfaces stack cleanly and keeps the palette coherent across themes.

---

## 2. Radius scale

Base radius = **10px** (0.625rem). All other radii derive from it.

| Token | Value | Use |
|---|---|---|
| `radius-sm` | 6px | Tight badges, kbd |
| `radius-md` | 8px | xs buttons, small chips |
| `radius-lg` | **10px** | Buttons, inputs (default) |
| `radius-xl` | 14px | Inner card slots |
| `radius-2xl` | 18px | Cards |
| `radius-3xl` | 22px | Large feature surfaces |
| `radius-4xl` | 26px | Hero / marketing |

Formula: `lg = base; sm = base - 4; md = base - 2; xl = base + 4; 2xl = base + 8; 3xl = base + 12; 4xl = base + 16`.

---

## 3. Typography

| Role | Family stack | Base size |
|---|---|---|
| UI body | `DM Sans`, system-ui, sans-serif | **14px** |
| Code / mono | `SF Mono`, `SFMono-Regular`, Consolas, Liberation Mono, Menlo, monospace | **13px** |
| Headings | Inherit UI font | scaled (see below) |

**Weights actually used:** 400 (body), 500 (medium — buttons, labels), 600 (semibold — titles). **Never 700+.**

Heading sizes (relative to current font size):

| Level | Size | Notes |
|---|---|---|
| h1 | 1.35em | weight 600 |
| h2 | 1.20em | weight 600, 1px bottom border in `border` color |
| h3 | 1.10em | weight 600 |
| h4 | 1.00em | weight 600 |
| h5 | 0.95em | weight 600 |
| h6 | 0.90em | weight 600, color = `muted-foreground` |

Line-height for headings: **1.3**. Body: default (~1.5).

---

## 4. Spacing

4px base grid. Common composed values:

| Step | px | Use |
|---|---|---|
| 1 | 4 | Tight inline gaps |
| 1.5 | 6 | Header row gap |
| 2 | 8 | Button gap |
| 2.5 | 10 | sm button padding |
| 3 | 12 | Default button padding |
| 3.5 | 14 | lg button padding |
| 4 | 16 | Card footer padding-y |
| 6 | 24 | Card padding |
| 8 | 32 | Section spacing |

Component heights (desktop dense / mobile comfortable):

| Component | Mobile | Desktop (sm: breakpoint) |
|---|---|---|
| Button xs | 28 | 24 |
| Button sm | 32 | 28 |
| Button default | 36 | 32 |
| Button lg | 40 | 36 |
| Button xl | 44 | 40 |
| Input default | 34 | 30 |
| Input sm | 30 | 26 |
| Input lg | 38 | 34 |
| Icon button default | 36 | 32 |

**Density rule:** at the small-tablet breakpoint and above, knock ~4px off heights. Mobile gets comfortable touch targets; desktop gets denser UI.

Icon sizes inside buttons: 18px mobile, 16px desktop (`size-4.5` → `size-4`). xs/sm buttons use 14–16px.

---

## 5. Surface elevation recipe

Every elevated surface (card, popover, button, input) uses **all four layers**:

1. **Solid fill** in semantic surface color
2. **1px border** in `border` (or `input` for inputs)
3. **Tiny drop shadow:** `0 1px 2px rgba(0,0,0,0.05)`
4. **1px inset highlight** via an inner pseudo-element / inner shadow:
   - Light mode: `inset 0 1px 0 rgba(0,0,0,0.04)` (subtle dark line at top)
   - Dark mode: `inset 0 -1px 0 rgba(255,255,255,0.06)` (subtle light line at bottom)

The inset highlight gives the "physical" feel — flat but with depth.

Pressed/active state: replace the highlight with `inset 0 1px 0 rgba(0,0,0,0.08)` (recessed feel) and remove the drop shadow.

---

## 6. Focus ring

- 2px ring in `ring` color (= primary)
- 1px offset in `background` (creates a halo)
- Inputs use a 3px ring at `ring @ 24% alpha` (softer)

---

## 7. Motion

| Property | Duration | Easing |
|---|---|---|
| color | 120ms | ease |
| border-color | 120ms | ease |
| background | 120ms | ease |
| box-shadow (focus) | 120ms | ease |
| theme switch | 0ms (suppress all transitions during the swap) | — |

No long animations, no bounce, no parallax. The motion is just enough to feel responsive.

---

## 8. Global texture

Body has a fixed full-viewport noise overlay:

- SVG turbulence (`feTurbulence` `baseFrequency=0.9`, `numOctaves=4`)
- 256×256 px tile, `background-repeat: repeat`
- **Opacity: 0.035** (3.5%)
- `pointer-events: none`
- Sits above background, below all content (`position: fixed; inset: 0`)

If your stack can't easily render SVG turbulence, ship a 256×256 PNG of monochrome noise at 3.5% opacity instead. Don't skip this layer — it kills color banding and gives the UI subtle warmth.

---

## 9. Scrollbars (webkit / styled)

- Width: **6px**
- Track: transparent
- Thumb: `rgba(0,0,0,0.15)` light / `rgba(255,255,255,0.10)` dark
- Thumb hover: `rgba(0,0,0,0.25)` light / `rgba(255,255,255,0.18)` dark
- Thumb radius: 3px
- Some lists (chip strips, etc.) hide scrollbars entirely

---

## 10. Opacity scale (commonly used)

`opacity-64` (64%) for disabled. `opacity-80` for hover de-emphasis on links. `opacity-72` for muted placeholders. No other opacity values appear consistently — keep to these.
