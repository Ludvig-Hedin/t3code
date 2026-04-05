/**
 * Marketing-only Bird Code chrome — class names aligned with production:
 * - Sidebar: `Sidebar.tsx` header, new thread/search rows, Projects group
 * - Header row: `ChatHeader.tsx` (title, Badge, Git / open / terminal / diff)
 * - Messages: `ChatView` + `MessagesTimeline`
 * - Composer: `ChatView` form (`rounded-[22px]`), footer per `ComposerPrimaryActions` / `ProviderModelPicker` layout
 */
import { forwardRef, type ReactNode } from "react";
import {
  ChevronDown,
  DiffIcon,
  ExternalLink,
  EyeIcon,
  GitBranch,
  ListChecks,
  MessageSquare,
  PanelLeft,
  Search,
  SquarePen,
  TerminalIcon,
  TerminalSquareIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const APP_STAGE_LABEL = "Alpha";

export function MarketingSidebarBrand() {
  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">
      <img
        src="/favicon.svg"
        alt=""
        className="size-6 shrink-0 rounded-sm"
        width={24}
        height={24}
      />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-medium tracking-tight text-muted-foreground">
          Bird Code
        </span>
        <span className="shrink-0 rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
          {APP_STAGE_LABEL}
        </span>
      </div>
    </div>
  );
}

export function MarketingSidebarNavRows() {
  return (
    <div className="px-2 py-1">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        tabIndex={-1}
        aria-hidden
      >
        <SquarePen className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">New thread</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ⌘N
        </kbd>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        tabIndex={-1}
        aria-hidden
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 text-left">Search</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </button>
    </div>
  );
}

export function MarketingSidebarProjectsSection({
  projectLabel,
  children,
}: {
  projectLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden px-2 py-2">
      <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Projects
        </span>
        <span
          className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/50"
          aria-hidden
        >
          <span className="text-xs leading-none">+</span>
        </span>
      </div>
      <div className="rounded-md border border-border/60 bg-muted/15 px-1.5 py-1">
        <div className="flex items-center gap-1.5 px-1.5 py-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
            {projectLabel}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/50" aria-hidden />
        </div>
        <div className="border-t border-border/40 pt-0.5">{children}</div>
      </div>
    </div>
  );
}

