import { ProjectId, ThreadId, type TurnId } from "@t3tools/contracts";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import type { Thread } from "../types";

const PROJECT_ID = ProjectId.makeUnsafe("project-1");
const DRAFT_THREAD_ID = ThreadId.makeUnsafe("thread-draft-browser-test");
const PROJECT_THREAD_ID = ThreadId.makeUnsafe("thread-project-diff-browser-test");
const PROJECT_TURN_ID = "turn-project-diff-browser-test" as TurnId;

const navigateSpy = vi.hoisted(() => vi.fn());

const projectThread = {
  id: PROJECT_THREAD_ID,
  projectId: PROJECT_ID,
  title: "Diff thread",
  createdAt: "2026-03-04T12:00:00.000Z",
  updatedAt: "2026-03-04T12:00:01.000Z",
  turnDiffSummaries: [
    {
      turnId: PROJECT_TURN_ID,
      completedAt: "2026-03-04T12:00:01.000Z",
      status: "ready",
      checkpointTurnCount: 1,
      checkpointRef: "checkpoint-project-diff-browser-test",
      assistantMessageId: null,
      files: [
        {
          path: "apps/web/src/components/DiffPanel.tsx",
          kind: "M",
          additions: 12,
          deletions: 4,
        },
        {
          path: "apps/web/src/components/ChatView.tsx",
          kind: "M",
          additions: 2,
          deletions: 1,
        },
      ],
    },
  ],
} as unknown as Thread;

const storeState = {
  projects: [
    {
      id: PROJECT_ID,
      name: "Project",
      cwd: "/repo/project",
    },
  ],
  threads: [projectThread],
};

const draftStoreState = {
  draftThreadsByThreadId: {
    [DRAFT_THREAD_ID]: {
      projectId: PROJECT_ID,
    },
  },
};

vi.mock("@tanstack/react-router", () => ({
  useNavigate: vi.fn(() => navigateSpy),
  useParams: vi.fn((options?: { select?: (params: { threadId?: string }) => unknown }) =>
    options?.select ? options.select({ threadId: DRAFT_THREAD_ID }) : { threadId: DRAFT_THREAD_ID },
  ),
  useSearch: vi.fn((options?: { select?: (search: { diff?: string }) => unknown }) =>
    options?.select ? options.select({ diff: "1" }) : { diff: "1" },
  ),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQuery: vi.fn((options: { queryKey?: string[] }) => {
      if (options.queryKey?.[0] === "git-status") {
        return {
          data: {
            isRepo: true,
          },
          error: null,
          isError: false,
          isFetching: false,
          isLoading: false,
        };
      }

      return {
        data: null,
        error: null,
        isError: false,
        isFetching: false,
        isLoading: false,
      };
    }),
  };
});

vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: (selector: (state: typeof draftStoreState) => unknown) =>
    selector(draftStoreState),
}));

vi.mock("../hooks/useSettings", () => ({
  useSettings: vi.fn(() => ({
    diffWordWrap: false,
    timestampFormat: "locale",
  })),
}));

vi.mock("../hooks/useTheme", () => ({
  useTheme: vi.fn(() => ({
    resolvedTheme: "light",
  })),
}));

vi.mock("../lib/gitReactQuery", () => ({
  gitStatusQueryOptions: vi.fn(() => ({ queryKey: ["git-status"] })),
}));

vi.mock("../lib/providerReactQuery", () => ({
  checkpointDiffQueryOptions: vi.fn(() => ({ queryKey: ["checkpoint-diff"] })),
}));

vi.mock("../store", () => ({
  useStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}));

import DiffPanel from "./DiffPanel";

describe("DiffPanel", () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("shows project diffs on a new-thread route", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const screen = await render(<DiffPanel mode="inline" />, { container: host });

    try {
      await expect.element(page.getByText("Project diffs")).toBeInTheDocument();
      await expect.element(page.getByText("Project", { exact: true })).toBeInTheDocument();
      await expect.element(page.getByText("Diff thread")).toBeInTheDocument();
      await expect
        .element(page.getByText("apps/web/src/components/DiffPanel.tsx"))
        .toBeInTheDocument();
      await expect
        .element(page.getByText("Select a thread to inspect turn diffs."))
        .not.toBeInTheDocument();
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});
