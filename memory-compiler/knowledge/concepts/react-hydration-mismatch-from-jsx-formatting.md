---
title: "React Hydration Mismatch from JSX Formatting"
aliases: [hydration-error, jsx-formatting, ssr-mismatch, server-client-divergence]
tags: [react, ssr, nextjs, jsx, formatting]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Mismatch from JSX Formatting

React's hydration process compares the server-rendered HTML with the client-side virtual DOM. When JSX formatting decisions (newlines, comments, spacing) create different text nodes on server vs. client, React detects a mismatch and logs warnings. This is especially problematic in strict HTML containers like `<colgroup>`, `<table>`, and `<select>` where whitespace handling is semantic. Understanding how JSX formatting affects the final DOM prevents hydration errors and improves Next.js/SSR reliability.

## Key Points

- Hydration compares server HTML with client vDOM element-by-element using React's diffing algorithm
- JSX formatting (newlines, indentation, comments) can create implicit text nodes
- Server and client may parse the same JSX differently, especially with comments
- Strict HTML elements (`<colgroup>`, `<tbody>`, `<select>`) are sensitive to whitespace in their content models
- Solution: Format code to minimize whitespace text nodes, especially in semantic containers
- Comments inside strict containers should be moved outside

## Details

### How JSX Formatting Affects the DOM

JSX parser treats whitespace and comments specially. Two seemingly identical pieces of code can produce different DOM structures:

**Format 1: Multi-line with inline comments**

```jsx
<colgroup>
  <col />
  {/* This column is for checkboxes */}
  <col />
  {/* This column shows the user name */}
</colgroup>
```

**Format 2: Single-line, comment outside**

```jsx
{
  /* Columns: checkbox (left), name (middle), actions (right) */
}
<colgroup>
  <col /> <col /> <col />
</colgroup>;
```

Both look identical visually, but the text node structure differs:

- Format 1: `<colgroup>` → [#text "\n ", `<col />`, #text "\n ", `<col />`, #text "\n"]`
- Format 2: `<colgroup>` → [`<col />`, #text " ", `<col />`, #text " ", `<col />`]`

The server (Node.js) may normalize whitespace differently than the client browser, causing mismatch.

### Strict HTML Containers

Some HTML elements enforce strict content models that browsers parse strictly:

| Element         | Allowed Children                                                   | Sensitivity                 |
| --------------- | ------------------------------------------------------------------ | --------------------------- |
| `<colgroup>`    | `<col>`, `<colgroup>` only                                         | Very strict—no text nodes   |
| `<table>`       | `<caption>`, `<colgroup>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>` | Strict—no raw text          |
| `<tbody>`       | `<tr>` only                                                        | Strict—no direct text nodes |
| `<select>`      | `<option>`, `<optgroup>`                                           | Strict—no raw text          |
| `<ul>` / `<ol>` | `<li>` only                                                        | Strict—no direct text nodes |

Whitespace in these containers is often stripped by browsers during DOM parsing, but SSR engines (like Node.js running React) may preserve it, causing server/client divergence.

### Debugging Hydration Errors

When you see "Hydration failed..." or "Warning: Expected server HTML to contain..." in the console:

1. **Identify the container** - Is it a strict element like `<colgroup>`?
2. **Check formatting** - Look for multi-line formatting with comments inside strict containers
3. **Use DevTools** - Inspect the actual DOM on both server and client
4. **Compare structure** - Count text nodes and element order
5. **Move comments** - Place comments outside the problematic container

### Prevention Strategy

**Rule 1: Single-line for strict containers**

```jsx
<colgroup>
  <col />
  <col />
  <col />
</colgroup>
```

**Rule 2: Block comment before container**

```jsx
{
  /* Columns: checkbox, name, actions */
}
<colgroup>
  <col />
  <col />
  <col />
</colgroup>;
```

**Rule 3: No inline comments inside strict elements**

```jsx
// ❌ Avoid
<colgroup>
  <col /> {/* bad */}
</colgroup>;

// ✅ Better
{
  /* Columns */
}
<colgroup>
  <col />
</colgroup>;
```

## Related Concepts

- [[concepts/html-colgroup-text-node-constraints]] - Specific example of whitespace sensitivity
- [[concepts/zustand-selector-stability-anti-pattern]] - Different domain, similar reference stability issue

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"
- [[daily/2026-04-12.md]] - "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"
- [[daily/2026-04-12.md]] - "JSX formatting decisions (newlines, spacing) interact with semantic HTML constraints"
