---
title: "HTML <colgroup> Strictness and Hydration Errors"
aliases: [colgroup-text-nodes, colgroup-hydration, strict-container-elements]
tags: [html, react, hydration, jsx-formatting]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# HTML `<colgroup>` Strictness and Hydration Errors

The HTML `<colgroup>` element is strictly constrained to contain only `<col>` and nested `<colgroup>` elements. Any text nodes—including whitespace from newlines and inline comments—trigger a server/client hydration mismatch in React. This causes React to force a re-render, destroying the integrity of SSR + client-side rendering.

## Key Points

- `<colgroup>` only permits `<col>` and `<colgroup>` children; all other content is invalid
- Inline JSX comments (e.g., `{/* checkbox */}`) combined with newline formatting create implicit text nodes
- Text nodes are rendered on the server but stripped during client-side mounting, causing hydration mismatch
- React hydration errors trigger full re-renders, breaking performance optimizations and state consistency
- Remove comments from inside `<colgroup>`; document intent via block comments before the element

## Details

### The Problem

When JSX is formatted with inline comments and newlines inside a `<colgroup>`:

```jsx
<colgroup>
  <col width="40px" /> {/* checkbox */}
  <col />
</colgroup>
```

The JSX transpiler treats whitespace between elements as content. On the server, the HTML renders as:

```html
<colgroup>
  <col width="40px" />
  <!-- whitespace text node -->
  <col />
</colgroup>
```

The browser's HTML parser handles this gracefully, but React on the client sees a different tree: it strips the comment and whitespace during parsing, resulting in client-side hydration failure. React then re-renders the entire component, which is expensive.

### Why This Matters

Hydration mismatches in table elements are particularly problematic because:

- Tables have strict DOM structure requirements
- Column widths and styling depend on `<colgroup>` integrity
- Re-renders can cause layout shift and visual instability
- Performance is degraded (SSR benefits are lost)

### The Solution

Move intent documentation outside the element:

```jsx
// Define columns: checkbox (40px), then actions
<colgroup>
  <col width="40px" />
  <col />
</colgroup>
```

Or if more context is needed, add a block comment before the table:

```jsx
// Table layout:
// - Column 1: 40px checkbox selector
// - Column 2: flexible action buttons
<table>
  <colgroup>
    <col width="40px" />
    <col />
  </colgroup>
</table>
```

## Related Concepts

- [[concepts/zustand-selector-stability-pattern]] - Another source of hydration mismatches from unstable references
- [[concepts/rpc-layer-expansion-pattern]] - Architectural patterns that avoid such formatting issues through strict structure

## Sources

- [[daily/2026-04-12.md]] - "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"
- [[daily/2026-04-12.md]] - "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"
