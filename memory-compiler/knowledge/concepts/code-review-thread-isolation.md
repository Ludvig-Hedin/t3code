---
title: "Code Review Thread Isolation: Fresh Threads Over Session Reuse"
aliases: [review-thread-isolation, new-thread-per-review, stale-session-avoidance]
tags: [architecture, chat-ui, code-review, reliability]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Code Review Thread Isolation: Fresh Threads Over Session Reuse

Dispatching AI-powered code reviews to an existing active chat session is fragile — stale, interrupted, or errored sessions cause "session not found" errors and confusing UX. The reliable pattern is to create a new, dedicated thread for each code review (both auto-triggered and manual), inheriting model/branch/project metadata from the active thread but operating in isolation. This ensures the review always has a clean session and its output doesn't pollute the user's ongoing conversation.

## Key Points

- **Active sessions can be stale** — interrupted, errored, or timed-out sessions still appear as `activeThreadId` but reject new turns with "No conversation found"
- **New thread per review eliminates the class of bugs** — `bootstrap.createThread()` with specific config always succeeds; no dependence on existing session state
- **Empty diffs should skip review entirely** — sending "Review this diff" with no content produces confusing AI responses; check before dispatch
- **Surface errors clearly** — toast for auto-review failures, inline red text for manual review failures; never silently swallow and proceed with push
- **Inherit metadata, not session** — new review threads copy model, branch, and project from the active thread but don't share its session

## Details

### The Problem: Reusing `activeThreadId`

The original code review implementation dispatched a `thread.turn.start` message to `activeThreadId`:

```typescript
// ❌ BROKEN: Dispatches to potentially stale session
async function runCodeReview(diff: string) {
  const threadId = getActiveThreadId();
  try {
    await dispatch({ type: "thread.turn.start", threadId, message: formatReview(diff) });
  } catch (e) {
    // Silently falls through to push
    console.error(e);
  }
  await gitPush(); // Pushes even when review failed
}
```

Failure modes:

1. **Stale session** — user closed the thread's underlying session; `threadId` points to nothing
2. **Interrupted session** — prior turn was force-stopped; session is in error state
3. **Race condition** — user switched threads between review trigger and dispatch
4. **Silent failure** — `catch` block logs but proceeds with push, so user gets no review feedback

### The Fix: Dedicated Review Threads

```typescript
// ✅ CORRECT: Create fresh thread for each review
async function runCodeReview(diff: string) {
  // Guard: skip empty diffs
  if (!diff || diff.trim().length === 0) {
    showInfoToast("No changes to review");
    return;
  }

  // Create isolated review thread
  const reviewThread = await bootstrap.createThread({
    model: activeThread.model,
    branch: activeThread.branch,
    projectId: activeThread.projectId,
    title: "Code Review",
  });

  try {
    await dispatch({
      type: "thread.turn.start",
      threadId: reviewThread.id,
      message: formatReviewPrompt(diff),
    });
  } catch (e) {
    showErrorToast(`Code review failed: ${e.message}`);
    throw e; // Don't proceed with push
  }
}
```

### Why New Threads Are More Reliable

A freshly created thread:

- Has a guaranteed-valid session (just created)
- Has no prior error state or interrupted turns
- Is isolated from user's ongoing conversation
- Can be navigated to without losing the user's context
- Survives even if the user switches active threads during review

### Error Handling Strategy

Three error scenarios with distinct UX:

1. **Auto-review (pre-push hook) failure** — show toast notification; don't block push but inform user
2. **Manual review button failure** — show inline red error text in the review panel; user explicitly requested this
3. **Empty diff** — show info toast "No changes to review"; skip entirely rather than sending empty content to AI

The critical rule: **never silently catch an error and proceed with the next action** (e.g., pushing code). The user must always know if the review ran or not.

### Thread Navigation Edge Case

After creating the review thread, the UI navigates to it so the user can see the review results. This changes `activeThreadId` to the review thread. A `pendingAutoFixTurnId` sentinel depends on this navigation happening before the review turn completes. If timing is ever an issue (e.g., slow navigation), storing `reviewThreadId` in a separate ref provides a more robust sentinel check.

## Related Concepts

- [[concepts/late-event-ingestion-guard]] — Both address stale session state causing unexpected behavior
- [[concepts/phase-derivation-turn-id-guard]] — Related: ensuring UI state accurately reflects session lifecycle
- [[concepts/rpc-layer-expansion-pattern]] — Review threads use the same RPC infrastructure as regular chat threads

## Sources

- [[daily/2026-04-20.md]] — "Create a new thread for each code review (both auto and manual) instead of reusing `activeThreadId` — eliminates stale session problem entirely"
- [[daily/2026-04-20.md]] — "Dispatching turns to an existing active session is fragile — stale/interrupted sessions cause 'session not found' errors; creating fresh threads is more reliable"
- [[daily/2026-04-20.md]] — "Skip review entirely when diff is empty, show info toast instead of sending useless message to AI"
- [[daily/2026-04-20.md]] — "Silent `catch` blocks that fall through to the next action (push) create confusing UX — always surface the error or explicitly handle it"
