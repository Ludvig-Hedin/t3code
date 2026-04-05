/**
 * Shared utilities for the code review system.
 *
 * Extracted here so both CodeReviewControl (manual trigger) and
 * GitActionsControl (auto-review on push) can share the same prompt logic.
 */
import type { CodeReviewFixMode, GitPrepareReviewContextResult } from "@t3tools/contracts";

/**
 * Build a code review prompt to embed in a `thread.turn.start` message.
 *
 * - review-only / auto-fix: instructs the agent to LIST findings only, no file edits
 * - agent-decides: instructs the agent to review AND fix in a single turn
 */
export function buildCodeReviewPrompt(
  ctx: GitPrepareReviewContextResult,
  fixMode: CodeReviewFixMode,
): string {
  const header =
    fixMode === "agent-decides"
      ? "Review this diff for bugs, security issues, and code quality. For each issue found, fix it immediately using your tools. Summarize what you changed at the end."
      : "Review this diff for bugs, security issues, and code quality. List each finding as a numbered item with: file path, line reference, severity (critical/major/minor), and a concise explanation. Do NOT modify any files in this turn.";

  return [
    header,
    "",
    `Base branch: ${ctx.baseBranch}`,
    "",
    "Commits:",
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
