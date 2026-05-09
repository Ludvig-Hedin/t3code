---
title: "Context Token Counter Accuracy and Post-Compaction Display"
aliases: [token-counter, context-display, compaction-counter]
tags: [ui, token-counting, context-management, debugging]
sources:
  - "daily/2026-04-22.md"
created: 2026-04-23
updated: 2026-04-23
---

# Context Token Counter Accuracy and Post-Compaction Display

AI chat applications display token usage counters to help users understand how much of the context window is consumed. When provider-side context compaction occurs (summarizing or trimming older messages to fit within model limits), the displayed token count may not reflect the actual post-compaction state, showing inflated numbers (e.g., 300k tokens when the context window is much smaller). This creates user confusion about whether the system is working correctly and how much context is actually being sent to the model.

## Key Points

- **Counter may show pre-compaction totals** — UI token count can reflect cumulative messages added before server-side compaction reduces them
- **Compaction is provider-side** — The model/provider performs context summarization or truncation, but the client UI may not receive updated token counts
- **User confusion from inflated numbers** — Displaying 300k tokens when the model's context window is 128k or 200k raises questions about system correctness
- **Counter calculation source matters** — Token counts can be computed client-side (by counting messages) or server-side (after compaction); misalignment causes display bugs
- **Post-compaction sync needed** — Client must either receive updated token counts from the server or recalculate based on the compacted context

## Details

### The Display Problem

In a typical AI chat session, messages accumulate and the token counter increments with each exchange. When the conversation approaches the context window limit, the provider (Claude, OpenAI, etc.) may:

1. Summarize older messages into a shorter representation
2. Truncate the oldest messages entirely
3. Use sliding-window compression to retain recent context

After compaction, the actual tokens sent to the model are significantly fewer than the cumulative total. However, the UI may still display the pre-compaction count because:

- **Client-side counting** — UI sums tokens across all messages in the local store, unaware that the server compacted them
- **Stale metadata** — Server compacts but doesn't send updated token count back to the client
- **No compaction signal** — UI has no indication that compaction occurred, so it assumes all messages are still active

### Example Scenario

```
User session:
- Message 1: 1,000 tokens
- Message 2: 1,500 tokens
- ...
- Message 50: 1,200 tokens
- Cumulative: 300,000 tokens (client-side sum)

Provider-side compaction (at message 30):
- Summarizes messages 1-25 into 5,000 tokens
- Keeps messages 26-50 verbatim
- Actual context sent to model: 35,000 tokens

UI display:
- Shows: 300,000 tokens (stale client-side count)
- Reality: 35,000 tokens (post-compaction)
```

### Diagnostic Questions

When investigating this issue:

1. **Where is the counter calculated?** Client-side or server-side?
2. **Does the server send compaction events?** Is there an IPC message or state update when compaction occurs?
3. **How does the client update the count?** Does it recalculate on every message, or only when the server pushes an update?
4. **What does "token count" mean?** Is it cumulative (all messages ever sent) or current (active context window)?

### Potential Fixes

**Option 1: Server-authoritative count**

```typescript
// Server sends updated token count after compaction
onCompact: (compactedContext) => {
  sendToClient({
    type: "context.compacted",
    newTokenCount: compactedContext.tokens,
    messagesRetained: compactedContext.messages.length,
  });
};
```

**Option 2: Client recalculates from active messages**

```typescript
// Client filters out compacted messages and recounts
const activeMessages = messages.filter((m) => !m.compacted);
const tokenCount = activeMessages.reduce((sum, m) => sum + m.tokens, 0);
```

**Option 3: Display both counts**

```typescript
// Show cumulative and active counts separately
<TokenCounter
  cumulative={300_000}
  active={35_000}
  label="35k active / 300k cumulative"
/>
```

Option 3 provides transparency: users see both the total conversation size and the current active context.

### Related Patterns

Similar issues occur in:

- **Download progress indicators** — showing "downloaded 500 MB" when the file is only 100 MB (chunked compression)
- **Memory usage displays** — showing allocated memory vs. resident set size
- **Build caches** — displaying "cache size: 10 GB" when deduplicated size is 2 GB

The meta-pattern: **displayed metric must match the actual resource consumption**, not a stale or cumulative approximation.

## Related Concepts

- [[concepts/flush-pipeline-failure-modes]] — Another case where background operations (compaction) aren't visible to the user
- [[concepts/websocket-silent-death-heartbeat]] — Related issue where client state desyncs from server reality

## Sources

- [[daily/2026-04-22]] — "User investigating why context counter shows 300k tokens when context window is much smaller, questioning accuracy of token display after compaction"
- [[daily/2026-04-22]] — "Issue relates to provider-side compaction not being reflected in displayed token count"
