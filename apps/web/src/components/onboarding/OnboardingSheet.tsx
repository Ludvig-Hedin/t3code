/**
 * OnboardingSheet — 4-step right-side sheet.
 *
 * Auto-opens on first launch (controlled by useOnboarding localStorage state).
 * Can be reopened from Settings via the "Setup Guide" button.
 *
 * Steps:
 *  1. Provider Install
 *  2. Mobile Pairing
 *  3. Git Setup
 *  4. Import Chats
 */
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetPanel, SheetFooter } from "../ui/sheet";
import { type OnboardingStep, useOnboarding } from "../../hooks/useOnboarding";
import { ProviderInstallStep } from "./steps/ProviderInstallStep";
import { MobilePairingStep } from "./steps/MobilePairingStep";
import { GitSetupStep } from "./steps/GitSetupStep";
import { ImportChatsFlow } from "./ImportChatsFlow";
import { cn } from "~/lib/utils";

const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Providers",
  2: "Mobile",
  3: "Git",
  4: "Import",
};

const TOTAL_STEPS = 4;

// ── Step indicator dots ───────────────────────────────────────────────────────

function StepDots({ current, total }: { current: OnboardingStep; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as OnboardingStep;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div
            key={step}
            className={cn(
              "rounded-full transition-all duration-200",
              isActive && "w-5 h-2 bg-foreground",
              isDone && "w-2 h-2 bg-foreground/40",
              !isActive && !isDone && "w-2 h-2 bg-muted-foreground/20",
            )}
          />
        );
      })}
    </div>
  );
}

// ── Step content router ───────────────────────────────────────────────────────

function StepContent({ step, onImportDone }: { step: OnboardingStep; onImportDone: () => void }) {
  switch (step) {
    case 1:
      return <ProviderInstallStep />;
    case 2:
      return <MobilePairingStep />;
    case 3:
      return <GitSetupStep />;
    case 4:
      return <ImportChatsFlow onDone={onImportDone} />;
  }
}

// ── Main sheet ────────────────────────────────────────────────────────────────

export function OnboardingSheet() {
  const { open, currentStep, closeOnboarding, completeOnboarding, nextStep, prevStep, skipStep } =
    useOnboarding();

  const isLastStep = currentStep === TOTAL_STEPS;
  // The import step manages its own primary CTA (the import button)
  const isImportStep = currentStep === 4;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) closeOnboarding();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex flex-col w-[520px] max-w-full"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="flex-row items-center justify-between pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <StepDots current={currentStep} total={TOTAL_STEPS} />
            <span className="text-xs text-muted-foreground">
              {currentStep}/{TOTAL_STEPS} — {STEP_LABELS[currentStep]}
            </span>
          </div>
          <button
            type="button"
            onClick={completeOnboarding}
            className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Skip setup"
            title="Skip all — you can return anytime via Settings → Setup Guide"
          >
            <XIcon className="size-4" />
          </button>
        </SheetHeader>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <SheetPanel className="flex-1 min-h-0">
          <StepContent step={currentStep} onImportDone={nextStep} />
        </SheetPanel>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <SheetFooter
          variant="bare"
          className="flex-row items-center justify-between gap-2 shrink-0"
        >
          {!isImportStep && (
            <button
              type="button"
              onClick={skipStep}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
            >
              Skip this step
            </button>
          )}
          <div className={cn("flex items-center gap-2", isImportStep && "ml-auto")}>
            {currentStep > 1 && (
              <Button size="sm" variant="outline" onClick={prevStep}>
                <ArrowLeftIcon className="size-3.5 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={isLastStep ? completeOnboarding : nextStep}>
              {isLastStep ? (
                <>
                  <CheckIcon className="size-3.5 mr-1" />
                  Done
                </>
              ) : (
                <>
                  Next
                  <ArrowRightIcon className="size-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
