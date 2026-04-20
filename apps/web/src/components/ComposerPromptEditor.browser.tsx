import "../index.css";

import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";

import { ComposerPromptEditor } from "./ComposerPromptEditor";

function ComposerPromptEditorHarness(props: { initialValue?: string }) {
  const [value, setValue] = useState(props.initialValue ?? "");
  const [cursor, setCursor] = useState((props.initialValue ?? "").length);

  return (
    <div className="w-[480px]">
      <ComposerPromptEditor
        value={value}
        cursor={cursor}
        terminalContexts={[]}
        disabled={false}
        placeholder="Message"
        className="min-h-17.5"
        onRemoveTerminalContext={() => {}}
        onChange={(nextValue, nextCursor) => {
          setValue(nextValue);
          setCursor(nextCursor);
        }}
        onPaste={() => {}}
      />
      <div data-testid="composer-value">{value}</div>
    </div>
  );
}

async function mountComposer(initialValue = "") {
  const host = document.createElement("div");
  document.body.append(host);
  const screen = await render(<ComposerPromptEditorHarness initialValue={initialValue} />, {
    container: host,
  });

  const cleanup = async () => {
    await screen.unmount();
    host.remove();
  };

  return {
    [Symbol.asyncDispose]: cleanup,
    cleanup,
  };
}

describe("ComposerPromptEditor", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("converts a bullet shortcut into a real unordered list", async () => {
    await using _ = await mountComposer();

    await page.getByTestId("composer-editor").fill("-");
    document
      .querySelector<HTMLElement>('[data-testid="composer-editor"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Space",
          key: " ",
        }),
      );

    await vi.waitFor(() => {
      const editor = document.querySelector<HTMLElement>('[data-testid="composer-editor"]');
      expect(editor?.querySelector("ul")).not.toBeNull();
      expect(editor?.querySelector("li")).not.toBeNull();
      expect(document.querySelector('[data-testid="composer-value"]')?.textContent).toBe("- ");
    });
  });

  it("converts a numbered shortcut into a real ordered list", async () => {
    await using _ = await mountComposer();

    await page.getByTestId("composer-editor").fill("1.");
    document
      .querySelector<HTMLElement>('[data-testid="composer-editor"]')
      ?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: "Space",
          key: " ",
        }),
      );

    await vi.waitFor(() => {
      const editor = document.querySelector<HTMLElement>('[data-testid="composer-editor"]');
      expect(editor?.querySelector("ol")).not.toBeNull();
      expect(editor?.querySelector("li")).not.toBeNull();
      expect(document.querySelector('[data-testid="composer-value"]')?.textContent).toBe("1. ");
    });
  });
});
