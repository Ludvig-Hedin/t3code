# Clean Tool Output Humanization

## Status

- Completed on 2026-04-18.

## Goal

- Make the chat work log's Clean mode read like a polished activity feed instead of exposing raw shell wrappers and low-signal command strings.

## What Changed

- Clean mode now strips shell launch wrappers like `/bin/zsh -lc` before rendering command activity.
- Common shell commands are translated into plain-English descriptions for the work log.
- Supported mappings now cover:
  - `pwd`
  - `cat <file>`
  - `sed -n 'A,Bp' <file>`
  - `rg` search commands
  - `rg --files` project scans
  - `... | head -n N` result limits
  - chained `&&` commands
- Long clean-mode command/tool-call labels now wrap instead of truncating with ellipsis.
- Verbose mode still preserves the raw command display for debugging.

## User-Facing Impact

- User-facing.
- Tool activity in the chat timeline reads like intent:
  - "Print the current folder, then list key project files and source directories."
  - "Print lines 400–560 of apps/web/src/components/chat/MessagesTimeline.tsx."
  - "Search in apps/web/src for \"ChatView\", \"Message\", or \"Thread\" (skip node_modules) (first 200 matches)."

## Architectural Notes

- Humanization lives in `apps/web/src/components/chat/humanizeToolDetail.ts` so both dynamic tool-call rows and command-execution rows share the same translation layer.
