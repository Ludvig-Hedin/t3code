---
title: "React Hydration Constraints with Semantic HTML Elements"
aliases: [hydration-mismatch, colgroup-whitespace, html-strict-children]
tags: [react, hydration, html, edge-cases]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Constraints with Semantic HTML Elements

React's server-side rendering (SSR) hydration requires the HTML structure to match exactly between server and client. Certain HTML elements have strict children requirements and don't allow whitespace or text nodes. The `<colgroup>` element, for instance, only allows `<col>` and nested `<colgroup>` children; any whitespace or comments create implicit text nodes that cause hydration mismatches between server and client, resulting in React errors.

## Key Points

- **Strict children:** `<colgroup>` allows only `<col>` and `<colgroup>` children, no text nodes
- **Implicit text nodes:** Inline comments (e.g., `{/* checkbox */}`) and newline whitespace create text nodes
- **Server vs client mismatch:** Server renders valid HTML; client hydration creates extra text nodes, causing mismatch
- **Hydration error:** React throws "Hydration failed" or similar when structures don't match
- **Solution:** Remove inline comments and whitespace-only content from semantic container elements

## Details

### The Problem

```jsx
// ❌ PROBLEMATIC: Inline comments create implicit text nodes inside <colgroup>
<colgroup>
  <col width="40px" />
  {/* checkbox column */} {/* <- This comment becomes a text node! */}
  <col width="1fr" />
</colgroup>
```

During server-side rendering:

1. The `{/* checkbox column */}` comment is stripped (comments don't render)
2. Server produces: `<colgroup><col.../><col.../></colgroup>`

During client-side hydration:

1. JSX is compiled; the inline comment is parsed as content
2. React creates an implicit text node from the whitespace around the comment
3. Client produces: `<colgroup><col.../>TEXT_NODE<col.../></colgroup>`

The structures don't match → hydration error.

### The Correct Pattern

Move comments outside the semantic container:

```jsx
// ✅ CORRECT: Comments outside <colgroup>
{
  /* Checkbox and name columns */
}
<colgroup>
  <col width="40px" />
  <col width="1fr" />
</colgroup>;
```

Or use a block comment above if the container spans multiple lines:

```jsx
{
  /* 
  Column layout:
  - checkbox: 40px
  - name: flexible
*/
}
<colgroup>
  <col width="40px" />
  <col width="1fr" />
</colgroup>;
```

The key: no inline comments or whitespace-only text inside `<colgroup>`.

### Affected HTML Elements

Beyond `<colgroup>`, other elements with strict children include:

| Element                         | Allowed Children                                                   | Note                  |
| ------------------------------- | ------------------------------------------------------------------ | --------------------- |
| `<colgroup>`                    | `<col>`, `<colgroup>`                                              | No text or comments   |
| `<table>`                       | `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<caption>`, `<colgroup>` | No text between rows  |
| `<thead>`, `<tbody>`, `<tfoot>` | `<tr>` only                                                        | No text or comments   |
| `<tr>`                          | `<td>`, `<th>`                                                     | No text between cells |
| `<select>`                      | `<option>`, `<optgroup>`                                           | No text               |
| `<ul>`, `<ol>`                  | `<li>`                                                             | No text               |

The pattern generalizes: semantic list/table/form elements don't allow arbitrary text children.

### Application in Bird Code

The `AutomationsManager.tsx` component was fixed by removing an inline comment from a `<colgroup>`:

```jsx
// Before: Causes hydration error
<colgroup>
  <col width="40px" />
  {/* checkbox */}
  <col width="1fr" />
  {/* name */}
  <col width="150px" />
  {/* status */}
</colgroup>;

// After: Fixed
{
  /* Column layout: checkbox (40px), name (flex), status (150px) */
}
<colgroup>
  <col width="40px" />
  <col width="1fr" />
  <col width="150px" />
</colgroup>;
```

The documentation was moved to a single block comment above, preserving clarity without creating text nodes.

### Why This Happens

HTML has semantic constraints beyond what most people realize. `<colgroup>` is a container that defines table column properties — it doesn't represent content, just layout metadata. Allowing arbitrary text inside would be meaningless. The W3C spec restricts its children to enforce this semantic boundary.

React's hydration process must recreate the exact HTML structure on the client. If the server-rendered structure doesn't match the JSX-compiled client structure, React can't trust the DOM and must re-render, causing a flash or error.

## Related Concepts

- [[concepts/server-side-rendering-best-practices]] - SSR patterns and constraints
- [[concepts/html-semantics-and-accessibility]] - Why semantic HTML matters
- [[concepts/jsx-comment-handling]] - How JSX compiles comments and whitespace

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"
- [[daily/2026-04-12.md]] - "Root cause identified: Inline comments after `<col>` elements (e.g., `{/* checkbox */}`) combined with newline formatting created implicit text nodes during rendering"
- [[daily/2026-04-12.md]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
