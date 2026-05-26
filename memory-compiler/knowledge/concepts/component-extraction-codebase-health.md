---
title: Component Extraction for Codebase Health
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Component Extraction for Codebase Health

Large components should be incrementally decomposed by extracting self-contained UI sections into separate files, reducing cognitive load and improving maintainability.

## Key Points

- Target components over 1000+ lines for extraction candidates
- Extract self-contained sections that have clear boundaries (empty states, modals, forms)
- Prune unused imports after extraction — can clear lint warnings
- Full decomposition is a multi-day effort; ship incremental extractions

## Details

Large React components accumulate complexity over time. A 5900+ line `ChatView.tsx` contains multiple concerns that should be separate components:

1. **Empty draft thread view** — shown when no thread is active
2. **Message list rendering** — the main chat interface
3. **Input composer** — the text input and toolbar
4. **Tool call displays** — specialized UI for function calls

### Extraction Process

The t3code UX overhaul extracted `EmptyDraftThreadView.tsx` from ChatView:

```
Before: ChatView.tsx (5916 lines)
After:  ChatView.tsx (5738 lines) + EmptyDraftThreadView.tsx
Delta:  -178 lines from main component
```

### Extraction Guidelines

1. **Identify boundaries**: Look for conditionally rendered sections (`{!thread && <EmptyState />}`)
2. **Check dependencies**: Props needed, context usage, store subscriptions
3. **Extract with minimal interface**: Pass only what's needed
4. **Prune parent imports**: After extraction, remove unused imports (cleared 4 lint warnings by removing 10 lucide icons)
5. **Test both paths**: Ensure original behavior preserved

### When to Defer

Full decomposition of large components like ChatView is a multi-day effort. The practical approach:

- Ship incremental extractions (e.g., EmptyDraftThreadView first)
- Document remaining extractions as future work
- Each extraction should be independently valuable
- Don't block other work on complete decomposition

## Related Concepts

- [[concepts/project-feature-expansion-pattern]] — Multiple related changes as single unit
- [[concepts/standalone-to-workspace-package-refactoring]] — Similar decomposition at package level
- [[concepts/lazy-file-tree-rpc-expansion]] — Component architecture for performance

## Sources

- daily/2026-05-10.md — Session (15:49): "Agent H decomposed ChatView's empty draft view into EmptyDraftThreadView.tsx (5916→5738 lines, -178 lines)"
- daily/2026-05-10.md — Session (23:13): "S4 ChatView decomposition done partially (−178 lines via EmptyDraftThreadView extraction); full decomposition deferred as multi-day effort"
