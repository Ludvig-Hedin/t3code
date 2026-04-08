import { type NativeApi, type ThreadId } from "@t3tools/contracts";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const THREAD_ID = "thread-review-test" as ThreadId;
const GIT_CWD = "/repo/project";

const { dispatchCommandSpy, prepareReviewContextSpy } = vi.hoisted(() => ({
  dispatchCommandSpy: vi.fn(() => Promise.resolve()),
  prepareReviewContextSpy: vi.fn(() =>
    Promise.resolve({
      baseBranch: "main",
      commitSummary: "abc123 Fix issue",
      diffSummary: "1 file changed",
      diffPatch: "diff --git a/src/example.ts b/src/example.ts",
    }),
  ),
}));

vi.mock("~/hooks/useSettings", () => ({
  useSettings: vi.fn(() => ({
    codeReview: {
      fixMode: "review-only",
      autoReviewOnPush: false,
    },
  })),
}));

vi.mock("~/nativeApi", () => ({
  ensureNativeApi: vi.fn(
    () =>
      ({
        git: {
          prepareReviewContext: prepareReviewContextSpy,
        },
        orchestration: {
          dispatchCommand: dispatchCommandSpy,
        },
      }) as unknown as NativeApi,
  ),
}));

vi.mock("~/store", () => ({
  useStore: (selector: (state: unknown) => unknown) =>
    selector({
      threads: [{ id: THREAD_ID, latestTurn: null }],
    }),
}));

import { CodeReviewControl } from "./CodeReviewControl";

describe("CodeReviewControl", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("opens the review popover and dispatches a review turn", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const screen = await render(
      <CodeReviewControl
        gitCwd={GIT_CWD}
        activeThreadId={THREAD_ID as ThreadId}
        isGitRepo={true}
      />,
      { container: host },
    );

    try {
      const reviewButton = page.getByRole("button", { name: "Run code review" });
      await reviewButton.click();

      await expect.element(page.getByText("Code Review")).toBeInTheDocument();
      await expect.element(page.getByText("Fix mode")).toBeInTheDocument();

      const runButton = page.getByRole("button", { name: "Run Review" });
      await runButton.click();

      expect(prepareReviewContextSpy).toHaveBeenCalledWith({ cwd: GIT_CWD });
      expect(dispatchCommandSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "thread.turn.start",
          threadId: THREAD_ID,
          runtimeMode: "approval-required",
        }),
      );
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});
