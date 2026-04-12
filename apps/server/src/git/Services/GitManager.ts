/**
 * GitManager - Effect service contract for stacked Git workflows.
 *
 * Orchestrates status inspection and commit/push/PR flows by composing
 * lower-level Git and external tool services.
 *
 * @module GitManager
 */
import {
  GitActionProgressEvent,
  GitGetWorkingDiffInput,
  GitGetWorkingDiffResult,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  GitPrepareReviewContextInput,
  GitPrepareReviewContextResult,
  GitPullRequestRefInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  GitRunStackedActionResult,
  GitStatusInput,
  GitStatusResult,
} from "@t3tools/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";
import type { GitManagerServiceError } from "@t3tools/contracts";

export interface GitActionProgressReporter {
  readonly publish: (event: GitActionProgressEvent) => Effect.Effect<void, never>;
}

export interface GitRunStackedActionOptions {
  readonly actionId?: string;
  readonly progressReporter?: GitActionProgressReporter;
}

/**
 * GitManagerShape - Service API for high-level Git workflow actions.
 */
export interface GitManagerShape {
  /**
   * Read current repository Git status plus open PR metadata when available.
   */
  readonly status: (
    input: GitStatusInput,
  ) => Effect.Effect<GitStatusResult, GitManagerServiceError>;

  /**
   * Resolve a pull request by URL/number against the current repository.
   */
  readonly resolvePullRequest: (
    input: GitPullRequestRefInput,
  ) => Effect.Effect<GitResolvePullRequestResult, GitManagerServiceError>;

  /**
   * Prepare a new thread workspace from a pull request in local or worktree mode.
   */
  readonly preparePullRequestThread: (
    input: GitPreparePullRequestThreadInput,
  ) => Effect.Effect<GitPreparePullRequestThreadResult, GitManagerServiceError>;

  /**
   * Run a Git action (`commit`, `push`, `create_pr`, `commit_push`, `commit_push_pr`).
   * When `featureBranch` is set, creates and checks out a feature branch first.
   */
  readonly runStackedAction: (
    input: GitRunStackedActionInput,
    options?: GitRunStackedActionOptions,
  ) => Effect.Effect<GitRunStackedActionResult, GitManagerServiceError>;

  /**
   * Fetch the git diff context (commits, stat, patch) for use in a code review prompt.
   * When baseBranch is omitted, the server resolves the default branch automatically.
   */
  readonly prepareReviewContext: (
    input: GitPrepareReviewContextInput,
  ) => Effect.Effect<GitPrepareReviewContextResult, GitManagerServiceError>;

  /**
   * Fetch the raw working-tree diff patch (staged + unstaged vs HEAD).
   * Matches the insertion/deletion counts shown in the diff button.
   */
  readonly getWorkingDiff: (
    input: GitGetWorkingDiffInput,
  ) => Effect.Effect<GitGetWorkingDiffResult, GitManagerServiceError>;
}

/**
 * GitManager - Service tag for stacked Git workflow orchestration.
 */
export class GitManager extends ServiceMap.Service<GitManager, GitManagerShape>()(
  "t3/git/Services/GitManager",
) {}
