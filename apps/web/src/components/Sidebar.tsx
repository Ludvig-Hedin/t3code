import {
  ArchiveIcon,
  ArrowUpDownIcon,
  ChevronRightIcon,
  CodeIcon,
  CopyIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderIcon,
  FolderOpenIcon,
  GitPullRequestIcon,
  HashIcon,
  LayoutGridIcon,
  LoaderCircleIcon,
  MailIcon,
  PanelLeftIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  ZapIcon,
} from "lucide-react";
import { ProjectFavicon } from "./ProjectFavicon";
import { autoAnimate } from "@formkit/auto-animate";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  type DesktopUpdateState,
  ProjectId,
  PROVIDER_DISPLAY_NAMES,
  ThreadId,
  type GitStatusResult,
  type ProviderKind,
} from "@t3tools/contracts";
import { useQueries } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import {
  type SidebarProjectSortOrder,
  type SidebarThreadSortOrder,
} from "@t3tools/contracts/settings";
import { isElectron, isMobileWebView } from "../env";
import { APP_STAGE_LABEL, APP_VERSION } from "../branding";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isLinuxPlatform, isMacPlatform, newCommandId } from "../lib/utils";
import { useStore } from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useUiStateStore } from "../uiStateStore";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHints,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { gitStatusQueryOptions } from "../lib/gitReactQuery";
import { DiffStatLabel } from "./chat/DiffStatLabel";
import { readNativeApi } from "../nativeApi";
import { useComposerDraftStore } from "../composerDraftStore";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { focusThreadPopout, usePopoutWindowStore } from "../popoutWindowStore";

import { useThreadActions } from "../hooks/useThreadActions";
import { toastManager } from "./ui/toast";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { createProjectFromPath } from "../lib/createProject";
import { SearchModal } from "./search/SearchModal";
import { useSearchModalStore } from "../searchModalStore";
import { useFilesPanelStore } from "../filesPanelStore";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import { BirdLogomark } from "./BirdLogo";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { Popover, PopoverTrigger, PopoverPopup } from "./ui/popover";
import { Checkbox } from "./ui/checkbox";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuAction,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useThreadSelectionStore } from "../threadSelectionStore";
import {
  getVisibleSidebarThreadIds,
  getVisibleThreadsForProject,
  resolveAdjacentThreadId,
  isContextMenuPointerDown,
  resolveProjectStatusIndicator,
  resolveSidebarNewThreadSeedContext,
  resolveSidebarNewThreadEnvMode,
  resolveThreadRowClassName,
  resolveThreadStatusPill,
  orderItemsByPreferredIds,
  shouldClearThreadSelectionOnMouseDown,
  sortProjectsForSidebar,
  sortThreadsForSidebar,
  useThreadJumpHintVisibility,
} from "./Sidebar.logic";
import { SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { useServerKeybindings } from "../rpc/serverState";
import { useSidebarThreadSummaryById } from "../storeSelectors";
import type { Project } from "../types";
import { openInPreferredEditor } from "~/editorPreferences";
const THREAD_PREVIEW_LIMIT = 6;
const SIDEBAR_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SIDEBAR_THREAD_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};
const SIDEBAR_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;

// --- Organize/filter types and helpers ---

type SidebarOrganizeMode = "by_project" | "chronological" | "by_provider" | "by_date";
type SidebarDateBucket = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "older";

interface SidebarFilterState {
  projectIds: Set<ProjectId> | null;
  providerKinds: Set<ProviderKind> | null;
  dateBuckets: Set<SidebarDateBucket> | null;
  activityBuckets: Set<"has_activity" | "no_activity"> | null;
}

/** Bucket a thread's most-recent activity date into a named time range using calendar-day boundaries */
function resolveThreadDateBucket(thread: {
  latestUserMessageAt: string | null;
  createdAt: string;
}): SidebarDateBucket {
  const ts = thread.latestUserMessageAt ?? thread.createdAt;
  const date = ts ? new Date(ts) : new Date(0);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const thisWeekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86_400_000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86_400_000);
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (date >= todayStart) return "today";
  if (date >= yesterdayStart) return "yesterday";
  if (date >= thisWeekStart) return "this_week";
  if (date >= lastWeekStart) return "last_week";
  if (date >= thisMonthStart) return "this_month";
  return "older";
}

const DATE_BUCKET_LABELS: Record<SidebarDateBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  older: "Older",
};
const DATE_BUCKET_ORDER: SidebarDateBucket[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "older",
];

type SidebarProjectSnapshot = Project & {
  expanded: boolean;
};
interface TerminalStatusIndicator {
  label: "Terminal process running";
  colorClass: string;
  pulse: boolean;
}

interface PrStatusIndicator {
  label: "PR open" | "PR closed" | "PR merged";
  colorClass: string;
  tooltip: string;
  url: string;
}

type ThreadPr = GitStatusResult["pr"];

function ThreadStatusLabel({
  status,
  compact = false,
}: {
  status: NonNullable<ReturnType<typeof resolveThreadStatusPill>>;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span
        title={status.label}
        className={`inline-flex size-3.5 shrink-0 items-center justify-center ${status.colorClass}`}
      >
        <span
          className={`size-[9px] rounded-full ${status.dotClass} ${
            status.pulse ? "animate-pulse" : ""
          }`}
        />
        <span className="sr-only">{status.label}</span>
      </span>
    );
  }

  return (
    <span
      title={status.label}
      className={`inline-flex items-center gap-1 text-[10px] ${status.colorClass}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status.dotClass} ${
          status.pulse ? "animate-pulse" : ""
        }`}
      />
      <span className="hidden md:inline">{status.label}</span>
    </span>
  );
}

function ThreadUnreadCompletionDot() {
  return (
    <span
      aria-hidden="true"
      title="Unread completion"
      className="inline-flex w-3.5 shrink-0 items-center justify-center"
    >
      <span className="size-2 rounded-full bg-sky-500 dark:bg-sky-300/90" />
    </span>
  );
}

function ThreadWorkingSpinner() {
  // User-facing change: switched from blue (sky-500) to a muted gray so the
  // "Working" state reads as a neutral, low-chrome indicator. When this
  // spinner is shown we also suppress the redundant "Working" text + blue dot
  // below, keeping a single, gray spinner as the sole activity hint (matches
  // the visual language of native Claude / Codex apps).
  return (
    <span
      aria-hidden="true"
      title="Working"
      className="inline-flex w-3.5 shrink-0 items-center justify-center"
    >
      <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground/80" />
    </span>
  );
}

function terminalStatusFromRunningIds(
  runningTerminalIds: string[],
): TerminalStatusIndicator | null {
  if (runningTerminalIds.length === 0) {
    return null;
  }
  return {
    label: "Terminal process running",
    colorClass: "text-teal-600 dark:text-teal-300/90",
    pulse: true,
  };
}

function prStatusIndicator(pr: ThreadPr): PrStatusIndicator | null {
  if (!pr) return null;

  if (pr.state === "open") {
    return {
      label: "PR open",
      colorClass: "text-emerald-600 dark:text-emerald-300/90",
      tooltip: `#${pr.number} PR open: ${pr.title}`,
      url: pr.url,
    };
  }
  if (pr.state === "closed") {
    return {
      label: "PR closed",
      colorClass: "text-zinc-500 dark:text-zinc-400/80",
      tooltip: `#${pr.number} PR closed: ${pr.title}`,
      url: pr.url,
    };
  }
  if (pr.state === "merged") {
    return {
      label: "PR merged",
      colorClass: "text-violet-600 dark:text-violet-300/90",
      tooltip: `#${pr.number} PR merged: ${pr.title}`,
      url: pr.url,
    };
  }
  return null;
}

function renderOverflowButton(label: string) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
    >
      <EllipsisIcon className="size-3.5" />
    </button>
  );
}

interface SidebarThreadRowProps {
  threadId: ThreadId;
  orderedProjectThreadIds: readonly ThreadId[];
  routeThreadId: ThreadId | null;
  selectedThreadIds: ReadonlySet<ThreadId>;
  showThreadJumpHints: boolean;
  jumpLabel: string | null;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadId: ThreadId | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  renamingInputRef: MutableRefObject<HTMLInputElement | null>;
  renamingCommittedRef: MutableRefObject<boolean>;
  confirmingArchiveThreadId: ThreadId | null;
  setConfirmingArchiveThreadId: Dispatch<SetStateAction<ThreadId | null>>;
  confirmArchiveButtonRefs: MutableRefObject<Map<ThreadId, HTMLButtonElement>>;
  handleThreadClick: (
    event: MouseEvent,
    threadId: ThreadId,
    orderedProjectThreadIds: readonly ThreadId[],
  ) => void;
  navigateToThread: (threadId: ThreadId) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadId: ThreadId,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (threadId: ThreadId, newTitle: string, originalTitle: string) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadId: ThreadId) => Promise<void>;
  openPrLink: (event: MouseEvent<HTMLElement>, prUrl: string) => void;
  pr: ThreadPr | null;
}

