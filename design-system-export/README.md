# Design System Export — t3code

This bundle describes a complete visual language so any app, in any language or framework, can be rebuilt with the same look and feel.

## Files in this bundle

| File | Purpose |
|---|---|
| `README.md` | This file — instructions for the receiving agent |
| `DESIGN_TOKENS.md` | All raw values: colors, radii, fonts, spacing, motion |
| `COMPONENTS.md` | Recipes for buttons, cards, inputs, surfaces, scrollbars |
| `PORTING_GUIDE.md` | Step-by-step rebuild + per-framework cheatsheets (SwiftUI, Flutter, RN, Tailwind, plain CSS) |

## Instructions for the receiving Claude / Codex / agent

Paste this README into the new thread. Then say:

> I want this app to look like the reference described in these four markdown files. Read all four, then propose a token file and a starter set of components that match my current stack. Apply the visual language exactly — same colors, radii, surface treatments, density, and motion. Do not invent new tokens; map every component to a semantic token from `DESIGN_TOKENS.md`.

### Hard rules the new agent must follow

1. **Never reference raw hex values in components.** Components always use semantic tokens (`background`, `foreground`, `primary`, `border`, etc.).
2. **Two themes, one component tree.** Light and dark share the same semantic token names; only the values flip. Switch by toggling one class/attribute at the root.
3. **Alpha-tinted blacks (light) and whites (dark)** for `secondary`, `muted`, `accent`, `border`, `input` — never opaque mid-grays. This is the signature look.
4. **Every elevated surface follows the four-layer recipe** in `COMPONENTS.md` (fill + border + drop shadow + inset highlight).
5. **Radii derive from a single base** of `10px`. Never hand-pick radii.
6. **Density tightens on larger screens.** Heights drop ~4px at the `sm:` breakpoint (or your framework's equivalent).
7. **Subtle noise overlay** at 3.5% opacity over the whole viewport — kills banding, adds tactility.

## Visual summary (so the agent knows what they're aiming for)

- **Vibe:** calm, monochrome, alpha-layered, slightly tactile. Apple-adjacent but flatter.
- **Accent:** single indigo/blue primary (`oklch(0.488 0.217 264)` light, `oklch(0.588 0.217 264)` dark). No multi-color brand.
- **Type:** DM Sans for UI (14px root), SF Mono for code (13px). Weights 400 / 500 / 600 only.
- **Corners:** soft (10–18px on most surfaces; cards 18px, buttons 10px, badges 6–8px).
- **Borders:** always 1px, always alpha-tinted (black 8% light, white 6% dark).
- **Shadows:** tiny (`0 1px 2px rgba(0,0,0,0.05)`) + a 1px inset highlight inside the surface. Never large drop shadows.
- **Motion:** 120ms ease on color, border, background. No bounce, no large slides.

Once the agent has read all four files it should be able to build any screen and have it feel native to this design system.
