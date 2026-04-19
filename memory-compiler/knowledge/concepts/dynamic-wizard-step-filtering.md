---
title: "Dynamic Wizard Step Filtering and Navigation Synchronization"
aliases: [step-skipping, wizard-navigation, onboarding-steps, dynamic-step-array]
tags: [ui-pattern, navigation, onboarding, state-management]
sources:
  - "daily/2026-04-13.md"
created: 2026-04-13
updated: 2026-04-13
---

# Dynamic Wizard Step Filtering and Navigation Synchronization

Multi-step wizard flows (onboarding, setup, checkout) often dynamically filter which steps are shown based on conditions (e.g., `shouldShowTeamStep`). When a step is removed from the underlying array but the visual step indicators (dots, progress bar) still show the original count, navigation appears to "skip" steps. The root cause is a desynchronization between the steps array used for content rendering and the step indicators used for visual feedback.

## Key Points

- **Dynamic filtering changes array indices** — Removing step 4 from a 5-step array means step 5 becomes index 3, but indicators may still show 5 dots
- **Navigation uses index arithmetic** — `currentStepIndex + 1` jumps correctly within the filtered array, but users see a gap in the visual indicators
- **Two-way desync** — Going forward skips a dot (step 3 → step 5 visually), going backward also skips (step 5 → step 3 visually)
- **Step content vs step indicators are separate concerns** — Content renders from the filtered array; indicators must derive from the same array
- **Conditional step removal must propagate** — When a condition filters out a step, both the content array AND the indicator count must update

## Details

### The Bug Pattern

A 5-step onboarding flow: Welcome → Profile → Company → Team → Workspace.

The `shouldShowTeamStep` condition evaluates to `false`, filtering "Team" out:

```typescript
const steps = allSteps.filter((step) => {
  if (step.id === "team" && !shouldShowTeamStep) return false;
  return true;
});
// Result: ["welcome", "profile", "company", "workspace"] — 4 steps
```

But the step indicator component still renders 5 dots (from the original `allSteps` array), creating a visual mismatch:

```
Visual indicators:  ● ● ● ○ ○  (5 dots, currently on step 3)
Actual steps:       [welcome, profile, company, workspace] (4 items)
```

When the user clicks "Next" from Company (index 2), navigation goes to index 3 (Workspace), which is correct within the 4-item array. But the visual indicators jump from dot 3 to dot 5, appearing to skip dot 4 (the filtered-out Team step).

### The Fix

Ensure step indicators derive from the same filtered array as step content:

```typescript
// ✅ Both content and indicators use the same filtered steps
function OnboardingFlow() {
  const steps = allSteps.filter((step) => {
    if (step.id === "team" && !shouldShowTeamStep) return false;
    return true;
  });

  return (
    <>
      {/* Indicators use filtered steps */}
      <StepIndicators total={steps.length} current={currentIndex} />

      {/* Content uses filtered steps */}
      <StepContent step={steps[currentIndex]} />

      {/* Navigation uses filtered steps */}
      <Button onClick={() => setCurrentIndex(currentIndex + 1)}>Next</Button>
    </>
  );
}
```

### Edge Cases

**Step becomes visible mid-flow** — If `shouldShowTeamStep` changes from `false` to `true` while the user is on step 3 (Company), the array grows by 1. If `currentIndex` was 2 (Company), it's still 2 — but now index 3 is Team (correct) instead of Workspace. This works naturally.

**Filtered step has required data** — If the filtered-out step collects required data (e.g., team invitations), the final submission must handle missing data gracefully (skip validation for that step's fields).

**Animation between steps** — Step transitions that animate by index delta (e.g., slide left by N positions) must use the filtered array length, not the original.

### Prevention Pattern

Use a single source of truth for the step list:

```typescript
// Single source of truth
const visibleSteps = useMemo(
  () => allSteps.filter((step) => step.isVisible(context)),
  [allSteps, context],
);

// Derive everything from visibleSteps
const totalSteps = visibleSteps.length;
const currentStep = visibleSteps[currentIndex];
const canGoNext = currentIndex < totalSteps - 1;
const canGoBack = currentIndex > 0;
```

Never reference `allSteps` directly in rendering or navigation logic — always go through the filtered list.

## Related Concepts

- [[concepts/settings-ui-management-pattern]] - Settings panels also use step-like flows for integration management
- [[concepts/conditional-check-ordering-render-pipelines]] - Both involve conditional rendering logic where order and filtering affect what the user sees

## Sources

- [[daily/2026-04-13.md]] - "When I press next when I'm on the 3rd step I get to step 5, and when I click back from step 5 I get to step 3"
- [[daily/2026-04-13.md]] - "Found the issue: The shouldShowTeamStep variable was evaluating to false, causing the 'team' step to be filtered out of the steps array entirely"
- [[daily/2026-04-13.md]] - "Steps array: ['welcome', 'profile', 'company', 'workspace'] (4 items, no 'team') — but step indicators still showed 5 dots"
- [[daily/2026-04-13.md]] - "Corrected the condition that filters the team step, ensuring it's always included, and synchronized the step indicators with the actual steps array length"
