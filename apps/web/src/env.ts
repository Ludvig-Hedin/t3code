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
