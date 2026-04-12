---
title: "Startup Milestone Logging: UX Pattern for Long-Running Operations"
aliases: [progress-indication, startup-log, milestone-steps, dev-server-ux]
tags: [ux-pattern, user-experience, development-tools, progress]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Startup Milestone Logging: UX Pattern for Long-Running Operations

When starting a dev server takes 10-30 seconds, users need feedback. A bare spinner provides no information and invites the question: "Is it frozen?" A startup milestone log shows human-readable steps ("Installing dependencies", "Starting Web server", "Compiling", "Dev server ready") mapped from dev-server output, giving users confidence the process is progressing. This pattern balances information density with visual simplicity.

## Key Points

- **Problem:** Spinner alone doesn't convey progress; users assume the tool is stuck
- **Solution:** Map dev-server logs to milestone steps; display step-by-step to users
- **Steps example:** "Installing dependencies" → "Starting Web" → "Compiling" → "Dev server ready"
- **Implementation:** Parse dev-server stdout for keywords; match to milestone definitions; update UI as each step completes
- **UX benefit:** Users see activity, understand timing, and know when to expect the preview to load

## Details

### The Problem with Spinner-Only UX

```jsx
// ❌ UNCLEAR: Spinner with no context
export function PreviewPane() {
  return (
    <div className="flex items-center justify-center h-full">
      <Spinner />
    </div>
  );
}
```

When the user opens a preview:

1. Spinner appears
2. User waits 15+ seconds with no feedback
3. User wonders: Is it working? Is it frozen? Should I refresh?
4. Eventually dev server starts and iframe loads
5. No one knows how long it actually takes or what's happening

This creates friction and lack of confidence.

### The Milestone Logging Pattern

```jsx
// ✅ CLEAR: Milestones with human-readable steps
export function StartupLogView({ milestones }) {
  return (
    <div className="space-y-3 p-4">
      {milestones.map((milestone, index) => (
        <div key={index} className="flex items-start gap-2">
          {milestone.completed ? (
            <CheckCircle2 className="text-green-500 mt-0.5" />
          ) : (
            <Clock className="text-gray-400 animate-spin" />
          )}
          <span className={milestone.completed ? "text-gray-600" : "text-gray-400"}>
            {milestone.label}
          </span>
        </div>
      ))}
    </div>
  );
}
```

Milestones are defined as:

```typescript
const STARTUP_MILESTONES = [
  { pattern: /installing|npm install|pnpm install|bun install/, label: "Installing dependencies" },
  { pattern: /starting|listening on|dev server running/, label: "Starting Web server" },
  { pattern: /compiling|bundling|building/, label: "Compiling" },
  { pattern: /ready|compiled|success|dev server ready/, label: "Dev server ready" },
];
```

As the dev server outputs logs, the component matches them against patterns and marks milestones complete:

```typescript
function parseStartupLog(logs: string[]): Milestone[] {
  const completed = new Set<number>();

  for (const log of logs) {
    for (let i = 0; i < STARTUP_MILESTONES.length; i++) {
      if (STARTUP_MILESTONES[i].pattern.test(log)) {
        completed.add(i);
      }
    }
  }

  return STARTUP_MILESTONES.map((m, i) => ({
    ...m,
    completed: completed.has(i),
  }));
}
```

### UX Flow

1. User opens preview
2. `StartupLogView` renders with all milestones incomplete (gray, clock icon spinning)
3. Dev server outputs: `npm: installing dependencies...`
4. Component marks "Installing dependencies" as complete (green checkmark)
5. Dev server outputs: `vite: dev server ready on localhost:5173`
6. Component marks "Dev server ready" as complete
7. User sees full green list; confidence that it's done

### Implementation Details

**Pattern Matching:** Use regex patterns that catch common output formats from different package managers and build tools:

- `npm install`, `pnpm install`, `bun install`
- `dev server running`, `listening on`, `dev server ready`

**Ordering:** Milestones should reflect typical startup sequence (dependencies → server → compile → ready). If a project skips a step (e.g., no compilation needed), that milestone just stays incomplete, which is fine.

**Real-Time Updates:** Stream dev-server logs to the component in real-time. Use a listener or callback to update the UI as each log arrives:

```typescript
devServer.on("stdout", (line: string) => {
  setLogs((prev) => [...prev, line]);
});
```

**Timeout Fallback:** If dev server never outputs "ready", still let the preview load after a timeout (e.g., 60 seconds). The milestone log is helpful feedback, not a blocker.

### Application in Bird Code

The preview pane now includes a `StartupLogView` component that maps dev-server output to startup milestones:

```jsx
<PreviewPane>
  {isStarting ? <StartupLogView milestones={milestones} /> : <iframe src={previewUrl} />}
</PreviewPane>
```

The component subscribes to dev-server logs, updates milestones, and transitions from log view to iframe once "Dev server ready" appears.

## Related Concepts

- [[concepts/user-feedback-and-loading-states]] - General UX patterns for async operations
- [[concepts/dev-server-integration]] - How preview panes communicate with dev servers
- [[concepts/real-time-ui-updates]] - Streaming logs to React components

## Sources

- [[daily/2026-04-12.md]] - "Add `StartupLogView` component: Instead of bare spinner, show human-readable startup milestones (`Installing dependencies`, `Starting Web`, `Compiling`, `Dev server ready`) mapped from dev-server output"
- [[daily/2026-04-12.md]] - "Preview showed Bird Code logo/spinner instead of target app — traced to route pattern... Second fix: ... added `StartupLogView` component to show human-readable startup steps"
