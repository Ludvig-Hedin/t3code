#!/usr/bin/env bash
# PostToolUse hook — show file path + git diff after every Write/Edit
#
# Claude Code fires this after each Edit or Write tool call.
# We output a "systemMessage" which appears inline in the conversation
# right below the tool call, so you see exactly what changed without
# having to click into the tool box or scroll to the end-of-thread summary.
#
# For other providers (Gemini, Codex, Cursor): these don't support hooks,
# so we rely on instructions in AGENTS.md / GEMINI.md instead.

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_response.filePath // ""')

# Nothing to show if the tool didn't touch a specific file (e.g. Bash)
[ -z "$file" ] && exit 0

# Get the diff relative to last commit. Falls back to staged diff for
# files that are staged-only, and marks genuinely new files explicitly.
if git -C "$(dirname "$file")" rev-parse --git-dir >/dev/null 2>&1; then
  diff=$(git diff HEAD -- "$file" 2>/dev/null | head -120)
  [ -z "$diff" ] && diff=$(git diff --cached -- "$file" 2>/dev/null | head -120)
  [ -z "$diff" ] && diff="(new file — not yet committed)"
else
  diff="(not in a git repository)"
fi

# systemMessage renders inline in Claude Code immediately after the tool call.
# jq handles all JSON escaping correctly.
jq -n --arg f "$file" --arg d "$diff" \
  '{"systemMessage": ("✏️  " + $f + "\n```diff\n" + $d + "\n```")}'
