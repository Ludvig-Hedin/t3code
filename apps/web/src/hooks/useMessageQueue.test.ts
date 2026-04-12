import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import {
  dequeueQueuedMessage,
  getMessageQueueStorageKey,
  moveQueuedMessage,
  removeQueuedMessage,
} from "./useMessageQueue";

describe("useMessageQueue helpers", () => {
  it("scopes queue storage per thread", () => {
    expect(getMessageQueueStorageKey(ThreadId.makeUnsafe("thread-a"))).toBe(
      "t3code:message-queue:v1:thread-a",
    );
    expect(getMessageQueueStorageKey(ThreadId.makeUnsafe("thread-b"))).toBe(
      "t3code:message-queue:v1:thread-b",
    );
  });

  it("dequeues the first queued message and preserves the rest", () => {
    const queue = [
      { id: "a", text: "first", createdAt: 1 },
      { id: "b", text: "second", createdAt: 2 },
    ];

    expect(dequeueQueuedMessage(queue)).toEqual({
      nextQueue: [{ id: "b", text: "second", createdAt: 2 }],
      text: "first",
    });
  });

  it("moves queued messages to a target position", () => {
    const queue = [
      { id: "a", text: "first", createdAt: 1 },
      { id: "b", text: "second", createdAt: 2 },
      { id: "c", text: "third", createdAt: 3 },
    ];

    expect(moveQueuedMessage(queue, "c", 0).map((msg) => msg.id)).toEqual(["c", "a", "b"]);
    expect(moveQueuedMessage(queue, "a", 2).map((msg) => msg.id)).toEqual(["b", "c", "a"]);
  });

  it("removes queued messages by id", () => {
    const queue = [
      { id: "a", text: "first", createdAt: 1 },
      { id: "b", text: "second", createdAt: 2 },
    ];

    expect(removeQueuedMessage(queue, "a")).toEqual([{ id: "b", text: "second", createdAt: 2 }]);
  });
});
