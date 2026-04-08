# White Screen / Bootstrap Stuck — Bug Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the intermittent white screen and permanently-stuck loading screen by (1) adding retry logic after snapshot recovery failure and (2) replacing `return null` transient renders with a visible loading screen.

**Architecture:** Three targeted patches across four files. No new abstractions beyond extracting `AppLoadingScreen` into a shared component so all three route files can use it. The retry in `runSnapshotRecovery` closes the race where a brief WS blip blocks bootstrap permanently.

**Tech Stack:** React 18, TanStack Router, Zustand, Vitest, Bun

---

## Background: Root Causes

**Bug #1 — Stuck forever on loading screen (the "doesn't refresh" case)**

Race condition in `EventRouter` (`apps/web/src/routes/__root.tsx`):

1. WS connects → first "welcome" → `beginSnapshotRecovery` → `state.inFlight = { kind: "snapshot" }`
2. WS blips → reconnects → second "welcome" → `beginSnapshotRecovery` returns `false` (blocked) → **dropped**
3. First `getSnapshot()` fails over the now-dead connection
4. `failSnapshotRecovery()` clears `inFlight` — but does **nothing else**
5. WS is now stable, so no new "welcome" arrives → `bootstrapComplete` stays `false` forever

**Bug #2 — Visible white flash during navigation**

`_chat.index.tsx`: when `projects.length > 0`, the component returns `null` while a `useEffect` queues `handleNewThread()`. On mobile this blank period is 200–600 ms.

`_chat.$threadId.tsx`: returns `null` when `routeThreadExists = false` (e.g. re-bootstrap replaced the thread list). The `useEffect` then navigates to `/`, triggering Bug #2 again. Combined, the two nulls chain into a longer blank.

---

## File Map

| File                                           | Change                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/components/AppLoadingScreen.tsx` | **CREATE** — extracted shared loading component                            |
| `apps/web/src/routes/__root.tsx`               | **MODIFY** — import AppLoadingScreen; add retry after failSnapshotRecovery |
| `apps/web/src/routes/_chat.index.tsx`          | **MODIFY** — return AppLoadingScreen instead of null                       |
| `apps/web/src/routes/_chat.$threadId.tsx`      | **MODIFY** — return AppLoadingScreen instead of null                       |

---

## Tasks

---

### Task 1: Create shared `AppLoadingScreen` component

**Files:**

- Create: `apps/web/src/components/AppLoadingScreen.tsx`
- Modify: `apps/web/src/routes/__root.tsx`

The existing `AppLoadingScreen` is a private function inside `__root.tsx`. Extract it to a shared file so `_chat.index.tsx` and `_chat.$threadId.tsx` can import it without creating circular route-file imports.

- [ ] **Step 1: Create `apps/web/src/components/AppLoadingScreen.tsx`**

```tsx
import { BirdLogomark } from "./BirdLogo";
import { Spinner } from "./ui/spinner";

