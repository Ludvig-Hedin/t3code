import {
  type OrchestrationReadModel,
  type OrchestrationThread,
  type OrchestrationThreadActivity,
  type ThreadId,
} from "@t3tools/contracts";

export interface MobileThreadSummary {
  readonly threadId: ThreadId;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly subtitle: string;
  readonly latestMessageAt: string | null;
  readonly latestMessagePreview: string | null;
  readonly pendingApprovals: number;
  readonly updatedAt: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
}

function getLatestUserMessageAt(thread: OrchestrationThread): string | null {
  let latestUserMessageAt: string | null = null;
  for (const message of thread.messages) {
    if (message.role !== "user") continue;
    if (latestUserMessageAt === null || message.createdAt > latestUserMessageAt) {
      latestUserMessageAt = message.createdAt;
    }
  }
  return latestUserMessageAt;
}

function getLatestMessagePreview(thread: OrchestrationThread): string | null {
  const ordered = [...thread.messages].toSorted(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
  const latestMessage = ordered[ordered.length - 1];
  if (!latestMessage) {
    return null;
  }
  const collapsed = latestMessage.text.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return null;
  }
  return collapsed.length > 120 ? `${collapsed.slice(0, 117)}…` : collapsed;
}

function isStalePendingRequestFailureDetail(detail: string | undefined): boolean {
  const normalized = detail?.toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("stale pending approval request") ||
    normalized.includes("stale pending user-input request") ||
    normalized.includes("unknown pending approval request") ||
    normalized.includes("unknown pending permission request") ||
    normalized.includes("unknown pending user-input request")
  );
}

function requestKindFromRequestType(
  requestType: unknown,
): "command" | "file-read" | "file-change" | null {
  switch (requestType) {
    case "command_execution_approval":
    case "exec_command_approval":
      return "command";
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    default:
      return null;
  }
}

function countPendingApprovals(activities: ReadonlyArray<OrchestrationThreadActivity>): number {
  const openByRequestId = new Map<string, true>();
  const ordered = [...activities].toSorted((left, right) => {
    if (left.sequence !== undefined && right.sequence !== undefined) {
      if (left.sequence !== right.sequence) {
        return left.sequence - right.sequence;
      }
    } else if (left.sequence !== undefined) {
      return 1;
    } else if (right.sequence !== undefined) {
      return -1;
    }
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
  });

  for (const activity of ordered) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    const requestKind =
      payload &&
      (payload.requestKind === "command" ||
        payload.requestKind === "file-read" ||
        payload.requestKind === "file-change")
        ? payload.requestKind
        : requestKindFromRequestType(payload?.requestType);
    const detail = typeof payload?.detail === "string" ? payload.detail : undefined;

    if (activity.kind === "approval.requested" && requestId && requestKind) {
      openByRequestId.set(requestId, true);
      continue;
    }

    if (activity.kind === "approval.resolved" && requestId) {
      openByRequestId.delete(requestId);
      continue;
    }

    if (
      activity.kind === "provider.approval.respond.failed" &&
      requestId &&
      isStalePendingRequestFailureDetail(detail)
    ) {
      openByRequestId.delete(requestId);
    }
  }

  return openByRequestId.size;
}

function summarizeThread(thread: OrchestrationThread, projectTitle: string): MobileThreadSummary {
  const latestMessageAt = getLatestUserMessageAt(thread);
  const latestMessagePreview = getLatestMessagePreview(thread);
  const turnState = thread.latestTurn?.state ?? null;
  const sessionStatus = thread.session?.status ?? "idle";
  const pendingApprovals = countPendingApprovals(thread.activities);
  const statusLabel =
    pendingApprovals > 0
      ? pendingApprovals === 1
        ? "1 pending approval"
        : `${pendingApprovals} pending approvals`
      : turnState === "running"
        ? "Turn running"
        : sessionStatus === "starting"
          ? "Starting"
          : sessionStatus === "running"
            ? "Running"
            : sessionStatus === "interrupted"
              ? "Interrupted"
              : sessionStatus === "stopped"
                ? "Stopped"
                : sessionStatus === "error"
                  ? "Error"
                  : "Ready";

  const subtitleParts = [thread.branch, thread.worktreePath, projectTitle].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return {
    threadId: thread.id,
    projectId: thread.projectId,
    projectTitle,
    title: thread.title,
    statusLabel,
    subtitle: subtitleParts.join(" · "),
    latestMessageAt,
    latestMessagePreview,
    pendingApprovals,
    updatedAt: thread.updatedAt,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
  };
}

function compareThreadSummaries(left: MobileThreadSummary, right: MobileThreadSummary): number {
  const leftTimestamp = left.latestMessageAt ?? left.updatedAt;
  const rightTimestamp = right.latestMessageAt ?? right.updatedAt;
  return (
    rightTimestamp.localeCompare(leftTimestamp) || right.updatedAt.localeCompare(left.updatedAt)
  );
}

export function buildMobileThreadSummaries(
  snapshot: OrchestrationReadModel,
): MobileThreadSummary[] {
  const projectTitles = new Map(snapshot.projects.map((project) => [project.id, project.title]));
  return snapshot.threads
    .filter((thread) => thread.deletedAt === null)
    .map((thread) => summarizeThread(thread, projectTitles.get(thread.projectId) ?? "Project"))
    .toSorted(compareThreadSummaries);
}
