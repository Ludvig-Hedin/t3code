/**
 * useOnboarding — localStorage-backed state for the 4-step onboarding sheet.
 *
 * Auto-opens on first launch (no stored state). Persists current step and
 * completion. Listens for storage events so the "Setup Guide" button in
 * Settings can reopen the sheet from a different component tree.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Exported so Settings sidebar button can reference the same key without duplicating it. */
export const STORAGE_KEY = "birdcode:onboarding";

export type OnboardingStep = 1 | 2 | 3 | 4;

interface OnboardingState {
  completed: boolean;
  currentStep: OnboardingStep;
  open: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  currentStep: 1,
  open: false,
};

function loadState(): { state: OnboardingState; wasStored: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: DEFAULT_STATE, wasStored: false };
    return {
      state: { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OnboardingState>) },
      wasStored: true,
    };
  } catch {
    return { state: DEFAULT_STATE, wasStored: false };
  }
}

/** Custom event name used to notify same-tab listeners when state changes. */
const ONBOARDING_CHANGED_EVENT = "onboarding:changed";

/**
 * Persist state to localStorage only — does NOT dispatch the cross-component
 * custom event. The event is dispatched separately from a useEffect so it never
 * runs inside a setState updater (which would violate React's purity requirement
 * and cause React 18 Strict Mode to double-advance the step).
 */
function persistState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    const { state: loaded, wasStored } = loadState();
    // Auto-open on the very first visit (nothing stored yet)
    return { ...loaded, open: !wasStored && !loaded.completed };
  });

  // Tracks the last JSON we persisted so the sync effect can skip no-op writes
  // and avoid re-triggering the custom event (which would otherwise loop).
  const lastPersistedRef = useRef<string | null>(null);

  // Sync React state → localStorage + notify other same-tab instances.
  //
  // WHY this lives in useEffect instead of inside setState updaters:
  // React 18 Strict Mode double-invokes setState updater functions to detect
  // side effects. Calling persistState / dispatchEvent inside an updater ran
  // the side effect twice, making nextStep advance by 2 (3→5) and prevStep
  // retreat by 2 (5→3). Moving all persistence here keeps updaters pure.
  useEffect(() => {
    const serialized = JSON.stringify(state);
    if (lastPersistedRef.current === serialized) return; // nothing actually changed
    lastPersistedRef.current = serialized;
    persistState(state);
    // Dispatch a custom event so same-tab components (e.g. the Settings sidebar
    // button) are notified immediately — the native "storage" event only fires
    // for writes from *other* tabs/windows.
    window.dispatchEvent(new CustomEvent(ONBOARDING_CHANGED_EVENT));
  }, [state]);

  // Sync state when another component writes to localStorage.
  // - "storage" fires for cross-tab writes (browser native).
  // - ONBOARDING_CHANGED_EVENT fires for same-tab writes dispatched above.
  //
  // Both handlers use a functional setState that returns the SAME object
  // reference when the loaded values are structurally identical to the current
  // state. This lets React bail out of re-rendering and prevents the custom
  // event from triggering an infinite update loop.
  useEffect(() => {
    const applyLoaded = (prev: OnboardingState): OnboardingState => {
      const loaded = loadState().state;
      if (
        prev.currentStep === loaded.currentStep &&
        prev.open === loaded.open &&
        prev.completed === loaded.completed
      ) {
        return prev; // same reference → React bails out, no loop
      }
      return loaded;
    };

    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(applyLoaded);
    };
    const customHandler = () => setState(applyLoaded);

    window.addEventListener("storage", storageHandler);
    window.addEventListener(ONBOARDING_CHANGED_EVENT, customHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, customHandler);
    };
  }, []);

  // All updater functions below are intentionally pure (no side effects).
  // Persistence is handled by the useEffect above.

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const openOnboarding = useCallback(() => update({ open: true }), [update]);
  const closeOnboarding = useCallback(() => update({ open: false }), [update]);

  const goToStep = useCallback(
    (step: OnboardingStep) => update({ currentStep: step, open: true }),
    [update],
  );

  const nextStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= 4) {
        return { ...prev, open: false, completed: true };
      }
      return { ...prev, currentStep: (prev.currentStep + 1) as OnboardingStep };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      return { ...prev, currentStep: (prev.currentStep - 1) as OnboardingStep };
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    update({ completed: true, open: false });
  }, [update]);

  // Skip is identical to next — advances without requiring step completion
  const skipStep = useCallback(() => nextStep(), [nextStep]);

  return {
    open: state.open,
    currentStep: state.currentStep,
    completed: state.completed,
    openOnboarding,
    closeOnboarding,
    goToStep,
    nextStep,
    prevStep,
    completeOnboarding,
    skipStep,
  };
}
