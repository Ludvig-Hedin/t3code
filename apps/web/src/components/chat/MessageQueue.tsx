/**
 * MessageQueue — renders queued messages above the composer when AI is working.
 *
 * Shows compact editable cards with delete and reorder controls.
 * Only renders when the queue is non-empty.
 */
import { memo, useCallback, useRef, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PencilIcon, XIcon } from "lucide-react";
import type { QueuedMessage } from "~/hooks/useMessageQueue";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface MessageQueueProps {
  queue: readonly QueuedMessage[];
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}

/** Single queued message card with inline edit support */
const QueuedMessageCard = memo(function QueuedMessageCard({
  message,
  index,
  total,
  onEdit,
  onRemove,
  onReorder,
}: {
  message: QueuedMessage;
  index: number;
  total: number;
  onEdit: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = useCallback(() => {
    setEditText(message.text);
    setIsEditing(true);
    // Focus the textarea after render
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
      className={cn(
        "group/card flex items-start gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2 transition-colors hover:bg-muted/40",
      )}
    >
      {/* Queue position indicator */}
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {index + 1}
      </span>

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
          isEditing ? "visible" : "invisible group-hover/card:visible",
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
            {/* Reorder buttons — only shown when multiple items */}
            {total > 1 && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === 0}
                        onClick={() => onReorder(message.id, "up")}
                        aria-label="Move up"
                      />
                    }
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Move up</TooltipPopup>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        disabled={index === total - 1}
                        onClick={() => onReorder(message.id, "down")}
                        aria-label="Move down"
                      />
                    }
                  >
                    <ArrowDownIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Move down</TooltipPopup>
                </Tooltip>
              </>
            )}
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
                    aria-label="Remove from queue"
                  />
                }
              >
                <XIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="top">Remove</TooltipPopup>
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
  onReorder,
}: MessageQueueProps) {
  if (queue.length === 0) return null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[52rem] px-1">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span className="text-xs font-medium text-muted-foreground">
          Queued {queue.length === 1 ? "message" : `messages (${queue.length})`}
        </span>
        <span className="text-[10px] text-muted-foreground/60">Will send when AI is ready</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {queue.map((msg, i) => (
          <QueuedMessageCard
            key={msg.id}
            message={msg}
            index={i}
            total={queue.length}
            onEdit={onEdit}
            onRemove={onRemove}
            onReorder={onReorder}
          />
        ))}
      </div>
    </div>
  );
});
