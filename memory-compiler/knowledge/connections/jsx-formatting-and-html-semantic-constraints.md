---
title: "Connection: JSX Formatting and HTML Semantic Constraints"
connects:
  - "concepts/react-hydration-mismatch-from-jsx-formatting"
  - "concepts/html-colgroup-text-node-constraints"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: JSX Formatting and HTML Semantic Constraints

## The Connection

Hydration mismatches from JSX formatting are particularly severe in strict HTML containers like `<colgroup>` because these elements have strict content models that don't tolerate whitespace or text nodes. The broader hydration problem (server/client DOM divergence from formatting) combines with the specific constraint (colgroup only allows `<col>` elements), creating a sharp failure mode: the code looks fine but crashes with a cryptic hydration error. Understanding both concepts together reveals why hydration is fragile in semantic HTML.

## Key Insight

Many developers treat hydration errors as "random React bugs" without realizing they stem from the interaction of two distinct issues:

1. **JSX formatting choices** - Comments, newlines, and indentation create implicit text nodes
2. **HTML content model constraints** - Some containers don't allow text nodes at all

This combination is most severe in semantic containers that enforce strict content models. In permissive containers like `<div>`, whitespace text nodes are tolerated and hydration rarely fails. But in `<colgroup>`, browsers strip text nodes, and server/client divergence causes immediate failure.

In other words: **the error is not "formatting is bad" OR "colgroup is strict"—it's their combination that causes crash**.

## Evidence

From the daily log:

1. **Specific manifestation**: "Fixed hydration error in AutomationsManager.tsx caused by invalid whitespace text nodes inside `<colgroup>` element"

2. **Root cause identified**: "Inline comments after `<col>` elements (e.g., `{/* checkbox */}`) combined with newline formatting created implicit text nodes"

3. **Semantic constraint recognized**: "HTML `<colgroup>` is strict: only `<col>` and `<colgroup>` elements allowed as children—any whitespace/text nodes cause server/client mismatch"

The error is not a failure of either concept alone, but their **intersection**.

## Design Implications for Developers

1. **Hydration debugging should identify the container first** - Is it a strict semantic element?
2. **Strict containers need special formatting discipline** - Single-line formatting, no comments inside
3. **Non-strict containers are forgiving** - Whitespace in `<div>` rarely causes hydration errors
4. **JSX formatters should be aware** - Tools like Prettier should have special handling for strict containers
5. **Linting rules** - Teams should enforce "no comments inside `<colgroup>`" as a code style rule

## Pattern Generalization

This connection applies to all strict HTML containers:

| Container       | Allowed Only             | Formatting Risk                           |
| --------------- | ------------------------ | ----------------------------------------- |
| `<colgroup>`    | `<col>`                  | **High** - easily causes hydration errors |
| `<tbody>`       | `<tr>`                   | **High** - same issue                     |
| `<select>`      | `<option>`, `<optgroup>` | **High** - same issue                     |
| `<ul>` / `<ol>` | `<li>`                   | **Medium** - less common to hit           |
| `<div>`         | Any                      | **Low** - whitespace is tolerated         |

Any strict container + JSX formatting = hydration risk.

## Related Concepts

- [[concepts/react-hydration-mismatch-from-jsx-formatting]] - The broader JSX formatting pattern
- [[concepts/html-colgroup-text-node-constraints]] - The specific HTML constraint
- [[concepts/zustand-selector-stability-anti-pattern]] - Another reference stability issue in React
