/**
 * MessageQueue — renders queued messages above the composer when AI is working.
 *
 * Single box with all messages, drag handles when there are multiple items, and a send-now button.
 * Only renders when the queue is non-empty.
 */
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { CheckIcon, GripVerticalIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueuedMessage } from "~/hooks/useMessageQueue";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface MessageQueueProps {
  queue: readonly QueuedMessage[];
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onSendNow?: () => void;
  sendNowShortcutLabel?: string;
}

/** Single queued message row with inline edit and drag handle */
const SortableQueuedMessageRow = memo(function SortableQueuedMessageRow({
  message,
  canReorder,
  onEdit,
  onRemove,
}: {
  message: QueuedMessage;
  canReorder: boolean;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // dnd-kit sortable hook for drag handle
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: message.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const startEditing = useCallback(() => {
    setEditText(message.text);
    setIsEditing(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  }, [message.text]);

  const confirmEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed.length > 0) {
      onEdit(message.id, trimmed);
    }
    setIsEditing(false);
  }, [editText, message.id, onEdit]);

  const cancelEdit = useCallback(() => {
    setEditText(message.text);
    setIsEditing(false);
  }, [message.text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [confirmEdit, cancelEdit],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/row flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-muted/20",
      )}
    >
      {canReorder ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="Drag to reorder"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md cursor-grab text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing touch-none"
              >
                <GripVerticalIcon className="size-3.5" />
              </button>
            }
          >
            <TooltipPopup side="top">Drag to reorder</TooltipPopup>
          </TooltipTrigger>
        </Tooltip>
      ) : null}

      {/* Message content / edit textarea */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 text-sm leading-relaxed outline-none focus:border-border/80"
            rows={Math.min(editText.split("\n").length, 5)}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {message.text.length > 300 ? `${message.text.slice(0, 300)}...` : message.text}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5",
          isEditing ? "visible" : "invisible group-hover/row:visible",
        )}
      >
        {isEditing ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={confirmEdit}
                    aria-label="Confirm edit"
                  />
                }
              >
                <CheckIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Save (Enter)</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={cancelEdit}
                    aria-label="Cancel edit"
                  />
                }
              >
                <XIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Cancel (Esc)</TooltipPopup>
            </Tooltip>
          </>
        ) : (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={startEditing}
                    aria-label="Edit message"
                  />
                }
              >
                <PencilIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Edit</TooltipPopup>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(message.id)}
                    aria-label="Delete from queue"
                  />
                }
              >
                <Trash2Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Delete</TooltipPopup>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
});

export const MessageQueue = memo(function MessageQueue({
  queue,
  onEdit,
  onRemove,
  onMove,
  onSendNow,
  sendNowShortcutLabel,
}: MessageQueueProps) {
  // dnd-kit setup — must run before any early return (Rules of Hooks)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const messageIds = useMemo(() => queue.map((msg) => msg.id), [queue]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (queue.length === 0) return null;

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingId(null);

    if (!over || active.id === over.id) return;

    const activeIndex = messageIds.indexOf(active.id as string);
    const overIndex = messageIds.indexOf(over.id as string);

    if (activeIndex === -1 || overIndex === -1) return;
    onMove(String(active.id), overIndex);
  };

  const sendNowTooltipLabel = sendNowShortcutLabel
    ? `Send now (${sendNowShortcutLabel})`
    : "Send now";

  return (
    <div className="mx-auto w-full min-w-0 max-w-[52rem] px-1">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {queue.length === 1 ? "Queued message" : `Queued messages (${queue.length})`}
          </span>
          <span className="text-[10px] text-muted-foreground/60">Will send when AI is ready</span>
        </div>
        {onSendNow && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="xs"
                  onClick={onSendNow}
                  className="text-xs"
                  aria-label="Send now"
                  title={sendNowTooltipLabel}
                >
                  Send now
                </Button>
              }
            >
              <TooltipPopup side="top">{sendNowTooltipLabel}</TooltipPopup>
            </TooltipTrigger>
          </Tooltip>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={messageIds} strategy={verticalListSortingStrategy}>
          <div
            className={cn(
              "overflow-hidden rounded-2xl border border-border/60 bg-card/30",
              draggingId ? "shadow-sm" : "shadow-xs/5",
            )}
          >
            {queue.map((msg) => (
              <SortableQueuedMessageRow
                key={msg.id}
                message={msg}
                canReorder={queue.length > 1}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
});
