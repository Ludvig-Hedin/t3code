import { useConnectionStatusStore } from "../connectionStatusStore";

/**
 * Visible banner shown when the WS transport has declared the connection dead
 * and is about to reload the page. Replaces the previous silent reload that
 * disoriented users (per UX audit). Pinned to the top so it's seen even mid-task.
 */
export function ConnectionStatusBanner() {
  const status = useConnectionStatusStore((s) => s.status);
  if (status === "online") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 py-2"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-sm backdrop-blur dark:text-amber-300">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
        Reconnecting…
      </div>
    </div>
  );
}
