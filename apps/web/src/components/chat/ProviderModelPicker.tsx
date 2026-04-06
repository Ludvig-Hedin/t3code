import { type ProviderKind, type ServerProvider } from "@t3tools/contracts";
import { normalizeModelSlug, resolveSelectableModel } from "@t3tools/shared/model";
import type { SelectableModelOption } from "@t3tools/shared/model";
import { memo, useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { type ProviderPickerKind, PROVIDER_OPTIONS } from "../../session-logic";
import { CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
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
import {
  AutoIcon,
  ClaudeAI,
  CursorIcon,
  Gemini,
  Icon,
  OllamaIcon,
  OpenAI,
  OpenCodeIcon,
} from "../Icons";
import { PullModelDialog } from "./PullModelDialog";
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
  // manifest = Auto: sparkle icon conveys automatic/intelligent model routing
  manifest: AutoIcon,
  codex: OpenAI,
  claudeAgent: ClaudeAI,
  gemini: Gemini,
  cursor: CursorIcon,
  opencode: OpenCodeIcon,
  ollama: OllamaIcon,
};

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);

// Install & auth metadata for each provider — shown in the setup dialog
type ProviderInstallEntry = {
  installCommands: ReadonlyArray<{ label: string; command: string }>;
  authCommand?: string;
  docsUrl: string;
};

const PROVIDER_INSTALL_DATA: Record<string, ProviderInstallEntry> = {
  codex: {
    installCommands: [
      { label: "npm", command: "npm install -g @openai/codex" },
      { label: "Homebrew", command: "brew install codex" },
    ],
    authCommand: "codex auth",
    docsUrl: "https://developers.openai.com/codex/quickstart?setup=cli",
  },
  claudeAgent: {
    installCommands: [
      { label: "macOS / Linux / WSL", command: "curl -fsSL https://claude.ai/install.sh | bash" },
    ],
    // Running `claude` launches the interactive auth flow on first run
    authCommand: "claude",
    docsUrl: "https://code.claude.com/docs/en/cli-reference",
  },
  gemini: {
    installCommands: [{ label: "npm", command: "npm install -g @google/gemini-cli" }],
    authCommand: "gemini auth",
    docsUrl: "https://geminicli.com/docs/",
  },
  opencode: {
    installCommands: [
      { label: "macOS / Linux", command: "curl -fsSL https://opencode.ai/install | bash" },
    ],
    docsUrl: "https://opencode.ai/docs/",
  },
};

