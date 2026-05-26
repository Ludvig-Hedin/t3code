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
import { Readable } from "node:stream";
import { Data, Effect, Layer, Option, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { PreviewServerManager } from "./Services/PreviewServerManager";

/**
 * Headers we always strip from upstream responses: dev frameworks (Next.js,
 * Remix) emit `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'`
 * which the browser uses to block the Bird Code preview iframe with no
 * useful error. Bird Code's preview is designed to embed these dev servers,
 * so the policy is irrelevant and harmful here.
 */
const STRIPPED_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  // M4: we strip Accept-Encoding from the request so upstream sends plain
  // text. Defensive: also drop any `content-encoding` upstream sends back —
  // some dev frameworks emit `Content-Encoding: identity` plus a length
  // header that doesn't match the wire body, and the browser then aborts
  // assets with `ERR_CONTENT_LENGTH_MISMATCH`.
  "content-encoding",
]);

/**
 * Content types whose bodies need text rewriting (URL fixup + script
 * injection). Anything else is streamed straight through without buffering
 * so SSE / chunked streams arrive promptly and large binary uploads don't
 * exhaust memory.
 */
function needsBodyRewriting(contentType: string): boolean {
  return (
    contentType.includes("text/html") ||
    contentType.includes("text/css") ||
    contentType.includes("text/javascript") ||
    contentType.includes("application/javascript")
  );
}

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

  // For request bodies: read fully for non-streaming methods. We accept a
  // small buffer cost on POST/PUT/PATCH; a future improvement is to forward
  // the request body as a stream too. SSE / WS upgrades go through the
  // upgrade hook in server.ts, not this handler.
  const bodyBuffer = yield* request.arrayBuffer.pipe(
    Effect.catch(() => Effect.succeed(new ArrayBuffer(0))),
  );

  const proxyBase = `/preview/${encodeURIComponent(projectId)}/${encodeURIComponent(appId)}`;

  /**
   * Open the upstream connection. We resolve as soon as response headers
   * arrive so SSE / chunked streams pass through promptly. The `kind` field
   * tells the caller whether to drain the body for rewriting or pipe it
   * straight through.
   */
  type OpenResult =
    | {
        readonly kind: "buffered";
        readonly status: number;
        readonly headers: Record<string, string>;
        readonly body: Buffer;
      }
    | {
        readonly kind: "stream";
        readonly status: number;
        readonly headers: Record<string, string>;
        readonly stream: Readable;
      };

  const opened = yield* Effect.tryPromise({
    try: () =>
      new Promise<OpenResult>((resolve, reject) => {
        const forwardHeaders = collectHeaders(request.headers);
        forwardHeaders["host"] = `127.0.0.1:${port}`;
        // Strip Accept-Encoding so upstream sends plain text we can rewrite.
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
            const responseHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(proxyRes.headers)) {
              if (v === undefined) continue;
              const lower = k.toLowerCase();
              if (STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
              responseHeaders[lower] = Array.isArray(v) ? v.join(", ") : v;
            }

            // Rewrite Location headers so redirects stay within the proxy.
            if (responseHeaders["location"]) {
              responseHeaders["location"] = responseHeaders["location"].replace(
                new RegExp(`http://(?:127\\.0\\.0\\.1|localhost):${port}`, "g"),
                proxyBase,
              );
            }

            // Sandboxed iframes have opaque origin "null"; force-allow it.
            responseHeaders["access-control-allow-origin"] = "*";
            delete responseHeaders["access-control-allow-credentials"];

            const status = proxyRes.statusCode ?? 200;
            const contentType = responseHeaders["content-type"] ?? "";

            if (needsBodyRewriting(contentType)) {
              // Drain the body so we can run the rewriter on it.
              const chunks: Buffer[] = [];
              proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
              proxyRes.on("end", () => {
                resolve({
                  kind: "buffered",
                  status,
                  headers: responseHeaders,
                  body: Buffer.concat(chunks),
                });
              });
              proxyRes.on("error", reject);
            } else {
              // Stream binary / SSE / chunked passthrough — no buffering.
              //
              // M4: drop `transfer-encoding` so the runtime can re-emit the
              // correct framing for the streamed body (Effect's
              // `HttpServerResponse.stream` derives chunked encoding by
              // itself). Keeping both `content-length` and a stale
              // `transfer-encoding: chunked` from upstream confuses browsers
              // and can truncate large source maps / stall SSE streams.
              delete responseHeaders["transfer-encoding"];
              resolve({
                kind: "stream",
                status,
                headers: responseHeaders,
                stream: proxyRes,
              });
            }
          },
        );

        proxyReq.on("error", reject);

        if (bodyBuffer.byteLength > 0) {
          proxyReq.write(Buffer.from(bodyBuffer));
        }
        proxyReq.end();
      }),
    catch: (cause) => new ProxyError({ cause }),
  }).pipe(
    Effect.catch(() =>
      Effect.succeed<OpenResult>({
        kind: "buffered",
        status: 502,
        headers: { "content-type": "application/json" },
        body: Buffer.from(JSON.stringify({ error: "Upstream connection failed" })),
      }),
    ),
  );

  if (opened.kind === "stream") {
    // Pipe upstream → response. Effect's Stream.fromAsyncIterable converts a
    // Node Readable (which is async iterable) into an Effect Stream.
    const stream = Stream.fromAsyncIterable(
      opened.stream as unknown as AsyncIterable<Uint8Array>,
      (cause) => new ProxyError({ cause }),
    );
    return HttpServerResponse.stream(stream, {
      status: opened.status,
      headers: opened.headers,
    });
  }

  // Buffered path — rewrite text bodies before sending.
  let responseBody = opened.body;
  const responseHeaders: Record<string, string> = { ...opened.headers };
  const contentType = responseHeaders["content-type"] ?? "";
  const isHtml = contentType.includes("text/html");
  const isCss = contentType.includes("text/css");
  const isJs =
    contentType.includes("text/javascript") || contentType.includes("application/javascript");

  if (isHtml || isCss || isJs) {
    let bodyStr = responseBody.toString("utf8");

    // 1. http://localhost:{port}/… and ws://localhost:{port}/… — rewrite both.
    //    HMR clients embed `new WebSocket('ws://localhost:5173/…')` literals;
    //    without rewriting, the iframe connects directly to the dev port and
    //    HMR breaks for every remote/tunneled client.
    const devHttpPattern = new RegExp(`http://(?:localhost|127\\.0\\.0\\.1):${port}`, "g");
    bodyStr = bodyStr.replace(devHttpPattern, proxyBase);
    const devWsPattern = new RegExp(`ws://(?:localhost|127\\.0\\.0\\.1):${port}`, "g");
    // The browser will prepend the page's origin when the URL is relative,
    // and our upgrade hook in server.ts forwards it to the upstream port.
    bodyStr = bodyStr.replace(devWsPattern, proxyBase);

    if (isHtml) {
      // 2. Root-relative paths in HTML attributes.
      bodyStr = bodyStr.replace(/((?:src|href|action)=["'])\/(?!\/)/gi, `$1${proxyBase}/`);
      // srcset takes a comma-separated list of URLs; rewrite each entry.
      bodyStr = bodyStr.replace(
        /srcset=(["'])([^"']*)\1/gi,
        (_match, quote: string, value: string) => {
          const rewritten = value
            .split(",")
            .map((entry) => entry.replace(/^(\s*)\/(?!\/)/, `$1${proxyBase}/`))
            .join(",");
          return `srcset=${quote}${rewritten}${quote}`;
        },
      );

      // 3. Inject <base> and a console-capture script at the start of <head>.
      const injectHead =
        `<base href="${proxyBase}/">` +
        `<script>(function(){` +
        `var _c={log:console.log.bind(console),warn:console.warn.bind(console),` +
        `error:console.error.bind(console),info:console.info.bind(console),` +
        `debug:console.debug.bind(console)};` +
        `function ser(v){if(v===null)return'null';if(v===undefined)return'undefined';` +
        `if(typeof v==='string')return v;` +
        `if(typeof v==='number'||typeof v==='boolean')return String(v);` +
        `try{return JSON.stringify(v)}catch(e){return String(v)}}` +
        `function send(level,args){try{window.parent.postMessage(` +
        `{__birdcode:1,level:level,args:Array.prototype.map.call(args,ser),ts:Date.now()},'*'` +
        `)}catch(e){}}` +
        `['log','warn','error','info','debug'].forEach(function(m){` +
        `console[m]=function(){_c[m].apply(console,arguments);send(m,arguments)};});` +
        `window.addEventListener('error',function(e){` +
        `send('error',[e.message+(e.filename?' ('+e.filename+':'+e.lineno+')':'')]);});` +
        `window.addEventListener('unhandledrejection',function(e){` +
        `send('error',['Unhandled rejection: '+ser(e.reason)]);});` +
        `})()</script>`;

      if (/<head>/i.test(bodyStr)) {
        bodyStr = bodyStr.replace(/<head>/i, `<head>${injectHead}`);
      } else if (/<html[^>]*>/i.test(bodyStr)) {
        bodyStr = bodyStr.replace(/<html([^>]*)>/i, `<html$1><head>${injectHead}</head>`);
      } else {
        bodyStr = injectHead + bodyStr;
      }
    }

    if (isCss) {
      // 4. Root-relative url('/...') in CSS.
      bodyStr = bodyStr.replace(/url\((['"]?)\/(?!\/)/g, `url($1${proxyBase}/`);
    }

    const newBody = Buffer.from(bodyStr, "utf8");
    responseBody = newBody;
    // We always recompute content-length on rewrite, since chunked-transfer
    // upstreams can leave the header absent and the rewritten body length
    // typically changes regardless.
    responseHeaders["content-length"] = String(responseBody.byteLength);
    delete responseHeaders["transfer-encoding"];
  }

  return HttpServerResponse.uint8Array(new Uint8Array(responseBody), {
    status: opened.status,
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
