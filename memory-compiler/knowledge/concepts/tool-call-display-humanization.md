---
title: "Tool Call Display Humanization"
aliases: [clean-tool-calls, focus-view, tool-call-formatting, agent-output-display]
tags: [ux, chat-ui, ai-tools, display-formatting]
sources:
  - "daily/2026-04-13.md"
created: 2026-04-13
updated: 2026-04-13
---

# Tool Call Display Humanization

AI chat UIs that show agent tool calls (file reads, searches, edits, shell commands) can overwhelm users with raw JSON data. A "clean" or "focus" display mode transforms these into concise, human-readable inline summaries with subtle Lucide icons. The feature is implemented as a toggleable setting (defaulting to clean), with a formatting utility that maps tool names and parameters to natural-language descriptions. The clean display intentionally hides tool call results/output entirely, showing only the action description.

## Key Points

- **Mapping tool calls to descriptions** - Each tool type (Grep, Read, Edit, Bash, Glob, Agent, etc.) has a formatter that extracts key parameters into a one-line summary
- **Lucide icons over emojis** - Use `Search`, `FileText`, `Pencil`, `Terminal`, `FolderSearch`, `Bot`, `Globe`, `Wrench` icons for visual categorization
- **Subtlety is key** - 40% opacity, `text-xs`, minimal spacing; tool calls should be visible but not attention-competing
- **Hide results entirely** - Clean mode shows only the action description, not the output/response from the tool
- **Toggleable via settings** - `cleanToolCallDisplay` boolean setting defaults to `true`; users can switch to raw JSON view

## Details

### Formatting Utility

A `formatToolCallForDisplay()` function maps tool call data to human-readable strings:

```typescript
function formatToolCallForDisplay(toolCall: ToolCall): string {
  switch (toolCall.toolName) {
    case "Grep":
      return `Searched for "${toolCall.params.pattern}" in ${toolCall.params.path || "codebase"}`;
    case "Read":
      const lines =
        typeof toolCall.params.offset === "number" && toolCall.params.limit
          ? ` (lines ${toolCall.params.offset}-${toolCall.params.offset + toolCall.params.limit})`
          : "";
      return `Read ${toolCall.params.file_path}${lines}`;
    case "Write":
      return `Wrote to ${toolCall.params.file_path}`;
    case "Edit":
      return `Edited ${toolCall.params.file_path}`;
    case "Bash":
      const cmd = toolCall.params.command?.slice(0, 60);
      return `Ran \`${cmd}${toolCall.params.command?.length > 60 ? "..." : ""}\``;
    case "Glob":
      return `Found files matching ${toolCall.params.pattern}`;
    case "Agent":
      return `Dispatched agent: ${toolCall.params.description}`;
    case "WebFetch":
      return `Fetched web: ${toolCall.params.url}`;
    case "WebSearch":
      return `Searched web: ${toolCall.params.query}`;
    default:
      return `${toolCall.toolName}: ${JSON.stringify(toolCall.params).slice(0, 80)}`;
  }
}
```

The formatter extracts the most informative parameter for each tool type, producing summaries like:

- "Searched for `useOnboarding` in src/hooks/"
- "Read src/components/OnboardingFlow.tsx (lines 1-50)"
- "Ran `npm run build`"
- "Edited src/lib/formatToolCall.ts"

### Clean Display Component

The `CleanToolCallDisplay` component renders as inline muted text with a small icon:

```tsx
function CleanToolCallDisplay({ toolCall }: { toolCall: ToolCall }) {
  const description = formatToolCallForDisplay(toolCall);
  const Icon = getToolIcon(toolCall.toolName);

  return (
    <div className="flex items-center gap-1.5 opacity-40 text-xs text-muted-foreground py-0.5">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{description}</span>
    </div>
  );
}
```

Key styling decisions:

- `opacity-40` — subtle enough to not compete with assistant text
- `text-xs` — smaller than message text
- `py-0.5` — tight vertical spacing between consecutive tool calls
- `truncate` — long descriptions clip rather than wrap

### Property Name Gotcha

A critical implementation detail: the tool call data structure may use `toolCall.toolName` rather than `toolCall.name` for the tool identifier. Using the wrong property causes the formatter to fall through to the generic default for every tool, and if the component filters by name, it can cause the entire conversation to disappear (rendering nothing). Always verify the actual data shape before building the formatter.

### Iterative Design Process

The feature went through several refinement rounds:

1. **Initial:** Emoji icons + bordered cards → too visible, inconsistent with app style
2. **Second pass:** Lucide icons + still showing results → too much information
3. **Third pass:** Results hidden entirely → cleaner but still too prominent
4. **Final:** 40% opacity, text-xs, minimal spacing → properly subtle and non-intrusive

The user's feedback drove progressive reduction: "make it less visible", "make the icons not emojis", "40% opacity or something and smaller". This illustrates that AI tool call display should be ambient information, not primary content.

### Settings Integration

The setting is added to the app's settings schema and UI:

```typescript
// Settings schema
cleanToolCallDisplay: z.boolean().default(true)

// Settings panel toggle
<SettingToggle
  label="Clean tool call display"
  description="Show tool calls as compact inline text instead of detailed cards"
  value={settings.cleanToolCallDisplay}
  onChange={(v) => updateSetting("cleanToolCallDisplay", v)}
/>
```

Defaulting to `true` means new users get the clean experience immediately. Power users who want raw JSON can toggle it off.

## Related Concepts

- [[concepts/settings-ui-management-pattern]] - Settings toggle for the display mode
- [[concepts/startup-milestone-logging]] - Similar pattern of transforming technical output into human-readable UX

## Sources

- [[daily/2026-04-13.md]] - "Built `formatToolCallForDisplay()` function that transforms raw tool call data into human-readable summaries: Grep → 'Searched for X in Y', Read → 'Read path/to/file', Bash → 'Ran command: X'"
- [[daily/2026-04-13.md]] - "Replaced emoji icons with Lucide React icons and made styling more subtle with muted colors and smaller text"
- [[daily/2026-04-13.md]] - "User feedback: 'make it even more subtle. 40% opacity or something and smaller and more compact and tighter together'"
- [[daily/2026-04-13.md]] - "The tool call data used toolCall.toolName but component was checking toolCall.name — caused entire conversation to disappear"
