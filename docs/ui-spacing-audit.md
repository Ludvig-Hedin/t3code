# UI Spacing Audit

This repo currently uses several different page-shell spacing patterns across the main app. The result is that adjacent pages feel like they belong to different products even though they share the same sidebar, header, and content model.

## What already feels right

- `settings` pages use a centered content column with a clear max width and predictable page padding.
- `thread` pages use a tighter reading width and smaller outer gutters, which keeps the chat surface dense without feeling cramped.

## Current inconsistencies

- `settings` uses `SettingsPageContainer` with `p-6` and `max-w-4xl`.
- `skills` uses its own container with `px-4 sm:px-10`, `py-10`, and `max-w-[960px]`.
- `plugins` uses a full-width catalog shell with `px-6` and no shared page-width cap.
- `automations` uses a full-width table shell with `px-4` and no shared page-width cap.
- `mobile` settings already uses a different but still centered shell, so the app has at least three separate outer-spacing recipes today.

## Recommendation

Use one shared page-shell system with a small number of explicit variants instead of per-page ad hoc spacing.

- `content` variant for settings-style pages: centered column, `px-4 sm:px-6`, `py-6`, `max-w-4xl`.
- `reading` variant for thread-style pages: tighter gutters, `px-3 sm:px-5`, no extra centering on the main scroll area, composer capped separately.
- `catalog` or `table` variant for plugins and automations: still centered, but wider than settings, with the same outer gutter scale and a shared max width.

## Unification order

1. Extract the shared shell into a reusable component instead of keeping spacing inline inside each route or manager.
2. Move `settings`, `skills`, `plugins`, and `automations` onto that shell first.
3. Normalize vertical rhythm next, so major sections use the same spacing between headers, toolbars, and content blocks.
4. Leave inner component density alone unless a page still looks off after the shell change.

## Status

- `skills`, `plugins`, and `automations` now share the same `p-6` page-edge padding.
- Inner component spacing still varies where it needs to, but the page shells are now aligned.

## Why this matters

- The user reads spacing as product consistency.
- A shared shell will reduce one-off layout fixes.
- It will make future pages easier to add without creating another spacing dialect.
