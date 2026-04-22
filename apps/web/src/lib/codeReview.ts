/**
 * Shared utilities for the code review system.
 *
 * Extracted here so both CodeReviewControl (manual trigger) and
 * GitActionsControl (auto-review on push) can share the same prompt logic.
 */
import type { CodeReviewFixMode, GitPrepareReviewContextResult } from "@t3tools/contracts";

/**
 * Returns true when the review context contains no reviewable content —
 * i.e. there are no commits and no diff between the base branch and HEAD.
 * Callers can use this to skip dispatching a review turn entirely.
 */
export function isDiffEmpty(ctx: GitPrepareReviewContextResult): boolean {
  return !ctx.commitSummary?.trim() && !ctx.diffSummary?.trim() && !ctx.diffPatch?.trim();
}

/**
 * Build a code review prompt to embed in a `thread.turn.start` message.
 *
 * When the diff is empty (no commits, no changes ahead of the base branch)
 * we return a prompt that makes this explicit so the agent doesn't receive a
 * confusing "review this diff" instruction with blank content.
 *
 * - review-only / auto-fix: instructs the agent to LIST findings only, no file edits
 * - agent-decides: instructs the agent to review AND fix in a single turn
 */
export function buildCodeReviewPrompt(
  ctx: GitPrepareReviewContextResult,
  fixMode: CodeReviewFixMode,
): string {
  // ── Empty-diff fallback ──────────────────────────────────────────────
  // When there are no commits or changes ahead of the base branch (e.g. the
  // user triggered review before any local commits existed, or the diff
  // resolution failed), send a clearly-worded message instead of the
  // confusing "review this diff" header with all-empty sections.
  if (isDiffEmpty(ctx)) {
    return [
      "A pre-push code review was requested, but there are no commits or file changes",
      `ahead of the base branch (${ctx.baseBranch || "main"}) to review.`,
      "",
      "Nothing needs to be reviewed right now. You can let the user know that",
      "the push will proceed without changes.",
    ].join("\n");
  }

  const header =
    fixMode === "agent-decides"
      ? [
          "You are performing a pre-push code review. Review the diff below for bugs,",
          "security issues, and code quality problems.",
          "For each issue found, fix it immediately using your tools.",
          "Summarize every change you made at the end.",
        ].join(" ")
      : [
          "You are performing a pre-push code review. Review the diff below for bugs,",
          "security issues, and code quality problems.",
          "List each finding as a numbered item with: file path, line reference,",
          "severity (critical / major / minor), and a concise explanation.",
          "Do NOT modify any files in this turn.",
        ].join(" ");

  return [
    header,
    "",
    `Base branch: ${ctx.baseBranch || "main"}`,
    "",
    "Commits ahead of base branch:",
    ctx.commitSummary || "(none)",
    "",
    "Diff stat:",
    ctx.diffSummary || "(no changes)",
    "",
    "Diff patch:",
    ctx.diffPatch || "(no patch)",
  ].join("\n");
}

/** The runtimeMode to use for a given fix mode. */
export function runtimeModeForFixMode(
  fixMode: CodeReviewFixMode,
): "approval-required" | "full-access" {
  // agent-decides needs full tool access to fix files during the review turn;
  // review-only and auto-fix should not touch files during the review step.
  return fixMode === "agent-decides" ? "full-access" : "approval-required";
}
