# 2026-04-20 Chat Header And Composer Responsiveness

## Goal

Prevent the chat composer footer and main chat header from looking compressed when the thread column becomes narrow.

## Changes

- Made the prompt improvement control collapse to icon-only when its available width drops below a safe threshold.
- Made the main chat header respond to container width instead of only viewport width.
- Moved secondary header actions into an overflow popover on narrow desktop layouts so actions stay reachable.
- Hid primary header labels at tighter widths while keeping tooltips and `aria-label`s intact.

## User-facing impact

- The Improve button no longer gets its text smashed in narrow composer layouts.
- The chat header now holds up better when sidebars or panels reduce the available width.

## Architectural note

- The composer fix is self-contained in `ComposerImproveButton` using a local `ResizeObserver`, which avoids coupling the behavior to `ChatView`.
- The header fix reuses the existing named container in `ChatHeader` so the layout responds to actual available space instead of global breakpoints.
