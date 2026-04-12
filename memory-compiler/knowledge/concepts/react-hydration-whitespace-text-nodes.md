---
title: "React Hydration Errors from Whitespace and Special HTML Elements"
aliases: [hydration-mismatch, colgroup-whitespace, jsx-formatting-html]
tags: [react, html, debugging, hydration]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Errors from Whitespace and Special HTML Elements

Some HTML elements (like `<colgroup>`) are strict about what content they can contain. When JSX formatting inadvertently introduces whitespace text nodes or inline comments, a server-rendered DOM may differ from the client-rendered DOM, causing React hydration mismatches. Understanding which HTML elements are strict and how JSX formatting interacts with them is essential for preventing these errors.

## Key Points

- `<colgroup>` elements can only contain `<col>` and `<colgroup>` children—any text nodes (whitespace or comments) violate HTML spec
- Inline comments within special containers (e.g., `{/* checkbox */}`) combined with newline formatting create implicit text nodes
- Server and client may render differently: server may preserve text nodes while client-side React strips them, causing hydration mismatch
- The fix is surgical: remove inline comments or text nodes from within strict containers; preserve documentation via block comments
- This pattern applies to other strict containers: `<table>`, `<tbody>`, `<thead>`, `<tfoot>`, `<tr>` (only `<td>` or `<th>` allowed inside)

## Details

### The `<colgroup>` Constraint

The HTML spec defines `<colgroup>` as a container for `<col>` and nested `<colgroup>` elements only. Any text node—including whitespace and newlines—violates this constraint:

```jsx
// ❌ WRONG: Inline comment creates implicit text node
<colgroup>
  <col span={1} />
  {/* checkbox */}
  <col span={99} />
</colgroup>

// This renders as:
// <colgroup>
//   <col span="1">
//   " "                          <-- whitespace text node (and comment)
//   <col span="99">
// </colgroup>
```

On the server, the renderer may include whitespace or comments; on the client, React's JSX compiler may handle it differently, creating a mismatch.

### Why JSX Formatting Matters

JSX is whitespace-sensitive within expressions. Newlines and indentation can create implicit text nodes:

```jsx
// The newline and indentation here are PART OF THE TREE
<colgroup>
  <col />
  <col />
</colgroup>

// Renders as:
// <colgroup>
//   <col>     <- node
//   \n        <- text node (whitespace!)
//   <col>     <- node
// </colgroup>
```

In most contexts (like `<div>`), whitespace text nodes are ignored by browser rendering and React hydration. But in strict containers, they cause mismatches.

### The Fix

Remove comments from within strict containers and document logic above the container:

```jsx
// ✅ CORRECT: Documentation moved outside
// The first column is for checkboxes (1 span)
// Remaining columns display content (99 span)
<colgroup>
  <col span={1} />
  <col span={99} />
</colgroup>
```

This ensures no text nodes inside the container, matching server and client renders.

### Strict HTML Containers

Elements that only allow specific children (no text nodes):

- `<colgroup>` - only `<col>` and `<colgroup>`
- `<table>` - only `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<caption>`, `<colgroup>`
- `<tbody>`, `<thead>`, `<tfoot>` - only `<tr>`
- `<tr>` - only `<td>`, `<th>`
- `<select>` - only `<option>`, `<optgroup>`
- `<svg>` - only SVG elements

## Related Concepts

- [[concepts/zustand-selector-stability]] - Hydration errors are one class of runtime errors; selector stability is another
- [[concepts/react-commit-phase-debugging]] - Some hydration errors manifest during specific commit phases

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"
- [[daily/2026-04-12.md]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
- [[daily/2026-04-12.md]] - "JSX formatting decisions (newlines, spacing) interact with semantic HTML constraints"
