# Automations

Bird Code automations are currently stored client-side in the web app via Zustand + `localStorage`.

## Current behavior

- Creating, editing, renaming, deleting, and sorting automations all happen in the browser.
- Manual run now starts a real chat thread with the automation prompt and marks the automation as running while the turn is created.
- The automation thread is created through the same orchestration path as a normal chat turn, so the prompt lands in a real conversation instead of only updating timestamps.

## Current limitation

- Scheduled automations are still browser-session-bound.
- They do not run if the app is closed, the browser tab is gone, or the machine is asleep.
- Closing the laptop lid will stop them unless there is an always-on background process that keeps the session alive.

## Follow-up work

- Move scheduling to a server-side or desktop background worker if automations need to survive sleep / lid close.
- Add per-automation execution history so runs can be traced after the fact.
