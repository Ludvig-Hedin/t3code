---
title: "React Hydration Mismatch with Semantic HTML Elements"
aliases: [hydration-semantic-html, colgroup-text-nodes, semantic-html-whitespace]
tags: [react, hydration, html]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Mismatch with Semantic HTML Elements

Certain HTML elements have strict content models that only allow specific child elements. When JSX includes whitespace, formatting, or inline comments within these containers, React creates implicit text nodes that violate the semantic HTML spec, causing server-client hydration mismatches. The `<colgroup>` element is particularly strict: it can only contain `<col>` and `<colgroup>` children, nothing else.

## Key Points

- **Strict content models** - Elements like `<colgroup>`, `<thead>`, `<tbody>` only accept specific children
- **Implicit text nodes** - Whitespace and inline comments in JSX create text nodes that aren't rendered visually but exist in the DOM tree
- **Server-client mismatch** - Server renders semantic HTML strictly; client React renders with implicit text nodes, causing hydration error
- **Documentation pattern** - Block comments above the container communicate intent without creating child text nodes
- **Testing requirement** - Build-time validation (TypeScript) cannot catch this; requires runtime hydration testing or visual inspection

## Details

The classic case: a `<colgroup>` element in a table definition.

```jsx
<colgroup>
  {/* checkbox */}
  <col style={{ width: "40px" }} />
  {/* actions */}
  <col style={{ width: "100px" }} />
</colgroup>
```

When React renders this in the browser:

1. The comments and whitespace between `<col>` elements create text nodes
2. On the server, the HTML rendered to a string doesn't include these text nodes (server-side rendering is stricter)
3. When hydrating, React's virtual DOM (with text nodes) doesn't match the server HTML (without them)
4. React throws a hydration error

The fix: move documentation outside the container or into a block comment.

```jsx
{
  /* Column definitions: checkbox (40px), content (flexible), actions (100px) */
}
<colgroup>
  <col style={{ width: "40px" }} />
  <col />
  <col style={{ width: "100px" }} />
</colgroup>;
```

### Why This Matters

Hydration errors indicate a mismatch between server and client rendering. While the app may seem to work (React re-renders the correct structure), it's a sign of deeper issues:

- Performance: hydration mismatch causes full re-render instead of fast attachment
- Type safety: if the structure differs, future changes may create bugs
- Maintenance: hidden DOM tree differences are hard to debug

### Semantic HTML Elements Prone to This

- `<colgroup>` - Only `<col>` and `<colgroup>` children
- `<tbody>`, `<thead>`, `<tfoot>` - Only `<tr>` children
- `<dl>` - Only `<dt>` and `<dd>` children (in that order)
- `<select>` - Only `<option>`, `<optgroup>`, and `<script>` children
- `<svg>` - Specific content model depending on SVG element type

### Prevention Pattern

**Good:** Block comment before the element explains structure, no inline comments within

```jsx
{
  /* Row definitions: each column corresponds to a field */
}
<tbody>
  {rows.map((row) => (
    <tr key={row.id}>...</tr>
  ))}
</tbody>;
```

**Bad:** Inline comments create text nodes

```jsx
<tbody>
  {/* starts row content */}
  {rows.map((row) => (
    <tr key={row.id}>...</tr>
  ))}
</tbody>
```

## Related Concepts

- [[concepts/zustand-selector-stability]] - Both involve React's virtual DOM tree and reference equality
- [[concepts/iframe-sandboxing-cors]] - Related to client-server mismatches in complex nested contexts

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element. Root cause: Inline comments after `<col>` elements combined with newline formatting created implicit text nodes."
