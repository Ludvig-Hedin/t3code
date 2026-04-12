# 2026-04-12 - Queued Messages Tray

## Goal

Rework the queued-message UI so it stays attached to the chat that created it and reads as one grouped tray instead of a stack of separate cards.

## Current status

- Queue state is now scoped per thread in local storage.
- The tray now renders as a single grouped container with subtle row dividers.
- Rows use a drag handle on the left for reorder operations when there is more than one item.
- The single-item state hides the drag handle entirely.
- A header-level `Send now` action is wired up for the active queue and advertises `Cmd + Shift + Enter` / `Ctrl + Shift + Enter` in the tooltip.
- Queue removal uses a trash icon instead of an `X`.

## Follow-up

- Verify the tray behavior in the browser on a running chat, a new chat, and a second existing chat.
- If drag-and-drop needs tighter affordance polish, tune the row hover and grab states after visual QA.
