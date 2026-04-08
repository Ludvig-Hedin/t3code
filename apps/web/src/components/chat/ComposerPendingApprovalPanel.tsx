import { memo } from "react";
import { type PendingApproval } from "../../session-logic";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const approvalSummary =
    approval.requestKind === "command"
      ? "Command approval requested"
      : approval.requestKind === "file-read"
        ? "File-read approval requested"
        : "File-change approval requested";

  return (
    <div className="px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-sm tracking-[0.2em]">PENDING APPROVAL</span>
        <span className="text-sm font-medium">{approvalSummary}</span>
        {pendingCount > 1 ? (
          <span className="text-xs text-muted-foreground">1/{pendingCount}</span>
        ) : null}
      </div>
      {/* Show the specific file path or command so the user can make an informed decision
          without having to scroll up to find the agent's message.
          Use text-muted-foreground (no opacity) for WCAG AA contrast. The full
          value is accessible via aria-label on the element itself. */}
      {approval.detail ? (
        <p
          className="mt-1 max-w-full truncate font-mono text-xs text-muted-foreground"
          aria-label={approval.detail}
        >
          {approval.detail}
        </p>
      ) : null}
    </div>
  );
});
