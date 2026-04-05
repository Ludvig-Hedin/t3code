/**
 * Message queue hook for queuing user messages while the AI is working.
 *
 * Uses useReducer for predictable state transitions. Queued messages can be
 * edited, deleted, and reordered before they are auto-sent.
 */
import { useCallback, useReducer } from "react";

export interface QueuedMessage {
  readonly id: string;
  readonly text: string;
  readonly createdAt: number;
}

type QueueAction =
  | { type: "enqueue"; text: string }
  | { type: "dequeue" }
  | { type: "edit"; id: string; text: string }
  | { type: "remove"; id: string }
  | { type: "reorder"; id: string; direction: "up" | "down" }
  | { type: "clear" };

function queueReducer(state: QueuedMessage[], action: QueueAction): QueuedMessage[] {
  switch (action.type) {
    case "enqueue":
      return [
        ...state,
        {
          id: crypto.randomUUID(),
          text: action.text,
          createdAt: Date.now(),
        },
      ];

    case "dequeue":
      return state.slice(1);

    case "edit":
      return state.map((msg) => (msg.id === action.id ? { ...msg, text: action.text } : msg));

    case "remove":
      return state.filter((msg) => msg.id !== action.id);

    case "reorder": {
      const idx = state.findIndex((msg) => msg.id === action.id);
      if (idx === -1) return state;
      const targetIdx = action.direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= state.length) return state;
      const next = [...state];
      // Swap adjacent items
      [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
      return next;
    }

    case "clear":
      return [];

    default:
      return state;
  }
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
  /** Move a queued message up or down */
  reorder: (id: string, direction: "up" | "down") => void;
  /** Clear all queued messages */
  clear: () => void;
}

export function useMessageQueue(): MessageQueueApi {
  const [queue, dispatch] = useReducer(queueReducer, []);

  const enqueue = useCallback((text: string) => {
    dispatch({ type: "enqueue", text });
  }, []);

  const dequeue = useCallback((): string | null => {
    if (queue.length === 0) return null;
    const first = queue[0]!;
    dispatch({ type: "dequeue" });
    return first.text;
  }, [queue]);

  const edit = useCallback((id: string, text: string) => {
    dispatch({ type: "edit", id, text });
  }, []);

  const remove = useCallback((id: string) => {
    dispatch({ type: "remove", id });
  }, []);

  const reorder = useCallback((id: string, direction: "up" | "down") => {
    dispatch({ type: "reorder", id, direction });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  return { queue, enqueue, dequeue, edit, remove, reorder, clear };
}
