/**
 * OnboardingSheet — 6-step right-side sheet.
 *
 * Auto-opens on first launch (controlled by useOnboarding localStorage state).
 * Can be reopened from Settings via the "Setup Guide" button.
 *
 * Steps:
 *  1. Tour              (overview of what Bird Code can do)
 *  2. Project Setup     (pick a workspace folder)
 *  3. Provider Install
 *  4. Mobile Pairing    (optional)
 *  5. Git Setup
 *  6. Import Chats      (optional)
 */
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetHeader, SheetPanel, SheetFooter } from "../ui/sheet";
import {
  type OnboardingStep,
  TOTAL_ONBOARDING_STEPS,
  useOnboarding,
} from "../../hooks/useOnboarding";
import { FeatureTourStep } from "./steps/FeatureTourStep";
import { ProjectSetupStep } from "./steps/ProjectSetupStep";
import { ProviderInstallStep } from "./steps/ProviderInstallStep";
import { MobilePairingStep } from "./steps/MobilePairingStep";
import { GitSetupStep } from "./steps/GitSetupStep";
import { ImportChatsFlow } from "./ImportChatsFlow";
import { cn } from "~/lib/utils";

const STEP_LABELS: Record<OnboardingStep, string> = {
  1: "Tour",
  2: "Project",
  3: "Providers",
  4: "Mobile",
  5: "Git",
  6: "Import",
};

const TOTAL_STEPS = TOTAL_ONBOARDING_STEPS;

// ── Step indicator dots ───────────────────────────────────────────────────────

function StepDots({ current, total }: { current: OnboardingStep; total: number }) {
  const { goToStep } = useOnboarding();
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as OnboardingStep;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <button
            key={step}
            type="button"
            onClick={() => goToStep(step)}
            aria-label={`Go to step ${step}`}
            aria-current={isActive ? "step" : undefined}
            className={cn(
              "rounded-full transition-all duration-200 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30",
              isActive && "w-5 h-2 bg-foreground",
              isDone && "w-2 h-2 bg-foreground/40 hover:bg-foreground/60",
              !isActive && !isDone && "w-2 h-2 bg-muted-foreground/20 hover:bg-muted-foreground/40",
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
      return <FeatureTourStep />;
    case 2:
      return <ProjectSetupStep />;
    case 3:
      return <ProviderInstallStep />;
    case 4:
      return <MobilePairingStep />;
    case 5:
      return <GitSetupStep />;
    case 6:
      return <ImportChatsFlow onDone={onImportDone} />;
  }
}

// ── Main sheet ────────────────────────────────────────────────────────────────

export function OnboardingSheet() {
  const { open, currentStep, closeOnboarding, completeOnboarding, nextStep, prevStep, skipStep } =
    useOnboarding();

  const isLastStep = currentStep === TOTAL_STEPS;
  // The import step manages its own primary CTA (the import button)
  const isImportStep = currentStep === 6;

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
            {/* M9: the import step owns its own primary CTAs ("Import N
                threads" while selecting, "Done" on the success screen). Hide
                the footer primary so the user doesn't see two stacked Done
                buttons after a successful import. */}
            {!isImportStep && (
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
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
