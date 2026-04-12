/**
 * HTTP reverse proxy for preview dev servers.
 *
 * Routes /preview/:projectId/:appId/* → http://127.0.0.1:{port}/*
 *
 * This allows iOS and desktop clients to access locally running dev servers
 * through the Bird Code server's existing connection, without needing direct
 * access to localhost ports.
 *
 * CORS / sandbox strategy
 * -----------------------
 * The preview iframe uses a `sandbox` attribute WITHOUT `allow-same-origin`,
 * so its origin is the opaque value "null". To allow the iframe to still load
 * proxied resources (scripts, stylesheets, etc.) we:
 *
 *   1. Strip `Accept-Encoding` before forwarding so upstream servers always
 *      respond with plain text we can inspect and rewrite.
 *   2. Override `Access-Control-Allow-Origin: *` on every proxy response so
 *      the null-origin iframe is permitted to fetch those resources.
 *   3. Rewrite `http://localhost:{port}/…` / `http://127.0.0.1:{port}/…`
 *      occurrences in HTML and JS response bodies to the Bird Code proxy base
 *      path so all resource fetches stay inside the Bird Code server (which
 *      adds the CORS headers) rather than hitting the upstream dev server
 *      directly and getting rejected.
 *
 * Route pattern note
 * ------------------
 * We use "/preview/*" (not "/preview/:projectId/:appId/*") so the wildcard
 * matches the trailing-slash-only case that the browser sends on the first
 * iframe navigation (/preview/pid/aid/).  A named-param wildcard like
 * "/:appId/*" may require at least one character after the final slash and
 * would therefore NOT match the trailing "/" — causing the request to fall
 * through to the SPA catch-all and load Bird Code inside the iframe.
 */
import * as nodeHttp from "node:http";
import { Data, Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { PreviewServerManager } from "./Services/PreviewServerManager";

/** Tagged error for upstream proxy connection failures */
class ProxyError extends Data.TaggedError("PreviewProxyError")<{
  readonly cause?: unknown;
}> {}

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

  // Read the request body (returns empty ArrayBuffer for GET requests).
  // Using Effect.catch (v4 API) to swallow any body-read errors gracefully.
  const bodyBuffer = yield* request.arrayBuffer.pipe(
    Effect.catch(() => Effect.succeed(new ArrayBuffer(0))),
  );

  // Forward the request to the upstream dev server via node:http.
  // The error channel is typed as ProxyError so Effect.catch can handle it.
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

        // Disable compression: we need to inspect and rewrite HTML/JS response
        // bodies. Local proxying has negligible transfer overhead, so stripping
        // Accept-Encoding costs nothing and lets us safely read plain text.
        delete forwardHeaders["accept-encoding"];

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
                responseHeaders["location"] = responseHeaders["location"].replace(
                  new RegExp(`http://(?:127\\.0\\.0\\.1|localhost):${port}`, "g"),
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
    // Wrap as a tagged error class so Effect.catch can handle it
    catch: (cause) => new ProxyError({ cause }),
  }).pipe(
    Effect.catch(() =>
      Effect.succeed({
        status: 502,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ error: "Upstream connection failed" })),
      }),
    ),
  );

  // -------------------------------------------------------------------------
  // Post-processing: CORS override + absolute-URL rewriting
  // -------------------------------------------------------------------------
  // Build mutable copies so we can patch headers and body without mutating the
  // resolved value (which is still referenced in the Effect pipeline).
  const proxyBase = `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(appId)}`;
  const responseHeaders: Record<string, string> = { ...result.headers };
  let responseBody = result.body;

  // Override CORS: Vite's dev server emits Access-Control-Allow-Origin set to
  // its own origin (e.g. http://localhost:5733). Sandboxed iframes have the
  // opaque origin "null", which Vite and most dev servers reject.  Setting "*"
  // lets the null-origin iframe fetch all proxied assets.
  responseHeaders["access-control-allow-origin"] = "*";
  // credentials flags are incompatible with a wildcard allow-origin.
  delete responseHeaders["access-control-allow-credentials"];

  // Rewrite absolute dev-server URLs in HTML and JavaScript response bodies.
  // Vite embeds http://localhost:{port}/… references for @vite/client, HMR
  // overlay, and other internal endpoints.  Replacing them with proxy paths
  // keeps every resource fetch routed through Bird Code's server (which adds
  // the CORS * header) rather than hitting the upstream directly and being
  // blocked by the null-origin CORS check.
  const contentType = responseHeaders["content-type"] ?? "";
  const isRewritable =
    contentType.includes("text/html") ||
    contentType.includes("text/javascript") ||
    contentType.includes("application/javascript");

  if (isRewritable) {
    const bodyStr = responseBody.toString("utf8");
    const devServerPattern = new RegExp(`http://(?:localhost|127\\.0\\.0\\.1):${port}`, "g");
    const rewritten = bodyStr.replace(devServerPattern, proxyBase);
    if (rewritten !== bodyStr) {
      responseBody = Buffer.from(rewritten, "utf8");
      // content-length must match the new byte length after rewriting.
      if (responseHeaders["content-length"]) {
        responseHeaders["content-length"] = String(responseBody.byteLength);
      }
    }
  }

  return HttpServerResponse.uint8Array(new Uint8Array(responseBody), {
    status: result.status,
    headers: responseHeaders,
  });
});

// CORS preflight handler — browsers send OPTIONS before cross-origin requests
// that carry custom headers. Returning 204 with permissive CORS headers lets
// the browser proceed without the upstream dev server needing to handle it.
const previewOptionsHandler = Effect.gen(function* () {
  return HttpServerResponse.uint8Array(new Uint8Array(0), {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, OPTIONS",
      "access-control-allow-headers": "*",
      "access-control-max-age": "86400",
    },
  });
});

// Export route layers covering all HTTP verbs the preview proxy needs to handle.
// GET     — normal browser page loads, HMR polling, asset fetches.
// POST/PUT/PATCH — form submissions and REST calls from the previewed app.
// OPTIONS — CORS preflight from sandboxed iframes.
//
// Pattern "/preview/*" is used (not "/preview/:projectId/:appId/*") so that the
// wildcard matches the trailing-slash-only first navigation from the iframe.
export const previewProxyRouteLayer = Layer.mergeAll(
  HttpRouter.add("GET", "/preview/*", previewProxyHandler),
  HttpRouter.add("POST", "/preview/*", previewProxyHandler),
  HttpRouter.add("PUT", "/preview/*", previewProxyHandler),
  HttpRouter.add("PATCH", "/preview/*", previewProxyHandler),
  HttpRouter.add("OPTIONS", "/preview/*", previewOptionsHandler),
);