type ProviderSetupDialog = {
  providerId: string;
  providerLabel: string;
  /** Whether the provider needs to be installed or authenticated */
  action: "install" | "auth";
} | null;

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
  onOllamaPullModel?: (model: string) => Promise<{ success: boolean; error?: string }>;
  onOllamaQuitServer?: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const [customModelValue, setCustomModelValue] = useState("");
  const [customModelError, setCustomModelError] = useState<string | null>(null);
  // Tracks which provider's install/auth dialog is open
  const [setupDialog, setSetupDialog] = useState<ProviderSetupDialog>(null);
  const [isPullModelDialogOpen, setIsPullModelDialogOpen] = useState(false);
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

  // OpenCode model search — filtered client-side so users can find models in a long list
  const openCodeModels = getProviderModelsForProvider(props.modelOptionsByProvider, "opencode");
  const filteredOpenCodeModels =
    modelSearchQuery.trim().length === 0
      ? openCodeModels
      : openCodeModels.filter(
          (m) =>
            m.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
            m.slug.toLowerCase().includes(modelSearchQuery.toLowerCase()),
        );

  const handleModelChange = (provider: ProviderKind, value: string) => {
    if (props.disabled) return;
    if (!value) return;
    const resolvedModel = resolveSelectableModel(
      provider,
      value,
      props.modelOptionsByProvider[provider],
    );
    if (!resolvedModel) {
      // Gemini and OpenCode both support dynamic model slugs (e.g. "anthropic/claude-sonnet-4-5")
      // that may not be in the pre-registered selectable options list — normalise and pass through.
      if (provider === "gemini" || provider === "opencode") {
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
          if (!open) setModelSearchQuery("");
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
                  // Ollama is a local server — show a direct download link rather than CLI install steps
                  if (option.value === "ollama") {
                    return (
                      <MenuItem
                        key={option.value}
                        onSelect={() => {
                          window.open("https://ollama.com/download", "_blank");
                        }}
                      >
                        <OptionIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground/85"
                        />
                        <span>{option.label}</span>
                        <span className="ms-auto text-[11px] text-blue-500 uppercase tracking-[0.08em]">
                          Install ↗
                        </span>
                      </MenuItem>
                    );
                  }

                  // Determine the appropriate action for this provider
                  const isNotInstalled = !liveProvider.installed;
                  const isUnauthenticated =
                    liveProvider.installed && liveProvider.auth.status === "unauthenticated";
                  const installData = PROVIDER_INSTALL_DATA[option.value];

                  // Show actionable Install button when the CLI isn't installed and we have a command
                  if (isNotInstalled && installData?.installCommands.length) {
                    return (
                      <MenuItem
                        key={option.value}
                        onSelect={() => {
                          setSetupDialog({
                            providerId: option.value,
                            providerLabel: option.label,
                            action: "install",
                          });
                          setIsMenuOpen(false);
                        }}
                      >
                        <OptionIcon
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 opacity-80",
                            providerIconClassName(option.value, "text-muted-foreground/85"),
                          )}
                        />
                        <span>{option.label}</span>
                        <span className="ms-auto text-[11px] text-blue-500 uppercase tracking-[0.08em] font-medium">
                          Install
                        </span>
                      </MenuItem>
                    );
                  }

                  // Show actionable Auth button when installed but not authenticated
                  if (isUnauthenticated && installData?.authCommand) {
                    return (
                      <MenuItem
                        key={option.value}
                        onSelect={() => {
                          setSetupDialog({
                            providerId: option.value,
                            providerLabel: option.label,
                            action: "auth",
                          });
                          setIsMenuOpen(false);
                        }}
                      >
                        <OptionIcon
                          aria-hidden="true"
                          className={cn(
                            "size-4 shrink-0 opacity-80",
                            providerIconClassName(option.value, "text-muted-foreground/85"),
                          )}
                        />
                        <span>{option.label}</span>
                        <span className="ms-auto text-[11px] text-amber-500 uppercase tracking-[0.08em] font-medium">
                          Authenticate
                        </span>
                      </MenuItem>
                    );
                  }

                  // Fallback: disabled item with generic status label
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
                // Manifest "Auto" renders as a direct top-level item — no submenu needed
                // because there is only one logical model ("auto"). One click selects it.
                if (option.value === "manifest") {
                  const isActive = props.provider === "manifest";
                  return (
                    <MenuItem
                      key={option.value}
                      onSelect={() => handleModelChange("manifest", "auto")}
                    >
                      <OptionIcon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          isActive ? "text-foreground/80" : "text-muted-foreground/85",
                        )}
                      />
                      <span className={cn(isActive ? "font-medium" : undefined)}>
                        {option.label}
                      </span>
                      {isActive && (
                        <CheckIcon aria-hidden="true" className="ms-auto size-3.5 shrink-0" />
                      )}
                    </MenuItem>
                  );
                }

                // OpenCode gets a dedicated search bar so users can filter its large model list
                if (option.value === "opencode") {
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
                        {props.provider === "opencode" &&
                          runtimeModel !== null &&
                          runtimeModel !== requestedModel && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {runtimeModel}
                            </span>
                          )}
                      </MenuSubTrigger>
                      <MenuSubPopup className="[--available-height:min(24rem,70vh)]" sideOffset={4}>
                        <div className="px-2 py-1.5">
                          <Input
                            autoFocus
                            placeholder="Search models…"
                            value={modelSearchQuery}
                            onChange={(e) => setModelSearchQuery(e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                        <MenuDivider />
                        <MenuGroup>
                          <MenuRadioGroup
                            value={props.provider === "opencode" ? props.model : ""}
                            onValueChange={(value) => {
                              setModelSearchQuery("");
                              handleModelChange("opencode", value);
                            }}
                          >
                            {filteredOpenCodeModels.length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">
                                No models found
                              </div>
                            )}
                            {filteredOpenCodeModels.map((modelOption) => (
                              <MenuRadioItem
                                key={`opencode:${modelOption.slug}`}
                                value={modelOption.slug}
                              >
                                {modelOption.name}
                              </MenuRadioItem>
                            ))}
                          </MenuRadioGroup>
                        </MenuGroup>
                      </MenuSubPopup>
                    </MenuSub>
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
                        {/* Ollama-specific actions: pull a new model or quit the local server */}
                        {option.value === "ollama" ? (
                          <>
                            <MenuDivider />
                            <MenuItem
                              onSelect={() => {
                                setIsPullModelDialogOpen(true);
                                setIsMenuOpen(false);
                              }}
                            >
                              Pull model…
                            </MenuItem>
                            {props.onOllamaQuitServer ? (
                              <MenuItem
                                onSelect={() => {
                                  props.onOllamaQuitServer?.();
                                  setIsMenuOpen(false);
                                }}
                              >
                                Quit Ollama
                              </MenuItem>
                            ) : null}
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
            </>
          )}
        </MenuPopup>
      </Menu>
      {/* Provider install / auth setup dialog */}
      <ProviderSetupDialog setupDialog={setupDialog} onClose={() => setSetupDialog(null)} />
      {/* PullModelDialog — only mounted when the parent supplies an onOllamaPullModel handler */}
      {props.onOllamaPullModel ? (
        <PullModelDialog
          open={isPullModelDialogOpen}
          onOpenChange={setIsPullModelDialogOpen}
          onPull={props.onOllamaPullModel}
        />
      ) : null}
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

// Shown when the user clicks Install or Authenticate for a provider
function ProviderSetupDialog({
  setupDialog,
  onClose,
}: {
  setupDialog: ProviderSetupDialog;
  onClose: () => void;
}) {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const copyToClipboard = (command: string) => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopiedCommand(command);
      // Reset the copied indicator after 2 s
      setTimeout(() => setCopiedCommand((prev) => (prev === command ? null : prev)), 2000);
    });
  };

  const info = setupDialog ? PROVIDER_INSTALL_DATA[setupDialog.providerId] : undefined;

  return (
    <Dialog
      open={setupDialog !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-md">
        {setupDialog && (
          <>
            <DialogHeader>
              <DialogTitle>
                {setupDialog.action === "install"
                  ? `Install ${setupDialog.providerLabel}`
                  : `Authenticate ${setupDialog.providerLabel}`}
              </DialogTitle>
            </DialogHeader>
            <DialogPanel className="space-y-4">
              {setupDialog.action === "install" && info && info.installCommands.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Run one of the following commands in your terminal, then refresh this page.
                  </p>
                  {info.installCommands.map((cmd) => (
                    <div key={cmd.label} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground/70">{cmd.label}</p>
                      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                        <code className="flex-1 truncate font-mono text-sm">{cmd.command}</code>
                        <button
                          type="button"
                          aria-label="Copy command"
                          onClick={() => copyToClipboard(cmd.command)}
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedCommand === cmd.command ? (
                            <CheckIcon className="size-3.5 text-green-500" />
                          ) : (
                            <CopyIcon className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : setupDialog.action === "auth" && info?.authCommand ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Run the following command to authenticate, then refresh this page.
                  </p>
                  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
                    <code className="flex-1 truncate font-mono text-sm">{info.authCommand}</code>
                    <button
                      type="button"
                      aria-label="Copy command"
                      onClick={() => copyToClipboard(info.authCommand!)}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copiedCommand === info.authCommand ? (
                        <CheckIcon className="size-3.5 text-green-500" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </DialogPanel>
            <DialogFooter>
              {info?.docsUrl ? (
                <a
                  href={info.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "mr-auto gap-1.5 text-muted-foreground",
                  )}
                >
                  Docs
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogPopup>
    </Dialog>
  );
}
