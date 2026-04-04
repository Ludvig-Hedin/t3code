import { describe, expect, it } from "vitest";
import { type OrchestrationReadModel } from "@t3tools/contracts";

import { buildMobileThreadSummaries } from "./orchestrationMobile";

const now = "2026-04-04T12:00:00.000Z";

const snapshot: OrchestrationReadModel = {
  snapshotSequence: 42,
  updatedAt: now,
  projects: [
    {
      id: "project-1" as never,
      title: "Project One",
      workspaceRoot: "/tmp/project-one",
      defaultModelSelection: null,
      scripts: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  ],
  threads: [
    {
      id: "thread-1" as never,
      projectId: "project-1" as never,
      title: "Build mobile app",
      modelSelection: {
        provider: "codex",
        model: "gpt-5-codex",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "feature/mobile",
      worktreePath: "/tmp/project-one",
      latestTurn: {
        turnId: "turn-1" as never,
        state: "running",
        requestedAt: now,
        startedAt: now,
        completedAt: null,
        assistantMessageId: null,
      },
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      deletedAt: null,
      messages: [
        {
          id: "message-1" as never,
          role: "user",
          text: "Ship the mobile companion.",
          turnId: null,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "message-2" as never,
          role: "assistant",
          text: "Working on it.",
          turnId: "turn-1" as never,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      proposedPlans: [],
      activities: [
        {
          id: "activity-1" as never,
          tone: "approval",
          kind: "approval.requested",
          summary: "Command approval requested",
          payload: {
            requestId: "approval-1",
            requestKind: "command",
            detail: "Approve command execution",
          },
          turnId: null,
          createdAt: now,
        },
      ],
      checkpoints: [],
      session: {
        threadId: "thread-1" as never,
        status: "running",
        providerName: "Codex",
        runtimeMode: "full-access",
        activeTurnId: "turn-1" as never,
        lastError: null,
        updatedAt: now,
      },
    },
    {
      id: "thread-2" as never,
      projectId: "project-1" as never,
      title: "Read-only review",
      modelSelection: {
        provider: "codex",
        model: "gpt-5-codex",
      },
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: now,
      updatedAt: "2026-04-03T09:00:00.000Z",
      archivedAt: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
};

describe("buildMobileThreadSummaries", () => {
  it("sorts by recency and surfaces thread status hints", () => {
    const summaries = buildMobileThreadSummaries(snapshot);
    expect(summaries).toHaveLength(2);
    expect(summaries[0]?.threadId).toBe("thread-1");
    expect(summaries[0]?.statusLabel).toBe("1 pending approval");
    expect(summaries[0]?.latestMessagePreview).toBe("Working on it.");
    expect(summaries[1]?.threadId).toBe("thread-2");
    expect(summaries[1]?.statusLabel).toBe("Ready");
  });
});
