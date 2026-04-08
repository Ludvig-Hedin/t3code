/**
 * popoutWindowStore — tracks chat thread popout windows.
 *
 * Uses a module-level Map for Window object references (not serialisable into
 * Zustand) and a Zustand store for the reactive "which threads are popped out"
 * signal that components can subscribe to.
 *
 * When a popout window is opened the main window polls `win.closed` every 500 ms
 * so it is notified when the user closes the popout via the browser's own X button
 * (not just through our in-app Close button).
 */
import { create } from "zustand";
import type { ThreadId } from "@t3tools/contracts";

// Module-level: actual Window references — intentionally not put in Zustand
// because Window objects are not serialisable.
const _openWindows = new Map<string, Window>();
const _pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

// ─── Zustand store ────────────────────────────────────────────────────────────

interface PopoutWindowState {
  /** Set of threadIds whose popout window is currently open. */
  poppedThreadIds: ReadonlySet<string>;
  _markPopped: (threadId: string) => void;
  _markClosed: (threadId: string) => void;
}

export const usePopoutWindowStore = create<PopoutWindowState>((set) => ({
  poppedThreadIds: new Set<string>(),
  _markPopped: (threadId) =>
    set((state) => ({
      poppedThreadIds: new Set([...state.poppedThreadIds, threadId]),
    })),
  _markClosed: (threadId) =>
    set((state) => {
      const next = new Set(state.poppedThreadIds);
      next.delete(threadId);
      return { poppedThreadIds: next };
    }),
}));

// ─── Internal helpers ─────────────────────────────────────────────────────────

function startPolling(threadId: string, win: Window): void {
  // Clear any previous interval for this threadId (safety guard)
  const prev = _pollIntervals.get(threadId);
  if (prev !== undefined) clearInterval(prev);

  const id = setInterval(() => {
    if (win.closed) {
      clearInterval(id);
      _pollIntervals.delete(threadId);
      _openWindows.delete(threadId);
      usePopoutWindowStore.getState()._markClosed(threadId);
    }
  }, 500);

  _pollIntervals.set(threadId, id);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Open a new browser window containing the given thread, or focus the existing
 * popout window if one is already open for that thread.
 */
export function openThreadPopout(threadId: ThreadId): void {
  const existing = _openWindows.get(threadId);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }

  const win = window.open(
    `/popout/${threadId}`,
    // Named target so repeated calls reuse the same browser window instead of
    // opening duplicates. The name must be unique per thread.
    `bird-code-popout-${threadId}`,
    "width=960,height=720,menubar=no,toolbar=no,location=no,status=no",
  );
  if (!win) return; // Pop-ups may be blocked; fail silently.

  _openWindows.set(threadId, win);
  usePopoutWindowStore.getState()._markPopped(threadId);
  startPolling(threadId, win);
}

/**
 * Focus the popout window for a thread if one is open.
 * Returns `true` when the window was found and focused, `false` otherwise.
 */
export function focusThreadPopout(threadId: ThreadId): boolean {
  const win = _openWindows.get(threadId);
  if (win && !win.closed) {
    win.focus();
    return true;
  }
  return false;
}

/**
 * Synchronously check whether a thread is currently displayed in a popout window.
 * (Non-reactive — use `usePopoutWindowStore` for reactive rendering.)
 */
export function isThreadPopped(threadId: ThreadId): boolean {
  const win = _openWindows.get(threadId);
  return !!win && !win.closed;
}
