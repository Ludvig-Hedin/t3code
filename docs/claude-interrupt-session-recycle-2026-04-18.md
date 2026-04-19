# Claude Interrupt Session Recycle

Date: 2026-04-18
Status: completed
Type: user-facing reliability fix

## Summary

Stopping a stuck Claude turn from the chat UI could leave the underlying Claude SDK runtime in a bad state. The next message in the same thread then reused that broken runtime and failed with:

`Claude Code returned an error result: No conversation found with session ID: ...`

## Root cause

- The chat stop button dispatches `thread.turn.interrupt`.
- In the Claude adapter, `interruptTurn()` only called `query.interrupt()`.
- That left the live SDK query/session object in memory.
- When Claude's runtime got wedged after the interrupt, the next user message reused the same broken runtime instead of forcing a fresh resumable session.

## Fix

- After interrupting an active Claude turn, the adapter now recycles the live Claude runtime session immediately.
- The thread's persisted resume cursor is still preserved by the provider session directory, so the next user message can recover onto a fresh Claude runtime instead of losing thread continuity.

## Validation

- Added a regression test in `apps/server/src/provider/Layers/ClaudeAdapter.test.ts`.
- Verified the test covers:
  - interrupted turn completion
  - query close on interrupt
  - session exit
  - adapter session removal after interrupt

## Notes

- This is intentionally scoped to Claude.
- Repo-wide `bun typecheck` is currently blocked by unrelated in-progress `cursor` provider changes in `apps/web`.
- Targeted validation for this fix used the server package test and typecheck successfully.
