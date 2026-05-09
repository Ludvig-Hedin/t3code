/**
 * Typed postMessage bridge between the DesignPanel (parent) and the preview
 * iframe's injected design runtime (child).
 *
 * The runtime source lives at
 * `apps/server/src/preview/designRuntime.ts`. Every message in either
 * direction carries `__birdcode_design: 1` as a discriminator so we can
 * safely ignore unrelated messages (e.g. the console-capture bridge uses
 * `__birdcode: 1`).
 */

export interface DesignNode {
  readonly oid: string;
  readonly parentOid: string | null;
  readonly tag: string;
  readonly textPreview: string;
  readonly className: string | null;
}

export type DesignIncomingMessage =
  | { readonly type: "design.ready"; readonly href: string }
  | { readonly type: "design.tree"; readonly nodes: readonly DesignNode[] }
  | { readonly type: "design.click"; readonly oid: string };

export type DesignOutgoingMessage =
  | { readonly type: "design.select"; readonly oid: string | null }
  | { readonly type: "design.hover"; readonly oid: string | null }
  | { readonly type: "design.requestTree" };

const MARKER_KEY = "__birdcode_design";
const MARKER_VALUE = 1 as const;

function isDesignMessage(data: unknown): data is DesignIncomingMessage & {
  readonly [MARKER_KEY]: typeof MARKER_VALUE;
} {
  if (data === null || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  if (record[MARKER_KEY] !== MARKER_VALUE) return false;
  return typeof record.type === "string";
}

export function onDesignMessage(listener: (msg: DesignIncomingMessage) => void): () => void {
  const handler = (event: MessageEvent) => {
    if (!isDesignMessage(event.data)) return;
    listener(event.data as DesignIncomingMessage);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export function postToDesignRuntime(
  iframe: HTMLIFrameElement | null,
  msg: DesignOutgoingMessage,
): void {
  const win = iframe?.contentWindow;
  if (!win) return;
  try {
    win.postMessage({ ...msg, [MARKER_KEY]: MARKER_VALUE }, "*");
  } catch {
    // contentWindow may be null mid-unmount; ignored.
  }
}
