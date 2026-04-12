---
title: "Connection: Systematic Phases Require Validation Gates"
connects:
  - "concepts/systematic-feature-implementation-phases"
  - "concepts/typecheck-validation-gates"
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Connection: Systematic Phases Require Validation Gates

## The Connection

Systematic phase-based implementation only works if each phase's output is validated before moving to the next. TypeCheck serves as this validation gate: after contracts are defined, TypeCheck verifies they're correctly used downstream; after business logic is implemented, TypeCheck verifies it produces the right types; after RPC handlers are added, TypeCheck verifies marshalling is correct. Without validation gates, phasing becomes "code in sequence without feedback"—the worst of both worlds.

## Key Insight

Phasing without validation is brittle. Each phase makes assumptions about previous phases, but if those assumptions are violated (e.g., business logic uses a type that doesn't match the contract), the error propagates forward undetected until runtime. With validation gates (TypeCheck):

- **Feedback is immediate** - Minutes after implementing a phase, you know if it matches the previous phase's output
- **Debugging is isolated** - If phase 3 fails TypeCheck, the bug is in phase 3 (not phase 4 which depends on it)
- **Integration becomes deterministic** - Phases integrate successfully because they were validated against each other

In other words: phases are **linear and sequential**, but validation gates are **lateral and parallel** — each phase validates against all previous phases simultaneously.

## Evidence

From the daily log:

1. **All phases were systematic**: "All 8 phases implemented following Bird Code's existing Effect Services + Layers pattern"

2. **TypeCheck ran frequently**: "Multiple TypeCheck validations performed throughout; only pre-existing ChatView.browser.tsx errors remain (Playwright-related, unrelated to A2A work)"

3. **Validation was phase-aware**: "Contracts, shared, scripts, desktop, marketing, and server packages all compile cleanly" — validation happened after each phase/package update, catching bugs early

4. **Phase-to-phase dependencies**: Each phase (contracts → shared → business logic → RPC) depends on previous phases being correct. TypeCheck validated these dependencies.

## Pattern Recognition

The conversation reveals a workflow:

1. Implement phase (e.g., contracts)
2. Run TypeCheck immediately
3. Fix any errors
4. Proceed to next phase
5. Repeat

This is **validation-driven phasing**: phases are sequential, but validation is constant. If you're only running TypeCheck at the end, you're not doing validation-driven phasing.

## Related Concepts

- [[concepts/systematic-feature-implementation-phases]] - The phases being validated
- [[concepts/typecheck-validation-gates]] - The validation mechanism
- [[concepts/effect-services-layers-pattern]] - Layers define contracts that TypeCheck validates
