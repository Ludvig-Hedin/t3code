/**
 * WebSocket upgrade proxying for /preview/:projectId/:appId/* paths.
 *
 * The Effect HTTP router handles plain HTTP — `'upgrade'` events on the
 * underlying `http.Server` are a separate event stream. Vite, Next.js and
 * other dev servers' HMR clients embed `new WebSocket('ws://host:port/...')`;
 * the body rewriter in `previewProxyRoute.ts` redirects those URLs through
 * `/preview/...`, but without proxying the upgrade itself the connection
 * fails. This hook accepts the upgrade, dials the upstream dev port, and
 * pipes the sockets in both directions.
 *
 * Bun-runtime note: Bun's HTTP server does not surface `'upgrade'` the same
 * way as Node's; this hook is a no-op there. WS HMR over Bun-mode tunnels
 * is a known follow-up.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";

interface PreviewSessionLookup {
  readonly getSession: (
    projectId: string,
    appId: string,
  ) => { readonly port: number | null } | undefined;
}

let lookup: PreviewSessionLookup | null = null;

/**
 * Called by `PreviewServerManager` at construction so the sync upgrade
 * listener can find the running upstream port without going through Effect.
 */
export function registerPreviewSessionLookup(value: PreviewSessionLookup): void {
  lookup = value;
}

function parsePreviewUrl(rawUrl: string): { projectId: string; appId: string } | null {
  const match = /^\/preview\/([^/?]+)\/([^/?]+)(?:[/?].*)?$/.exec(rawUrl);
  if (!match) return null;
  try {
    return {
      projectId: decodeURIComponent(match[1]!),
      appId: decodeURIComponent(match[2]!),
    };
  } catch {
    return null;
  }
}

function destroySocket(socket: Socket, reason: string): void {
  try {
    socket.write(
      `HTTP/1.1 502 Bad Gateway\r\n` +
        `Connection: close\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `Content-Length: ${Buffer.byteLength(reason)}\r\n\r\n` +
        reason,
    );
  } catch {
    // socket may already be closed
  }
  socket.destroy();
}

/**
 * Attach the preview-upgrade listener to a Node http.Server. Idempotent —
 * safe to call once at server construction.
 */
export function attachPreviewUpgradeHandler(server: HttpServer): void {
  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url ?? "";
    if (!url.startsWith("/preview/")) {
      // Not a preview upgrade — leave for other listeners (the WS RPC
      // endpoint handles its own path).
      return;
    }
    const parsed = parsePreviewUrl(url);
    if (!parsed) {
      destroySocket(socket, "Invalid preview path");
      return;
    }
    const session = lookup?.getSession(parsed.projectId, parsed.appId);
    if (!session || session.port === null) {
      destroySocket(socket, "Preview app not running");
      return;
    }

    // Strip the /preview/<pid>/<appId> prefix before forwarding.
    const upstreamPath =
      url.slice(
        `/preview/${encodeURIComponent(parsed.projectId)}/${encodeURIComponent(parsed.appId)}`
          .length,
      ) || "/";

    // Lazily import node:net to avoid a hot path at module load.
    void import("node:net").then(({ connect }) => {
      const upstream = connect({ host: "127.0.0.1", port: session.port! });
      let handshakeStarted = false;

      upstream.on("connect", () => {
        handshakeStarted = true;
        // Replay the upgrade handshake to upstream. Most headers pass through
        // verbatim so the dev server's WS handshake sees a normal browser
        // request, but `Host` and `Origin` are rewritten to point at the
        // upstream loopback (H7): Vite 5+ and Next 14+ default to rejecting
        // WS upgrades whose Origin doesn't match the configured host, so
        // forwarding the Bird Code shell origin (e.g. http://localhost:1421)
        // verbatim breaks HMR with "[vite] server connection lost" loops.
        const upstreamOrigin = `http://127.0.0.1:${session.port}`;
        const headerLines: string[] = [`${req.method ?? "GET"} ${upstreamPath} HTTP/1.1`];
        for (const [k, v] of Object.entries(req.headers)) {
          if (v === undefined) continue;
          const lowerKey = k.toLowerCase();
          if (lowerKey === "host") {
            headerLines.push(`Host: 127.0.0.1:${session.port}`);
            continue;
          }
          if (lowerKey === "origin" || lowerKey === "sec-websocket-origin") {
            headerLines.push(`${k}: ${upstreamOrigin}`);
            continue;
          }
          if (Array.isArray(v)) {
            for (const entry of v) headerLines.push(`${k}: ${entry}`);
          } else {
            headerLines.push(`${k}: ${v}`);
          }
        }
        upstream.write(headerLines.join("\r\n") + "\r\n\r\n");
        if (head.length > 0) upstream.write(head);

        socket.pipe(upstream).pipe(socket);
      });

      const closeBoth = () => {
        upstream.destroy();
        socket.destroy();
      };
      upstream.on("error", (err: Error) => {
        if (!handshakeStarted) {
          destroySocket(socket, `Preview upstream unavailable: ${err.message}`);
          upstream.destroy();
        } else {
          closeBoth();
        }
      });
      socket.on("error", closeBoth);
      upstream.on("close", () => socket.destroy());
      socket.on("close", () => upstream.destroy());
    });
  });
}
