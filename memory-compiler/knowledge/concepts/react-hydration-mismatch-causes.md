---
title: "React Hydration Mismatches from Whitespace and Text Nodes"
aliases: [hydration-error, server-client-mismatch, text-node-issue]
tags: [react, ssr, html-semantics]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# React Hydration Mismatches from Whitespace and Text Nodes

React hydration errors occur when the server-rendered HTML and client-side rendered HTML differ structurally. A common source is invisible text nodes created by whitespace and inline comments within semantic HTML containers. These text nodes exist on the server but not on the client (or vice versa), causing React to throw a hydration mismatch error.

## Key Points

- **Whitespace creates text nodes** - Newlines and spaces in JSX compile to implicit text nodes if not removed
- **Inline comments in JSX** - Comments like `{/* label */}` after elements create text nodes when followed by newlines
- **Semantic containers are strict** - Some HTML elements (like `<colgroup>`) reject text children; server/client render differently when text is present
- **Server vs client mismatch** - Server renders the text nodes but client removes them (or vice versa), causing React to fail hydration
- **Minimal fix approach** - Remove offending comments/whitespace; documentation can exist in block comments above the container

## Details

React's hydration process walks the server-rendered DOM and matches it against the client's virtual DOM. If structures don't match exactly, hydration fails with an error like:

```
Hydration failed because the initial UI does not match what was rendered on the server
```

### Whitespace and Text Node Generation

In JSX, all content between tags is meaningful:

```jsx
// This creates a text node with newline + spaces
<colgroup>
  <col span={1} />
</colgroup>

// After parsing, React sees:
<colgroup>
  [text node: "\n  "]
  <col span={1} />
  [text node: "\n"]
</colgroup>
```

On the client, depending on how the code is formatted, these text nodes may be stripped by optimization or bundler behavior. The server keeps them. Result: hydration mismatch.

### Inline Comments Within Semantic Containers

Comments in JSX compile to nothing at runtime, but they still affect whitespace handling:

```jsx
<colgroup>
  <col /> {/* checkbox column */}
  <col /> {/* name column */}
</colgroup>
```

The comment + following newline creates invisible text nodes. When the server renders, text is there. When the client hydrates, the bundler may have optimized the comments away, leaving different whitespace.

### HTML Semantic Enforcement

Some HTML elements are strict about children. The `<colgroup>` element only allows:

- `<col>` elements
- `<colgroup>` elements
- (Comments, but not text nodes)

Browsers treat text nodes in `<colgroup>` inconsistently between server rendering and client parsing, leading to hydration mismatch.

## Solutions

**Remove inline comments** from within semantic containers:

```jsx
// Before (problematic)
<colgroup>
  <col span={1} />  {/* checkbox */}
  <col span={1} />  {/* actions */}
</colgroup>

// After (fixed)
<colgroup>
  {/* Column structure: checkbox, then actions */}
  <col span={1} />
  <col span={1} />
</colgroup>
```

**Minimize whitespace** in semantic containers or use compact formatting:

```jsx
// Compact formatting
<colgroup>
  <col />
  <col />
</colgroup>
```

**Use suppressHydrationWarning** as a last resort (not recommended for new code):

```jsx
<colgroup suppressHydrationWarning>
  <col span={1} />
</colgroup>
```

## Related Concepts

- [[concepts/html-colgroup-semantic-constraints]] - Why `<colgroup>` has strict child rules
- [[concepts/jsx-formatting-and-semantic-html]] - Broader pattern of formatting affecting semantics
- [[concepts/effect-services-layers-pattern]] - If rendering logic is layered, hydration issues span layers

## Sources

- [[daily/2026-04-12]] - "React hydration mismatch due to `<colgroup>` containing text nodes from inline comments and whitespace; removed inline comments from within `<col>` elements"
- [[daily/2026-04-12]] - "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"
