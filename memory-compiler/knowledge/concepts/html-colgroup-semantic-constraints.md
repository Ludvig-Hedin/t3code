---
title: "HTML <colgroup> Semantic Constraints"
aliases: [colgroup-children, colgroup-strictness, table-col-semantics]
tags: [html, semantics, table-layout]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# HTML `<colgroup>` Semantic Constraints

The HTML `<colgroup>` element enforces strict semantic rules about what can be its children. This element defines column groupings in a table and only accepts `<col>` and `<colgroup>` elements as children—text nodes and most other content are invalid. These constraints create challenges in React SSR when formattin

g or comments inadvertently generate text nodes, causing server-rendered and client-rendered DOM to diverge.

## Key Points

- **Allowed children only:** `<col>` and `<colgroup>` elements (and HTML comments, which are metadata)
- **No text nodes allowed** - Any whitespace or text becomes invalid content
- **Strict enforcement** - Browsers handle invalid children inconsistently between server render and client parsing
- **JSX formatting risk** - Newlines and inline comments in JSX can create implicit text nodes
- **Server vs client divergence** - Inconsistent browser behavior with invalid content causes hydration mismatch

## Details

The HTML specification defines `<colgroup>` as having strict content model. Allowed content:

```html
<colgroup>
  <col />
  <col span="2" />
</colgroup>

<!-- This is also valid (metadata) -->
<colgroup>
  <!-- Column definitions -->
  <col />
</colgroup>
```

Invalid content includes:

```html
<!-- Text node: invalid -->
<colgroup>
  Text here
  <col />
</colgroup>

<!-- Whitespace text nodes: invalid but hard to see -->
<colgroup>
  <col />
</colgroup>
<!-- The newline before </colgroup> is a text node -->

<!-- Inline comments with whitespace: creates text nodes -->
<colgroup>
  <col />
  {/* label */}
  <!-- ^ Comment creates node, newline creates text -->
</colgroup>
```

### Why This Matters for SSR

Server-side rendering and client-side rendering use different DOM parsers and cleanup strategies:

**Server-side (Node.js):** Preserves all whitespace and text nodes exactly as written.

**Client-side (Browser):** May strip certain whitespace during hydration, or handle invalid content differently depending on the browser.

Result: The server renders `<colgroup>` with text nodes, the client parses it differently, React detects the mismatch, and hydration fails.

### Browser Inconsistency

Different browsers handle invalid `<colgroup>` children inconsistently:

- Some silently remove text nodes during parsing
- Some preserve them but render differently than the server
- Chrome, Firefox, Safari may each behave slightly differently

This is why the fix must be at the source (JSX) rather than relying on browser behavior.

## Guidelines for Table Column Groups

**Use compact formatting to minimize whitespace:**

```jsx
<colgroup>
  <col />
  <col span={2} />
</colgroup>
```

**Place documentation above the container:**

```jsx
{
  /* Column structure: ID (1), Name (1), Actions (2) */
}
<colgroup>
  <col />
  <col span={2} />
</colgroup>;
```

**Never inline comments within the container:**

```jsx
// Bad
<colgroup>
  <col /> {/* ID */}
</colgroup>

// Good
<colgroup>
  <col />
</colgroup>
```

## Related Concepts

- [[concepts/react-hydration-mismatch-causes]] - How text nodes cause hydration failure
- [[concepts/jsx-formatting-and-semantic-html]] - General pattern of formatting affecting semantics
- [[concepts/http-endpoint-authentication-patterns]] - Not directly related; linked for context completeness

## Sources

- [[daily/2026-04-12]] - "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"
- [[daily/2026-04-12]] - "Removed inline comments from within `<col>` elements; documentation already exists in block comment above `<colgroup>`"
