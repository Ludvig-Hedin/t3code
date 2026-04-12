---
title: "Connection: React Correctness - Memory References and Optimization Traps"
connects:
  - "concepts/zustand-selector-memory-references"
  - "concepts/react-hydration-mismatches-html-containers"
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Connection: React Correctness - Memory References and Optimization Traps

## The Connection

React's correctness mechanisms—equality checking in `useSyncExternalStore`, hydration mismatch detection, and server/client consistency requirements—all rely on precise understanding of how React compares and updates components. Two common bugs emerge from misunderstanding these mechanisms: unstable selectors causing infinite re-renders, and HTML content model violations causing hydration warnings. Both are React-specific and both stem from assumptions about "React will handle this."

## The Shared Root Cause

React makes two critical assumptions:

1. **Selectors are stable** - Same input → same output reference. If not, it looks like state changed.
2. **Server and client render identically** - HTML structure must match. If not, hydration fails.

Breaking these assumptions doesn't immediately crash the app. Instead, React notices the violation and takes action:

- **Unstable selector** → `useSyncExternalStore` detects new reference → schedules re-render → selector runs again → new reference → loop
- **Hydration mismatch** → React detects server HTML ≠ client HTML → logs warning → possibly renders incorrectly

Both are symptoms of the same principle: **React trusts its assumptions; violating them causes subtle bugs.**

## Evidence

**Zustand Selector Trap** - Developers naturally write `.filter()` in selectors (it's filtering, right?). But `.filter()` creates new arrays. Zustand uses `Object.is` equality, which compares references. New reference → re-render → selector again → infinite loop. The trap: filtering looks like it belongs in the selector, but React's equality check makes it wrong.

**Hydration Mismatch Trap** - Developers naturally add documentation (comments) and formatting inside HTML containers. But certain containers (`<colgroup>`, `<thead>`) have strict content models. Comments create text nodes. Server might strip them differently than client. Mismatch → React complains. The trap: formatting looks innocent, but HTML semantics make it wrong.

## The Meta-Lesson

Both bugs follow this pattern:

1. Developer writes code that LOOKS correct (filtering in selector, comments in table markup)
2. Code works locally during development (no obvious error)
3. React's internal mechanisms detect the violation
4. But the error message points somewhere else (re-render loop, "cannot find property", hydration warning)
5. Debugging requires understanding React's internal assumptions

## Defensive Practices

**For Selectors:**

- Assume selectors must be referentially stable
- Use `useMemo` for array operations outside selectors
- Test selectors with `===` comparisons to catch reference changes

**For Hydration:**

- Know which HTML elements have content restrictions
- Keep formatting simple; separate comments from content
- Test server/client rendering separately during development

**General React Principles:**

- **Reference equality is the currency of React** - Same reference = no re-render; different reference = re-render
- **HTML semantics matter** - Don't assume browser is lenient; some elements have strict children
- **Server and client must agree** - If one strips whitespace and the other doesn't, hydration fails

## Related Concepts

- [[concepts/zustand-selector-memory-references]] - The state management trap
- [[concepts/react-hydration-mismatches-html-containers]] - The HTML semantics trap
