---
title: "JSX Formatting Decisions and Semantic HTML Constraints"
aliases: [jsx-html-interaction, semantic-constraints, formatting-bugs]
tags: [jsx, html-semantics, react, code-style]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# JSX Formatting Decisions and Semantic HTML Constraints

Certain HTML elements have strict semantic constraints about what content they allow. JSX formatting decisions—newlines, indentation, comments—can inadvertently create text nodes that violate these constraints, causing hydration errors or invalid markup. The problem is not the JSX logic but how it's formatted, making it insidious and easy to miss in code review.

## Key Points

- **Formatting creates semantics** - Newlines and whitespace in JSX become actual text nodes in the DOM
- **Comments are content** - Inline comments inside constrained elements become text nodes
- **Semantic constraints are strict** - Elements like `<colgroup>`, `<thead>`, `<tbody>` allow only specific children
- **Hydration mismatches result** - Server and client may render whitespace differently, causing React errors
- **Solution is formatting-aware** - Fix the issue by moving comments outside the constrained element

## Details

### Semantic Elements with Child Constraints

Several HTML elements restrict what content their children can be:

| Element        | Allowed Children                                                   | Disallows                        |
| -------------- | ------------------------------------------------------------------ | -------------------------------- |
| `<colgroup>`   | `<col>`, nested `<colgroup>`                                       | Text nodes, comments, whitespace |
| `<thead>`      | `<tr>`                                                             | Text nodes, inline comments      |
| `<tbody>`      | `<tr>`                                                             | Text nodes, inline comments      |
| `<tfoot>`      | `<tr>`                                                             | Text nodes, inline comments      |
| `<table>`      | `<caption>`, `<colgroup>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>` | Text nodes, comments             |
| `<select>`     | `<option>`, `<optgroup>`, `<script>`                               | Text nodes (except whitespace)   |
| `<ul>`, `<ol>` | `<li>`                                                             | Text nodes, inline comments      |

### Whitespace and Comments Create Text Nodes

In JSX:

```jsx
// ❌ Creates text nodes from formatting
<colgroup>
  <col />
  {/* comment */}
  <col />
</colgroup>
```

This renders as:

```html
<colgroup>
  <col />
  <!-- comment created as text node -->
  <col />
</colgroup>
```

The newlines, indentation, and comment all become content in the DOM.

### Solution: Move Comments Outside

```jsx
// ✅ Comments document the element, not inside it
{
  /* Column definitions for the table */
}
<colgroup>
  <col />
  <col />
</colgroup>;
```

Or use a block comment above for clarity without creating nodes:

```jsx
{
  /* Define columns: first for checkbox, second for content */
}
<colgroup>
  <col className="w-12" />
  <col className="flex-1" />
</colgroup>;
```

### Real-World Example

In the AutomationsManager component, inline comments after `<col>` elements created text nodes:

```jsx
// ❌ BEFORE - Creates hydration error
<colgroup>
  <col className="w-12" /> {/* checkbox */}
  <col className="flex-1" /> {/* name */}
  <col className="w-20" />
</colgroup>;

// ✅ AFTER - Block comment documents without creating nodes
{
  /* Column definitions: checkbox, name, width */
}
<colgroup>
  <col className="w-12" />
  <col className="flex-1" />
  <col className="w-20" />
</colgroup>;
```

## Prevention Pattern

When writing semantic HTML elements with constrained children:

1. **Consult the HTML spec** - Look up child constraints for the element
2. **Document outside** - Put comments above the element, not inside
3. **Minimize whitespace** - Consider formatting that reduces accidental text nodes
4. **Test SSR carefully** - Hydration errors reveal whitespace/formatting issues

Example pattern:

```jsx
{
  /* Document the purpose of the element */
}
<constrainedElement>
  {/* Only valid children below, no comments inside */}
  <validChild1 />
  <validChild2 />
</constrainedElement>;
```

## Related Concepts

- [[concepts/colgroup-text-node-hydration-error]] - Specific case of this pattern
- [[concepts/react-hydration-server-client-mismatch]] - When the mismatch is detected

## Sources

- [[daily/2026-04-12.md]] - "JSX formatting decisions (newlines, spacing) interact with semantic HTML constraints"
- [[daily/2026-04-12.md]] - "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"
- [[daily/2026-04-12.md]] - "Removed inline comments from within `<col>` elements; documentation already exists in block comment above `<colgroup>`"
