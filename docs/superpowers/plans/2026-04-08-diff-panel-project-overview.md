# Diff Panel Project Overview

Status: in progress

## Goal

Keep the diff panel useful on draft/new-thread routes by showing the current project's thread diffs instead of the empty "Select a thread" state.

## Notes

- Draft threads do not exist in the main thread store yet.
- The diff panel now derives project context from the draft route and can render thread-level diff summaries for the current project.
- Browser coverage was added for the new-thread route and diff panel behavior.
