# Component Recipes

Each recipe describes a component in terms of the semantic tokens defined in `DESIGN_TOKENS.md`. Reproduce these recipes in whatever component primitives your stack uses.

---

## Button

### Shared base (all variants)

- Layout: inline flex, center, `gap: 8px`
- Shape: `radius-lg` (10px), 1px border
- Type: weight 500, 14px mobile / 13px desktop
- Cursor: pointer
- Focus: 2px ring in `ring`, 1px offset of `background`
- Disabled: `opacity: 0.64`, no pointer events
- Inner icon size: 18px mobile, 16px desktop
- Min touch target: 44×44 (use invisible padding on pointer-coarse devices)
- Whitespace: no-wrap
- Transitions: 120ms ease on `color, border-color, background, box-shadow`

### Sizes

| Size | Height (mobile / desktop) | Horizontal padding | Notes |
|---|---|---|---|
| `xs` | 28 / 24 | ~7px | radius drops to `radius-md` (8px) |
| `sm` | 32 / 28 | ~9px | gap 6px |
| `default` | 36 / 32 | ~11px | |
| `lg` | 40 / 36 | ~13px | |
| `xl` | 44 / 40 | ~15px | 16px text mobile / 14px desktop |
| `icon` | 36×36 / 32×32 | — | square |
| `icon-sm` | 32×32 / 28×28 | — | square |
| `icon-xs` | 28×28 / 24×24 | — | square, `radius-md` |
| `icon-lg` | 40×40 / 36×36 | — | square |
| `icon-xl` | 44×44 / 40×40 | — | square, 20/18px icon |

### Variants

#### `default` (primary)

- bg = `primary`, border = `primary`, text = `primary-foreground`
- Drop shadow: `0 1px 2px primary @ 24% alpha`
- **Inner top highlight:** `inset 0 1px 0 rgba(255,255,255,0.16)` (the "lit" feel)
- Hover/pressed: `bg = primary @ 90%`
- Active/pressed: replace top highlight with `inset 0 1px 0 rgba(0,0,0,0.08)`, drop shadow removed

#### `destructive`

Same recipe as `default` but with `destructive` in place of `primary`. Text stays white.

#### `outline`

- bg = `popover` (light) or `input @ 32% alpha` (dark)
- border = `input`
- text = `foreground`
- Drop shadow: `0 1px 2px rgba(0,0,0,0.05)`
- Inset highlight: `inset 0 1px 0 rgba(0,0,0,0.04)` (light) or `inset 0 -1px 0 rgba(255,255,255,0.06)` (dark)
- Hover: bg shifts to `accent @ 50%` (light) or `input @ 64%` (dark)

#### `destructive-outline`

Same as `outline` but text = `destructive-foreground`. Hover border = `destructive @ 32%`, hover bg = `destructive @ 4%`.

#### `secondary`

- bg = `secondary`, no border
- text = `secondary-foreground`
- Hover: bg = `secondary @ 90%`
- Active: bg = `secondary @ 80%`

#### `ghost`

- No bg, no border (transparent)
- text = `foreground`
- Hover: bg = `accent`
- Pressed: bg = `accent`

#### `link`

- Transparent, no border
- text inherits, underline only on hover (`underline-offset: 4px`)

---

## Card

- Container: `display: flex; flex-direction: column`
- bg = `card`, text = `card-foreground`
- Border: 1px in `border`
- Radius: `radius-2xl` (18px)
- Drop shadow: `0 1px 2px rgba(0,0,0,0.05)`
- Inset highlight: `inset 0 1px 0 rgba(0,0,0,0.04)` light / `inset 0 -1px 0 rgba(255,255,255,0.06)` dark, applied via `::before` so it sits inside the border at `radius - 1px`

### Card sub-parts

| Slot | Padding | Type |
|---|---|---|
| Card header | `24px` all around | grid, gap 6px between title and description |
| Card title | — | weight 600, 18px, line-height 1 |
| Card description | — | 14px, color = `muted-foreground` |
| Card content | `24px` all around (top reduced to 0 if header present) | — |
| Card footer | `24px` all around (top reduced to 16px if content present) | flex items center |
| Card action | (auto-placed top-right) | — |

### CardFrame (compound card with sub-sections)

A grouped card where multiple child cards stack inside a single rounded shell. Inner cards lose their own shadow/highlight; the outer frame owns the chrome. First child gets a flat top, last child gets a flat bottom; middle children get fully flat top + bottom radii. Useful for settings panels.

---

## Input (text field)

### Outer wrapper

- Span/container, inline-flex, full width
- bg = `background` (light) or `input @ 32%` (dark)
- Border: 1px in `input`
- Radius: `radius-lg` (10px)
- Drop shadow: `0 1px 2px rgba(0,0,0,0.05)`
- Inset highlight: same rule as buttons/cards
- Transitions: 120ms ease on shadow only

