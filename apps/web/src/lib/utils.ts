import { CommandId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { String, Predicate } from "effect";
import { type CxOptions, cx } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import * as Random from "effect/Random";
import * as Effect from "effect/Effect";

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs));
}

export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function isWindowsPlatform(platform: string): boolean {
  return /^win(dows)?/i.test(platform);
}

export function isLinuxPlatform(platform: string): boolean {
  return /linux/i.test(platform);
}

export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Effect.runSync(Random.nextUUIDv4);
}

export const newCommandId = (): CommandId => CommandId.makeUnsafe(randomUUID());

export const newProjectId = (): ProjectId => ProjectId.makeUnsafe(randomUUID());

export const newThreadId = (): ThreadId => ThreadId.makeUnsafe(randomUUID());

export const newMessageId = (): MessageId => MessageId.makeUnsafe(randomUUID());

const isNonEmptyString = Predicate.compose(Predicate.isString, String.isNonEmpty);
const firstNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (isNonEmptyString(value)) {
      return value;
    }
  }
  throw new Error("No non-empty string provided");
};

export const resolveServerUrl = (options?: {
  url?: string | undefined;
  protocol?: "http" | "https" | "ws" | "wss" | undefined;
  pathname?: string | undefined;
  searchParams?: Record<string, string> | undefined;
}): string => {
  // Do not use `window.location.origin` before `VITE_WS_URL`: in dev the UI is
  // served from Vite (e.g. :5733) while the API WebSocket is on a different
  // port. Prefer Electron bridge, then build-time API URL, then same-origin.
  const bridgeWsUrl =
    typeof window !== "undefined" ? window.desktopBridge?.getWsUrl?.() : undefined;
  const envWsUrl = import.meta.env.VITE_WS_URL;
  const locationOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
  const rawUrl = firstNonEmptyString(options?.url, bridgeWsUrl, envWsUrl, locationOrigin);

  const parsedUrl = new URL(rawUrl);
  if (options?.protocol) {
    parsedUrl.protocol = options.protocol;
  }
  if (options?.pathname) {
    parsedUrl.pathname = options.pathname;
  } else {
    parsedUrl.pathname = "/";
  }
  const merged: Record<string, string> = options?.searchParams ? { ...options.searchParams } : {};

  // When running inside the Bird Code iOS WKWebView, the Swift shell injects
  // window.__BC_WS_TOKEN__ with the desktop auth token before page load.
  // Append it as the ?token query param so the server's WS auth middleware accepts
  // the connection — identical to how the Electron desktop bridge embeds it in the URL.
  const mobileToken =
    typeof window !== "undefined" &&
    typeof (window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ === "string"
      ? ((window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ as string)
      : null;
  if (mobileToken && mobileToken.length > 0 && !merged["token"]) {
    merged["token"] = mobileToken;
  }

  if (Object.keys(merged).length > 0) {
    parsedUrl.search = new URLSearchParams(merged).toString();
  }

  return parsedUrl.toString();
};

function httpProtocolFromServerBase(): "http" | "https" {
  try {
    const base = resolveServerUrl({ pathname: "/" });
    const { protocol } = new URL(base);
    const scheme = protocol.replace(":", "").toLowerCase();
    if (scheme === "wss" || scheme === "https") {
      return "https";
    }
    if (scheme === "ws" || scheme === "http") {
      return "http";
    }
  } catch {
    /* fall through */
  }
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    return "https";
  }
  return "http";
}

export const resolveApiUrl = (options: {
  pathname: string;
  searchParams?: Record<string, string>;
}): string =>
  resolveServerUrl({
    protocol: httpProtocolFromServerBase(),
    pathname: options.pathname,
    searchParams: options.searchParams,
  });

/**
 * Returns the auth token the server expects for HTTP routes that require it
 * (setup, mobile-pair, etc.). In Electron the token is supplied via the
 * desktop bridge IPC; in the iOS WebView it's injected as `__BC_WS_TOKEN__`;
 * in plain browser launches there's no token (matching the server's
 * `authToken: undefined` config).
 */
export const resolveDesktopAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  const fromBridge = window.desktopBridge?.getDesktopAuthToken?.();
  if (typeof fromBridge === "string" && fromBridge.length > 0) return fromBridge;
  const fromMobile = (window as unknown as Record<string, unknown>).__BC_WS_TOKEN__;
  if (typeof fromMobile === "string" && fromMobile.length > 0) return fromMobile;
  return null;
};

/** Build the headers needed for a setup HTTP request, including bearer auth when available. */
export const setupAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = resolveDesktopAuthToken();
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
};
