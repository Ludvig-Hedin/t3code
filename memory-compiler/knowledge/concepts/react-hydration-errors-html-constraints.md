---
title: "React Hydration Errors and HTML Container Constraints"
aliases: [hydration-mismatch, colgroup-text-nodes, html-strict-children]
tags: [react, html, debugging, performance]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Errors and HTML Container Constraints

React hydration errors occur when the server-rendered HTML structure differs from what React expects during client hydration. Certain HTML elements like `<colgroup>` have strict content models: they only allow specific child elements and will reject text nodes (including whitespace). JSX inline comments within these containers inadvertently create text nodes through formatting, causing server/client mismatches.

## Key Points

- **Strict content model** - `<colgroup>` only allows `<col>` and `<colgroup>` children; any text nodes cause hydration mismatch
- **Inline comments create text nodes** - JSX comments after elements (e.g., `{/* checkbox */}`) combined with newlines produce implicit text nodes
- **Server-client structure mismatch** - Server renders text nodes; client-side React renders the intended structure without them
- **Documentation should use block comments** - Move inline comments above container elements; documentation already exists elsewhere
- **JSX formatting affects semantics** - Whitespace and newline handling interact with semantic HTML constraints

## Details

HTML elements with strict content models are subject to the HTML specification's requirements. The `<colgroup>` element is designed to contain only `<col>` elements and nested `<colgroup>` elements. When JSX renders:

```jsx
<colgroup>
  <col span={1} />
  {/* checkbox */} {/* This creates a text node during render */}
  <col span={7} />
</colgroup>
```

The inline comment combined with formatting creates an implicit text node. On the server, React may render it differently than on the client, or vice versa, triggering the hydration mismatch error.

The fix is to remove inline comments from within restricted containers and consolidate documentation in a block comment above the container:

```jsx
// Table columns: checkbox + 7 property columns
<colgroup>
  <col span={1} />
  <col span={7} />
</colgroup>
```

This pattern generalizes beyond `<colgroup>` to other strict-content-model elements: `<tbody>`, `<thead>`, `<tfoot>`, `<table>` (children must be `<caption>`, `<colgroup>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`). Any whitespace or text within these containers can cause mismatches.

### Debugging Hydration Errors

When React logs "Hydration failed" or "mismatch", check:

1. Do any elements have strict content models per HTML spec?
2. Are there inline comments or formatting whitespace inside them?
3. Does the rendered structure differ between server and client?

The fix is typically to move comments outside the problematic container and verify no text nodes exist.

## Related Concepts

- [[concepts/zustand-selector-stability-patterns]] - Another category of render-stability bugs
- [[concepts/react-performance-debugging]] - General patterns for React debugging

## Sources

- [[daily/2026-04-12.md]] - Fixed hydration error in AutomationsManager.tsx caused by inline comments within `<colgroup>`
- [[daily/2026-04-12.md]] - Root cause identified: `<colgroup>` strict content model rejects text nodes from formatting/comments
