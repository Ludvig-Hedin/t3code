import { type ApprovalRequestId, type ProviderApprovalDecision } from "@t3tools/contracts";
import { ChevronDownIcon, ShieldAlertIcon } from "lucide-react";
import { memo } from "react";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<void>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <>
      {/* Cancel — leftmost, low-emphasis ghost. mr-auto pushes the rest right. */}
      <Button
        size="sm"
        variant="ghost"
        className="mr-auto text-muted-foreground/80"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "cancel")}
      >
        Cancel
      </Button>
      {/* Decline — destructive-outline, kept clearly separate from Approve. */}
      <Button
        size="sm"
        variant="destructive-outline"
        disabled={isResponding}
        onClick={() => void onRespondToApproval(requestId, "decline")}
      >
        Decline
      </Button>
      {/* Approve split-button: primary "Approve" + caret menu containing the
          dangerous "Always allow this session" option, demoted behind a click
          so it's not a fat-finger target. Mirrors the pattern in
          ComposerPrimaryActions.tsx (~lines 183-215). */}
      <div className="flex items-center">
        <Button
          size="sm"
          variant="default"
          className="rounded-r-none px-4"
          disabled={isResponding}
          onClick={() => void onRespondToApproval(requestId, "accept")}
        >
          Approve
        </Button>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="default"
                className="rounded-l-none border-l-white/12 px-1.5"
                aria-label="More approval options"
                disabled={isResponding}
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
          </MenuTrigger>
          <MenuPopup align="end" side="top">
            <MenuItem
              disabled={isResponding}
              onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
            >
              <ShieldAlertIcon className="size-4 shrink-0 text-amber-400/90" />
              Always allow this session
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </>
  );
});