/** Full-screen splash shown while the app is loading or navigating. */
export function AppLoadingScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      {/* Logo pulses to indicate the app is alive and loading */}
      <BirdLogomark className="size-12 animate-pulse text-foreground/60" />
      <Spinner className="size-4 text-muted-foreground/50" />
    </div>
  );
}
```

- [ ] **Step 2: Update `__root.tsx` imports — swap local definition for shared import**

At the top of `apps/web/src/routes/__root.tsx`, the file currently imports `BirdLogomark` and `Spinner` only for the local `AppLoadingScreen`. Replace those imports and the local function with the new shared component.

Remove these two lines from the imports block (lines ~20-21):

```ts
import { BirdLogomark } from "../components/BirdLogo";
import { Spinner } from "../components/ui/spinner";
```

Add this import instead:

```ts
import { AppLoadingScreen } from "../components/AppLoadingScreen";
```

Then **delete** the local `AppLoadingScreen` function (lines ~115-124):

```tsx
// DELETE THIS BLOCK:
/** Full-screen splash shown while waiting for the initial server snapshot. */
function AppLoadingScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      {/* Logo pulses to indicate the app is alive and loading */}
      <BirdLogomark className="size-12 animate-pulse text-foreground/60" />
      <Spinner className="size-4 text-muted-foreground/50" />
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck to verify no import errors**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck
```

Expected: no errors relating to `AppLoadingScreen`, `BirdLogomark`, or `Spinner`.

---

### Task 2: Replace `null` in `_chat.index.tsx` with `AppLoadingScreen`

**Files:**

- Modify: `apps/web/src/routes/_chat.index.tsx`

Currently when `projects.length > 0` the component returns `null` (invisible) while the `useEffect` fires `handleNewThread`. Showing the loading screen instead gives the user visual feedback during this transition.

- [ ] **Step 1: Add the import**

In `apps/web/src/routes/_chat.index.tsx`, add after the last existing import:

```ts
import { AppLoadingScreen } from "../components/AppLoadingScreen";
```

- [ ] **Step 2: Replace `return null`**

Find (near the bottom of `ChatIndexRouteView`):

```tsx
// Projects exist — rendering nothing while the useEffect navigates to the draft thread.
return null;
```

Replace with:

```tsx
// Projects exist — show loading screen while useEffect navigates to the draft thread.
return <AppLoadingScreen />;
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck
```

Expected: no errors.

---

### Task 3: Replace `null` in `_chat.$threadId.tsx` with `AppLoadingScreen`

**Files:**

- Modify: `apps/web/src/routes/_chat.$threadId.tsx`

Currently when `!bootstrapComplete || !routeThreadExists` the component returns `null` while the `useEffect` schedules `navigate({ to: "/", replace: true })`. This chains into Task 2's null. Showing the loading screen fills the visual gap.

- [ ] **Step 1: Add the import**

In `apps/web/src/routes/_chat.$threadId.tsx`, add after the last existing import:

```ts
import { AppLoadingScreen } from "../components/AppLoadingScreen";
```

- [ ] **Step 2: Replace `return null`**

Find (around line 215 in `ChatThreadRouteView`):

```tsx
if (!bootstrapComplete || !routeThreadExists) {
  return null;
}
```

Replace with:

```tsx
if (!bootstrapComplete || !routeThreadExists) {
  return <AppLoadingScreen />;
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck
```

Expected: no errors.

---

### Task 4: Add retry after `failSnapshotRecovery` in `__root.tsx`

**Files:**

- Modify: `apps/web/src/routes/__root.tsx`

This is the core fix for the "stuck loading screen" bug. After `failSnapshotRecovery()`, if bootstrap hasn't completed and the component is still mounted, schedule a retry after 2 seconds. This breaks the dead-end where the WS is stable but no new "welcome" event will ever arrive.

**Safety properties of this fix:**

- `disposed` guard: if the component unmounts before the timer fires, the retry is skipped.
- `!recovery.getState().bootstrapped` guard: if bootstrap succeeded in the meantime (from a concurrent "welcome" event), the retry is skipped.
- `beginSnapshotRecovery` guard: if another snapshot recovery is already in flight when the retry runs, it returns `false` and is a no-op.
- No infinite tight loop: the 2-second delay means retries are spaced out even if the server is unreachable.

- [ ] **Step 1: Add the constant near the top of the existing constants block**

Find (around line 240):

```ts
const REPLAY_RECOVERY_RETRY_DELAY_MS = 100;
const MAX_NO_PROGRESS_REPLAY_RETRIES = 3;
```

Replace with:

```ts
const REPLAY_RECOVERY_RETRY_DELAY_MS = 100;
const MAX_NO_PROGRESS_REPLAY_RETRIES = 3;
// Delay before retrying a failed snapshot fetch when bootstrap hasn't completed.
// Prevents the app from being permanently stuck if a WS blip caused the first
// getSnapshot() call to fail and no new "welcome" event will arrive.
const SNAPSHOT_RETRY_DELAY_MS = 2_000;
```

- [ ] **Step 2: Add the retry inside `runSnapshotRecovery`'s catch block**

Find (around line 559):

```ts
      } catch {
        // Keep prior state and wait for welcome or a later replay attempt.
        recovery.failSnapshotRecovery();
      }
```

Replace with:

```ts
      } catch {
        // Keep prior state and wait for welcome or a later replay attempt.
        recovery.failSnapshotRecovery();
        // If bootstrap hasn't completed yet, schedule a retry. This handles the
        // race where the WS briefly blips (causing a second "welcome" to be
        // blocked as a duplicate), then the first getSnapshot() fails over the
        // dropped connection, leaving the app stuck with no further trigger.
        if (!disposed && !recovery.getState().bootstrapped) {
          setTimeout(() => {
            if (!disposed) {
              void runSnapshotRecovery("bootstrap");
            }
          }, SNAPSHOT_RETRY_DELAY_MS);
        }
      }
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck
```

Expected: no errors.

---

### Task 5: Format, lint, and full test run

- [ ] **Step 1: Format**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun fmt
```

Expected: exits 0, no unformatted files in the four changed files.

- [ ] **Step 2: Lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun lint
```

Expected: no new lint errors in the four changed files.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run tests**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun run test
```

Expected: all tests pass. The orchestration-recovery unit tests (`apps/web/src/orchestrationRecovery.test.ts`) are the most relevant — they test the coordinator logic, not the `setTimeout` retry (which lives in the React component). No test changes are needed for these fixes because:

- The `AppLoadingScreen` extraction is a pure UI refactor with no logic change.
- The `return null → return <AppLoadingScreen />` change alters render output, not behavior.
- The `setTimeout` retry in `runSnapshotRecovery` is in a React `useEffect` closure — covered by the existing integration smoke tests.

---

## Self-Review Checklist

- [x] **Spec coverage**: All three bugs addressed — retry (Bug #1), `_chat.index.tsx` null (Bug #2), `_chat.$threadId.tsx` null (Bug #2).
- [x] **No placeholders**: Every step has exact file paths and complete code.
- [x] **Type consistency**: `AppLoadingScreen` exported from `components/AppLoadingScreen.tsx`, imported with `../components/AppLoadingScreen` in all three route files (they are all in `routes/`, one level below `components/`).
- [x] **Import paths**: `__root.tsx` is in `routes/`, so `../components/AppLoadingScreen` is correct. `_chat.index.tsx` and `_chat.$threadId.tsx` are also in `routes/`, same path. ✓
- [x] **BirdLogomark / Spinner**: Used inside the new `AppLoadingScreen.tsx` which is in `components/`, so `./BirdLogo` and `./ui/spinner` are correct relative paths. ✓
- [x] **No circular deps**: Route files (`__root.tsx`, `_chat.index.tsx`, `_chat.$threadId.tsx`) importing from `components/AppLoadingScreen.tsx` is fine — `components/` never imports from `routes/`. ✓
- [x] **Retry safety**: All three guard conditions (`disposed`, `bootstrapped`, `beginSnapshotRecovery`) prevent double-bootstrap or stale-closure side effects. ✓