function SidebarThreadRow(props: SidebarThreadRowProps) {
  const thread = useSidebarThreadSummaryById(props.threadId);
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[props.threadId]);
  const runningTerminalIds = useTerminalStateStore(
    (state) =>
      selectThreadTerminalState(state.terminalStateByThreadId, props.threadId).runningTerminalIds,
  );
  // Reactively track whether this thread is currently open in a popout window
  // so we can show an indicator and focus the popout on click.
  const isPopped = usePopoutWindowStore((state) => state.poppedThreadIds.has(props.threadId));

  if (!thread) {
    return null;
  }

  const isActive = props.routeThreadId === thread.id;
  const isSelected = props.selectedThreadIds.has(thread.id);
  const isHighlighted = isActive || isSelected;
  const isThreadRunning =
    thread.session?.status === "running" && thread.session.activeTurnId != null;
  const threadStatus = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const prStatus = prStatusIndicator(props.pr);
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const isConfirmingArchive = props.confirmingArchiveThreadId === thread.id && !isThreadRunning;
  const threadMetaClassName = isConfirmingArchive
    ? "pointer-events-none opacity-0"
    : !isThreadRunning
      ? "pointer-events-none transition-opacity duration-150 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0"
      : "pointer-events-none";

  return (
    <SidebarMenuSubItem
      className="w-full"
      data-thread-item
      onMouseLeave={() => {
        props.setConfirmingArchiveThreadId((current) => (current === thread.id ? null : current));
      }}
      onBlurCapture={(event) => {
        const currentTarget = event.currentTarget;
        requestAnimationFrame(() => {
          if (currentTarget.contains(document.activeElement)) {
            return;
          }
          props.setConfirmingArchiveThreadId((current) => (current === thread.id ? null : current));
        });
      }}
    >
      <SidebarMenuSubButton
        render={<div role="button" tabIndex={0} />}
        size="sm"
        isActive={isActive}
        data-testid={`thread-row-${thread.id}`}
        className={`${resolveThreadRowClassName({
          isActive,
          isSelected,
        })} relative isolate`}
        onClick={(event) => {
          props.handleThreadClick(event, thread.id, props.orderedProjectThreadIds);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          props.navigateToThread(thread.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (props.selectedThreadIds.size > 0 && props.selectedThreadIds.has(thread.id)) {
            void props.handleMultiSelectContextMenu({
              x: event.clientX,
              y: event.clientY,
            });
          } else {
            if (props.selectedThreadIds.size > 0) {
              props.clearSelection();
            }
            void props.handleThreadContextMenu(thread.id, {
              x: event.clientX,
              y: event.clientY,
            });
          }
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 text-left">
          {prStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={prStatus.tooltip}
                    className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                    onClick={(event) => {
                      props.openPrLink(event, prStatus.url);
                    }}
                  >
                    <GitPullRequestIcon className="size-3" />
                  </button>
                }
              />
              <TooltipPopup side="top">{prStatus.tooltip}</TooltipPopup>
            </Tooltip>
          )}
          {threadStatus?.label === "Completed" ? (
            <ThreadUnreadCompletionDot />
          ) : threadStatus?.label === "Working" ? (
            <ThreadWorkingSpinner />
          ) : (
            <span
              className="inline-flex w-3.5 shrink-0 items-center justify-center"
              aria-hidden="true"
            />
          )}
          {threadStatus &&
            threadStatus.label !== "Completed" &&
            // The "Working" state is already communicated by the gray
            // ThreadWorkingSpinner above; rendering the text label + blue dot
            // here as well was redundant ("Working" shown twice, blue dot + spinner).
            threadStatus.label !== "Working" && <ThreadStatusLabel status={threadStatus} />}
          {props.renamingThreadId === thread.id ? (
            <input
              ref={(element) => {
                if (element && props.renamingInputRef.current !== element) {
                  props.renamingInputRef.current = element;
                  element.focus();
                  element.select();
                }
              }}
              className="min-w-0 flex-1 truncate text-xs bg-transparent outline-none border border-ring rounded px-0.5"
              value={props.renamingTitle}
              onChange={(event) => props.setRenamingTitle(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.renamingCommittedRef.current = true;
                  void props.commitRename(thread.id, props.renamingTitle, thread.title);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  props.renamingCommittedRef.current = true;
                  props.cancelRename();
                }
              }}
              onBlur={() => {
                if (!props.renamingCommittedRef.current) {
                  void props.commitRename(thread.id, props.renamingTitle, thread.title);
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs">{thread.title}</span>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* Popout indicator: shown when the thread is open in a separate window */}
          {isPopped && (
            <span
              role="img"
              aria-label="Open in popout window"
              title="Open in popout window"
              className="inline-flex items-center justify-center text-muted-foreground/50"
            >
              <ExternalLinkIcon className="size-3" />
            </span>
          )}
          {terminalStatus && (
            <span
              role="img"
              aria-label={terminalStatus.label}
              title={terminalStatus.label}
              className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
            >
              <TerminalIcon className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`} />
            </span>
          )}
          <div className="flex min-w-12 justify-end">
            {!isThreadRunning ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <SidebarMenuAction
                      render={renderOverflowButton(`Thread actions for ${thread.title}`)}
                      showOnHover
                      className="top-1 right-1 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void props.handleThreadContextMenu(thread.id, {
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                    />
                  }
                />
                <TooltipPopup side="top">Thread actions</TooltipPopup>
              </Tooltip>
            ) : null}
            <span className={threadMetaClassName}>
              {props.showThreadJumpHints && props.jumpLabel ? (
                <span
                  className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
                  title={props.jumpLabel}
                >
                  {props.jumpLabel}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 text-[10px]">
                  {thread.latestTurnDiffStat &&
                  (thread.latestTurnDiffStat.additions > 0 ||
                    thread.latestTurnDiffStat.deletions > 0) ? (
                    <span
                      className="inline-flex items-center gap-0.5 tabular-nums"
                      title={`+${thread.latestTurnDiffStat.additions} / -${thread.latestTurnDiffStat.deletions}`}
                    >
                      <DiffStatLabel
                        additions={thread.latestTurnDiffStat.additions}
                        deletions={thread.latestTurnDiffStat.deletions}
                      />
                    </span>
                  ) : null}
                  <span
                    className={`${
                      isHighlighted
                        ? "text-foreground/72 dark:text-foreground/82"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {formatRelativeTimeLabel(thread.updatedAt ?? thread.createdAt)}
                  </span>
                </div>
              )}
            </span>
          </div>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

// BirdLogomark is now imported from ./BirdLogo — see that file for the SVG source.

type SortableProjectHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  onProjectSortOrderChange,
  onThreadSortOrderChange,
}: {
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
  onThreadSortOrderChange: (sortOrder: SidebarThreadSortOrder) => void;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
          }
        >
          <ArrowUpDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sort projects</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom" className="min-w-44">
        <MenuGroup>
          <div className="px-2 py-1 sm:text-xs font-medium text-muted-foreground">
            Sort projects
          </div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => {
              onProjectSortOrderChange(value as SidebarProjectSortOrder);
            }}
          >
            {(Object.entries(SIDEBAR_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 sm:text-xs font-medium text-muted-foreground">
            Sort threads
          </div>
          <MenuRadioGroup
            value={threadSortOrder}
            onValueChange={(value) => {
              onThreadSortOrderChange(value as SidebarThreadSortOrder);
            }}
          >
            {(
              Object.entries(SIDEBAR_THREAD_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortableProjectItem({
  projectId,
  disabled = false,
  children,
}: {
  projectId: ProjectId;
  disabled?: boolean;
  children: (handleProps: SortableProjectHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: projectId, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative rounded-md ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

// --- FlatThreadRowList: renders a flat list of thread rows (used in non-by_project modes) ---

interface FlatThreadRowListProps {
  threadIds: ThreadId[];
  projects: readonly { id: ProjectId; name: string }[];
  showProjectTooltip: boolean;
  prByThreadId: Map<ThreadId, ThreadPr>;
  sidebarThreadsById: Record<string, { projectId: ProjectId } | undefined>;
  orderedProjectThreadIds: ThreadId[];
  routeThreadId: ThreadId | null;
  selectedThreadIds: ReadonlySet<ThreadId>;
  showThreadJumpHints: boolean;
  threadJumpLabelById: Map<ThreadId, string>;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadId: ThreadId | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  renamingInputRef: MutableRefObject<HTMLInputElement | null>;
  renamingCommittedRef: MutableRefObject<boolean>;
  confirmingArchiveThreadId: ThreadId | null;
  setConfirmingArchiveThreadId: Dispatch<SetStateAction<ThreadId | null>>;
  confirmArchiveButtonRefs: MutableRefObject<Map<ThreadId, HTMLButtonElement>>;
  handleThreadClick: (
    event: MouseEvent,
    threadId: ThreadId,
    orderedProjectThreadIds: readonly ThreadId[],
  ) => void;
  navigateToThread: (threadId: ThreadId) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadId: ThreadId,
    position: { x: number; y: number },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (threadId: ThreadId, newTitle: string, originalTitle: string) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadId: ThreadId) => Promise<void>;
  openPrLink: (event: MouseEvent<HTMLElement>, prUrl: string) => void;
}

function FlatThreadRowList({
  threadIds,
  projects,
  showProjectTooltip,
  prByThreadId,
  sidebarThreadsById,
  ...rowProps
}: FlatThreadRowListProps) {
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
  return (
    <SidebarMenuSub className="mx-1 my-0 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0">
      {threadIds.map((threadId) => {
        const thread = sidebarThreadsById[threadId];
        const projectName = thread ? (projectNameById.get(thread.projectId) ?? null) : null;
        const row = (
          <SidebarThreadRow
            key={threadId}
            threadId={threadId}
            orderedProjectThreadIds={rowProps.orderedProjectThreadIds}
            routeThreadId={rowProps.routeThreadId}
            selectedThreadIds={rowProps.selectedThreadIds}
            showThreadJumpHints={rowProps.showThreadJumpHints}
            jumpLabel={rowProps.threadJumpLabelById.get(threadId) ?? null}
            appSettingsConfirmThreadArchive={rowProps.appSettingsConfirmThreadArchive}
            renamingThreadId={rowProps.renamingThreadId}
            renamingTitle={rowProps.renamingTitle}
            setRenamingTitle={rowProps.setRenamingTitle}
            renamingInputRef={rowProps.renamingInputRef}
            renamingCommittedRef={rowProps.renamingCommittedRef}
            confirmingArchiveThreadId={rowProps.confirmingArchiveThreadId}
            setConfirmingArchiveThreadId={rowProps.setConfirmingArchiveThreadId}
            confirmArchiveButtonRefs={rowProps.confirmArchiveButtonRefs}
            handleThreadClick={rowProps.handleThreadClick}
            navigateToThread={rowProps.navigateToThread}
            handleMultiSelectContextMenu={rowProps.handleMultiSelectContextMenu}
            handleThreadContextMenu={rowProps.handleThreadContextMenu}
            clearSelection={rowProps.clearSelection}
            commitRename={rowProps.commitRename}
            cancelRename={rowProps.cancelRename}
            attemptArchiveThread={rowProps.attemptArchiveThread}
            openPrLink={rowProps.openPrLink}
            pr={prByThreadId.get(threadId) ?? null}
          />
        );

        if (showProjectTooltip && projectName) {
          return (
            <Tooltip key={threadId}>
              <TooltipTrigger render={<span />}>{row}</TooltipTrigger>
              <TooltipPopup side="right">{projectName}</TooltipPopup>
            </Tooltip>
          );
        }
        return row;
      })}
    </SidebarMenuSub>
  );
}

// --- SidebarOrganizedView: renders grouped/flat view for non-by_project organize modes ---

interface SidebarOrganizedViewProps extends Omit<
  FlatThreadRowListProps,
  "threadIds" | "orderedProjectThreadIds"
> {
  organizeMode: SidebarOrganizeMode;
  visibleThreads: Array<{
    id: ThreadId;
    projectId: ProjectId;
    latestUserMessageAt: string | null;
    createdAt: string;
    latestTurn: unknown | null;
    session?: { provider?: ProviderKind | null } | null;
  }>;
  expandedGroups: ReadonlySet<string>;
  onExpandGroup: (groupKey: string) => void;
  onCollapseGroup: (groupKey: string) => void;
}

function SidebarOrganizedView({
  organizeMode,
  visibleThreads,
  expandedGroups,
  onExpandGroup,
  onCollapseGroup,
  ...rowProps
}: SidebarOrganizedViewProps) {
  const GROUP_PREVIEW_LIMIT = 10;

  if (organizeMode === "chronological") {
    // Flat list sorted by latest activity desc
    const sorted = visibleThreads.toSorted((a, b) => {
      const aTs = a.latestUserMessageAt ?? a.createdAt;
      const bTs = b.latestUserMessageAt ?? b.createdAt;
      return new Date(bTs).getTime() - new Date(aTs).getTime();
    });
    return (
      <FlatThreadRowList
        threadIds={sorted.map((t) => t.id)}
        orderedProjectThreadIds={sorted.map((t) => t.id)}
        {...rowProps}
      />
    );
  }

  // Build groups for by_provider and by_date modes
  type Group = { key: string; label: string; threads: typeof visibleThreads };
  const groups: Group[] = [];

  if (organizeMode === "by_provider") {
    const byProvider = new Map<string, typeof visibleThreads>();
    for (const thread of visibleThreads) {
      const provider = thread.session?.provider ?? null;
      const key = provider ?? "__no_provider__";
      const existing = byProvider.get(key);
      if (existing) {
        existing.push(thread);
      } else {
        byProvider.set(key, [thread]);
      }
    }
    for (const [key, threads] of byProvider) {
      const provider = key === "__no_provider__" ? null : key;
      const label =
        provider && provider in PROVIDER_DISPLAY_NAMES
          ? PROVIDER_DISPLAY_NAMES[provider as ProviderKind]
          : "No provider";
      groups.push({ key, label, threads });
    }
  } else if (organizeMode === "by_date") {
    const byBucket = new Map<SidebarDateBucket, typeof visibleThreads>();
    for (const thread of visibleThreads) {
      const bucket = resolveThreadDateBucket(thread);
      const existing = byBucket.get(bucket);
      if (existing) {
        existing.push(thread);
      } else {
        byBucket.set(bucket, [thread]);
      }
    }
    for (const bucket of DATE_BUCKET_ORDER) {
      const threads = byBucket.get(bucket);
      if (!threads || threads.length === 0) continue;
      groups.push({ key: bucket, label: DATE_BUCKET_LABELS[bucket], threads });
    }
  }
  const sortedGroups = groups.toSorted((a, b) => a.label.localeCompare(b.label));

  return (
    <>
      {sortedGroups.map(({ key, label, threads }) => {
        const isExpanded = expandedGroups.has(key);
        const visibleCount = isExpanded
          ? threads.length
          : Math.min(threads.length, GROUP_PREVIEW_LIMIT);
        const shownThreads = threads.slice(0, visibleCount);
        const hiddenCount = threads.length - visibleCount;
        return (
          <div key={key} className="mb-1">
            <div className="px-4 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {label}
            </div>
            <FlatThreadRowList
              threadIds={shownThreads.map((t) => t.id)}
              orderedProjectThreadIds={threads.map((t) => t.id)}
              {...rowProps}
            />
            {hiddenCount > 0 && !isExpanded && (
              <button
                type="button"
                className="mt-0.5 w-full px-4 py-1 text-left text-[10px] text-muted-foreground/60 hover:text-muted-foreground/80"
                onClick={() => onExpandGroup(key)}
              >
                View more ({hiddenCount} more)
              </button>
            )}
            {isExpanded && threads.length > GROUP_PREVIEW_LIMIT && (
              <button
                type="button"
                className="mt-0.5 w-full px-4 py-1 text-left text-[10px] text-muted-foreground/60 hover:text-muted-foreground/80"
                onClick={() => onCollapseGroup(key)}
              >
                Show less
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// --- SidebarFilterButton: organize-mode radio + filter checkboxes in a Popover ---

interface SidebarFilterButtonProps {
  projects: readonly { id: ProjectId; name: string }[];
  visibleThreads: Array<{ session?: { provider?: ProviderKind | null } | null }>;
  organizeMode: SidebarOrganizeMode;
  filterState: SidebarFilterState;
  isFilterActive: boolean;
  onOrganizeModeChange: (mode: SidebarOrganizeMode) => void;
  onFilterChange: (state: SidebarFilterState) => void;
  onReset: () => void;
}

function SidebarFilterButton({
  projects,
  visibleThreads,
  organizeMode,
  filterState,
  isFilterActive,
  onOrganizeModeChange,
  onFilterChange,
  onReset,
}: SidebarFilterButtonProps) {
  // Collect providers seen in visible threads
  const seenProviders = useMemo(() => {
    const providers = new Set<ProviderKind>();
    for (const thread of visibleThreads) {
      const provider = thread.session?.provider;
      if (provider) providers.add(provider);
    }
    return providers;
  }, [visibleThreads]);

  const hasActiveFilters =
    filterState.projectIds !== null ||
    filterState.providerKinds !== null ||
    filterState.dateBuckets !== null ||
    filterState.activityBuckets !== null ||
    organizeMode !== "by_project";

  const ORGANIZE_OPTIONS: { value: SidebarOrganizeMode; label: string }[] = [
    { value: "by_project", label: "By Project" },
    { value: "chronological", label: "Chronological" },
    { value: "by_provider", label: "By Provider" },
    { value: "by_date", label: "By Date" },
  ];

  function toggleProjectFilter(projectId: ProjectId) {
    const current = filterState.projectIds ? new Set(filterState.projectIds) : new Set<ProjectId>();
    if (current.has(projectId)) {
      current.delete(projectId);
    } else {
      current.add(projectId);
    }
    onFilterChange({ ...filterState, projectIds: current.size > 0 ? current : null });
  }

  function toggleProviderFilter(provider: ProviderKind) {
    const current = filterState.providerKinds
      ? new Set(filterState.providerKinds)
      : new Set<ProviderKind>();
    if (current.has(provider)) {
      current.delete(provider);
    } else {
      current.add(provider);
    }
    onFilterChange({ ...filterState, providerKinds: current.size > 0 ? current : null });
  }

  function toggleDateBucketFilter(bucket: SidebarDateBucket) {
    const current = filterState.dateBuckets
      ? new Set(filterState.dateBuckets)
      : new Set<SidebarDateBucket>();
    if (current.has(bucket)) {
      current.delete(bucket);
    } else {
      current.add(bucket);
    }
    onFilterChange({ ...filterState, dateBuckets: current.size > 0 ? current : null });
  }

  function toggleActivityFilter(value: "has_activity" | "no_activity") {
    const current = filterState.activityBuckets
      ? new Set(filterState.activityBuckets)
      : new Set<"has_activity" | "no_activity">();
    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }
    onFilterChange({ ...filterState, activityBuckets: current.size > 0 ? current : null });
  }

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger className="relative inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
              <SlidersHorizontalIcon className="size-3.5" />
              {/* Active filter badge — shown when any filter or non-default organize mode is active */}
              {isFilterActive && (
                <span className="absolute top-0 right-0 size-1.5 rounded-full bg-primary" />
              )}
            </PopoverTrigger>
          }
        />
        <TooltipPopup side="right">Filter &amp; organize</TooltipPopup>
      </Tooltip>
      <PopoverPopup align="end" side="bottom" className="min-w-56 max-h-96">
        {/* Section A: Organize by */}
        <div className="px-2 pb-1 pt-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Organize by
        </div>
        <div className="flex flex-col gap-0.5 pb-2">
          {ORGANIZE_OPTIONS.map((option) => {
            const isSelected = organizeMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                onClick={() => onOrganizeModeChange(option.value)}
              >
                {/* Radio dot indicator: filled when selected, empty ring when not */}
                <span
                  className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected ? "border-primary bg-primary" : "border-muted-foreground/40"
                  }`}
                >
                  {isSelected && <span className="size-1.5 rounded-full bg-white" />}
                </span>
                <span
                  className={isSelected ? "font-medium text-foreground" : "text-muted-foreground"}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Section B: Filters */}
        <div className="border-t pt-2">
          {projects.length > 0 && (
            <>
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Projects
              </div>
              <div className="flex flex-col gap-0.5 pb-2">
                {projects.map((project) => {
                  const checked = filterState.projectIds?.has(project.id) ?? false;
                  return (
                    <label
                      key={project.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleProjectFilter(project.id)}
                      />
                      <span className="truncate text-muted-foreground">{project.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {seenProviders.size > 0 && (
            <>
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Providers
              </div>
              <div className="flex flex-col gap-0.5 pb-2">
                {[...seenProviders].map((provider) => {
                  const checked = filterState.providerKinds?.has(provider) ?? false;
                  return (
                    <label
                      key={provider}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleProviderFilter(provider)}
                      />
                      <span className="text-muted-foreground">
                        {PROVIDER_DISPLAY_NAMES[provider] ?? provider}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Date
          </div>
          <div className="flex flex-col gap-0.5 pb-2">
            {DATE_BUCKET_ORDER.map((bucket) => {
              const checked = filterState.dateBuckets?.has(bucket) ?? false;
              return (
                <label
                  key={bucket}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleDateBucketFilter(bucket)}
                  />
                  <span className="text-muted-foreground">{DATE_BUCKET_LABELS[bucket]}</span>
                </label>
              );
            })}
          </div>

          <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Messages{" "}
            <span className="normal-case tracking-normal text-muted-foreground/50">
              — check to show only
            </span>
          </div>
          <div className="flex flex-col gap-0.5 pb-2">
            {(
              [
                {
                  value: "has_activity" as const,
                  label: "Has messages",
                  hint: "At least one AI response",
                },
                {
                  value: "no_activity" as const,
                  label: "Empty threads",
                  hint: "No AI responses yet",
                },
              ] as const
            ).map(({ value, label, hint }) => {
              const checked = filterState.activityBuckets?.has(value) ?? false;
              return (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent"
                >
                  <Checkbox
                    className="mt-px"
                    checked={checked}
                    onCheckedChange={() => toggleActivityFilter(value)}
                  />
                  <span className="flex flex-col">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{hint}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {/* Reset button — only shown when filters/organize-mode are non-default */}
          {hasActiveFilters && (
            <div className="border-t pt-2">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                onClick={onReset}
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export default function Sidebar() {
  // Read raw projects array from store (stable reference) then filter in useMemo.
  // IMPORTANT: .filter() inside a Zustand selector creates a new array on every call,
  // which breaks useSyncExternalStore's Object.is check and causes an infinite re-render loop.
  const allProjects = useStore((store) => store.projects);
  const projects = useMemo(
    () => allProjects.filter((project) => project.deletedAt === null),
    [allProjects],
  );
  // bootstrapComplete flips to true once the server read model has been synced for the first time.
  // We use this to distinguish "still loading" from "genuinely no projects".
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const sidebarThreadsById = useStore((store) => store.sidebarThreadsById);
  const threadIdsByProjectId = useStore((store) => store.threadIdsByProjectId);
  const { projectExpandedById, projectOrder, threadLastVisitedAtById } = useUiStateStore(
    useShallow((store) => ({
      projectExpandedById: store.projectExpandedById,
      projectOrder: store.projectOrder,
      threadLastVisitedAtById: store.threadLastVisitedAtById,
    })),
  );
  const markThreadUnread = useUiStateStore((store) => store.markThreadUnread);
  const toggleProject = useUiStateStore((store) => store.toggleProject);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
  const pinnedToSidebarThreadIds = useUiStateStore((s) => s.pinnedToSidebarThreadIds);
  const pinnedToProjectThreadIds = useUiStateStore((s) => s.pinnedToProjectThreadIds);
  const pinToSidebar = useUiStateStore((s) => s.pinToSidebar);
  const unpinFromSidebar = useUiStateStore((s) => s.unpinFromSidebar);
  const pinToProject = useUiStateStore((s) => s.pinToProject);
  const unpinFromProject = useUiStateStore((s) => s.unpinFromProject);
  const setProjectOrder = useUiStateStore((s) => s.setProjectOrder);
  const clearComposerDraftForThread = useComposerDraftStore((store) => store.clearDraftThread);
  const getDraftThreadByProjectId = useComposerDraftStore(
    (store) => store.getDraftThreadByProjectId,
  );
  const terminalStateByThreadId = useTerminalStateStore((state) => state.terminalStateByThreadId);
  const clearProjectDraftThreadId = useComposerDraftStore(
    (store) => store.clearProjectDraftThreadId,
  );
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isOnSettings = pathname.startsWith("/settings");
  const appSettings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const { activeDraftThread, activeThread, defaultProjectId, handleNewThread } =
    useHandleNewThread();
  const { archiveThread, deleteThread } = useThreadActions();
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const keybindings = useServerKeybindings();
  const [addingProject, setAddingProject] = useState(false);
  const [newCwd, setNewCwd] = useState("");
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [addProjectError, setAddProjectError] = useState<string | null>(null);
  const addProjectInputRef = useRef<HTMLInputElement | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<ProjectId | null>(null);
  const [renamingProjectTitle, setRenamingProjectTitle] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<ThreadId | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadId, setConfirmingArchiveThreadId] = useState<ThreadId | null>(null);
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<ProjectId>
  >(() => new Set());
  // Organize mode and filter state for non-by_project views
  const [organizeMode, setOrganizeMode] = useState<SidebarOrganizeMode>("by_project");
  const [filterState, setFilterState] = useState<SidebarFilterState>({
    projectIds: null,
    providerKinds: null,
    dateBuckets: null,
    activityBuckets: null,
  });
  const [expandedOrganizeGroups, setExpandedOrganizeGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const renamingProjectCommittedRef = useRef(false);
  const renamingProjectInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<ThreadId, HTMLButtonElement>());
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const suppressProjectClickForContextMenuRef = useRef(false);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  // Search modal open state — shared via global store so SidebarCollapsedControls can also open it
  const searchOpen = useSearchModalStore((s) => s.open);
  const setSearchOpen = useSearchModalStore((s) => s.setOpen);
  // Sidebar collapse state — toggled by button and Cmd+B shortcut
  const { toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const selectedThreadIds = useThreadSelectionStore((s) => s.selectedThreadIds);
  const toggleThreadSelection = useThreadSelectionStore((s) => s.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((s) => s.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const removeFromSelection = useThreadSelectionStore((s) => s.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);

  // UI-rendered context menu state — replaces native api.contextMenu.show() to support icons
  type ContextMenuItemSpec = {
    id: string;
    label: string;
    icon?: ReactNode;
    destructive?: boolean;
    separator?: boolean;
  };
  type ActiveContextMenu = {
    items: ContextMenuItemSpec[];
    position: { x: number; y: number };
    resolve: (id: string | null) => void;
  } | null;
  const [activeContextMenu, setActiveContextMenu] = useState<ActiveContextMenu>(null);
  const showContextMenu = useCallback(
    (items: ContextMenuItemSpec[], position: { x: number; y: number }): Promise<string | null> =>
      new Promise((resolve) => setActiveContextMenu({ items, position, resolve })),
    [],
  );
  const contextMenuAnchor = useMemo(() => {
    if (!activeContextMenu) return undefined;
    const { x, y } = activeContextMenu.position;
    return {
      getBoundingClientRect: (): DOMRect =>
        ({
          x,
          y,
          width: 0,
          height: 0,
          top: y,
          right: x,
          bottom: y,
          left: x,
          toJSON() {
            return {};
          },
        }) as DOMRect,
    };
  }, [activeContextMenu]);
  const isLinuxDesktop = isElectron && isLinuxPlatform(navigator.platform);
  const platform = navigator.platform;
  // On mobile webview there is no native folder picker — use the path text input instead.
  const shouldBrowseForProjectImmediately = isElectron && !isLinuxDesktop && !isMobileWebView;
  const shouldShowProjectPathEntry = addingProject && !shouldBrowseForProjectImmediately;
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: (project) => project.id,
    });
  }, [projectOrder, projects]);
  const sidebarProjects = useMemo<SidebarProjectSnapshot[]>(
    () =>
      orderedProjects.map((project) => ({
        ...project,
        expanded: projectExpandedById[project.id] ?? true,
      })),
    [orderedProjects, projectExpandedById],
  );
  const sidebarThreads = useMemo(() => Object.values(sidebarThreadsById), [sidebarThreadsById]);
  const projectCwdById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.cwd] as const)),
    [projects],
  );
  const routeTerminalOpen = routeThreadId
    ? selectThreadTerminalState(terminalStateByThreadId, routeThreadId).terminalOpen
    : false;
  const sidebarShortcutLabelOptions = useMemo(
    () => ({
      platform,
      context: {
        terminalFocus: false,
        terminalOpen: routeTerminalOpen,
      },
    }),
    [platform, routeTerminalOpen],
  );
  const threadGitTargets = useMemo(
    () =>
      sidebarThreads.map((thread) => ({
        threadId: thread.id,
        branch: thread.branch,
        cwd: thread.worktreePath ?? projectCwdById.get(thread.projectId) ?? null,
      })),
    [projectCwdById, sidebarThreads],
  );
  const threadGitStatusCwds = useMemo(
    () => [
      ...new Set(
        threadGitTargets
          .filter((target) => target.branch !== null)
          .map((target) => target.cwd)
          .filter((cwd): cwd is string => cwd !== null),
      ),
    ],
    [threadGitTargets],
  );
  const threadGitStatusQueries = useQueries({
    queries: threadGitStatusCwds.map((cwd) => ({
      ...gitStatusQueryOptions(cwd),
      staleTime: 30_000,
      refetchInterval: 60_000,
    })),
  });
  const prByThreadId = useMemo(() => {
    const statusByCwd = new Map<string, GitStatusResult>();
    for (let index = 0; index < threadGitStatusCwds.length; index += 1) {
      const cwd = threadGitStatusCwds[index];
      if (!cwd) continue;
      const status = threadGitStatusQueries[index]?.data;
      if (status) {
        statusByCwd.set(cwd, status);
      }
    }

    const map = new Map<ThreadId, ThreadPr>();
    for (const target of threadGitTargets) {
      const status = target.cwd ? statusByCwd.get(target.cwd) : undefined;
      const branchMatches =
        target.branch !== null && status?.branch !== null && status?.branch === target.branch;
      map.set(target.threadId, branchMatches ? (status?.pr ?? null) : null);
    }
    return map;
  }, [threadGitStatusCwds, threadGitStatusQueries, threadGitTargets]);

  const openPrLink = useCallback((event: MouseEvent<HTMLElement>, prUrl: string) => {
    event.preventDefault();
    event.stopPropagation();

    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Link opening is unavailable.",
      });
      return;
    }

    void api.shell.openExternal(prUrl).catch((error) => {
      toastManager.add({
        type: "error",
        title: "Unable to open PR link",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    });
  }, []);

  const attemptArchiveThread = useCallback(
    async (threadId: ThreadId) => {
      try {
        await archiveThread(threadId);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to archive thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [archiveThread],
  );

  const focusMostRecentThreadForProject = useCallback(
    (projectId: ProjectId) => {
      const latestThread = sortThreadsForSidebar(
        (threadIdsByProjectId[projectId] ?? [])
          .map((threadId) => sidebarThreadsById[threadId])
          .filter((thread): thread is NonNullable<typeof thread> => thread !== undefined)
          .filter((thread) => thread.archivedAt === null),
        appSettings.sidebarThreadSortOrder,
      )[0];
      if (!latestThread) return;

      void navigate({
        to: "/$threadId",
        params: { threadId: latestThread.id },
      });
    },
    [appSettings.sidebarThreadSortOrder, navigate, sidebarThreadsById, threadIdsByProjectId],
  );

  const addProjectFromPath = useCallback(
    async (rawCwd: string) => {
      const cwd = rawCwd.trim();
      if (!cwd || isAddingProject) return;
      const api = readNativeApi();
      if (!api) return;

      setIsAddingProject(true);
      const finishAddingProject = () => {
        setIsAddingProject(false);
        setNewCwd("");
        setAddProjectError(null);
        setAddingProject(false);
      };

      try {
        const result = await createProjectFromPath({
          cwd,
          projects,
          defaultThreadEnvMode: appSettings.defaultThreadEnvMode,
          handleNewThread: async (projectId, options) => {
            await handleNewThread(ProjectId.makeUnsafe(projectId), options).catch(() => undefined);
          },
          dispatchProjectCreate: async (input) => {
            await api.orchestration.dispatchCommand({
              type: "project.create",
              commandId: newCommandId(),
              ...input,
              projectId: ProjectId.makeUnsafe(input.projectId),
            });
          },
        });
        if (result.kind === "existing") {
          focusMostRecentThreadForProject(ProjectId.makeUnsafe(result.projectId));
        }
      } catch (error) {
        const description =
          error instanceof Error ? error.message : "An error occurred while adding the project.";
        setIsAddingProject(false);
        if (shouldBrowseForProjectImmediately) {
          toastManager.add({
            type: "error",
            title: "Failed to add project",
            description,
          });
        } else {
          setAddProjectError(description);
        }
        return;
      }
      finishAddingProject();
    },
    [
      focusMostRecentThreadForProject,
      handleNewThread,
      isAddingProject,
      projects,
      shouldBrowseForProjectImmediately,
      appSettings.defaultThreadEnvMode,
    ],
  );

  const handleAddProject = () => {
    void addProjectFromPath(newCwd);
  };

  const canAddProject = newCwd.trim().length > 0 && !isAddingProject;

  const handlePickFolder = async () => {
    const api = readNativeApi();
    if (!api || isPickingFolder) return;
    setIsPickingFolder(true);
    let pickedPath: string | null = null;
    try {
      pickedPath = await api.dialogs.pickFolder();
    } catch {
      // Ignore picker failures and leave the current thread selection unchanged.
    }
    if (pickedPath) {
      await addProjectFromPath(pickedPath);
    } else if (!shouldBrowseForProjectImmediately) {
      addProjectInputRef.current?.focus();
    }
    setIsPickingFolder(false);
  };

  const handleStartAddProject = () => {
    setAddProjectError(null);
    if (shouldBrowseForProjectImmediately) {
      void handlePickFolder();
      return;
    }
    setAddingProject((prev) => !prev);
  };

  const cancelRename = useCallback(() => {
    setRenamingThreadId(null);
    renamingInputRef.current = null;
  }, []);

  const cancelProjectRename = useCallback(() => {
    setRenamingProjectId(null);
    renamingProjectInputRef.current = null;
    renamingProjectCommittedRef.current = false;
  }, []);

  const commitProjectRename = useCallback(
    async (projectId: ProjectId, newTitle: string, originalTitle: string) => {
      const finishRename = () => {
        setRenamingProjectId((current) => {
          if (current !== projectId) return current;
          renamingProjectInputRef.current = null;
          renamingProjectCommittedRef.current = false;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Project name cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const api = readNativeApi();
      if (!api) {
        finishRename();
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "project.meta.update",
          commandId: newCommandId(),
          projectId,
          title: trimmed,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to rename project",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
      finishRename();
    },
    [],
  );

  const commitRename = useCallback(
    async (threadId: ThreadId, newTitle: string, originalTitle: string) => {
      const finishRename = () => {
        setRenamingThreadId((current) => {
          if (current !== threadId) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const api = readNativeApi();
      if (!api) {
        finishRename();
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId,
          title: trimmed,
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to rename thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
      finishRename();
    },
    [],
  );

  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to copy thread ID",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add({
        type: "error",
        title: "Failed to copy path",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    },
  });
  const openProjectInEditor = useCallback(async (projectPath: string) => {
    const api = readNativeApi();
    if (!api) {
      return;
    }

    try {
      await openInPreferredEditor(api, projectPath);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to open project in editor",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    }
  }, []);
  const removeProject = useCallback(
    async (project: Project) => {
      const api = readNativeApi();
      if (!api) return;

      const confirmed = await api.dialogs.confirm(`Remove project "${project.name}"?`);
      if (!confirmed) return;

      try {
        const projectDraftThread = getDraftThreadByProjectId(project.id);
        if (projectDraftThread) {
          clearComposerDraftForThread(projectDraftThread.threadId);
        }
        clearProjectDraftThreadId(project.id);
        await api.orchestration.dispatchCommand({
          type: "project.delete",
          commandId: newCommandId(),
          projectId: project.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error removing project.";
        console.error("Failed to remove project", { projectId: project.id, error });
        toastManager.add({
          type: "error",
          title: `Failed to remove "${project.name}"`,
          description: message,
        });
      }
    },
    [
      clearComposerDraftForThread,
      clearProjectDraftThreadId,
      getDraftThreadByProjectId,
      threadIdsByProjectId,
    ],
  );
  const handleThreadContextMenu = useCallback(
    async (threadId: ThreadId, position: { x: number; y: number }) => {
      const thread = sidebarThreadsById[threadId];
      if (!thread) return;
      const threadWorkspacePath =
        thread.worktreePath ?? projectCwdById.get(thread.projectId) ?? null;
      const isPinnedToSidebar = pinnedToSidebarThreadIds.includes(threadId);
      const isPinnedToProject = pinnedToProjectThreadIds.includes(threadId);
      const clicked = await showContextMenu(
        [
          { id: "rename", label: "Rename thread", icon: <PencilIcon /> },
          { id: "mark-unread", label: "Mark unread", icon: <MailIcon /> },
          {
            id: isPinnedToSidebar ? "unpin-from-sidebar" : "pin-to-sidebar",
            label: isPinnedToSidebar ? "Unpin from sidebar" : "Pin to sidebar",
            icon: isPinnedToSidebar ? <PinOffIcon /> : <PinIcon />,
          },
          {
            id: isPinnedToProject ? "unpin-from-project" : "pin-to-project",
            label: isPinnedToProject ? "Unpin from project" : "Pin to project",
            icon: isPinnedToProject ? <PinOffIcon /> : <PinIcon />,
          },
          { id: "archive", label: "Archive thread", icon: <ArchiveIcon /> },
          { id: "copy-path", label: "Copy Path", icon: <CopyIcon /> },
          { id: "copy-thread-id", label: "Copy Thread ID", icon: <HashIcon /> },
          {
            id: "delete",
            label: "Delete",
            icon: <Trash2Icon />,
            destructive: true,
            separator: true,
          },
        ],
        position,
      );

      if (clicked === "rename") {
        setRenamingThreadId(threadId);
        setRenamingTitle(thread.title);
        renamingCommittedRef.current = false;
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadId, thread.latestTurn?.completedAt);
        return;
      }
      if (clicked === "pin-to-sidebar") {
        pinToSidebar(threadId);
        return;
      }
      if (clicked === "unpin-from-sidebar") {
        unpinFromSidebar(threadId);
        return;
      }
      if (clicked === "pin-to-project") {
        pinToProject(threadId);
        return;
      }
      if (clicked === "unpin-from-project") {
        unpinFromProject(threadId);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add({
            type: "error",
            title: "Path unavailable",
            description: "This thread does not have a workspace path to copy.",
          });
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(threadId, { threadId });
        return;
      }
      if (clicked === "archive") {
        await attemptArchiveThread(threadId);
        return;
      }
      if (clicked !== "delete") return;
      if (appSettings.confirmThreadDelete) {
        const confirmed = await readNativeApi()?.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) {
          return;
        }
      }
      await deleteThread(threadId);
    },
    [
      appSettings.confirmThreadDelete,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      markThreadUnread,
      pinToProject,
      pinToSidebar,
      pinnedToProjectThreadIds,
      pinnedToSidebarThreadIds,
      projectCwdById,
      showContextMenu,
      sidebarThreadsById,
      attemptArchiveThread,
      unpinFromProject,
      unpinFromSidebar,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const ids = [...selectedThreadIds];
      if (ids.length === 0) return;
      const count = ids.length;

      const clicked = await showContextMenu(
        [
          { id: "mark-unread", label: `Mark unread (${count})`, icon: <MailIcon /> },
          {
            id: "delete",
            label: `Delete (${count})`,
            icon: <Trash2Icon />,
            destructive: true,
            separator: true,
          },
        ],
        position,
      );

      if (clicked === "mark-unread") {
        for (const id of ids) {
          const thread = sidebarThreadsById[id];
          markThreadUnread(id, thread?.latestTurn?.completedAt);
        }
        clearSelection();
        return;
      }

      if (clicked !== "delete") return;

      if (appSettings.confirmThreadDelete) {
        const confirmed = await readNativeApi()?.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedIds = new Set<ThreadId>(ids);
      for (const id of ids) {
        await deleteThread(id, { deletedThreadIds: deletedIds });
      }
      removeFromSelection(ids);
    },
    [
      appSettings.confirmThreadDelete,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
      selectedThreadIds,
      showContextMenu,
      sidebarThreadsById,
    ],
  );

  const handleThreadClick = useCallback(
    (event: MouseEvent, threadId: ThreadId, orderedProjectThreadIds: readonly ThreadId[]) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadId);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadId, orderedProjectThreadIds);
        return;
      }

      // Plain click — clear selection, set anchor for future shift-clicks, and navigate
      if (selectedThreadIds.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadId);
      // Close the mobile sheet so the selected thread is immediately visible.
      if (isMobile) setOpenMobile(false);
      void navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [
      clearSelection,
      isMobile,
      navigate,
      rangeSelectTo,
      selectedThreadIds.size,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const navigateToThread = useCallback(
    (threadId: ThreadId) => {
      // If this thread is open in a popout window, focus that window instead of
      // navigating the main window. This matches the user's expectation that
      // clicking a popped-out thread brings the popout to the front.
      if (focusThreadPopout(threadId)) {
        return;
      }
      if (selectedThreadIds.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadId);
      // Close the mobile sheet so the selected thread is immediately visible.
      if (isMobile) setOpenMobile(false);
      void navigate({
        to: "/$threadId",
        params: { threadId },
      });
    },
    [clearSelection, isMobile, navigate, selectedThreadIds.size, setOpenMobile, setSelectionAnchor],
  );

  const handleProjectContextMenu = useCallback(
    async (projectId: ProjectId, position: { x: number; y: number }) => {
      const project = projects.find((entry) => entry.id === projectId);
      if (!project) return;
      const hasDesktopBridge = typeof window !== "undefined" && window.desktopBridge !== undefined;

      const clicked = await showContextMenu(
        [
          { id: "rename", label: "Rename project", icon: <PencilIcon /> },
          { id: "open-in-editor", label: "Open in editor", icon: <CodeIcon /> },
          ...(hasDesktopBridge
            ? [{ id: "open-in-finder", label: "Open in Finder", icon: <FolderOpenIcon /> }]
            : []),
          { id: "copy-path", label: "Copy Project Path", icon: <CopyIcon /> },
          {
            id: "delete",
            label: "Remove project",
            icon: <Trash2Icon />,
            destructive: true,
            separator: true,
          },
        ],
        position,
      );
      if (clicked === "rename") {
        setRenamingProjectId(projectId);
        setRenamingProjectTitle(project.name);
        renamingProjectCommittedRef.current = false;
        return;
      }
      if (clicked === "open-in-editor") {
        void openProjectInEditor(project.cwd);
        return;
      }
      if (clicked === "open-in-finder") {
        const api = readNativeApi();
        if (!api) return;
        try {
          await api.shell.openInFinder(project.cwd);
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to open project folder",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return;
      }
      if (clicked === "copy-path") {
        copyPathToClipboard(project.cwd, { path: project.cwd });
        return;
      }
      if (clicked !== "delete") return;
      await removeProject(project);
    },
    [copyPathToClipboard, openProjectInEditor, projects, removeProject, showContextMenu],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  // Track current renderedProjects in a ref so handleProjectDragEnd can snapshot
  // the displayed order without a stale closure when switching to manual sort.
  const renderedProjectsRef = useRef<typeof renderedProjects>([]);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeProject = sidebarProjects.find((project) => project.id === active.id);
      const overProject = sidebarProjects.find((project) => project.id === over.id);
      if (!activeProject || !overProject) return;

      if (appSettings.sidebarProjectSortOrder !== "manual") {
        // Auto-switch to manual: snapshot the current display order then reorder
        const snapshotIds = renderedProjectsRef.current.map((rp) => rp.project.id);
        setProjectOrder(snapshotIds);
        updateSettings({ sidebarProjectSortOrder: "manual" });
      }
      reorderProjects(activeProject.id, overProject.id);
    },
    [
      appSettings.sidebarProjectSortOrder,
      reorderProjects,
      setProjectOrder,
      sidebarProjects,
      updateSettings,
    ],
  );

  const handleProjectDragStart = useCallback((_event: DragStartEvent) => {
    // Always arm drag regardless of sort mode — we auto-switch to manual on drop
    dragInProgressRef.current = true;
    suppressProjectClickAfterDragRef.current = true;
  }, []);

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const animatedThreadListsRef = useRef(new WeakSet<HTMLElement>());
  const attachThreadListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedThreadListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedThreadListsRef.current.add(node);
  }, []);

  const handleProjectTitlePointerDownCapture = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      suppressProjectClickForContextMenuRef.current = false;
      if (
        isContextMenuPointerDown({
          button: event.button,
          ctrlKey: event.ctrlKey,
          isMac: isMacPlatform(navigator.platform),
        })
      ) {
        // Keep context-menu gestures from arming the sortable drag sensor.
        event.stopPropagation();
      }

      suppressProjectClickAfterDragRef.current = false;
    },
    [],
  );

  const visibleThreads = useMemo(
    () => sidebarThreads.filter((thread) => thread.archivedAt === null),
    [sidebarThreads],
  );

  // Whether any filter is active (affects badge on filter button)
  const isFilterActive =
    filterState.projectIds !== null ||
    filterState.providerKinds !== null ||
    filterState.dateBuckets !== null ||
    filterState.activityBuckets !== null ||
    organizeMode !== "by_project";

  // Compute set of filtered thread IDs for the by_project view (null = no filter)
  const filteredThreadIdSet = useMemo<Set<ThreadId> | null>(() => {
    const { projectIds, providerKinds, dateBuckets, activityBuckets } = filterState;
    if (!projectIds && !providerKinds && !dateBuckets && !activityBuckets) return null;
    const filtered = visibleThreads.filter((t) => {
      if (projectIds && !projectIds.has(t.projectId)) return false;
      if (providerKinds) {
        const provider = t.session?.provider ?? null;
        if (!provider || !providerKinds.has(provider)) return false;
      }
      if (dateBuckets && !dateBuckets.has(resolveThreadDateBucket(t))) return false;
      if (activityBuckets) {
        const hasActivity = t.latestTurn !== null;
        if (!activityBuckets.has(hasActivity ? "has_activity" : "no_activity")) return false;
      }
      return true;
    });
    return new Set(filtered.map((t) => t.id));
  }, [filterState, visibleThreads]);

  const sortedProjects = useMemo(
    () =>
      sortProjectsForSidebar(sidebarProjects, visibleThreads, appSettings.sidebarProjectSortOrder),
    [appSettings.sidebarProjectSortOrder, sidebarProjects, visibleThreads],
  );
  const renderedProjects = useMemo(
    () =>
      sortedProjects.map((project) => {
        const resolveProjectThreadStatus = (thread: (typeof visibleThreads)[number]) =>
          resolveThreadStatusPill({
            thread: {
              ...thread,
              lastVisitedAt: threadLastVisitedAtById[thread.id],
            },
          });
        const projectThreads = sortThreadsForSidebar(
          (threadIdsByProjectId[project.id] ?? [])
            .map((threadId) => sidebarThreadsById[threadId])
            .filter((thread): thread is NonNullable<typeof thread> => thread !== undefined)
            .filter((thread) => thread.archivedAt === null)
            // Apply active filters so only matching threads appear in each project group
            .filter((thread) => !filteredThreadIdSet || filteredThreadIdSet.has(thread.id)),
          appSettings.sidebarThreadSortOrder,
        );
        // Reorder so pinned-to-project threads float to the top of each project
        const projectPinnedSet = new Set(pinnedToProjectThreadIds);
        const rawProjectThreads = projectThreads;
        const sortedProjectThreads = [
          ...rawProjectThreads.filter((t) => projectPinnedSet.has(t.id)),
          ...rawProjectThreads.filter((t) => !projectPinnedSet.has(t.id)),
        ];
        const projectStatus = resolveProjectStatusIndicator(
          sortedProjectThreads.map((thread) => resolveProjectThreadStatus(thread)),
        );
        const activeThreadId = routeThreadId ?? undefined;
        const isThreadListExpanded = expandedThreadListsByProject.has(project.id);
        const pinnedCollapsedThread =
          !project.expanded && activeThreadId
            ? (sortedProjectThreads.find((thread) => thread.id === activeThreadId) ?? null)
            : null;
        const shouldShowThreadPanel = project.expanded || pinnedCollapsedThread !== null;
        const {
          hasHiddenThreads,
          hiddenThreads,
          visibleThreads: visibleProjectThreads,
        } = getVisibleThreadsForProject({
          threads: sortedProjectThreads,
          activeThreadId,
          isThreadListExpanded,
          previewLimit: THREAD_PREVIEW_LIMIT,
        });
        const hiddenThreadStatus = resolveProjectStatusIndicator(
          hiddenThreads.map((thread) => resolveProjectThreadStatus(thread)),
        );
        const orderedProjectThreadIds = sortedProjectThreads.map((thread) => thread.id);
        const renderedThreadIds = pinnedCollapsedThread
          ? [pinnedCollapsedThread.id]
          : visibleProjectThreads.map((thread) => thread.id);
        const showEmptyThreadState = project.expanded && projectThreads.length === 0;

        return {
          hasHiddenThreads,
          hiddenThreadStatus,
          orderedProjectThreadIds,
          project,
          projectStatus,
          renderedThreadIds,
          showEmptyThreadState,
          shouldShowThreadPanel,
          isThreadListExpanded,
        };
      }),
    [
      appSettings.sidebarThreadSortOrder,
      expandedThreadListsByProject,
      filteredThreadIdSet,
      pinnedToProjectThreadIds,
      routeThreadId,
      sortedProjects,
      sidebarThreadsById,
      threadIdsByProjectId,
      threadLastVisitedAtById,
    ],
  );
  // Keep ref current so drag handler can snapshot project order without stale closure
  renderedProjectsRef.current = renderedProjects;
  const visibleSidebarThreadIds = useMemo(
    () => getVisibleSidebarThreadIds(renderedProjects),
    [renderedProjects],
  );
  const threadJumpCommandById = useMemo(() => {
    const mapping = new Map<ThreadId, NonNullable<ReturnType<typeof threadJumpCommandForIndex>>>();
    for (const [visibleThreadIndex, threadId] of visibleSidebarThreadIds.entries()) {
      const jumpCommand = threadJumpCommandForIndex(visibleThreadIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(threadId, jumpCommand);
    }

    return mapping;
  }, [visibleSidebarThreadIds]);
  const threadJumpThreadIds = useMemo(
    () => [...threadJumpCommandById.keys()],
    [threadJumpCommandById],
  );
  const threadJumpLabelById = useMemo(() => {
    const mapping = new Map<ThreadId, string>();
    for (const [threadId, command] of threadJumpCommandById) {
      const label = shortcutLabelForCommand(keybindings, command, sidebarShortcutLabelOptions);
      if (label) {
        mapping.set(threadId, label);
      }
    }
    return mapping;
  }, [keybindings, sidebarShortcutLabelOptions, threadJumpCommandById]);
  const orderedSidebarThreadIds = visibleSidebarThreadIds;

  useEffect(() => {
    const getShortcutContext = () => ({
      terminalFocus: isTerminalFocused(),
      terminalOpen: routeTerminalOpen,
    });

    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      updateThreadJumpHintsVisibility(
        shouldShowThreadJumpHints(event, keybindings, {
          platform,
          context: getShortcutContext(),
        }),
      );

      if (event.defaultPrevented || event.repeat) {
        return;
      }

      // Open search modal on Cmd+K (Mac) or Ctrl+K (other platforms), but only
      // when the terminal does not have focus — the terminal handles Cmd+K itself.
      const key = event.key.toLowerCase();
      const isSearchShortcut = isMacPlatform(platform)
        ? key === "k" && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        : key === "k" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

      if (isSearchShortcut && !isTerminalFocused()) {
        event.preventDefault();
        event.stopPropagation();
        setSearchOpen(!searchOpen);
        return;
      }

      // Toggle Files panel on Cmd+Shift+E (Mac) or Ctrl+Shift+E (others) — VS Code parity.
      const isFilesShortcut = isMacPlatform(platform)
        ? key === "e" && event.metaKey && !event.ctrlKey && !event.altKey && event.shiftKey
        : key === "e" && event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey;

      if (isFilesShortcut && !isTerminalFocused()) {
        event.preventDefault();
        event.stopPropagation();
        useFilesPanelStore.getState().toggle();
        return;
      }

      // Toggle sidebar on Cmd+B (Mac) or Ctrl+B (other platforms)
      const isSidebarToggleShortcut = isMacPlatform(platform)
        ? key === "b" && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        : key === "b" && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

      if (isSidebarToggleShortcut) {
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: getShortcutContext(),
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        const targetThreadId = resolveAdjacentThreadId({
          threadIds: orderedSidebarThreadIds,
          currentThreadId: routeThreadId,
          direction: traversalDirection,
        });
        if (!targetThreadId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateToThread(targetThreadId);
        return;
      }

      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetThreadId = threadJumpThreadIds[jumpIndex];
      if (!targetThreadId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToThread(targetThreadId);
    };

    // Separate handler for navigate.* page shortcuts so they don't compete with
    // the thread-jump early-return above. Fires at window level alongside the main handler.
    const onNavigateKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: getShortcutContext(),
      });
      if (command === "navigate.automations") {
        event.preventDefault();
        event.stopPropagation();
        void navigate({ to: "/automations" });
      } else if (command === "navigate.skills") {
        event.preventDefault();
        event.stopPropagation();
        void navigate({ to: "/skills" });
      } else if (command === "navigate.plugins") {
        event.preventDefault();
        event.stopPropagation();
        void navigate({ to: "/plugins" });
      }
    };

    const onWindowKeyUp = (event: globalThis.KeyboardEvent) => {
      updateThreadJumpHintsVisibility(
        shouldShowThreadJumpHints(event, keybindings, {
          platform,
          context: getShortcutContext(),
        }),
      );
    };

    const onWindowBlur = () => {
      updateThreadJumpHintsVisibility(false);
    };

    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keydown", onNavigateKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keydown", onNavigateKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    keybindings,
    navigate,
    navigateToThread,
    orderedSidebarThreadIds,
    platform,
    routeTerminalOpen,
    routeThreadId,
    searchOpen,
    setSearchOpen,
    threadJumpThreadIds,
    toggleSidebar,
    updateThreadJumpHintsVisibility,
  ]);

  function renderProjectItem(
    renderedProject: (typeof renderedProjects)[number],
    dragHandleProps: SortableProjectHandleProps | null,
  ) {
    const {
      hasHiddenThreads,
      hiddenThreadStatus,
      orderedProjectThreadIds,
      project,
      projectStatus,
      renderedThreadIds,
      showEmptyThreadState,
      shouldShowThreadPanel,
      isThreadListExpanded,
    } = renderedProject;
    return (
      <>
        <div className="group/project-header relative">
          <SidebarMenuButton
            ref={dragHandleProps?.setActivatorNodeRef}
            size="sm"
            className="gap-2 px-2 py-1.5 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground cursor-grab active:cursor-grabbing"
            {...(dragHandleProps ? dragHandleProps.attributes : {})}
            {...(dragHandleProps ? dragHandleProps.listeners : {})}
            onPointerDownCapture={handleProjectTitlePointerDownCapture}
            onClick={(event) => handleProjectTitleClick(event, project.id)}
            onKeyDown={(event) => handleProjectTitleKeyDown(event, project.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              suppressProjectClickForContextMenuRef.current = true;
              void handleProjectContextMenu(project.id, {
                x: event.clientX,
                y: event.clientY,
              });
            }}
          >
            {!project.expanded && projectStatus ? (
              <span
                aria-hidden="true"
                title={projectStatus.label}
                className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
              >
                <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                  <span
                    className={`size-[9px] rounded-full ${projectStatus.dotClass} ${
                      projectStatus.pulse ? "animate-pulse" : ""
                    }`}
                  />
                </span>
                <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
              </span>
            ) : (
              <ChevronRightIcon
                className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                  project.expanded ? "rotate-90" : ""
                }`}
              />
            )}
            <ProjectFavicon cwd={project.cwd} />
            {renamingProjectId === project.id ? (
              <input
                ref={(element) => {
                  if (element && renamingProjectInputRef.current !== element) {
                    renamingProjectInputRef.current = element;
                    element.focus();
                    element.select();
                  }
                }}
                className="min-w-0 flex-1 truncate rounded border border-ring bg-background px-0.5 text-xs font-medium text-foreground/90 outline-none"
                value={renamingProjectTitle}
                onChange={(event) => setRenamingProjectTitle(event.target.value)}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") {
                    event.preventDefault();
                    renamingProjectCommittedRef.current = true;
                    void commitProjectRename(project.id, renamingProjectTitle, project.name);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    renamingProjectCommittedRef.current = true;
                    cancelProjectRename();
                  }
                }}
                onBlur={() => {
                  if (!renamingProjectCommittedRef.current) {
                    void commitProjectRename(project.id, renamingProjectTitle, project.name);
                  }
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="flex-1 truncate text-xs font-medium text-foreground/90">
                      {project.name}
                    </span>
                  }
                />
                <TooltipPopup side="right">{project.cwd}</TooltipPopup>
              </Tooltip>
            )}
          </SidebarMenuButton>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuAction
                    render={renderOverflowButton(`Project actions for ${project.name}`)}
                    showOnHover
                    className="top-1 right-6 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleProjectContextMenu(project.id, {
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                  />
                }
              />
              <TooltipPopup side="top">Project actions</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuAction
                    render={
                      <button
                        type="button"
                        aria-label={`Create new thread in ${project.name}`}
                        data-testid="new-thread-button"
                      />
                    }
                    showOnHover
                    className="top-1 right-1.5 size-5 rounded-md p-0 text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const seedContext = resolveSidebarNewThreadSeedContext({
                        projectId: project.id,
                        defaultEnvMode: resolveSidebarNewThreadEnvMode({
                          defaultEnvMode: appSettings.defaultThreadEnvMode,
                        }),
                        activeThread:
                          activeThread && activeThread.projectId === project.id
                            ? {
                                projectId: activeThread.projectId,
                                branch: activeThread.branch,
                                worktreePath: activeThread.worktreePath,
                              }
                            : null,
                        activeDraftThread:
                          activeDraftThread && activeDraftThread.projectId === project.id
                            ? {
                                projectId: activeDraftThread.projectId,
                                branch: activeDraftThread.branch,
                                worktreePath: activeDraftThread.worktreePath,
                                envMode: activeDraftThread.envMode,
                              }
                            : null,
                      });
                      void handleNewThread(project.id, {
                        ...(seedContext.branch !== undefined ? { branch: seedContext.branch } : {}),
                        ...(seedContext.worktreePath !== undefined
                          ? { worktreePath: seedContext.worktreePath }
                          : {}),
                        envMode: seedContext.envMode,
                      });
                    }}
                  >
                    <SquarePenIcon className="size-3.5" />
                  </SidebarMenuAction>
                }
              />
              <TooltipPopup side="top">
                {newThreadShortcutLabel ? `New thread (${newThreadShortcutLabel})` : "New thread"}
              </TooltipPopup>
            </Tooltip>
          </div>
        </div>

        <SidebarMenuSub
          ref={attachThreadListAutoAnimateRef}
          className="mx-1 my-0 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0"
        >
          {shouldShowThreadPanel && showEmptyThreadState ? (
            <SidebarMenuSubItem className="w-full" data-thread-selection-safe>
              <div
                data-thread-selection-safe
                className="flex h-6 w-full translate-x-0 items-center px-2 text-left text-[10px] text-muted-foreground/60"
              >
                <span>No threads yet</span>
              </div>
            </SidebarMenuSubItem>
          ) : null}
          {shouldShowThreadPanel &&
            renderedThreadIds.map((threadId) => (
              <SidebarThreadRow
                key={threadId}
                threadId={threadId}
                orderedProjectThreadIds={orderedProjectThreadIds}
                routeThreadId={routeThreadId}
                selectedThreadIds={selectedThreadIds}
                showThreadJumpHints={showThreadJumpHints}
                jumpLabel={threadJumpLabelById.get(threadId) ?? null}
                appSettingsConfirmThreadArchive={appSettings.confirmThreadArchive}
                renamingThreadId={renamingThreadId}
                renamingTitle={renamingTitle}
                setRenamingTitle={setRenamingTitle}
                renamingInputRef={renamingInputRef}
                renamingCommittedRef={renamingCommittedRef}
                confirmingArchiveThreadId={confirmingArchiveThreadId}
                setConfirmingArchiveThreadId={setConfirmingArchiveThreadId}
                confirmArchiveButtonRefs={confirmArchiveButtonRefs}
                handleThreadClick={handleThreadClick}
                navigateToThread={navigateToThread}
                handleMultiSelectContextMenu={handleMultiSelectContextMenu}
                handleThreadContextMenu={handleThreadContextMenu}
                clearSelection={clearSelection}
                commitRename={commitRename}
                cancelRename={cancelRename}
                attemptArchiveThread={attemptArchiveThread}
                openPrLink={openPrLink}
                pr={prByThreadId.get(threadId) ?? null}
              />
            ))}

          {project.expanded && hasHiddenThreads && !isThreadListExpanded && (
            <SidebarMenuSubItem className="w-full">
              <SidebarMenuSubButton
                render={<button type="button" />}
                data-thread-selection-safe
                size="sm"
                className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
                onClick={() => {
                  expandThreadListForProject(project.id);
                }}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {hiddenThreadStatus && <ThreadStatusLabel status={hiddenThreadStatus} compact />}
                  <span>Show more</span>
                </span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
          {project.expanded && hasHiddenThreads && isThreadListExpanded && (
            <SidebarMenuSubItem className="w-full">
              <SidebarMenuSubButton
                render={<button type="button" />}
                data-thread-selection-safe
                size="sm"
                className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
                onClick={() => {
                  collapseThreadListForProject(project.id);
                }}
              >
                <span>Show less</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      </>
    );
  }

  const handleProjectTitleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>, projectId: ProjectId) => {
      if (suppressProjectClickForContextMenuRef.current) {
        suppressProjectClickForContextMenuRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        // Consume the synthetic click emitted after a drag release.
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (selectedThreadIds.size > 0) {
        clearSelection();
      }
      toggleProject(projectId);
    },
    [clearSelection, selectedThreadIds.size, toggleProject],
  );

  const handleProjectTitleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, projectId: ProjectId) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      toggleProject(projectId);
    },
    [toggleProject],
  );

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (selectedThreadIds.size === 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection, selectedThreadIds.size]);

  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge;
    if (
      !bridge ||
      typeof bridge.getUpdateState !== "function" ||
      typeof bridge.onUpdateState !== "function"
    ) {
      return;
    }

    let disposed = false;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = bridge.onUpdateState((nextState) => {
      if (disposed) return;
      receivedSubscriptionUpdate = true;
      setDesktopUpdateState(nextState);
    });

    void bridge
      .getUpdateState()
      .then((nextState) => {
        if (disposed || receivedSubscriptionUpdate) return;
        setDesktopUpdateState(nextState);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState)
      : null;
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", sidebarShortcutLabelOptions) ??
    shortcutLabelForCommand(keybindings, "chat.new", sidebarShortcutLabelOptions);
  // Shortcut labels for footer nav items — sourced from user-configurable keybindings.
  // The commands navigate.automations/skills/plugins are defined in contracts/keybindings.ts.
  const automationsShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "navigate.automations",
    sidebarShortcutLabelOptions,
  );
  const skillsShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "navigate.skills",
    sidebarShortcutLabelOptions,
  );
  const pluginsShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "navigate.plugins",
    sidebarShortcutLabelOptions,
  );

  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            toastManager.add({
              type: "success",
              title: "Update downloaded",
              description: "Restart the app from the update button to install it.",
            });
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: "Could not download update",
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not start update download",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          });
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      const confirmed = window.confirm(
        getDesktopUpdateInstallConfirmationMessage(desktopUpdateState),
      );
      if (!confirmed) return;
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add({
            type: "error",
            title: "Could not install update",
            description: actionError,
          });
        })
        .catch((error) => {
          toastManager.add({
            type: "error",
            title: "Could not install update",
            description: error instanceof Error ? error.message : "An unexpected error occurred.",
          });
        });
    }
  }, [desktopUpdateButtonAction, desktopUpdateButtonDisabled, desktopUpdateState]);

  const expandThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectId)) return current;
      const next = new Set(current);
      next.add(projectId);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectId: ProjectId) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectId)) return current;
      const next = new Set(current);
      next.delete(projectId);
      return next;
    });
  }, []);

  // Icon-only button style matching new thread / search sidebar buttons
  // On mobile the buttons are slightly larger for better touch targets
  const sidebarIconButtonClass =
    "flex shrink-0 items-center justify-center rounded-md p-2 md:p-1.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

  // The toggle sidebar button — same icon size as new-thread/search buttons
  const toggleSidebarButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Toggle sidebar"
            className={sidebarIconButtonClass}
            onClick={toggleSidebar}
          >
            {/* Slightly larger icon on mobile for easier tapping */}
            <PanelLeftIcon className="size-5 md:size-3.5" />
          </button>
        }
      />
      <TooltipPopup side="bottom" sideOffset={4}>
        Toggle sidebar ({isMacPlatform(navigator.platform) ? "⌘B" : "Ctrl+B"})
      </TooltipPopup>
    </Tooltip>
  );

  const wordmark = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {/*
       * SidebarTrigger (shows PanelLeftCloseIcon when open) — rendered only on
       * regular mobile web. In isMobileWebView the `toggleSidebarButton` above
       * already covers sidebar toggling, so we skip this to avoid two buttons.
       */}
      {!isMobileWebView && <SidebarTrigger className="shrink-0 md:hidden" />}
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              aria-label="Go to threads"
              className="ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md outline-hidden ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
              to="/"
            >
              <BirdLogomark />
              <span className="truncate text-sm font-medium tracking-tight text-muted-foreground">
                Bird Code
              </span>
              <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                {APP_STAGE_LABEL}
              </span>
            </Link>
          }
        />
        <TooltipPopup side="bottom" sideOffset={2}>
          Version {APP_VERSION}
        </TooltipPopup>
      </Tooltip>
    </div>
  );

  return (
    <>
      {isElectron ? (
        <SidebarHeader className="drag-region h-[52px] flex-row items-center gap-1 px-2 py-0 pl-[90px]">
          {toggleSidebarButton}
          {wordmark}
        </SidebarHeader>
      ) : isMobileWebView ? (
        /* Compact non-drag header for the iOS WKWebView — includes sidebar toggle button */
        <SidebarHeader className="flex-row items-center gap-2 px-3 py-2">
          {toggleSidebarButton}
          {wordmark}
        </SidebarHeader>
      ) : (
        <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">
          {wordmark}
        </SidebarHeader>
      )}

      {isOnSettings ? (
        <SettingsSidebarNav pathname={pathname} />
      ) : (
        <>
          {/* New thread + search — styled to match footer buttons (same size/weight) */}
          {projects.length > 0 && defaultProjectId && (
            <div className="px-2 py-1">
              {/* Creates a draft thread in the default project and navigates to it,
                  where the real composer + prompt cards are shown for empty threads.
                  On mobile the sidebar closes immediately so the user sees the new thread. */}
              {/* Styled to exactly match the footer SidebarMenuButton size="sm" buttons:
                  h-7, rounded-lg, px-2 py-1.5, text-xs, size-3.5 icon. */}
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => {
                  void handleNewThread(defaultProjectId!);
                  // Close the mobile sheet so the new thread is immediately visible
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <SquarePenIcon className="size-3.5 shrink-0" />
                <span className="flex-1 text-left">New thread</span>
                {/* Plain-text shortcut hint — matches the settings button style (no border/bg). */}
                {newThreadShortcutLabel && (
                  <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                    {newThreadShortcutLabel}
                  </span>
                )}
              </button>
              {/* Search button — opens the search modal (also triggered by Cmd+K) */}
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon className="size-3.5 shrink-0" />
                <span className="flex-1 text-left">Search</span>
                {/* Plain-text shortcut hint — matches the settings button style (no border/bg). */}
                <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                  {isMacPlatform(navigator.platform) ? "⌘K" : "Ctrl+K"}
                </span>
              </button>
              {/* Files button — toggles the VS Code-style Files panel (also Cmd/Ctrl+Shift+E). */}
              <button
                type="button"
                className="flex h-7 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => useFilesPanelStore.getState().toggle()}
                aria-label="Toggle Files panel"
              >
                <FolderIcon className="size-3.5 shrink-0" />
                <span className="flex-1 text-left">Files</span>
                <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                  {isMacPlatform(navigator.platform) ? "⇧⌘E" : "Ctrl+Shift+E"}
                </span>
              </button>
            </div>
          )}
          <SidebarContent className="gap-0">
            {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
              <SidebarGroup className="px-2 pt-2 pb-0">
                <Alert variant="warning" className="rounded-2xl border-warning/40 bg-warning/8">
                  <TriangleAlertIcon />
                  <AlertTitle>Intel build on Apple Silicon</AlertTitle>
                  <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
                  {desktopUpdateButtonAction !== "none" ? (
                    <AlertAction>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={desktopUpdateButtonDisabled}
                        onClick={handleDesktopUpdateButtonClick}
                      >
                        {desktopUpdateButtonAction === "download"
                          ? "Download ARM build"
                          : "Install ARM build"}
                      </Button>
                    </AlertAction>
                  ) : null}
                </Alert>
              </SidebarGroup>
            ) : null}
            <SidebarGroup className="px-2 py-2">
              <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {organizeMode === "by_project" ? "Projects" : "Threads"}
                </span>
                <div className="flex items-center gap-1">
                  {/* Filter/organize button — placed to the left of the sort button */}
                  <SidebarFilterButton
                    projects={projects}
                    visibleThreads={visibleThreads}
                    organizeMode={organizeMode}
                    filterState={filterState}
                    isFilterActive={isFilterActive}
                    onOrganizeModeChange={setOrganizeMode}
                    onFilterChange={setFilterState}
                    onReset={() => {
                      setOrganizeMode("by_project");
                      setFilterState({
                        projectIds: null,
                        providerKinds: null,
                        dateBuckets: null,
                        activityBuckets: null,
                      });
                    }}
                  />
                  <ProjectSortMenu
                    projectSortOrder={appSettings.sidebarProjectSortOrder}
                    threadSortOrder={appSettings.sidebarThreadSortOrder}
                    onProjectSortOrderChange={(sortOrder) => {
                      updateSettings({ sidebarProjectSortOrder: sortOrder });
                    }}
                    onThreadSortOrderChange={(sortOrder) => {
                      updateSettings({ sidebarThreadSortOrder: sortOrder });
                    }}
                  />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={
                            shouldShowProjectPathEntry ? "Cancel add project" : "Add project"
                          }
                          aria-pressed={shouldShowProjectPathEntry}
                          className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                          onClick={handleStartAddProject}
                        />
                      }
                    >
                      <PlusIcon
                        className={`size-3.5 transition-transform duration-150 ${
                          shouldShowProjectPathEntry ? "rotate-45" : "rotate-0"
                        }`}
                      />
                    </TooltipTrigger>
                    <TooltipPopup side="right">
                      {shouldShowProjectPathEntry ? "Cancel add project" : "Add project"}
                    </TooltipPopup>
                  </Tooltip>
                </div>
              </div>
              {shouldShowProjectPathEntry && (
                <div className="mb-2 px-1">
                  {isElectron && (
                    <button
                      type="button"
                      className="mb-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary py-1.5 text-xs text-foreground/80 transition-colors duration-150 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handlePickFolder()}
                      disabled={isPickingFolder || isAddingProject}
                    >
                      <FolderIcon className="size-3.5" />
                      {isPickingFolder ? "Picking folder..." : "Browse for folder"}
                    </button>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      ref={addProjectInputRef}
                      className={`min-w-0 flex-1 rounded-md border bg-secondary px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none ${
                        addProjectError
                          ? "border-red-500/70 focus:border-red-500"
                          : "border-border focus:border-ring"
                      }`}
                      placeholder="/path/to/project"
                      value={newCwd}
                      onChange={(event) => {
                        setNewCwd(event.target.value);
                        setAddProjectError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleAddProject();
                        if (event.key === "Escape") {
                          setAddingProject(false);
                          setAddProjectError(null);
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60"
                      onClick={handleAddProject}
                      disabled={!canAddProject}
                    >
                      {isAddingProject ? "Adding..." : "Add"}
                    </button>
                  </div>
                  {addProjectError && (
                    <p className="mt-1 px-0.5 text-[11px] leading-tight text-red-400">
                      {addProjectError}
                    </p>
                  )}
                </div>
              )}

              {organizeMode !== "by_project" ? (
                /* Non-by_project views: flat/grouped thread list */
                <SidebarOrganizedView
                  organizeMode={organizeMode}
                  visibleThreads={
                    filteredThreadIdSet
                      ? visibleThreads.filter((t) => filteredThreadIdSet.has(t.id))
                      : visibleThreads
                  }
                  expandedGroups={expandedOrganizeGroups}
                  onExpandGroup={(key) =>
                    setExpandedOrganizeGroups((prev) => {
                      const next = new Set(prev);
                      next.add(key);
                      return next;
                    })
                  }
                  onCollapseGroup={(key) =>
                    setExpandedOrganizeGroups((prev) => {
                      const next = new Set(prev);
                      next.delete(key);
                      return next;
                    })
                  }
                  showProjectTooltip
                  projects={projects}
                  prByThreadId={prByThreadId}
                  sidebarThreadsById={sidebarThreadsById}
                  routeThreadId={routeThreadId}
                  selectedThreadIds={selectedThreadIds}
                  showThreadJumpHints={showThreadJumpHints}
                  threadJumpLabelById={threadJumpLabelById}
                  appSettingsConfirmThreadArchive={appSettings.confirmThreadArchive}
                  renamingThreadId={renamingThreadId}
                  renamingTitle={renamingTitle}
                  setRenamingTitle={setRenamingTitle}
                  renamingInputRef={renamingInputRef}
                  renamingCommittedRef={renamingCommittedRef}
                  confirmingArchiveThreadId={confirmingArchiveThreadId}
                  setConfirmingArchiveThreadId={setConfirmingArchiveThreadId}
                  confirmArchiveButtonRefs={confirmArchiveButtonRefs}
                  handleThreadClick={handleThreadClick}
                  navigateToThread={navigateToThread}
                  handleMultiSelectContextMenu={handleMultiSelectContextMenu}
                  handleThreadContextMenu={handleThreadContextMenu}
                  clearSelection={clearSelection}
                  commitRename={commitRename}
                  cancelRename={cancelRename}
                  attemptArchiveThread={attemptArchiveThread}
                  openPrLink={openPrLink}
                />
              ) : (
                /* by_project view: always use DndContext so drag-to-reorder works in any sort mode */
                <>
                  {/* Pinned-to-sidebar section — shown above the project list */}
                  {pinnedToSidebarThreadIds.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-0.5 flex items-center gap-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                        <PinIcon className="size-2.5" />
                        Pinned
                      </div>
                      <FlatThreadRowList
                        threadIds={pinnedToSidebarThreadIds.filter((id) =>
                          visibleThreads.some((t) => t.id === id),
                        )}
                        projects={projects}
                        showProjectTooltip
                        prByThreadId={prByThreadId}
                        sidebarThreadsById={sidebarThreadsById}
                        orderedProjectThreadIds={orderedSidebarThreadIds}
                        routeThreadId={routeThreadId}
                        selectedThreadIds={selectedThreadIds}
                        showThreadJumpHints={showThreadJumpHints}
                        threadJumpLabelById={threadJumpLabelById}
                        appSettingsConfirmThreadArchive={appSettings.confirmThreadArchive}
                        renamingThreadId={renamingThreadId}
                        renamingTitle={renamingTitle}
                        setRenamingTitle={setRenamingTitle}
                        renamingInputRef={renamingInputRef}
                        renamingCommittedRef={renamingCommittedRef}
                        confirmingArchiveThreadId={confirmingArchiveThreadId}
                        setConfirmingArchiveThreadId={setConfirmingArchiveThreadId}
                        confirmArchiveButtonRefs={confirmArchiveButtonRefs}
                        handleThreadClick={handleThreadClick}
                        navigateToThread={navigateToThread}
                        handleMultiSelectContextMenu={handleMultiSelectContextMenu}
                        handleThreadContextMenu={handleThreadContextMenu}
                        clearSelection={clearSelection}
                        commitRename={commitRename}
                        cancelRename={cancelRename}
                        attemptArchiveThread={attemptArchiveThread}
                        openPrLink={openPrLink}
                      />
                    </div>
                  )}
                  <DndContext
                    sensors={projectDnDSensors}
                    collisionDetection={projectCollisionDetection}
                    modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
                    onDragStart={handleProjectDragStart}
                    onDragEnd={handleProjectDragEnd}
                    onDragCancel={handleProjectDragCancel}
                  >
                    <SidebarMenu>
                      <SortableContext
                        items={renderedProjects.map(
                          (renderedProject) => renderedProject.project.id,
                        )}
                        strategy={verticalListSortingStrategy}
                      >
                        {renderedProjects.map((renderedProject) => (
                          <SortableProjectItem
                            key={renderedProject.project.id}
                            projectId={renderedProject.project.id}
                          >
                            {(dragHandleProps) =>
                              renderProjectItem(renderedProject, dragHandleProps)
                            }
                          </SortableProjectItem>
                        ))}
                      </SortableContext>
                    </SidebarMenu>
                  </DndContext>
                </>
              )}

              {/* Only surface the "no projects" empty state once bootstrap is complete —
                  avoids a flash of this message before the server read model arrives. */}
              {bootstrapComplete && projects.length === 0 && !shouldShowProjectPathEntry && (
                <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
                  No projects yet
                </div>
              )}
            </SidebarGroup>
          </SidebarContent>

          <SidebarSeparator />
          <SidebarFooter className="p-2">
            <SidebarUpdatePill />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className={`gap-2 px-2 py-1.5 hover:bg-accent hover:text-foreground ${
                    pathname.startsWith("/automations")
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground/70"
                  }`}
                  onClick={() => void navigate({ to: "/automations" })}
                >
                  <ZapIcon className="size-3.5" />
                  <span className="flex-1 text-xs">Automations</span>
                  {/* User-configurable shortcut via navigate.automations keybinding. */}
                  {automationsShortcutLabel && (
                    <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                      {automationsShortcutLabel}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className={`gap-2 px-2 py-1.5 hover:bg-accent hover:text-foreground ${
                    pathname.startsWith("/skills")
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground/70"
                  }`}
                  onClick={() => void navigate({ to: "/skills" })}
                >
                  <SparklesIcon className="size-3.5" />
                  <span className="flex-1 text-xs">Skills</span>
                  {/* User-configurable shortcut via navigate.skills keybinding. */}
                  {skillsShortcutLabel && (
                    <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                      {skillsShortcutLabel}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className={`gap-2 px-2 py-1.5 hover:bg-accent hover:text-foreground ${
                    pathname.startsWith("/plugins")
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground/70"
                  }`}
                  onClick={() => void navigate({ to: "/plugins" })}
                >
                  <LayoutGridIcon className="size-3.5" />
                  <span className="flex-1 text-xs">Plugins</span>
                  {/* User-configurable shortcut via navigate.plugins keybinding. */}
                  {pluginsShortcutLabel && (
                    <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                      {pluginsShortcutLabel}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  className={`gap-2 px-2 py-1.5 hover:bg-accent hover:text-foreground ${
                    pathname.startsWith("/settings")
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground/70"
                  }`}
                  onClick={() => void navigate({ to: "/settings" })}
                >
                  <SettingsIcon className="size-3.5" />
                  <span className="flex-1 text-xs">Settings</span>
                  {/* Settings shortcut hint: ⌘, / Ctrl+, */}
                  <span className="pointer-events-none hidden text-[9px] text-muted-foreground/40 sm:inline">
                    {isMacPlatform(navigator.platform) ? "⌘," : "Ctrl+,"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      )}
      {/* Search modal — rendered outside conditional blocks so it survives route changes */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} projects={projects} />
      {/* UI-rendered context menu — positioned at cursor via virtual anchor, supports icons */}
      <Menu
        open={activeContextMenu !== null}
        onOpenChange={(open) => {
          if (!open && activeContextMenu) {
            activeContextMenu.resolve(null);
            setActiveContextMenu(null);
          }
        }}
      >
        <MenuPopup anchor={contextMenuAnchor} side="bottom" align="start" sideOffset={0}>
          {activeContextMenu?.items.map((item) => (
            <span key={item.id}>
              {item.separator && <MenuSeparator />}
              <MenuItem
                variant={item.destructive ? "destructive" : "default"}
                onClick={() => {
                  activeContextMenu.resolve(item.id);
                  setActiveContextMenu(null);
                }}
              >
                {item.icon}
                {item.label}
              </MenuItem>
            </span>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
}
