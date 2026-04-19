---
title: "Connection: Silent Rendering Bugs from Conditional Pipelines"
connects:
  - "concepts/rendering-pipeline-specificity-ordering"
  - "concepts/dynamic-wizard-step-filtering"
  - "concepts/meta-provider-status-semantics"
sources:
  - "daily/2026-04-13.md"
created: 2026-04-13
updated: 2026-04-13
---

# Connection: Silent Rendering Bugs from Conditional Pipelines

## The Connection

Two distinct UI bugs from the same day share a root pattern: when a rendering pipeline processes items through a sequence of conditional checks or filters, the order and shape of those checks determines which items get special treatment—and which are silently mishandled. The provider picker rendered "Auto" as disabled because a generic status guard intercepted it before a specialized check. The onboarding wizard skipped a step because a filtered array desynchronized from the step indicator dots. Both bugs produced no errors—just wrong visual state.

## Key Insight

The shared pattern is **invisible pipeline ordering**: the code is individually correct at every step, but the sequence in which conditions are evaluated (or the array from which counts are derived) silently determines what the user sees. Neither bug throws an exception. Neither produces a console warning. The UI renders—just wrong.

This makes them harder to catch than crashes:

- **Provider picker**: "Auto" appeared greyed-out as "NOT INSTALLED"—a plausible state, so no one questioned it
- **Onboarding wizard**: Pressing Next jumped from dot 3 to dot 5—the skip was visible but the cause was invisible

Both are "rendering specificity" bugs: the most specific case (manifest provider, team step) must be handled before the generic fallback (status gate, step count) consumes it.

## Evidence

**Provider picker (rendering order):**

The unlocked-provider rendering path checked `status !== "ready"` for all providers before checking `type === "manifest"`. Since manifest's status is `"warning"` by design (no local routing target), it was caught by the generic guard and rendered as disabled. The locked-provider path didn't have this bug because it checked for manifest first.

**Onboarding wizard (array filtering):**

The `shouldShowTeamStep` condition filtered "team" out of the steps array (4 items), but the step indicator dots still showed 5 (from the original unfiltered count). Navigation worked correctly within the 4-item array, but the visual indicators showed a gap.

## Shared Pattern

Both bugs follow this structure:

1. **Heterogeneous items** pass through a pipeline (providers with different types; steps with different visibility)
2. **A generic operation** (status check; array length) treats all items uniformly
3. **A specific item** (manifest; team step) needs special handling that the generic operation doesn't provide
4. **No error** — the item renders in a wrong-but-plausible state

The fix in both cases is ensuring the specific case is handled before (or separately from) the generic operation.

## Design Implication

When building UIs that render heterogeneous lists through conditional pipelines:

1. **Audit for special cases** — Are any items in the list "meta" or "conditional"? Do they follow different rules than the majority?
2. **Check ordering** — Do specialized checks run before generic guards?
3. **Verify derived counts** — Are indicator dots, progress bars, and navigation bounds derived from the same filtered array as the content?
4. **Test both paths** — If the component has multiple rendering modes (locked/unlocked, with/without filters), test each independently

## Related Concepts

- [[concepts/rendering-pipeline-specificity-ordering]] — The provider picker ordering bug
- [[concepts/dynamic-wizard-step-filtering]] — The wizard step-skipping bug
- [[concepts/meta-provider-status-semantics]] — Why manifest provider's "warning" status is expected, not broken
