---
title: "Real-Time Status Visualization from Development Server Logs"
aliases: [startup-logs, dev-server-feedback, status-logging, progress-indicator]
tags: [ux, development-tools, logging, user-feedback]
sources:
  - "daily/2026-04-12.md"
created: 2026-04-12
updated: 2026-04-12
---

# Real-Time Status Visualization from Development Server Logs

Development tools that spawn long-running processes (like `npm run dev`) need to communicate progress to users. Instead of showing a bare spinner, the UI can parse server output in real-time and display human-readable milestone steps ("Installing dependencies", "Starting Web", "Compiling", "Dev server ready"). This transforms a frustrating blank screen into an informative progress indicator, improving perceived performance and reducing user confusion.

## Key Points

- **Spinner alone is insufficient** - Users don't know if app is stuck, crashing, or building
- **Parse server output in real-time** - Capture stdout/stderr and extract meaningful milestones
- **Map log patterns to user-facing strings** - "npm: npm warn" → "Installing dependencies"; "Compiling..." → "Compiling"
- **Order steps logically** - Display milestones in dependency order (install → build → start)
- **Show last step until completion** - Keep the most recent step visible; add checkmark when done

## Details

### Log Pattern Mapping

Development servers emit predictable log lines. The UI can hook into these by:

1. **Listening to process stdout** - As the server starts, capture lines in real-time
2. **Matching patterns** - Regex/keyword matching on specific lines
3. **Extracting milestones** - Map matched patterns to user-visible steps
4. **Deduplicating** - Don't repeat the same step twice if the line appears again

### Example: Vite + npm run dev

```
[expected logs] → [user-facing step]
npm warn...     → "Installing dependencies"
vite            → "Starting Web"
Compiling...    → "Compiling"
ready in ...ms  → "Dev server ready" ✓
```

### Implementation Pattern

```typescript
interface StartupStep {
  id: string;
  label: string;
  pattern: RegExp;
  order: number;
}

const STARTUP_STEPS: StartupStep[] = [
  {id: "install", label: "Installing dependencies", pattern: /npm\s+warn/, order: 1},
  {id: "start", label: "Starting Web", pattern: /vite/, order: 2},
  {id: "compile", label: "Compiling", pattern: /Compiling/, order: 3},
  {id: "ready", label: "Dev server ready", pattern: /ready\s+in/, order: 4},
];

function parseLogLine(line: string): StartupStep | null {
  for (const step of STARTUP_STEPS) {
    if (step.pattern.test(line)) {
      return step;
    }
  }
  return null;
}

// React component
function StartupLogView({serverProcess}) {
  const [currentStep, setCurrentStep] = useState<StartupStep | null>(null);

  useEffect(() => {
    if (!serverProcess) return;

    serverProcess.stdout.on("data", (chunk) => {
      const line = chunk.toString("utf-8");
      const step = parseLogLine(line);
      if (step && step.order > (currentStep?.order ?? 0)) {
        setCurrentStep(step);
      }
    });
  }, [serverProcess, currentStep]);

  return (
    <div className="startup-log">
      {currentStep ? (
        <>
          <Spinner />
          <p>{currentStep.label}</p>
        </>
      ) : (
        <p>Starting dev server...</p>
      )}
    </div>
  );
}
```

### Edge Cases

**Blank output** - Some servers may not emit the expected log lines. Fallback to generic "Starting..." message.

**Crashed process** - If the process exits with non-zero code, show an error state:

```typescript
serverProcess.on("exit", (code) => {
  if (code !== 0) {
    setCurrentStep({label: `Server crashed (exit ${code})`, ...});
  }
});
```

**Timeout** - If no progress is seen for >30 seconds, suggest troubleshooting:

```typescript
useEffect(() => {
  const timeout = setTimeout(() => {
    if (!currentStep) setError("Server startup taking too long; check logs");
  }, 30000);
  return () => clearTimeout(timeout);
}, [currentStep]);
```

### Related Configuration

Some development servers have specific log formats or verbose flags:

- Vite: `npm run dev -- --logLevel=info`
- Next.js: `npm run dev -- --debug`
- Create React App: `DANGEROUSLY_DISABLE_HOST_CHECK=true npm start`

The pattern matching logic should be robust enough to handle minor variations.

## Related Concepts

- [[concepts/iframe-sandboxing-cors-development-proxy]] - Related to development workflow UX
- [[concepts/concurrent-process-serialization]] - Both involve managing long-running child processes

## Sources

- [[daily/2026-04-12.md]] - "Added `StartupLogView` component: Instead of bare spinner, show human-readable startup milestones ('Installing dependencies', 'Starting Web', 'Compiling', 'Dev server ready') mapped from dev-server output"
- [[daily/2026-04-12.md]] - "Route pattern changed from `/preview/:projectId/:appId/*` to `/preview/*` to catch all preview requests; added `StartupLogView` component to show human-readable startup steps"
