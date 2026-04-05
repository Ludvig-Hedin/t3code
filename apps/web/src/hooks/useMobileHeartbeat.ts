import { useEffect } from "react";

import { isMobileWebView } from "~/env";
import { resolveServerUrl } from "~/lib/utils";

const HEARTBEAT_INTERVAL_MS = 30_000;

function getMobileDeviceToken(): string | null {
  if (typeof window === "undefined") return null;
  const tok = (window as unknown as Record<string, unknown>).__BC_MOBILE_DEVICE_TOKEN__;
  return typeof tok === "string" && tok.length > 0 ? tok : null;
}

/**
 * Calls POST /api/mobile/heartbeat every 30 s when running inside the iOS WKWebView.
 * This keeps `lastSeenAt` fresh on the server so the desktop panel shows "Live now".
 * No-ops in all other environments.
 */
export function useMobileHeartbeat(): void {
  useEffect(() => {
    if (!isMobileWebView) return;

    const deviceToken = getMobileDeviceToken();
    if (!deviceToken) return;

    const beat = () => {
      const url = resolveServerUrl({ pathname: "/api/mobile/heartbeat" });
      void fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          "Content-Type": "application/json",
        },
      }).catch(() => {
        // Heartbeat failures are non-fatal — next beat will retry.
      });
    };

    // Fire immediately so "Live now" appears as soon as the page loads.
    beat();
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
}
