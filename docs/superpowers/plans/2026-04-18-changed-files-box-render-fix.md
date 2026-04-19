# Changed Files Box Render Fix

## Status

- Completed on 2026-04-18.

## Goal

- Fix the `ChangedFilesBox` warning caused by writing to the UI store from inside a React state updater during render.

## What Changed

- `ChangedFilesBox` now derives its open/closed state directly from the persisted UI store plus its default expansion prop.
- The click handler updates the store from the event path instead of from inside a `setState` updater callback.
- `uiStateStore` now exposes a pure `setChangedFilesExpanded` helper with a no-op fast path when the requested value is already stored.
- A store regression test now covers unchanged-value no-ops for changed-files expansion state.

## User-Facing Impact

- User-facing.
- Expanding and collapsing changed-file groups no longer risks the React render-phase warning that was bubbling up from `uiStateStore.ts`.

## Architectural Notes

- `ChangedFilesBox` is now controlled by the persisted UI store instead of maintaining a separate local open-state mirror, which removes the render-time store write and keeps the behavior predictable.
