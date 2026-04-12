---
title: "React Hydration Mismatches and HTML Container Element Strictness"
aliases: [hydration-errors, colgroup-strictness, html-container-constraints]
tags: [react, hydration, html-semantics, debugging]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Mismatches and HTML Container Element Strictness

Certain HTML container elements (like `<colgroup>`) have strict content models and only allow specific child elements. When JSX formatting introduces unexpected text nodes or whitespace—especially through inline comments within these containers—the server-rendered HTML differs from the client-rendered version, causing React hydration mismatches. These mismatches manifest as console warnings and potential rendering issues.

## Key Points

- **Container element strictness** - `<colgroup>` only allows `<col>` and `<colgroup>` children; any text nodes cause server/client mismatch
- **Inline comments create text nodes** - JSX comments like `{/* checkbox */}` after `<col>` elements are rendered as whitespace text nodes in the DOM
- **Hydration errors are subtle** - The app may render correctly but with console warnings about mismatches during hydration
- **Formatting interacts with semantics** - Newlines and indentation in JSX are significant when they create implicit text node children
- **Minimal fix approach** - Remove inline comments from within container elements; document intent in block comments instead

## Details

The `<colgroup>` element in HTML tables has a restricted content model. According to HTML5 spec, it can contain only `<col>` and nested `<colgroup>` elements. Any other content—including text nodes from whitespace, newlines, or comments—violates this constraint.

In JSX, when developers write:

```jsx
<colgroup>
  <col width="80px" />
  {/* checkbox */}
  <col />
  {/* date */}
  <col />
</colgroup>
```

The JSX compiler preserves whitespace and creates implicit text nodes between elements. Server-side rendering (Node.js) and client-side rendering (browser) may handle these text nodes differently, causing a hydration mismatch. React detects the discrepancy and warns about "server/client content mismatch."

### Solutions

**Remove inline comments from within containers** - Move comment documentation to a block comment before the container:

```jsx
// Column widths and purposes: checkbox (80px), date, content
<colgroup>
  <col width="80px" />
  <col />
  <col />
</colgroup>
```

**Use CSS classes for semantic clarity** if column purpose is important for styling.

**Validate container content models** - Before rendering, check if the element has content model restrictions. Common strict containers: `<colgroup>`, `<thead>`, `<tbody>`, `<tfoot>`, `<table>`.

## Related Concepts

- [[concepts/zustand-selector-memory-references]] - Another source of hydration-related re-render issues
- [[concepts/effect-router-wildcard-patterns]] - Related to routing edge cases during SSR/hydration

## Sources

- [[daily/2026-04-12.md]] - "Removed inline comments from within `<col>` elements; documentation already exists in block comment above `<colgroup>`"
- [[daily/2026-04-12.md]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