### States

| State | Change |
|---|---|
| Focus | border = `ring`, 3px outer ring in `ring @ 24% alpha`, drop shadow removed |
| Invalid (`aria-invalid`) | border = `destructive @ 36%`, ring = `destructive @ 16%` |
| Invalid + focus | border = `destructive @ 64%`, ring = `destructive @ 16%` |
| Disabled | `opacity: 0.64`, drop shadow removed |
| Autofill | bg = `foreground @ 4%` (light) / `foreground @ 8%` (dark) |

### Inner input element

- Height: 34px mobile / 30px desktop (default size)
- Horizontal padding: 11px
- bg: transparent (inherits wrapper)
- Placeholder: `muted-foreground @ 72%`

### Sizes

| Size | Mobile / Desktop |
|---|---|
| `sm` | 30 / 26 |
| `default` | 34 / 30 |
| `lg` | 38 / 34 |

---

## Popover / Menu / Dialog

- bg = `popover`, text = `popover-foreground`
- Border: 1px `border`
- Radius: `radius-lg` to `radius-xl`
- Same surface recipe as Card (drop shadow + inset highlight)
- Backdrop (modal): `rgba(0,0,0,0.4)` light / `rgba(0,0,0,0.6)` dark, with optional small blur

---

## Badge / Chip

- Inline-flex, center, `gap: 4px`
- Padding: 2px 8px
- Radius: `radius-sm` (6px) or `radius-md` (8px)
- Font: weight 500, 12px
- Variants:
  - `default`: bg = `secondary`, text = `secondary-foreground`
  - `outline`: transparent bg, 1px `border`, text = `foreground`
  - `destructive`: bg = `destructive @ 12%`, text = `destructive-foreground`, border = `destructive @ 24%`
  - `success` / `warning` / `info`: analogous to destructive

---

## Tooltip

- bg = `foreground`, text = `background` (inverted)
- Padding: 4px 8px
- Radius: `radius-md` (8px)
- Font: 12px, weight 500
- Drop shadow: `0 4px 12px rgba(0,0,0,0.15)`
- Show delay ~300ms, hide ~100ms

---

## Switch / Toggle

- Track: 1px border `input`, bg = `muted` (off) → `primary` (on), radius = full pill
- Thumb: white, radius = full, `0 1px 2px rgba(0,0,0,0.15)` drop shadow
- Track size: 28×16 mobile, 24×14 desktop
- Transition: 120ms ease on bg + thumb position

---

## Checkbox / Radio

- Size: 16×16
- Border: 1px `input`
- bg: `background`
- Radius: `radius-sm` (6px) for checkbox, full circle for radio
- Checked: bg = `primary`, border = `primary`, white checkmark/dot
- Focus: 2px ring `ring @ 24%`

---

## Separator

- 1px line in `border` color
- Default direction: horizontal, full width

---

## Sidebar

- bg = `card` (slightly lifted from `background`)
- 1px `border` on the inner edge
- Default width: 280px
- Collapsible to ~52px (icons only)
- Item rows: 32px tall, `radius-md`, hover bg = `accent`
- Active item: bg = `accent`, text = `accent-foreground`, optional 2px primary indicator on the leading edge

---

## Scrollbar (custom)

See `DESIGN_TOKENS.md` §9 — 6px wide, alpha-thumb, 3px radius.

---

## Markdown content (chat / docs)

- Paragraphs: margin 10.4px (0.65rem) vertical
- Lists: `padding-left: 20px`; disc → circle → square nesting
- Code (inline): 1px `border`, bg = `muted`, padding 1.6px 5.6px, radius 6px, font 12px mono
- Code (block): 1px `border`, bg = `muted`, radius 12px, padding ~13px
- Link: color = `info-foreground`, underline at 40% alpha of that color; hover opacity 0.8
- Blockquote: 2px left border in `border`, color = `muted-foreground`, padding-left 13px
- Table: full-width, 1px `border` on cells, cell padding ~6px 7px, left-aligned

---

## Empty states

- Centered vertical stack
- Icon: 32–48px, color = `muted-foreground`
- Title: weight 600, 16px
- Description: 14px, `muted-foreground`, max-width ~360px
- Optional action button below (any variant)

---

## Notification / Toast

- Surface recipe (card)
- Padding: 12px 16px
- Optional 4px left bar in `success` / `warning` / `destructive` / `info` color
- Auto-dismiss with subtle fade + 4px slide

---

## Loading

- Spinner: 16px, 2px stroke, `border` color with `primary` arc; 1s linear infinite rotate
- Skeleton: bg = `muted`, animated shimmer gradient running left → right over 2s linear infinite (the `skeleton` keyframes move `background-position` from `200% 0` to `-200% 0`)
