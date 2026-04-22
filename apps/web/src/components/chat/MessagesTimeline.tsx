import { type MessageId, type ThreadId, type TurnId } from "@t3tools/contracts";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  measureElement as measureVirtualElement,
  type VirtualItem,
  useVirtualizer,
} from "@tanstack/react-virtual";
import { deriveTimelineEntries, formatElapsed } from "../../session-logic";
import { AUTO_SCROLL_BOTTOM_THRESHOLD_PX } from "../../chat-scroll";
import { type TurnDiffSummary } from "../../types";
import { summarizeTurnDiffStats } from "../../lib/turnDiffTree";
import { formatModelDisplayName } from "../../lib/modelDisplayName";
import ChatMarkdown from "../ChatMarkdown";
import { ChevronRightIcon, Undo2Icon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { clamp } from "effect/Number";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./ExpandedImagePreview";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { DiffStatLabel, hasNonZeroStat } from "./DiffStatLabel";
import { FileDiffCard } from "./FileDiffCard";
import { useFileDiff } from "../../hooks/useFileDiff";
import { useSettings } from "../../hooks/useSettings";
import { MessageCopyButton } from "./MessageCopyButton";
import {
  MAX_VISIBLE_WORK_LOG_ENTRIES,
  deriveMessagesTimelineRows,
  estimateMessagesTimelineRowHeight,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import { ReasoningBlock } from "./ReasoningBlock";
import { WorkEntryRow } from "./WorkEntryRow";
import { groupWorkEntriesIntoSections, computeWorkLogHeaderStats } from "./workLogHelpers";
import {
  deriveDisplayedUserMessageState,
  type ParsedTerminalContextEntry,
} from "~/lib/terminalContext";
import { type TimestampFormat, type ToolCallDisplayStyle } from "@t3tools/contracts/settings";
import { formatTimestamp } from "../../timestampFormat";
import {
  buildInlineTerminalContextText,
  formatInlineTerminalContextLabel,
  textContainsInlineTerminalContextLabels,
} from "./userMessageTerminalContexts";

const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 8;

interface MessagesTimelineProps {
  /** Needed to fetch per-turn raw diffs for inline FileDiffCard display. */
  threadId: ThreadId;
  hasMessages: boolean;
  isWorking: boolean;
  activeTurnInProgress: boolean;
  activeTurnStartedAt: string | null;
  scrollContainer: HTMLDivElement | null;
  timelineEntries: ReturnType<typeof deriveTimelineEntries>;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  /** Maps turnId → model slug so each AI response can show the model that generated it. */
  modelByTurnId: Map<string, string>;
  nowIso: string;
  expandedWorkGroups: Record<string, boolean>;
  onToggleWorkGroup: (groupId: string) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
  toolCallDisplayStyle?: ToolCallDisplayStyle;
  onToggleToolCallDisplayStyle?: () => void;
  /**
   * When provided, shell-type code blocks show a "Run in terminal" button that
   * calls this callback with the raw command string.
   */
  onRunInTerminal?: (command: string) => void;
  onVirtualizerSnapshot?: (snapshot: {
    totalSize: number;
    measurements: ReadonlyArray<{
      id: string;
      kind: MessagesTimelineRow["kind"];
      index: number;
      size: number;
      start: number;
      end: number;
    }>;
  }) => void;
}

export const MessagesTimeline = memo(function MessagesTimeline({
  threadId,
  hasMessages,
  isWorking,
  activeTurnInProgress,
  activeTurnStartedAt,
  scrollContainer,
  timelineEntries,
  completionDividerBeforeEntryId,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  modelByTurnId,
  nowIso,
  expandedWorkGroups,
  onToggleWorkGroup,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  isRevertingCheckpoint,
  onImageExpand,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
  toolCallDisplayStyle,
  onToggleToolCallDisplayStyle,
  onRunInTerminal,
  onVirtualizerSnapshot,
}: MessagesTimelineProps) {
  const appSettings = useSettings();
  const collapseChangedFilesByDefault = appSettings.collapseChangedFilesByDefault;
  const timelineRootRef = useRef<HTMLDivElement | null>(null);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const timelineRoot = timelineRootRef.current;
    if (!timelineRoot) return;

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((previousWidth) => {
        if (previousWidth !== null && Math.abs(previousWidth - nextWidth) < 0.5) {
          return previousWidth;
        }
        return nextWidth;
      });
    };

    updateWidth(timelineRoot.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      updateWidth(timelineRoot.getBoundingClientRect().width);
    });
    observer.observe(timelineRoot);
    return () => {
      observer.disconnect();
    };
  }, [hasMessages, isWorking]);

  const rows = useMemo(
    () =>
      deriveMessagesTimelineRows({
        timelineEntries,
        completionDividerBeforeEntryId,
        isWorking,
        activeTurnStartedAt,
      }),
    [timelineEntries, completionDividerBeforeEntryId, isWorking, activeTurnStartedAt],
  );

  const firstUnvirtualizedRowIndex = useMemo(() => {
    const firstTailRowIndex = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
    if (!activeTurnInProgress) return firstTailRowIndex;

    const turnStartedAtMs =
      typeof activeTurnStartedAt === "string" ? Date.parse(activeTurnStartedAt) : Number.NaN;
    let firstCurrentTurnRowIndex = -1;
    if (!Number.isNaN(turnStartedAtMs)) {
      firstCurrentTurnRowIndex = rows.findIndex((row) => {
        if (row.kind === "working") return true;
        if (!row.createdAt) return false;
        const rowCreatedAtMs = Date.parse(row.createdAt);
        return !Number.isNaN(rowCreatedAtMs) && rowCreatedAtMs >= turnStartedAtMs;
      });
    }

    if (firstCurrentTurnRowIndex < 0) {
      firstCurrentTurnRowIndex = rows.findIndex(
        (row) => row.kind === "message" && row.message.streaming,
      );
    }

    if (firstCurrentTurnRowIndex < 0) return firstTailRowIndex;

    for (let index = firstCurrentTurnRowIndex - 1; index >= 0; index -= 1) {
      const previousRow = rows[index];
      if (!previousRow || previousRow.kind !== "message") continue;
      if (previousRow.message.role === "user") {
        return Math.min(index, firstTailRowIndex);
      }
      if (previousRow.message.role === "assistant" && !previousRow.message.streaming) {
        break;
      }
    }

    return Math.min(firstCurrentTurnRowIndex, firstTailRowIndex);
  }, [activeTurnInProgress, activeTurnStartedAt, rows]);

  const virtualizedRowCount = clamp(firstUnvirtualizedRowIndex, {
    minimum: 0,
    maximum: rows.length,
  });
  const virtualMeasurementScopeKey =
    timelineWidthPx === null ? "width:unknown" : `width:${Math.round(timelineWidthPx)}`;

  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => scrollContainer,
    // Scope cached row measurements to the current timeline width so offscreen
    // rows do not keep stale heights after wrapping changes.
    getItemKey: (index: number) => {
      const rowId = rows[index]?.id ?? String(index);
      return `${virtualMeasurementScopeKey}:${rowId}`;
    },
    estimateSize: (index: number) => {
      const row = rows[index];
      if (!row) return 96;
      return estimateMessagesTimelineRowHeight(row, {
        expandedWorkGroups,
        timelineWidthPx,
        turnDiffSummaryByAssistantMessageId,
      });
    },
    measureElement: measureVirtualElement,
    useAnimationFrameWithResizeObserver: true,
    overscan: 8,
  });
  useEffect(() => {
    if (timelineWidthPx === null) return;
    rowVirtualizer.measure();
  }, [rowVirtualizer, timelineWidthPx]);
  useEffect(() => {
    rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) => {
      const viewportHeight = instance.scrollRect?.height ?? 0;
      const scrollOffset = instance.scrollOffset ?? 0;
      const itemIntersectsViewport =
        item.end > scrollOffset && item.start < scrollOffset + viewportHeight;
      if (itemIntersectsViewport) {
        return false;
      }
      const remainingDistance = instance.getTotalSize() - (scrollOffset + viewportHeight);
      return remainingDistance > AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
    };
    return () => {
      rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [rowVirtualizer]);
  const pendingMeasureFrameRef = useRef<number | null>(null);
  const onTimelineImageLoad = useCallback(() => {
    if (pendingMeasureFrameRef.current !== null) return;
    pendingMeasureFrameRef.current = window.requestAnimationFrame(() => {
      pendingMeasureFrameRef.current = null;
      rowVirtualizer.measure();
    });
  }, [rowVirtualizer]);
  useEffect(() => {
    return () => {
      const frame = pendingMeasureFrameRef.current;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);
  useLayoutEffect(() => {
    if (!onVirtualizerSnapshot) {
      return;
    }
    onVirtualizerSnapshot({
      totalSize: rowVirtualizer.getTotalSize(),
      measurements: rowVirtualizer.measurementsCache
        .slice(0, virtualizedRowCount)
        .flatMap((measurement) => {
          const row = rows[measurement.index];
          if (!row) {
            return [];
          }
          return [
            {
              id: row.id,
              kind: row.kind,
              index: measurement.index,
              size: measurement.size,
              start: measurement.start,
              end: measurement.end,
            },
          ];
        }),
    });
  }, [onVirtualizerSnapshot, rowVirtualizer, rows, virtualizedRowCount]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);
  const [allDirectoriesExpandedByTurnId, setAllDirectoriesExpandedByTurnId] = useState<
    Record<string, boolean>
  >({});
  const onToggleAllDirectories = useCallback((turnId: TurnId) => {
    setAllDirectoriesExpandedByTurnId((current) => ({
      ...current,
      [turnId]: !(current[turnId] ?? true),
    }));
  }, []);

  // The most-recent checkpoint's turn count — whether it auto-expands depends
  // on the "Collapse changed files by default" setting.
  const mostRecentCheckpointTurnCount = useMemo(() => {
    let max = -1;
    for (const summary of turnDiffSummaryByAssistantMessageId.values()) {
      if ((summary.checkpointTurnCount ?? 0) > max) {
        max = summary.checkpointTurnCount ?? 0;
      }
    }
    return max >= 0 ? max : undefined;
  }, [turnDiffSummaryByAssistantMessageId]);

  const renderRowContent = (row: TimelineRow) => (
    <div
      className="pb-4"
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {row.kind === "work" &&
        (() => {
          const groupId = row.id;
          const groupedEntries = row.groupedEntries;
          const isExpanded = expandedWorkGroups[groupId] ?? false;
          const hasOverflow = groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
          const visibleEntries =
            hasOverflow && !isExpanded
              ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
              : groupedEntries;
          const hiddenCount = groupedEntries.length - visibleEntries.length;
          const effectiveToolCallDisplayStyle = toolCallDisplayStyle ?? "clean";

          // Compute header stats and sections for sectioned rendering
          const headerStats = computeWorkLogHeaderStats(groupedEntries);
          const sections = groupWorkEntriesIntoSections(visibleEntries);

          // Determine if this is the last work group row (for auto-open reasoning)
          const isLastWorkGroup =
            isWorking &&
            (() => {
              for (let i = rows.length - 1; i >= 0; i--) {
                if (rows[i]?.kind === "work") {
                  return rows[i] === row;
                }
              }
              return false;
            })();

          return (
            <div className="rounded-xl border border-border/45 bg-card/25 px-2 py-1.5">
              {/* Header: always shown */}
              <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                <div className="flex items-center gap-2">
                  {isLastWorkGroup && (
                    <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400/60" />
                  )}
                  {headerStats.length > 0 ? (
                    <p className="text-[9px] tracking-wide text-muted-foreground/50">
                      {headerStats.map((s) => s.label).join(" · ")}
                    </p>
                  ) : (
                    <p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/50">
                      Work log ({groupedEntries.length})
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {onToggleToolCallDisplayStyle ? (
                    <button
                      type="button"
                      className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 transition-colors duration-150 hover:text-foreground/75"
                      onClick={onToggleToolCallDisplayStyle}
                    >
                      {effectiveToolCallDisplayStyle === "verbose" ? "Clean" : "Raw"}
                    </button>
                  ) : null}
                  {hasOverflow && (
                    <button
                      type="button"
                      className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/50 transition-colors duration-150 hover:text-foreground/75"
                      onClick={() => onToggleWorkGroup(groupId)}
                    >
                      {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
                    </button>
                  )}
                </div>
              </div>

              {/* Sectioned content */}
              <div className="space-y-0.5">
                {sections.map((section, sectionIndex) => {
                  if (section.kind === "reasoning") {
                    return (
                      <ReasoningBlock
                        key={`reasoning:${section.entries[0]!.id}`}
                        entries={section.entries}
                        isActivelyWorking={!!isLastWorkGroup}
                        isLastSection={sectionIndex === sections.length - 1}
                      />
                    );
                  }

                  // Tool section: render each entry with per-type styling
                  return section.entries.map((workEntry) => (
                    <WorkEntryRow
                      key={`work-row:${workEntry.id}`}
                      entry={workEntry}
                      workspaceRoot={workspaceRoot}
                      displayStyle={effectiveToolCallDisplayStyle}
                    />
                  ));
                })}
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "user" &&
        (() => {
          const userImages = row.message.attachments ?? [];
          const displayedUserMessage = deriveDisplayedUserMessageState(row.message.text);
          const terminalContexts = displayedUserMessage.contexts;
          const canRevertAgentWork = revertTurnCountByUserMessageId.has(row.message.id);
          return (
            <div className="flex justify-end">
              {/* Timestamp sits above the bubble, right-aligned, ~6px gap via mb-1.5 */}
              {/* max-w-[80%] lives here so it's relative to the full-width flex row, not
                  the content-sized group div — prevents short words from being broken */}
              <div className="group flex flex-col items-end max-w-[80%]">
                {/* bg uses explicit dark: opacity so the bubble is visible in dark mode
                    (bg-secondary/50 collapsed to ~2% white which was nearly invisible) */}
                {userImages.length > 0 && (
                  <div className="mb-2 flex w-full flex-wrap justify-end gap-2 sm:max-w-[640px]">
                    {userImages.map(
                      (image: NonNullable<TimelineMessage["attachments"]>[number]) => (
                        <div
                          key={image.id}
                          className="overflow-hidden rounded-xl border border-border/80 bg-background/70"
                        >
                          {image.previewUrl ? (
                            <button
                              type="button"
                              className="h-full w-full cursor-zoom-in"
                              aria-label={`Preview ${image.name}`}
                              onClick={() => {
                                const preview = buildExpandedImagePreview(userImages, image.id);
                                if (!preview) return;
                                onImageExpand(preview);
                              }}
                            >
                              <img
                                src={image.previewUrl}
                                alt={image.name}
                                className="h-full max-h-[280px] w-auto object-cover"
                                onLoad={onTimelineImageLoad}
                                onError={onTimelineImageLoad}
                              />
                            </button>
                          ) : (
                            <div className="flex min-h-[36px] items-center justify-center px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                              {image.name}
                            </div>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {(displayedUserMessage.visibleText.trim().length > 0 ||
                  terminalContexts.length > 0) && (
                  <div className="relative rounded-2xl bg-black/5 dark:bg-white/[0.03] px-12 py-8">
                    <UserMessageBody
                      text={displayedUserMessage.visibleText}
                      terminalContexts={terminalContexts}
                    />
                  </div>
                )}
                {/* Action buttons below bubble, only show on hover — prevents invisible space inside bubble */}
                {(displayedUserMessage.copyText || canRevertAgentWork) && (
                  <div className="mt-1 flex items-center justify-end gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
                    {displayedUserMessage.copyText && (
                      <MessageCopyButton text={displayedUserMessage.copyText} />
                    )}
                    {canRevertAgentWork && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={isRevertingCheckpoint || isWorking}
                        onClick={() => onRevertUserMessage(row.message.id)}
                        title="Revert to this message"
                      >
                        <Undo2Icon className="size-3" />
                      </Button>
                    )}
                  </div>
                )}
                {/* Timestamp above bubble, outside, right-aligned — 6px gap via mb-1.5 order */}
                <p className="mb-1.5 order-first text-right text-[10px] text-muted-foreground/40">
                  {formatTimestamp(row.message.createdAt, timestampFormat)}
                </p>
              </div>
            </div>
          );
        })()}

      {row.kind === "message" &&
        row.message.role === "assistant" &&
        (() => {
          const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");
          return (
            <>
              {row.showCompletionDivider && (
                <div className="my-3 flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {completionSummary ? `Response • ${completionSummary}` : "Response"}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              <div className="min-w-0 px-1 py-0.5">
                <ChatMarkdown
                  text={messageText}
                  cwd={markdownCwd}
                  isStreaming={Boolean(row.message.streaming)}
                  {...(onRunInTerminal !== undefined ? { onRunInTerminal } : {})}
                />
                {(() => {
                  const turnSummary = turnDiffSummaryByAssistantMessageId.get(row.message.id);
                  if (!turnSummary) return null;
                  const checkpointFiles = turnSummary.files;
                  if (checkpointFiles.length === 0) return null;
                  const allDirectoriesExpanded =
                    allDirectoriesExpandedByTurnId[turnSummary.turnId] ?? true;
                  // Only the most-recent checkpoint can auto-expand, and only
                  // when the user has not opted into collapsing by default.
                  const isRecentTurn =
                    mostRecentCheckpointTurnCount != null &&
                    turnSummary.checkpointTurnCount === mostRecentCheckpointTurnCount;
                  const defaultExpanded = isRecentTurn && !collapseChangedFilesByDefault;
                  return (
                    <ChangedFilesBox
                      key={`changed-files-box:${turnSummary.turnId}`}
                      threadId={threadId}
                      turnId={turnSummary.turnId}
                      files={checkpointFiles}
                      checkpointTurnCount={turnSummary.checkpointTurnCount}
                      defaultExpanded={defaultExpanded}
                      allDirectoriesExpanded={allDirectoriesExpanded}
                      resolvedTheme={resolvedTheme}
                      onOpenTurnDiff={onOpenTurnDiff}
                      onToggleAllDirectories={onToggleAllDirectories}
                    />
                  );
                })()}
                {/* Model + timestamp meta row */}
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground/50">
                    {formatMessageMeta(
                      row.message.createdAt,
                      row.message.streaming
                        ? formatElapsed(row.durationStart, nowIso)
                        : formatElapsed(row.durationStart, row.message.completedAt),
                      timestampFormat,
                    )}
                  </p>
                  {/* Show the human-readable model name used for this turn */}
                  {row.message.turnId && modelByTurnId.get(row.message.turnId) && (
                    <span
                      className="rounded px-1 py-0.5 text-[9px] leading-none text-muted-foreground/30 bg-muted/30"
                      title={modelByTurnId.get(row.message.turnId)}
                    >
                      {formatModelDisplayName(modelByTurnId.get(row.message.turnId)!)}
                    </span>
                  )}
                </div>
              </div>
            </>
          );
        })()}

      {row.kind === "proposed-plan" && (
        <div className="min-w-0 px-1 py-0.5">
          <ProposedPlanCard
            planMarkdown={row.proposedPlan.planMarkdown}
            cwd={markdownCwd}
            workspaceRoot={workspaceRoot}
          />
        </div>
      )}

      {row.kind === "working" && (
        <div className="py-0.5 pl-1.5">
          <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70">
            <span className="inline-flex items-center gap-[3px]">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:200ms]" />
              <span className="h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse [animation-delay:400ms]" />
            </span>
            <span>
              {row.createdAt
                ? `Working for ${formatWorkingTimer(row.createdAt, nowIso) ?? "0s"}`
                : "Working..."}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  if (!hasMessages && !isWorking) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground/30">
          Send a message to start the conversation.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={timelineRootRef}
      data-timeline-root="true"
      className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden"
    >
      {virtualizedRowCount > 0 && (
        <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow: VirtualItem) => {
            const row = rows[virtualRow.index];
            if (!row) return null;

            return (
              <div
                key={`virtual-row:${row.id}`}
                data-index={virtualRow.index}
                data-virtual-row-id={row.id}
                data-virtual-row-kind={row.kind}
                data-virtual-row-size={virtualRow.size}
                data-virtual-row-start={virtualRow.start}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderRowContent(row)}
              </div>
            );
          })}
        </div>
      )}

      {nonVirtualizedRows.map((row) => (
        <div key={`non-virtual-row:${row.id}`}>{renderRowContent(row)}</div>
      ))}
    </div>
  );
});

type TimelineEntry = ReturnType<typeof deriveTimelineEntries>[number];
type TimelineMessage = Extract<TimelineEntry, { kind: "message" }>["message"];
type TimelineRow = MessagesTimelineRow;

function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatMessageMeta(
  createdAt: string,
  duration: string | null,
  timestampFormat: TimestampFormat,
): string {
  if (!duration) return formatTimestamp(createdAt, timestampFormat);
  return `${formatTimestamp(createdAt, timestampFormat)} • ${duration}`;
}

const UserMessageTerminalContextInlineLabel = memo(
  function UserMessageTerminalContextInlineLabel(props: { context: ParsedTerminalContextEntry }) {
    const tooltipText =
      props.context.body.length > 0
        ? `${props.context.header}\n${props.context.body}`
        : props.context.header;

    return <TerminalContextInlineChip label={props.context.header} tooltipText={tooltipText} />;
  },
);

/**
 * ChangedFilesBox
 *
 * Collapsible wrapper that renders per-file FileDiffCard components for each
 * file changed in a turn.
 *
 * Behaviour:
 *  - The parent decides the initial state from the user's settings.
 *  - When expanded, the diff is fetched lazily on first open.
 *
 * The raw unified diff (needed to populate FileDiffCard lines) is fetched
 * lazily via useFileDiff the first time the card is opened.  Results are
 * cached so re-opens are instant.
 *
 * Fallback: even before the diff loads, each FileDiffCard shows the filename
 * and +/- stats from the checkpoint summary, so users always see something.
 */
import { useUiStateStore } from "../../uiStateStore";

const ChangedFilesBox = memo(function ChangedFilesBox(props: {
  threadId: ThreadId;
  turnId: TurnId;
  checkpointTurnCount: number | undefined;
  files: ReadonlyArray<import("../../types").TurnDiffFileChange>;
  defaultExpanded: boolean;
  allDirectoriesExpanded: boolean;
  resolvedTheme: "light" | "dark";
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  onToggleAllDirectories: (turnId: TurnId) => void;
}) {
  const {
    threadId,
    turnId,
    checkpointTurnCount,
    files,
    defaultExpanded,
    resolvedTheme,
    onOpenTurnDiff,
  } = props;

  const persistedExpanded = useUiStateStore((s) => s.changedFilesExpandedByThreadId[threadId]);
  const setPersistedExpanded = useUiStateStore((s) => s.setChangedFilesExpanded);

  // Store state is the source of truth once the user has interacted with the box.
  const isOpen = persistedExpanded ?? defaultExpanded;

  const toggleOpen = useCallback(() => {
    const next = !isOpen;
    setPersistedExpanded(threadId, next);
  }, [isOpen, threadId, setPersistedExpanded]);

  const changedFilesPanelId = useId();
  const changedFilesHeaderId = useId();

  // Fetch the raw diff lazily — only when the box is first opened.
  const { files: parsedFiles, isLoading } = useFileDiff(
    threadId,
    checkpointTurnCount,
    isOpen, // enabled only when open
  );

  // Build a path → ParsedFile lookup for O(1) access per file card.
  const parsedFileByPath = useMemo(() => {
    const map = new Map<string, (typeof parsedFiles)[number]>();
    for (const pf of parsedFiles) {
      const path = pf.to ?? pf.from ?? "";
      if (path) map.set(path, pf);
    }
    return map;
  }, [parsedFiles]);

  const summaryStat = summarizeTurnDiffStats(files);

  return (
    <div className="mt-2 space-y-0">
      {/* ── Collapsed summary header (always visible) ──
          Outer wrapper is non-interactive so the expand toggle and "Full diff"
          are sibling buttons (nested <button> is invalid HTML). */}
      <div className="flex w-full items-center gap-1.5 rounded-lg border border-border/50 bg-card/30 px-2.5 py-1.5 transition-colors hover:bg-card/50">
        <button
          type="button"
          id={changedFilesHeaderId}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-md"
          aria-expanded={isOpen}
          aria-controls={changedFilesPanelId}
          onClick={toggleOpen}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-150",
              isOpen && "rotate-90",
            )}
            aria-hidden
          />
          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">
            <span>{files.length === 1 ? "1 file changed" : `${files.length} files changed`}</span>
            {hasNonZeroStat(summaryStat) && (
              <>
                <span className="mx-1.5 text-muted-foreground/30">·</span>
                <DiffStatLabel
                  additions={summaryStat.additions}
                  deletions={summaryStat.deletions}
                />
              </>
            )}
          </p>
        </button>
        <button
          type="button"
          className="ml-auto shrink-0 text-[9px] uppercase tracking-[0.1em] text-muted-foreground/40 outline-none hover:text-foreground/60 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpenTurnDiff(turnId, files[0]?.path);
          }}
        >
          Full diff
        </button>
      </div>

      {/* ── Per-file diff cards (shown when open) ── */}
      <div
        id={changedFilesPanelId}
        role="region"
        aria-labelledby={changedFilesHeaderId}
        hidden={!isOpen}
      >
        {isOpen && (
          <div className="mt-1.5 space-y-1">
            {files.map((fileChange) => {
              const parsedFile = parsedFileByPath.get(fileChange.path) ?? null;
              return (
                <FileDiffCard
                  key={`file-diff-card:${turnId}:${fileChange.path}`}
                  fileChange={fileChange}
                  parsedFile={parsedFile}
                  isLoading={isLoading && parsedFiles.length === 0}
                  defaultExpanded={defaultExpanded}
                  resolvedTheme={resolvedTheme}
                  onViewFullDiff={() => onOpenTurnDiff(turnId, fileChange.path)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  terminalContexts: ParsedTerminalContextEntry[];
}) {
  if (props.terminalContexts.length > 0) {
    const hasEmbeddedInlineLabels = textContainsInlineTerminalContextLabels(
      props.text,
      props.terminalContexts,
    );
    const inlinePrefix = buildInlineTerminalContextText(props.terminalContexts);
    const inlineNodes: ReactNode[] = [];

    if (hasEmbeddedInlineLabels) {
      let cursor = 0;

      for (const context of props.terminalContexts) {
        const label = formatInlineTerminalContextLabel(context.header);
        const matchIndex = props.text.indexOf(label, cursor);
        if (matchIndex === -1) {
          inlineNodes.length = 0;
          break;
        }
        if (matchIndex > cursor) {
          inlineNodes.push(
            <span key={`user-terminal-context-inline-before:${context.header}:${cursor}`}>
              {props.text.slice(cursor, matchIndex)}
            </span>,
          );
        }
        inlineNodes.push(
          <UserMessageTerminalContextInlineLabel
            key={`user-terminal-context-inline:${context.header}`}
            context={context}
          />,
        );
        cursor = matchIndex + label.length;
      }

      if (inlineNodes.length > 0) {
        if (cursor < props.text.length) {
          inlineNodes.push(
            <span key={`user-message-terminal-context-inline-rest:${cursor}`}>
              {props.text.slice(cursor)}
            </span>,
          );
        }

        return (
          <div className="wrap-anywhere whitespace-pre-wrap font-mono text-sm leading-normal text-foreground">
            {inlineNodes}
          </div>
        );
      }
    }

    for (const context of props.terminalContexts) {
      inlineNodes.push(
        <UserMessageTerminalContextInlineLabel
          key={`user-terminal-context-inline:${context.header}`}
          context={context}
        />,
      );
      inlineNodes.push(
        <span key={`user-terminal-context-inline-space:${context.header}`} aria-hidden="true">
          {" "}
        </span>,
      );
    }

    if (props.text.length > 0) {
      inlineNodes.push(<span key="user-message-terminal-context-inline-text">{props.text}</span>);
    } else if (inlinePrefix.length === 0) {
      return null;
    }

    return (
      <div className="wrap-anywhere whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {inlineNodes}
      </div>
    );
  }

  if (props.text.length === 0) {
    return null;
  }

  return (
    <div className="wrap-anywhere whitespace-pre-wrap font-mono text-xs leading-normal text-foreground">
      <UserMessageMarkdown text={props.text} />
    </div>
  );
});

/**
 * Light markdown renderer for user messages. Supports:
 * - **bold** text
 * - Unordered lists (lines starting with "- " or "* ")
 * - Ordered lists (lines starting with "1. ", "2. ", etc.)
 *
 * The AI receives the raw markdown, but the user sees formatted output.
 */
function renderInlineBoldSegments(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  // Match **text** patterns (non-greedy, no newlines inside)
  const boldPattern = /\*\*([^*\n]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    nodes.push(
      <strong key={`b-${match.index}`} className="font-semibold">
        {match[1]}
      </strong>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes.length > 0 ? nodes : [text];
}

const UserMessageMarkdown = memo(function UserMessageMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");

  // Group consecutive list lines into list blocks for proper rendering
  const elements: ReactNode[] = [];
  let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const Tag = listBuffer.type;
    elements.push(
      <Tag
        key={`list-${elements.length}`}
        className={cn(
          "my-0.5 space-y-0.5",
          listBuffer.type === "ul" ? "list-disc pl-5" : "list-decimal pl-5",
        )}
      >
        {listBuffer.items.map((item) => (
          <li key={item}>{renderInlineBoldSegments(item)}</li>
        ))}
      </Tag>,
    );
    listBuffer = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    // Unordered list: "- " or "* "
    const ulMatch = line.match(/^(\s*)([-*])\s(.*)$/);
    if (ulMatch) {
      if (listBuffer && listBuffer.type !== "ul") flushList();
      if (!listBuffer) listBuffer = { type: "ul", items: [] };
      listBuffer.items.push(ulMatch[3] ?? "");
      continue;
    }

    // Ordered list: "1. ", "2. ", etc.
    const olMatch = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (olMatch) {
      if (listBuffer && listBuffer.type !== "ol") flushList();
      if (!listBuffer) listBuffer = { type: "ol", items: [] };
      listBuffer.items.push(olMatch[3] ?? "");
      continue;
    }

    // Regular line — flush any pending list
    flushList();

    if (i > 0 && elements.length > 0) {
      elements.push("\n");
    }
    elements.push(<span key={`line-${i}`}>{renderInlineBoldSegments(line)}</span>);
  }

  flushList();

  return <>{elements}</>;
});
