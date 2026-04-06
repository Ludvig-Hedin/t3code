/**
 * useOnboarding — localStorage-backed state for the 5-step onboarding sheet.
 *
 * Auto-opens on first launch (no stored state). Persists current step and
 * completion. Listens for storage events so the "Setup Guide" button in
 * Settings can reopen the sheet from a different component tree.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "birdcode:onboarding";

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

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OnboardingState>) };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore — storage may be unavailable
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(() => {
    const hasStoredState = localStorage.getItem(STORAGE_KEY) !== null;
    const loaded = loadState();
    // Auto-open on the very first visit (nothing stored yet)
    return { ...loaded, open: !hasStoredState && !loaded.completed };
  });

  // Sync state when another component writes to localStorage (e.g. Settings "Setup Guide" button)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setState(loadState());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
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
