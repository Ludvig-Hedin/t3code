---
title: "HTML Semantic Constraints and JSX Formatting"
aliases: [colgroup-constraints, html-content-model, semantic-html]
tags: [react, html, hydration, bug-prevention]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# HTML Semantic Constraints and JSX Formatting

Certain HTML elements have strict content models that only allow specific children. The `<colgroup>` element is a prime example: it only permits `<col>` and `<colgroup>` child elements. When JSX renders whitespace or text nodes (including from comments) within these constrained containers, it creates server/client rendering mismatches that trigger React hydration errors. The solution is to be aware of semantic HTML constraints and structure JSX carefully around them.

## Key Points

- **Content model constraints** - Some HTML elements (`<colgroup>`, `<tbody>`, `<thead>`, etc.) have strict children requirements
- **Implicit text nodes in JSX** - Whitespace, newlines, and inline comments in JSX can create text nodes
- **Hydration mismatches** - Server-rendered HTML differs from client-rendered if text nodes exist when they shouldn't
- **Solution: restructure JSX** - Move comments outside constrained containers or use block comments above the container
- **HTML spec compliance** - Ignoring semantic constraints may work in some browsers but fails in others (especially during SSR)

## Details

### The `<colgroup>` Example

The `<colgroup>` element is used to define column properties in HTML tables. According to the HTML specification, `<colgroup>` can only contain:

- `<col>` elements
- `<colgroup>` elements
- Comments and text nodes are semantically invalid

When JSX renders:

```jsx
<colgroup>
  <col span={1} /> {/* checkbox column */}
  <col span={7} /> {/* data columns */}
</colgroup>
```

The inline comments (and surrounding whitespace/newlines) create implicit text nodes during server-side rendering. When React hydrates on the client, it sees no text nodes (because browsers clean them up), causing a mismatch.

### Why This Happens

JSX is compiled to function calls. Whitespace between elements is preserved as string children:

```jsx
// This JSX:
<colgroup>
  <col />
  {/* comment */}
  <col />
</colgroup>;

// Becomes approximately:
React.createElement(
  "colgroup",
  null,
  "\n  ",
  React.createElement("col", null),
  "\n  ",
  "/* comment */",
  "\n  ",
  React.createElement("col", null),
);
```

The text nodes are preserved during server rendering but cleaned by the browser during hydration, creating a mismatch.

### Solution: Restructure JSX

Move comments outside the constrained container:

```jsx
// Good: comment outside <colgroup>
{
  /* checkbox and data columns */
}
<colgroup>
  <col span={1} />
  <col span={7} />
</colgroup>;
```

Or use a single block comment:

```jsx
<colgroup>
  {/* checkbox column, data columns, etc. */}
  <col span={1} />
  <col span={7} />
</colgroup>
```

### Other Constrained Elements

This constraint applies to other HTML elements:

- `<table>` - can only contain `<caption>`, `<colgroup>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`
- `<tbody>`, `<thead>`, `<tfoot>` - can only contain `<tr>`
- `<tr>` - can only contain `<td>`, `<th>`
- `<select>` - can only contain `<option>`, `<optgroup>`, `<script>` (but not text nodes)

When rendering these in JSX, avoid inline comments within the container.

## Related Concepts

- [[concepts/jsx-implicit-text-nodes]] - How JSX formatting creates text nodes
- [[concepts/react-hydration-mismatch]] - General hydration error patterns (if exists)

## Sources

- [[daily/2026-04-12.md]] - Fixed hydration error in AutomationsManager.tsx caused by `<colgroup>` containing inline comments
- [[daily/2026-04-12.md]] - Root cause: "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"
