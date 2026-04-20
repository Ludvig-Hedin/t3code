import {
  type CustomApprovalPolicy,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import { memo, type ReactNode } from "react";
import { EllipsisIcon, ListTodoIcon } from "lucide-react";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  /** Per-action approval config, used when runtimeMode is "custom" */
  customApprovalPolicy: CustomApprovalPolicy;
  traitsMenuContent?: ReactNode;
  onToggleInteractionMode: () => void;
  onTogglePlanSidebar: () => void;
  /** Called with the newly selected runtime mode */
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onCustomApprovalPolicyChange: (policy: CustomApprovalPolicy) => void;
}) {
  const isCustom = props.runtimeMode === "custom";

  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80"
                  aria-label="More composer controls"
                />
              }
            >
              <EllipsisIcon aria-hidden="true" className="size-4" />
            </MenuTrigger>
          }
        />
        <TooltipPopup side="top">More composer controls</TooltipPopup>
      </Tooltip>
      <MenuPopup align="start">
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuDivider />
          </>
        ) : null}
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Mode</div>
        <MenuRadioGroup
          value={props.interactionMode}
          onValueChange={(value) => {
            if (!value || value === props.interactionMode) return;
            props.onToggleInteractionMode();
          }}
        >
          {/* Chat: agent acts immediately on each message */}
          <MenuRadioItem value="default">
            <span className="flex flex-col">
              <span>Chat</span>
              <span className="text-[10px] font-normal text-muted-foreground/60">
                Agent acts on each message directly
              </span>
            </span>
          </MenuRadioItem>
          {/* Plan: agent proposes a step-by-step plan before making any changes */}
          <MenuRadioItem value="plan">
            <span className="flex flex-col">
              <span>Plan</span>
              <span className="text-[10px] font-normal text-muted-foreground/60">
                Agent proposes a plan before making changes
              </span>
            </span>
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuDivider />
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Permissions</div>
        <MenuRadioGroup
          value={props.runtimeMode}
          onValueChange={(value) => {
            if (!value || value === props.runtimeMode) return;
            props.onRuntimeModeChange(value as RuntimeMode);
          }}
        >
          {/* Auto accept edits: AI acts without asking */}
          <MenuRadioItem value="full-access">Auto accept edits</MenuRadioItem>
          {/* Ask permission: AI must request approval for each action */}
          <MenuRadioItem value="approval-required">Ask permission</MenuRadioItem>
          {/* Custom: granular per-action control */}
          <MenuRadioItem value="custom">Custom</MenuRadioItem>
        </MenuRadioGroup>

        {/* Per-action toggles, shown only when "Custom" is selected */}
        {isCustom ? (
          <>
            <div className="px-2 pt-2 pb-0.5 text-xs text-muted-foreground/70">
              Auto-approve actions:
            </div>
            {/* commands: command_execution_approval + exec_command_approval */}
            <MenuCheckboxItem
              variant="switch"
              checked={props.customApprovalPolicy.commands}
              onCheckedChange={(checked) =>
                props.onCustomApprovalPolicyChange({
                  ...props.customApprovalPolicy,
                  commands: !!checked,
                })
              }
            >
              Run shell commands
            </MenuCheckboxItem>
            {/* fileReads: file_read_approval */}
            <MenuCheckboxItem
              variant="switch"
              checked={props.customApprovalPolicy.fileReads}
              onCheckedChange={(checked) =>
                props.onCustomApprovalPolicyChange({
                  ...props.customApprovalPolicy,
                  fileReads: !!checked,
                })
              }
            >
              Read files
            </MenuCheckboxItem>
            {/* fileChanges: file_change_approval + apply_patch_approval */}
            <MenuCheckboxItem
              variant="switch"
              checked={props.customApprovalPolicy.fileChanges}
              onCheckedChange={(checked) =>
                props.onCustomApprovalPolicyChange({
                  ...props.customApprovalPolicy,
                  fileChanges: !!checked,
                })
              }
            >
              Write &amp; modify files
            </MenuCheckboxItem>
          </>
        ) : null}

        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen ? "Hide plan sidebar" : "Show plan sidebar"}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
