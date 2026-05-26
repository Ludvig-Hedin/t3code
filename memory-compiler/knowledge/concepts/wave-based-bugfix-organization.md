---
title: Wave-Based Bugfix Organization
sources:
  - daily/2026-05-10.md
created: "2026-05-10"
updated: "2026-05-10"
---

# Wave-Based Bugfix Organization

Organize large bugfix sweeps into dependency-ordered waves, grouping fixes by subsystem to minimize context switching and ensure downstream fixes build on upstream corrections.

## Key Points

- Order waves by dependency: Server data integrity → Infrastructure → Client → Platform-specific
- Validate each issue against codebase before applying fix (validation-then-fix pattern)
- Complete all fixes in a wave before moving to next
- Final wave should include all platform-specific (iOS, Desktop) fixes

## Details

When addressing 20+ bugs across a codebase, random ordering leads to:
- Fixing symptoms before root causes
- Breaking fixes when upstream code changes
- Excessive context switching between subsystems

### Wave Structure

The t3code bugfix sweep organized 21 fixes into 4 waves:

1. **Wave 1: Server data integrity** — Core backend fixes that other layers depend on
2. **Wave 2: Preview/proxy** — Infrastructure layer between server and client
3. **Wave 3: Web** — Client-side React application fixes
4. **Wave 4: Desktop/iOS** — Platform-specific wrappers and native code

### Validation-Then-Fix Pattern

For each bug:
1. **Validate** the issue exists in current codebase state
2. **Understand** the root cause, not just symptoms
3. **Fix** with minimal surface area
4. **Verify** fix doesn't break related functionality

This prevents applying outdated fixes or addressing issues that no longer exist.

### Type Breaks During Sweeps

Large sweeps may encounter type errors from earlier fixes. Example from t3code:

> H6 (WS reconnect signal) — solved by specializing orchestration `onDomainEvent` type rather than broadening base type

When a fix introduces type errors, prefer:
- Specializing types at the usage site
- Over broadening base types that affect entire codebase

### Documenting Skipped Items

Some items may be intentionally skipped:
- Pre-existing issues outside scope (22 TS errors in baseline)
- Items requiring architectural decisions (C1+C2, C5+H3)
- False positives (Swift diagnostics that aren't real build failures)

Document these explicitly rather than leaving them ambiguous.

## Related Concepts

- [[concepts/systematic-feature-implementation-phases]] — Similar phased approach for features
- [[concepts/typecheck-validation-gates]] — Validation between phases
- [[concepts/multi-agent-holistic-verification-pattern]] — Verification after parallel work

## Sources

- daily/2026-05-10.md — Session (15:49): "Wave organization: Server data integrity → Preview/proxy → Web → Desktop/iOS"
- daily/2026-05-10.md — Session (15:49): "Systematic validation-then-fix pattern: validated each issue against codebase before applying fix"
