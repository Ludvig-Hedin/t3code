/**
 * useOnboarding — localStorage-backed state for the 5-step onboarding sheet.
 *
 * Auto-opens on first launch (no stored state). Persists current step and
 * completion. Listens for storage events so the "Setup Guide" button in
 * Settings can reopen the sheet from a different component tree.
 */
import { useCallback, useEffect, useState } from "react";

/** Exported so Settings sidebar button can reference the same key without duplicating it. */
export const STORAGE_KEY = "birdcode:onboarding";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

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

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // Dispatch a custom event so same-tab components (e.g. the Settings sidebar
    // button) are notified immediately — the native "storage" event only fires
    // for writes from *other* tabs/windows.
    window.dispatchEvent(new CustomEvent(ONBOARDING_CHANGED_EVENT));
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

  // Sync state when another component writes to localStorage.
  // - "storage" fires for cross-tab writes (browser native).
  // - ONBOARDING_CHANGED_EVENT fires for same-tab writes dispatched by saveState().
  useEffect(() => {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setState(loadState().state);
      }
    };
    const customHandler = () => {
      setState(loadState().state);
    };
    window.addEventListener("storage", storageHandler);
    window.addEventListener(ONBOARDING_CHANGED_EVENT, customHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener(ONBOARDING_CHANGED_EVENT, customHandler);
    };
  }, []);

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      saveState(next);
      return next;
    });
  }, []);

  const openOnboarding = useCallback(() => update({ open: true }), [update]);
  const closeOnboarding = useCallback(() => update({ open: false }), [update]);

  const goToStep = useCallback(
    (step: OnboardingStep) => update({ currentStep: step, open: true }),
    [update],
  );

  const nextStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep >= 5) {
        const next = { ...prev, open: false, completed: true };
        saveState(next);
        return next;
      }
      const next = { ...prev, currentStep: (prev.currentStep + 1) as OnboardingStep };
      saveState(next);
      return next;
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => {
      if (prev.currentStep <= 1) return prev;
      const next = { ...prev, currentStep: (prev.currentStep - 1) as OnboardingStep };
      saveState(next);
      return next;
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
