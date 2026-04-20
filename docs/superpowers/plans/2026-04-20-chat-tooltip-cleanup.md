# 2026-04-20 Chat Tooltip Cleanup

## Goal

Add clear, consistent tooltips to the clickable controls in the chat input, chat header, and sidebar so the UI reads cleanly on hover without relying on icon shape or native `title` attributes.

## Changes

- Added hover tooltips to the prompt-improvement controls, voice recording buttons, compact composer overflow menu, provider/model picker, rate-limit popover trigger, and composer mode toggles.
- Added hover tooltips to the empty-thread project switcher and the sidebar’s primary action buttons.
- Moved the shared sidebar trigger and resize rail onto the same tooltip component so the app chrome uses one consistent affordance pattern.

## Progress note

- The tooltip pass is in place across the main chat surfaces; next step is verification and a small code review sweep for any missed controls or accessibility regressions.

## User-facing impact

- Hovering the main controls now explains the action before the click, which makes the chat composer, header, and sidebar easier to scan quickly.
