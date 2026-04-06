/**
 * True when running inside the Electron preload bridge, false in a regular browser.
 * The preload script sets window.nativeApi via contextBridge before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);

/**
 * True when running inside the Bird Code iOS WKWebView.
 * The Swift WKWebView injects window.__BC_WS_TOKEN__ via WKUserScript before
 * the page loads, so this is reliable at module load time.
 */
export const isMobileWebView =
  typeof window !== "undefined" &&
  typeof (window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ === "string" &&
  ((window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ as string).length > 0;

/**
 * True when this browser window is a thread popout.
 *
 * Detection happens at module-load time (before React renders) so all
 * components that branch on this flag get a stable, consistent value:
 *  - On the very first load at /popout/<threadId>, the pathname prefix fires.
 *  - After the popout navigates to /<threadId> (e.g. "New Thread" flow), the
 *    sessionStorage key — set by the popout route on mount — fires instead.
 */
export const isPopoutWindow =
  typeof sessionStorage !== "undefined" &&
  (sessionStorage.getItem("is-popout-window") === "1" ||
    window.location.pathname.startsWith("/popout/"));
