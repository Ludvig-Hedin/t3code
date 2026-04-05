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
  const rawUrl = firstNonEmptyString(
    options?.url,
    window.desktopBridge?.getWsUrl(),
    import.meta.env.VITE_WS_URL,
    window.location.origin,
  );

  const parsedUrl = new URL(rawUrl);
  if (options?.protocol) {
    parsedUrl.protocol = options.protocol;
  }
  if (options?.pathname) {
    parsedUrl.pathname = options.pathname;
  } else {
    parsedUrl.pathname = "/";
  }
  const merged: Record<string, string> = { ...(options?.searchParams ?? {}) };

  // When running inside the Bird Code iOS WKWebView, the Swift shell injects
  // window.__BC_WS_TOKEN__ with the desktop auth token before page load.
  // Append it as the ?token query param so the server's WS auth middleware accepts
  // the connection — identical to how the Electron desktop bridge embeds it in the URL.
  const mobileToken =
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
