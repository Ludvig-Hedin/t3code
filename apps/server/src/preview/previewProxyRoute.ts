/**
 * HTTP reverse proxy for preview dev servers.
 *
 * Routes /preview/:projectId/:appId/* → http://127.0.0.1:{port}/*
 *
 * This allows iOS and desktop clients to access locally running dev servers
 * through the Bird Code server's existing connection, without needing direct
 * access to localhost ports.
 */
import * as nodeHttp from "node:http";
import { Effect, Layer, Option } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

import { PreviewServerManager } from "./Services/PreviewServerManager";

/** Extract projectId, appId, and the remaining path from a /preview/:p/:a/* URL */
function parsePreviewPath(pathname: string): {
  projectId: string;
  appId: string;
  rest: string;
} | null {
  // Expected: /preview/<projectId>/<appId>[/rest]
  const match = /^\/preview\/([^/]+)\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  return {
    projectId: decodeURIComponent(match[1]!),
    appId: decodeURIComponent(match[2]!),
    rest: match[3] ?? "/",
  };
}

/** Collect only plain string entries from an effect Headers object, skipping symbol keys */
function collectHeaders(
  headers: HttpServerRequest.HttpServerRequest["headers"],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    // Object.keys only yields string keys — symbol keys (like TypeId) are excluded
    const value = headers[key];
    if (typeof value === "string") {
      result[key] = value;
    }
  }
  return result;
}

const previewProxyHandler = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const urlOpt = HttpServerRequest.toURL(request);

  if (Option.isNone(urlOpt)) {
    return HttpServerResponse.text("Bad Request", { status: 400 });
  }

  const url = urlOpt.value;
  const parsed = parsePreviewPath(url.pathname);
  if (!parsed) {
    return HttpServerResponse.text("Invalid preview path", { status: 400 });
  }

  const { projectId, appId, rest } = parsed;
  const previewManager = yield* PreviewServerManager;
  const session = previewManager.getSession(projectId, appId);

  if (!session || session.port === null) {
    return HttpServerResponse.jsonUnsafe(
      { error: "App not running", appId, projectId },
      { status: 502 },
    );
  }

  const port = session.port;
  // Reconstruct the upstream path including query string
  const upstreamPath = rest + (url.search ?? "");

  // Read the request body (returns empty ArrayBuffer for GET requests)
  const bodyBuffer = yield* request.arrayBuffer.pipe(
    Effect.catchAll(() => Effect.succeed(new ArrayBuffer(0))),
  );

  // Forward the request to the upstream dev server via node:http
  const result = yield* Effect.tryPromise({
    try: () =>
      new Promise<{
        status: number;
        headers: Record<string, string>;
        body: Buffer;
      }>((resolve, reject) => {
        const forwardHeaders = collectHeaders(request.headers);

        // Override host to point to the upstream dev server
        forwardHeaders["host"] = `127.0.0.1:${port}`;

        const proxyReq = nodeHttp.request(
          {
            hostname: "127.0.0.1",
            port,
            path: upstreamPath,
            method: request.method,
            headers: forwardHeaders,
          },
          (proxyRes) => {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              const responseHeaders: Record<string, string> = {};
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                if (v !== undefined) {
                  // Node's IncomingMessage headers can be string or string[]
                  responseHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
                }
              }

              // Rewrite Location headers that reference the upstream port so
              // redirects stay within the Bird Code proxy namespace.
              if (responseHeaders["location"]) {
                responseHeaders["location"] = responseHeaders[
                  "location"
                ].replace(
                  new RegExp(
                    `http://(?:127\\.0\\.0\\.1|localhost):${port}`,
                    "g",
                  ),
                  `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(appId)}`,
                );
              }

              resolve({
                status: proxyRes.statusCode ?? 200,
                headers: responseHeaders,
                body: Buffer.concat(chunks),
              });
            });
            proxyRes.on("error", reject);
          },
        );

        proxyReq.on("error", reject);

        // Forward the request body if present (for POST/PUT etc.)
        if (bodyBuffer.byteLength > 0) {
          proxyReq.write(Buffer.from(bodyBuffer));
        }

        proxyReq.end();
      }),
    catch: (e) => e as Error,
  }).pipe(
    Effect.catchAll(() =>
      Effect.succeed({
        status: 502,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ error: "Upstream connection failed" })),
      }),
    ),
  );

  return HttpServerResponse.uint8Array(new Uint8Array(result.body), {
    status: result.status,
    headers: result.headers,
  });
});

// Export three separate route layers covering GET, POST, and PUT.
// GET covers normal browser page loads and HMR polling.
// POST/PUT are needed for Vite HMR WebSocket upgrade negotiation and form submissions.
export const previewProxyRouteLayer = Layer.mergeAll(
  HttpRouter.add("GET", "/preview/:projectId/:appId/*", previewProxyHandler),
  HttpRouter.add("POST", "/preview/:projectId/:appId/*", previewProxyHandler),
  HttpRouter.add("PUT", "/preview/:projectId/:appId/*", previewProxyHandler),
);
