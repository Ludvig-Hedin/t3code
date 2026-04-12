---
title: "Colgroup Text Node Hydration Errors in React Tables"
aliases: [colgroup-hydration, table-hydration-mismatch, semantic-html-constraints]
tags: [react, html-semantics, hydration, debugging]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Colgroup Text Node Hydration Errors in React Tables

The HTML `<colgroup>` element has strict semantic requirements: it can only contain `<col>` and `<colgroup>` child elements. Any whitespace, comments, or text nodes are invalid and cause React hydration mismatches between server-rendered and client-rendered output. This constraint is often violated accidentally through JSX formatting decisions, resulting in cryptic hydration errors.

## Key Points

- **Strict child constraints** - `<colgroup>` can only contain `<col>` and `<colgroup>` elements; text nodes are invalid
- **Whitespace and comments create implicit text nodes** - JSX newlines and inline comments after `<col>` elements become text content
- **Hydration mismatch** - Server renders valid HTML; client renders with text nodes; React detects the difference and crashes
- **Root cause is formatting, not logic** - The bug is how the JSX is formatted, not what the JSX does
- **Minimal fix** - Remove comments from inside `<colgroup>`; document intent in block comments above

## Details

The `<colgroup>` element defines column properties for an HTML table. Semantic HTML specifies that only `<col>` elements (and nested `<colgroup>` elements) may be children. Any other content, including:

- Newline characters after `<col>` elements
- Inline comments (e.g., `{/* checkbox */}`)
- Whitespace between elements

These become text nodes in the DOM and cause hydration mismatches.

### Example of the Problem

```jsx
// ❌ This causes hydration error
<colgroup>
  <col className="w-12" /> {/* checkbox */}
  <col className="flex-1" /> {/* name */}
  <col className="w-20" />
</colgroup>
```

The comments and newlines create implicit text nodes:

- After the first `<col>`: newline + comment text + newline
- Between elements: newline characters

Server-side rendering may collapse whitespace differently than client rendering, causing React to detect a mismatch and throw a hydration error.

### Solution: Move Comments Outside

```jsx
// ✅ This works - comments document the columns
// checkbox
// name
// width
<colgroup>
  <col className="w-12" />
  <col className="flex-1" />
  <col className="w-20" />
</colgroup>
```

Or use a block comment above the entire `<colgroup>`:

```jsx
{
  /* Column definitions: checkbox, name, width */
}
<colgroup>
  <col className="w-12" />
  <col className="flex-1" />
  <col className="w-20" />
</colgroup>;
```

## Debugging Pattern

When encountering hydration errors with tables:

1. Check if error mentions `<colgroup>`
2. Search for inline comments or whitespace inside `<colgroup>` tags
3. Move documentation outside the element
4. Verify only `<col>` elements are direct children

## Related Concepts

- [[concepts/jsx-semantic-html-formatting-interaction]] - How JSX formatting decisions interact with HTML semantics
- [[concepts/react-hydration-server-client-mismatch]] - General hydration error debugging

## Sources

- [[daily/2026-04-12.md]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
- [[daily/2026-04-12.md]] - "Removed inline comments from within `<col>` elements; documentation already exists in block comment above `<colgroup>`"
