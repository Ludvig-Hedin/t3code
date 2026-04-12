---
title: "Connection: JSX Formatting Creates Hydration Mismatches in Constrained Containers"
connects:
  - "concepts/jsx-implicit-text-nodes"
  - "concepts/html-semantic-constraints-jsx"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: JSX Formatting Creates Hydration Mismatches in Constrained Containers

## The Connection

JSX formatting decisions and HTML semantic constraints are two sides of the same bug. Developers think about JSX formatting (where to put comments and whitespace) independently from HTML spec constraints (what children are allowed). But when combined, they create a specific failure mode: invisible text nodes from formatting violate the content model of constrained containers, causing server/client rendering mismatches.

## Key Insight

The bug emerges at the intersection:

- **JSX side** → Formatting (comments, newlines) creates text nodes
- **HTML side** → Some elements (`<colgroup>`, `<tbody>`, `<select>`) forbid text nodes
- **Result** → Server renders text nodes; browser strips them; React hydration fails

The fix is not "never use comments in JSX" or "never use constrained containers." The fix is **awareness of the interaction**: when using constrained containers, be mindful that formatting artifacts become rendered nodes.

## Evidence

From the daily log:

1. **The bug combined both issues**: AutomationsManager.tsx had inline comments inside `<colgroup>` (formatting + constraint)

2. **Root cause identified the interaction**: "Inline comments after `<col>` elements combined with newline formatting created implicit text nodes"

3. **Solution addressed the interaction**: Remove inline comments from within `<col>` elements (respect the constraint, avoid the formatting artifact)

4. **General lesson learned**: "JSX formatting decisions (newlines, spacing) interact with semantic HTML constraints"

The conversation traced the bug back to this specific interaction: not just "comments are bad," not just "colgroup is strict," but "comments in colgroup specifically breaks hydration."

## Design Implication

When working with constrained containers, adopt one of two strategies:

**Strategy 1: Comments outside the container**

```jsx
{
  /* Define column structure */
}
<colgroup>
  <col span={1} />
  <col span={7} />
</colgroup>;
```

**Strategy 2: Compact formatting (no extraneous whitespace)**

```jsx
<colgroup>
  <col span={1} />
  <col span={7} />
</colgroup>
```

Both work because Strategy 1 moves the comment outside, and Strategy 2 has no formatting artifacts.

## Debugging Tip

If you see hydration errors in table components:

1. Check for `<tbody>`, `<thead>`, `<colgroup>`, `<select>` with inline comments
2. Move comments outside the container
3. If comments are necessary inside, consider refactoring: use a data-driven approach or document the structure differently

## Related Concepts

- [[concepts/jsx-implicit-text-nodes]] - How formatting creates nodes
- [[concepts/html-semantic-constraints-jsx]] - What containers forbid text nodes
