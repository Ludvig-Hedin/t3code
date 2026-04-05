import { type ProviderKind, type ServerProvider } from "@t3tools/contracts";
import { normalizeModelSlug, resolveSelectableModel } from "@t3tools/shared/model";
import type { SelectableModelOption } from "@t3tools/shared/model";
import { memo, useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { type ProviderPickerKind, PROVIDER_OPTIONS } from "../../session-logic";
import { ChevronDownIcon } from "lucide-react";
import { Button, buttonVariants } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { ClaudeAI, CursorIcon, Gemini, Icon, OpenAI, OpenCodeIcon } from "../Icons";
import { cn } from "~/lib/utils";
import { getProviderModelsForProvider, getProviderSnapshot } from "../../providerModels";

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderKind;
  label: string;
  available: true;
} {
  return option.available;
}

const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  cursor: CursorIcon,
};

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);
const COMING_SOON_PROVIDER_OPTIONS = [
  { id: "opencode", label: "OpenCode", icon: OpenCodeIcon },
] as const;

function providerIconClassName(
  provider: ProviderKind | ProviderPickerKind,
  fallbackClassName: string,
): string {
  return provider === "claudeAgent" ? "text-[#d97757]" : fallbackClassName;
}

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  provider: ProviderKind;
  model: string;
  lockedProvider: ProviderKind | null;
  providers?: ReadonlyArray<ServerProvider>;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<SelectableModelOption>>;
  activeProviderIconClassName?: string;
  runtimeModel?: string | null;
  compact?: boolean;
  disabled?: boolean;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerClassName?: string;
  onProviderModelChange: (provider: ProviderKind, model: string) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const [customModelValue, setCustomModelValue] = useState("");
  const [customModelError, setCustomModelError] = useState<string | null>(null);
  const activeProvider = props.lockedProvider ?? props.provider;
  const isGemini = activeProvider === "gemini";
  const selectedProviderOptions = getProviderModelsForProvider(
    props.modelOptionsByProvider,
    activeProvider,
  );
  const requestedModel = normalizeModelSlug(props.model, activeProvider) ?? props.model;
  const selectedModelLabel =
    selectedProviderOptions.find((option) => option.slug === requestedModel)?.name ?? props.model;
  const runtimeModel = normalizeModelSlug(props.runtimeModel, activeProvider);
  const runtimeModelLabel =
    runtimeModel !== null
      ? (selectedProviderOptions.find((option) => option.slug === runtimeModel)?.name ??
        runtimeModel)
      : null;
  const showRuntimeModel = runtimeModel !== null && runtimeModel !== requestedModel;
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[activeProvider];

  const handleModelChange = (provider: ProviderKind, value: string) => {
    if (props.disabled) return;
    if (!value) return;
    const resolvedModel = resolveSelectableModel(
      provider,
      value,
      props.modelOptionsByProvider[provider],
    );
    if (!resolvedModel) {
      if (provider === "gemini") {
        const normalized = normalizeModelSlug(value, provider);
        if (!normalized) return;
        props.onProviderModelChange(provider, normalized);
        setIsMenuOpen(false);
      }
      return;
    }
    props.onProviderModelChange(provider, resolvedModel);
    setIsMenuOpen(false);
  };

  const openCustomModelDialog = () => {
    if (props.disabled || !isGemini) return;
    setCustomModelValue("");
    setCustomModelError(null);
    setIsCustomModelDialogOpen(true);
    setIsMenuOpen(false);
  };

  const submitCustomModel = () => {
    if (props.disabled || !isGemini) return;
    const normalized = normalizeModelSlug(customModelValue, activeProvider);
    if (!normalized) {
      setCustomModelError("Enter a Gemini model slug.");
      return;
    }
    props.onProviderModelChange(activeProvider, normalized);
    setIsCustomModelDialogOpen(false);
    setCustomModelError(null);
  };

  return (
    <>
      <Menu
        open={isMenuOpen}
        onOpenChange={(open) => {
          if (props.disabled) {
            setIsMenuOpen(false);
            return;
          }
          setIsMenuOpen(open);
        }}
      >
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant={props.triggerVariant ?? "ghost"}
              data-chat-provider-model-picker="true"
              className={cn(
                "min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
                props.compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
                props.triggerClassName,
              )}
              disabled={props.disabled}
            />
          }
        >
          <span
            className={cn(
              "flex min-w-0 w-full box-border items-center gap-2 overflow-hidden",
              props.compact ? "max-w-36 sm:pl-1" : undefined,
            )}
          >
            <ProviderIcon
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0",
                providerIconClassName(activeProvider, "text-muted-foreground/70"),
                props.activeProviderIconClassName,
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              <span>{selectedModelLabel}</span>
              {showRuntimeModel ? (
                <span className="ml-1 text-[10px] text-muted-foreground/60">
                  using {runtimeModelLabel}
                </span>
              ) : null}
            </span>
            <ChevronDownIcon aria-hidden="true" className="size-3 shrink-0 opacity-60" />
          </span>
        </MenuTrigger>
        <MenuPopup align="start">
          {props.lockedProvider !== null ? (
            <MenuGroup>
              <MenuRadioGroup
                value={props.model}
                onValueChange={(value) => handleModelChange(props.lockedProvider!, value)}
              >
                {getProviderModelsForProvider(
                  props.modelOptionsByProvider,
                  props.lockedProvider,
                ).map((modelOption) => (
                  <MenuRadioItem
                    key={`${props.lockedProvider}:${modelOption.slug}`}
                    value={modelOption.slug}
                  >
                    {modelOption.name}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
              {isGemini ? (
                <>
                  <MenuDivider />
                  <MenuItem onSelect={openCustomModelDialog}>Custom model...</MenuItem>
                </>
              ) : null}
            </MenuGroup>
          ) : (
            <>
              {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
                const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
                const liveProvider = props.providers
                  ? getProviderSnapshot(props.providers, option.value)
                  : undefined;
                if (liveProvider && liveProvider.status !== "ready") {
                  const unavailableLabel = !liveProvider.enabled
                    ? "Disabled"
                    : !liveProvider.installed
                      ? "Not installed"
                      : "Unavailable";
                  return (
                    <MenuItem key={option.value} disabled>
                      <OptionIcon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0 opacity-80",
                          providerIconClassName(option.value, "text-muted-foreground/85"),
                        )}
                      />
                      <span>{option.label}</span>
                      <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                        {unavailableLabel}
                      </span>
                    </MenuItem>
                  );
                }
                return (
                  <MenuSub key={option.value}>
                    <MenuSubTrigger>
                      <OptionIcon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          providerIconClassName(option.value, "text-muted-foreground/85"),
                        )}
                      />
                      {option.label}
                    </MenuSubTrigger>
                    <MenuSubPopup className="[--available-height:min(24rem,70vh)]" sideOffset={4}>
                      <MenuGroup>
                        <MenuRadioGroup
                          value={props.provider === option.value ? props.model : ""}
                          onValueChange={(value) => handleModelChange(option.value, value)}
                        >
                          {getProviderModelsForProvider(
                            props.modelOptionsByProvider,
                            option.value,
                          ).map((modelOption) => (
                            <MenuRadioItem
                              key={`${option.value}:${modelOption.slug}`}
                              value={modelOption.slug}
                            >
                              {modelOption.name}
                            </MenuRadioItem>
                          ))}
                        </MenuRadioGroup>
                        {option.value === "gemini" ? (
                          <>
                            <MenuDivider />
                            <MenuItem onSelect={openCustomModelDialog}>Custom model...</MenuItem>
                          </>
                        ) : null}
                      </MenuGroup>
                    </MenuSubPopup>
                  </MenuSub>
                );
              })}
              {UNAVAILABLE_PROVIDER_OPTIONS.length > 0 && <MenuDivider />}
              {UNAVAILABLE_PROVIDER_OPTIONS.map((option) => {
                const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
                return (
                  <MenuItem key={option.value} disabled>
                    <OptionIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground/85 opacity-80"
                    />
                    <span>{option.label}</span>
                    <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                      Coming soon
                    </span>
                  </MenuItem>
                );
              })}
              {COMING_SOON_PROVIDER_OPTIONS.length > 0 && <MenuDivider />}
              {COMING_SOON_PROVIDER_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <MenuItem key={option.id} disabled>
                    <OptionIcon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
                    <span>{option.label}</span>
                    <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                      Coming soon
                    </span>
                  </MenuItem>
                );
              })}
            </>
          )}
        </MenuPopup>
      </Menu>
      <Dialog open={isCustomModelDialogOpen} onOpenChange={setIsCustomModelDialogOpen}>
        <DialogPopup className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom Gemini model</DialogTitle>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter any Gemini CLI model slug. The selected slug will be sent to the CLI, and any
              fallback will be shown in the picker.
            </p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitCustomModel();
              }}
            >
              <Input
                autoFocus
                value={customModelValue}
                onChange={(event) => {
                  setCustomModelValue(event.target.value);
                  setCustomModelError(null);
                }}
                placeholder="gemini-3.1-pro-preview"
                aria-label="Custom Gemini model"
              />
              {customModelError ? (
                <p className="text-xs text-destructive">{customModelError}</p>
              ) : null}
            </form>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCustomModelDialogOpen(false);
                setCustomModelError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" onClick={submitCustomModel}>
              Use model
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
