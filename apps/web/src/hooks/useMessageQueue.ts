/**
 * Message queue hook for queuing user messages while the AI is working.
 *
 * Queues are scoped per thread and persisted in local storage so they stay
 * attached to the chat they were created in, even if the route stays mounted
 * while thread params change.
 */
import * as Schema from "effect/Schema";
import { useCallback, useRef } from "react";
import { type ThreadId } from "@t3tools/contracts";
import { useLocalStorage } from "./useLocalStorage";

export interface QueuedMessage {
  readonly id: string;
  readonly text: string;
  readonly createdAt: number;
}

export const QueuedMessageSchema = Schema.Struct({
  createdAt: Schema.Number,
  id: Schema.String,
  text: Schema.String,
});

export const QueuedMessageListSchema = Schema.Array(QueuedMessageSchema);

const MESSAGE_QUEUE_STORAGE_PREFIX = "t3code:message-queue:v1";

export function getMessageQueueStorageKey(threadId: ThreadId): string {
  return `${MESSAGE_QUEUE_STORAGE_PREFIX}:${threadId}`;
}

export function enqueueQueuedMessage(
  queue: readonly QueuedMessage[],
  text: string,
): QueuedMessage[] {
  return [
    ...queue,
    {
      id: crypto.randomUUID(),
      text,
      createdAt: Date.now(),
    },
  ];
}

export function dequeueQueuedMessage(queue: readonly QueuedMessage[]): {
  readonly nextQueue: QueuedMessage[];
  readonly text: string | null;
} {
  if (queue.length === 0) {
    return { nextQueue: [], text: null };
  }

  return {
    nextQueue: queue.slice(1),
    text: queue[0]!.text,
  };
}

export function editQueuedMessage(
  queue: readonly QueuedMessage[],
  id: string,
  text: string,
): QueuedMessage[] {
  return queue.map((msg) => (msg.id === id ? { ...msg, text } : msg));
}

export function removeQueuedMessage(queue: readonly QueuedMessage[], id: string): QueuedMessage[] {
  return queue.filter((msg) => msg.id !== id);
}

export function moveQueuedMessage(
  queue: readonly QueuedMessage[],
  id: string,
  toIndex: number,
): QueuedMessage[] {
  const fromIndex = queue.findIndex((msg) => msg.id === id);
  if (fromIndex === -1) return [...queue];

  const clampedToIndex = Math.max(0, Math.min(toIndex, queue.length - 1));
  if (fromIndex === clampedToIndex) return [...queue];

  const next = [...queue];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return [...queue];
  next.splice(clampedToIndex, 0, item);
  return next;
}

export function clearQueuedMessages(): QueuedMessage[] {
  return [];
}

export interface MessageQueueApi {
  /** All queued messages in send order */
  readonly queue: readonly QueuedMessage[];
  /** Add a message to the end of the queue */
  enqueue: (text: string) => void;
  /** Remove and return the first message (returns its text, or null if empty) */
  dequeue: () => string | null;
  /** Edit the text of a queued message by id */
  edit: (id: string, text: string) => void;
  /** Remove a queued message by id */
  remove: (id: string) => void;
  /** Move a queued message to a new index */
  move: (id: string, toIndex: number) => void;
  /** Clear all queued messages */
  clear: () => void;
}

export function useMessageQueue(threadId: ThreadId): MessageQueueApi {
  const [queue, setQueue] = useLocalStorage(
    getMessageQueueStorageKey(threadId),
    [] as QueuedMessage[],
    QueuedMessageListSchema,
  );

  const lastDequeuedTextRef = useRef<string | null>(null);

  const enqueue = useCallback(
    (text: string) => {
      setQueue((current) => enqueueQueuedMessage(current, text));
    },
    [setQueue],
  );

  const dequeue = useCallback((): string | null => {
    lastDequeuedTextRef.current = null;
    setQueue((current) => {
      const { nextQueue, text } = dequeueQueuedMessage(current);
      lastDequeuedTextRef.current = text;
      return nextQueue;
    });
    return lastDequeuedTextRef.current;
  }, [setQueue]);

  const edit = useCallback(
    (id: string, text: string) => {
      setQueue((current) => editQueuedMessage(current, id, text));
    },
    [setQueue],
  );

  const remove = useCallback(
    (id: string) => {
      setQueue((current) => removeQueuedMessage(current, id));
    },
    [setQueue],
  );

  const move = useCallback(
    (id: string, toIndex: number) => {
      setQueue((current) => moveQueuedMessage(current, id, toIndex));
    },
    [setQueue],
  );

  const clear = useCallback(() => {
    setQueue(clearQueuedMessages());
  }, [setQueue]);

  return { queue, enqueue, dequeue, edit, remove, move, clear };
}