export function MarketingChatHeaderBar({
  threadTitle,
  projectName,
  isGitRepo = true,
}: {
  threadTitle: string;
  projectName: string;
  /** When false, diff toggle matches app “disabled when not git” styling */
  isGitRepo?: boolean;
}) {
  return (
    <header className="flex min-w-0 shrink-0 border-b border-border px-3 py-2 sm:px-5 sm:py-3">
      <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground md:hidden dark:bg-input/32"
            aria-hidden
          >
            <PanelLeft className="size-3.5 opacity-80" />
          </span>
          <h2
            className="min-w-0 shrink truncate text-sm font-medium text-foreground"
            title={threadTitle}
          >
            {threadTitle}
          </h2>
          <span className="inline-flex h-5 min-w-0 max-w-[min(42%,11rem)] shrink items-center overflow-hidden rounded-sm border border-input bg-background px-[calc(0.25rem-1px)] text-xs font-medium text-foreground dark:bg-input/32">
            <span className="min-w-0 truncate">{projectName}</span>
          </span>
          {!isGitRepo ? (
            <span className="shrink-0 rounded-sm border border-amber-700/40 px-1.5 py-px text-[10px] font-medium text-amber-800 dark:text-amber-600">
              No Git
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2 @3xl/header-actions:gap-3">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="hidden font-mono text-[10px] sm:inline-flex"
            aria-hidden
            tabIndex={-1}
          >
            lint
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="hidden sm:inline-flex"
            aria-label="Git actions"
            tabIndex={-1}
          >
            <GitBranch className="size-3 opacity-80" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            className="hidden sm:inline-flex"
            aria-label="Open in editor"
            tabIndex={-1}
          >
            <ExternalLink className="size-3 opacity-80" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="shrink-0 px-1.5"
            aria-label="Toggle terminal drawer"
            tabIndex={-1}
          >
            <TerminalSquareIcon className="size-3 shrink-0 opacity-80 sm:size-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className={cn("shrink-0 px-1.5", !isGitRepo && "opacity-40")}
            aria-label="Toggle diff panel"
            tabIndex={-1}
            disabled={!isGitRepo}
          >
            <DiffIcon className="size-3 shrink-0 opacity-80 sm:size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

export function MarketingSidebarThreadButton({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 w-full cursor-pointer items-center gap-2 overflow-hidden rounded-lg p-2 text-left text-xs outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </button>
  );
}

export function MarketingSidebarThreadStatic({
  title,
  active,
}: {
  title: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 overflow-hidden rounded-lg p-2 text-left text-xs",
        active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground/90",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </div>
  );
}

export function MarketingUserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] flex-col items-end">
        <div className="rounded-2xl rounded-br-sm bg-secondary/50 px-3 py-2">
          <div className="break-words whitespace-pre-wrap font-mono text-sm leading-relaxed text-foreground">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketingAssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 px-1 py-0.5">
      <div className="text-sm leading-relaxed tracking-normal text-foreground [&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8rem]">
        {children}
      </div>
    </div>
  );
}

export function MarketingToolWorkRow({
  variant,
  primary,
  secondary,
}: {
  variant: "read" | "run";
  primary: string;
  secondary: string;
}) {
  const Icon = variant === "read" ? EyeIcon : TerminalIcon;
  return (
    <div className="rounded-md px-0.5 py-0.5">
      <div className="flex items-center gap-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center text-foreground/45">
          <Icon className="size-3" />
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate font-mono text-[10px] leading-4 tracking-tight text-muted-foreground/85">
            <span>{primary}</span>
            {secondary ? <span className="text-muted-foreground/40"> — {secondary}</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MarketingWorkLogCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5">
      <div className="mb-1 flex items-center gap-1.5 px-0.5">
        <span className="size-1 shrink-0 rounded-full bg-muted-foreground/35" />
        <p className="text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55">
          Work log
        </p>
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

export function MarketingWorkingRow() {
  return (
    <div className="py-0.5 pl-1.5">
      <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70">
        <span className="inline-flex items-center gap-[3px]">
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:200ms]" />
          <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:400ms]" />
        </span>
        <span>Working...</span>
      </div>
    </div>
  );
}

/** Static composer shell for bento / feature previews (non-interactive). */
export function MarketingComposerFrame({
  placeholder,
  actionSlot,
}: {
  placeholder: string;
  actionSlot?: ReactNode;
}) {
  return (
    <div className="px-3 pt-1.5 pb-1 sm:px-5 sm:pt-2">
      <div className="mx-auto w-full min-w-0 max-w-[52rem]" data-chat-composer-form="true">
        <div className="group rounded-[22px] p-px transition-colors duration-200">
          <div className="rounded-[20px] border border-border bg-card transition-colors duration-200 has-focus-visible:border-border/80">
            <div className="relative px-3 pb-2 pt-2.5 sm:px-4 sm:pt-3">
              <p className="min-h-[1.25rem] text-sm leading-relaxed text-muted-foreground">
                {placeholder}
              </p>
            </div>
            {actionSlot ? (
              <div className="flex min-w-0 flex-nowrap items-center justify-end gap-2 overflow-hidden px-2.5 pb-2.5 sm:px-3 sm:pb-3">
                {actionSlot}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Matches `ComposerPromptEditor` surface + `ChatView` composer footer layout (simplified). */
export function MarketingHeroComposer({
  value,
  placeholder,
  readOnly,
  isRunning,
  isConnecting,
  hasSendableContent,
  onSubmit,
}: {
  value: string;
  placeholder: string;
  readOnly?: boolean;
  isRunning: boolean;
  isConnecting?: boolean;
  hasSendableContent: boolean;
  onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
}) {
  const sendBusy = Boolean(isConnecting);
  const showStop = isRunning;

  return (
    <div className="px-3 pt-1.5 pb-1 sm:px-5 sm:pt-2">
      <form
        className="mx-auto w-full min-w-0 max-w-[52rem]"
        data-chat-composer-form="true"
        onSubmit={onSubmit}
      >
        <div className="group rounded-[22px] p-px transition-colors duration-200">
          <div className="rounded-[20px] border border-border bg-card transition-colors duration-200 has-focus-visible:border-border/80">
            <div className="relative px-3 pb-2 pt-2.5 sm:px-4 sm:pt-3">
              <label htmlFor="hero-demo-composer" className="sr-only">
                Message
              </label>
              <textarea
                id="hero-demo-composer"
                readOnly={readOnly}
                rows={3}
                value={value}
                placeholder={placeholder}
                className="block max-h-[200px] min-h-[4.375rem] w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/35 focus:outline-none"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div
              data-chat-composer-footer="true"
              className="flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-hidden px-2.5 pb-2.5 sm:px-3 sm:pb-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:min-w-max sm:overflow-visible">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  <span className="size-3.5 rounded-sm bg-foreground/90 font-mono text-[8px] leading-none text-background">
                    AI
                  </span>
                  <span className="max-w-[7rem] truncate sm:max-w-[9rem]">Codex · gpt-5.1</span>
                  <ChevronDown className="size-3 opacity-50" />
                </Button>
                <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-7 shrink-0 px-2 text-muted-foreground hover:text-foreground/80 sm:inline-flex"
                  tabIndex={-1}
                >
                  <MessageSquare className="size-3.5" />
                  <span className="sr-only sm:not-sr-only">Chat</span>
                </Button>
                <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-7 shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 md:inline-flex"
                  tabIndex={-1}
                >
                  <ListChecks className="size-3.5" />
                  <span className="sr-only md:not-sr-only">Plan</span>
                </Button>
              </div>
              <div
                data-chat-composer-actions="right"
                className="flex shrink-0 flex-nowrap items-center justify-end gap-2"
              >
                {showStop ? (
                  <button
                    type="button"
                    className="flex size-8 cursor-default items-center justify-center rounded-full bg-rose-500/90 text-white sm:h-8 sm:w-8"
                    aria-label="Stop generation"
                    tabIndex={-1}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                      <rect x="2" y="2" width="8" height="8" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex h-9 w-9 cursor-default items-center justify-center rounded-full bg-foreground/90 text-background transition-all duration-150 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8"
                    disabled={sendBusy || !hasSendableContent}
                    aria-label="Send message"
                    tabIndex={-1}
                  >
                    {sendBusy ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        className="animate-spin"
                        aria-hidden
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="5.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeDasharray="20 12"
                        />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                        <path
                          d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export function MarketingAppWindow({
  sidebar,
  children,
  className,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 overflow-hidden rounded-[var(--radius)] border border-border bg-background text-left shadow-sm",
        className,
      )}
    >
      <aside className="flex min-h-0 w-[12.5rem] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-border bg-card sm:w-[13.5rem] md:w-[14rem]">
        {sidebar}
      </aside>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {children}
      </div>
    </div>
  );
}

export const MarketingMessagesArea = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function MarketingMessagesArea({ children }, ref) {
    return (
      <div
        ref={ref}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
      >
        {children}
      </div>
    );
  },
);
