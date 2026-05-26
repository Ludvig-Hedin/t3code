---
title: Empty State Canonical Pattern
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Empty State Canonical Pattern

A 3-part visual hierarchy pattern for displaying empty states in UI components, using progressively muted text colors for heading, reason, and action hint.

## Key Points

- Structure: heading (most prominent) → reason (medium) → action hint (least prominent)
- Color hierarchy: `text-muted-foreground` → `text-muted-foreground/50` → `text-muted-foreground/40` (or /30)
- Apply consistently across all empty states: sidebars, search results, panels, lists
- Distinguishes "nothing here yet" from "your search found nothing" contextually

## Details

Empty states are often neglected, showing only "No results" without context. The canonical pattern provides a consistent, informative structure:

### Visual Hierarchy

```tsx
<div className="text-center py-8">
  <p className="text-muted-foreground font-medium">
    No projects yet
  </p>
  <p className="text-muted-foreground/50 text-sm mt-1">
    Create your first project to get started
  </p>
  <p className="text-muted-foreground/40 text-xs mt-2">
    Tip: Use Cmd+N to create a new project
  </p>
</div>
```

### Three Components

1. **Heading** (`text-muted-foreground`): What's empty — "No search results", "No threads yet", "No skills installed"
2. **Reason** (`text-muted-foreground/50`): Why it's empty or what caused this state — "Try different search terms", "Start a conversation", "Visit the skills marketplace"
3. **Action hint** (`text-muted-foreground/40` or `/30`): How to change the state — keyboard shortcut, button location, or workflow suggestion

### Application Examples

- **Sidebar threads**: "No threads yet" / "Start a conversation to see it here" / "Cmd+N to create"
- **Search modal**: "No results for 'query'" / "Try different keywords" / "Search supports regex"
- **Skills manager**: "No skills installed" / "Skills extend agent capabilities" / "Browse marketplace →"

This pattern was applied across Sidebar, SkillsManager, SearchModal, and ChatView during the t3code UX audit.

## Related Concepts

- [[concepts/diagnostic-empty-states]] — Surfaces why detection failed; more detailed variant for technical contexts
- [[concepts/tool-call-display-humanization]] — Another UI pattern for displaying technical information accessibly
- [[concepts/startup-milestone-logging]] — Progressive disclosure pattern for status information

## Sources

- daily/2026-05-10.md — Session (15:49): "Empty state canonical pattern: 3-part with text-muted-foreground/{50,40,30} hierarchy"
- daily/2026-05-10.md — Session (23:13): "Canonical empty-state pattern: text-muted-foreground/{50,40,30} hierarchy for heading/reason/action"
