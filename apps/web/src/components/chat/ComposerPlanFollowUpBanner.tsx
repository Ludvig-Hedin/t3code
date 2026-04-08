import { memo } from "react";

export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* "Plan ready" is a decision point — tell the user they need to act on it */}
        <span className="uppercase text-sm tracking-[0.2em]">Plan ready</span>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{planTitle}</span>
        ) : null}
      </div>
      {/* Prompt the user to review the plan above and choose their next action.
          Use text-sm + text-muted-foreground (no opacity) to satisfy WCAG AA 4.5:1. */}
      <p className="mt-1 text-sm text-muted-foreground">
        Review the plan above, then implement or refine it below.
      </p>
    </div>
  );
});
