import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageQueue } from "./MessageQueue";

describe("MessageQueue", () => {
  it("renders a singular header without a numeric badge", () => {
    const markup = renderToStaticMarkup(
      <MessageQueue
        queue={[{ id: "a", text: "hello world", createdAt: 1 }]}
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onSendNow={() => {}}
        sendNowShortcutLabel="⌘⇧↵"
      />,
    );

    expect(markup).toContain("Queued message");
    expect(markup).not.toContain("Queued messages (1)");
    expect(markup).toContain("Send now");
    expect(markup).toContain("⌘⇧↵");
    expect(markup).not.toContain("Drag to reorder");
    expect(markup).toContain("Delete");
  });

  it("renders a plural header for multiple queued messages", () => {
    const markup = renderToStaticMarkup(
      <MessageQueue
        queue={[
          { id: "a", text: "first", createdAt: 1 },
          { id: "b", text: "second", createdAt: 2 },
        ]}
        onEdit={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
        onSendNow={() => {}}
        sendNowShortcutLabel="⌘⇧↵"
      />,
    );

    expect(markup).toContain("Queued messages (2)");
    expect(markup).toContain("Send now");
  });
});
