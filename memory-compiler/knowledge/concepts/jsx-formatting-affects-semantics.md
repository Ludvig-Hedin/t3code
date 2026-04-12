---
title: "JSX Formatting Decisions Interact with Semantic HTML Constraints"
aliases: [formatting-semantics, jsx-whitespace-semantics, invisible-nodes]
tags: [jsx, react, html-semantics, ssr]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# JSX Formatting Decisions Interact with Semantic HTML Constraints

Code formatting in JSX (newlines, indentation, inline comments) is typically invisible in the rendered output, but interacts unexpectedly with HTML's semantic constraints. Elements with strict content models (like `<colgroup>`) treat whitespace and comment-induced text nodes as invalid content, breaking the assumption that formatting is purely cosmetic. This interaction is particularly problematic in SSR where server and client may parse formatting differently.

## Key Points

- **Formatting is never purely cosmetic in JSX** - Whitespace and comments generate text nodes, which are semantic content
- **Semantic containers care about whitespace** - Elements like `<colgroup>`, `<table>`, `<tbody>` have strict rules about children
- **Server/client divergence** - Different rendering contexts may handle formatting artifacts differently
- **Invisible nodes are semantic** - Text nodes from formatting are real DOM content, not metadata
- **Formatting discipline required** - Strict semantic containers need compact formatting or comments placed outside

## Details

### How JSX Formatting Creates Semantic Content

In JSX, everything between tags is preserved as content:

```jsx
<colgroup>
  <col />
</colgroup>
```

The formatter sees this as readable, with logical indentation. React sees:

```
<colgroup>
  [text node: newline + spaces]
  <col />
  [text node: newline]
</colgroup>
```

These text nodes are semantic—they're actual DOM content. When an element says "I only accept `<col>` children," the text nodes violate that constraint.

### Inline Comments and Formatting Interaction

Inline comments are compiled away (not rendered), but they affect whitespace:

```jsx
<colgroup>
  <col /> {/* checkbox */}
  <col /> {/* name */}
</colgroup>
```

The transpiler produces:

```
<colgroup>
  [text: spaces + newline after first comment]
  <col />
  [text: spaces + newline after second comment]
  <col />
</colgroup>
```

Comments are gone, but the whitespace they "protected" remains as semantic text nodes.

### Why SSR Amplifies This Problem

Server-side rendering (Node.js) and browser DOM parsing handle formatting differently:

**Node.js SSR:** Preserves all whitespace and text nodes exactly as declared. No optimization.

**Browser Parser:** May strip whitespace during parsing or handle invalid content gracefully. Behavior varies by browser and element type.

When a table component renders on the server with strict colgroup children, the server creates text nodes. When the browser hydrates the same component, it may parse the HTML more leniently, stripping text nodes. React detects the mismatch and fails hydration.

### The Assumption That Breaks

Most developers assume: "Formatting is for humans; whitespace doesn't matter."

This is true for most HTML. But semantic containers (especially in tables) prove this false:

- `<colgroup>` only accepts `<col>` and `<colgroup>`
- `<table>` has specific allowed children
- `<tbody>` has specific allowed children

In these contexts, whitespace is not formatting—it's invalid semantic content.

## Solutions

**Option 1: Compact Formatting**

```jsx
<colgroup>
  <col />
  <col />
  <col />
</colgroup>
```

Pro: No text nodes. Con: Less readable for tables with many columns.

**Option 2: Block Comments Above Container**

```jsx
{
  /* Column structure: ID, Name, Actions */
}
<colgroup>
  <col />
  <col />
  <col />
</colgroup>;
```

Pro: Readable, no inline comments. Con: Requires discipline.

**Option 3: Programmatic Column Generation**

```jsx
<colgroup>
  {columns.map((col, i) => (
    <col key={i} span={col.span} />
  ))}
</colgroup>
```

Pro: No formatting issues, dynamic. Con: More complex for static tables.

## Related Concepts

- [[concepts/react-hydration-mismatch-causes]] - The practical problem caused by formatting/semantics interaction
- [[concepts/html-colgroup-semantic-constraints]] - The semantic rules that make formatting matter

## Sources

- [[daily/2026-04-12]] - "JSX formatting decisions (newlines, spacing) interact with semantic HTML constraints"
- [[daily/2026-04-12]] - "Inline comments within special container elements can inadvertently create text nodes during rendering"
