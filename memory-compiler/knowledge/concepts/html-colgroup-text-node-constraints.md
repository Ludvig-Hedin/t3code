---
title: "HTML <colgroup> Text Node Constraints"
aliases: [colgroup-constraints, html-semantic-constraints, strict-html-elements]
tags: [html, semantic, react, hydration]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# HTML <colgroup> Text Node Constraints

The HTML `<colgroup>` element is strict about its children: only `<col>` and nested `<colgroup>` elements are allowed. Any whitespace, comments, or text nodes create server/client hydration mismatches in React because the server's HTML differs from the client's virtual DOM. This is a common source of "hydration error" bugs in table layouts with column definitions, particularly when JSX formatting introduces implicit text nodes.

## Key Points

- `<colgroup>` only allows `<col>` and `<colgroup>` children—no text nodes or comments
- Whitespace from JSX formatting (newlines, indentation) creates implicit text nodes
- Comments within `<colgroup>` (e.g., `{/* checkbox */}`) create text nodes during rendering
- Server renders one tree; client renders another → hydration mismatch
- Error manifests as React warning about inconsistent DOM structure

## Details

### The Problem

In JSX, comments and formatting can inadvertently create text nodes:

```jsx
<colgroup>
  <col /> {/* checkbox column */}
  <col /> {/* name column */}
  <col /> {/* actions column */}
</colgroup>
```

During rendering:

1. Each `{/* ... */}` comment is dropped (comments are removed in JSX)
2. Newlines between `<col />` elements become implicit text nodes
3. Server (Node.js) may normalize whitespace differently than the browser
4. Client renders from JSX and sees different whitespace structure
5. React detects mismatch: "server had X nodes, client has Y"

### Strict HTML Container Model

`<colgroup>` is one of a handful of HTML elements with strict content models that don't tolerate text nodes:

| Element         | Allowed Children         | Strictness            |
| --------------- | ------------------------ | --------------------- |
| `<colgroup>`    | `<col>`, `<colgroup>`    | Very strict—no text   |
| `<tbody>`       | `<tr>` only              | Strict—no direct text |
| `<select>`      | `<option>`, `<optgroup>` | Strict—no raw text    |
| `<ul>` / `<ol>` | `<li>` only              | Strict—no direct text |

Whitespace in these containers is often stripped by browsers during parsing, but SSR engines may preserve it, causing server/client divergence.

### The Solution

**Option 1: Single-line formatting**

```jsx
<colgroup>
  <col /> <col /> <col /> {/* all columns on one line */}
</colgroup>
```

**Option 2: Block comment outside the container**

```jsx
{
  /* Columns: checkbox (1), name (2), actions (3) */
}
<colgroup>
  <col />
  <col />
  <col />
</colgroup>;
```

The key is: no comments or extra whitespace inside the `<colgroup>` tags.

## Related Concepts

- [[concepts/react-hydration-mismatch-from-jsx-formatting]] - Broader hydration problem from formatting
- [[concepts/zustand-selector-stability-anti-pattern]] - Another reference stability issue in React

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"
- [[daily/2026-04-12.md]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
