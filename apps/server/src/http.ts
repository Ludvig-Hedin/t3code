import Mime from "@effect/platform-node/Mime";
import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as Multipart from "effect/unstable/http/Multipart";

import {
  ATTACHMENTS_ROUTE_PREFIX,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from "./attachmentPaths";
import { resolveAttachmentPathById } from "./attachmentStore";
import { ServerConfig } from "./config";
import { ProjectFaviconResolver } from "./project/Services/ProjectFaviconResolver";
import { requestWhisperTranscription, resolveWhisperConfig } from "./transcription/whisperHttp";

const PROJECT_FAVICON_CACHE_CONTROL = "public, max-age=3600";
const FALLBACK_PROJECT_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6b728080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-fallback="project-favicon"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z"/></svg>`;

const TranscriptionUploadBody = Schema.Struct({
  file: Multipart.SingleFileSchema,
});

/**
 * Prefer `Authorization: Bearer` or `X-Auth-Token` for HTTP auth.
 * Query `?token=` is disabled by default (credentials leak via Referer, logs, and
 * browser history). Set `enableInsecureQueryToken` on server config only for
 * legacy clients that cannot send headers.
 */
function readRequestAuthToken(
  request: HttpServerRequest.HttpServerRequest,
  options: { readonly enableInsecureQueryToken: boolean },
): string | null {
  const headers = request.headers as Record<string, string | string[] | undefined>;
  const authHeader = headers.authorization ?? headers.Authorization;
  if (typeof authHeader === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]) {
      return match[1];
    }
  }

  const xAuth = headers["x-auth-token"] ?? headers["X-Auth-Token"] ?? headers["X-AUTH-TOKEN"];
  if (typeof xAuth === "string" && xAuth.trim().length > 0) {
    return xAuth.trim();
  }

  if (options.enableInsecureQueryToken) {
    const url = HttpServerRequest.toURL(request);
    if (Option.isSome(url)) {
      return url.value.searchParams.get("token");
    }
  }

  return null;
}

function authorizeServerHttpRequest(
  request: HttpServerRequest.HttpServerRequest,
  config: { readonly authToken: string | undefined; readonly enableInsecureQueryToken: boolean },
) {
  if (!config.authToken) {
    return null;
  }

  const token = readRequestAuthToken(request, {
    enableInsecureQueryToken: config.enableInsecureQueryToken,
  });
  if (token === config.authToken) {
    return null;
  }

  return HttpServerResponse.text("Unauthorized request", { status: 401 });
}

export const attachmentsRouteLayer = HttpRouter.add(
  "GET",
  `${ATTACHMENTS_ROUTE_PREFIX}/*`,
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig;
    const rawRelativePath = url.value.pathname.slice(ATTACHMENTS_ROUTE_PREFIX.length);
    const normalizedRelativePath = normalizeAttachmentRelativePath(rawRelativePath);
    if (!normalizedRelativePath) {
      return HttpServerResponse.text("Invalid attachment path", { status: 400 });
    }

    const isIdLookup =
      !normalizedRelativePath.includes("/") && !normalizedRelativePath.includes(".");
    const filePath = isIdLookup
      ? resolveAttachmentPathById({
          attachmentsDir: config.attachmentsDir,
          attachmentId: normalizedRelativePath,
        })
      : resolveAttachmentRelativePath({
          attachmentsDir: config.attachmentsDir,
          relativePath: normalizedRelativePath,
        });
    if (!filePath) {
      return HttpServerResponse.text(isIdLookup ? "Not Found" : "Invalid attachment path", {
        status: isIdLookup ? 404 : 400,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    return yield* HttpServerResponse.file(filePath, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
      ),
    );
  }),
);

export const projectFaviconRouteLayer = HttpRouter.add(
  "GET",
  "/api/project-favicon",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const projectCwd = url.value.searchParams.get("cwd");
    if (!projectCwd) {
      return HttpServerResponse.text("Missing cwd parameter", { status: 400 });
    }

    const faviconResolver = yield* ProjectFaviconResolver;
    const faviconFilePath = yield* faviconResolver.resolvePath(projectCwd);
    if (!faviconFilePath) {
      return HttpServerResponse.text(FALLBACK_PROJECT_FAVICON_SVG, {
        status: 200,
        contentType: "image/svg+xml",
        headers: {
          "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL,
        },
      });
    }

    return yield* HttpServerResponse.file(faviconFilePath, {
      status: 200,
      headers: {
        "Cache-Control": PROJECT_FAVICON_CACHE_CONTROL,
      },
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(HttpServerResponse.text("Internal Server Error", { status: 500 })),
      ),
    );
  }),
);

export const transcriptionRouteLayer = HttpRouter.add(
  "POST",
  "/api/transcribe",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;

    const unauthorizedResponse = authorizeServerHttpRequest(request, config);
    if (unauthorizedResponse) {
      return unauthorizedResponse;
    }

    const body = yield* HttpServerRequest.schemaBodyMultipart(TranscriptionUploadBody).pipe(
      Effect.catch(() =>
        Effect.succeed(
          HttpServerResponse.text("Expected multipart form data with a file field.", {
            status: 400,
          }),
        ),
      ),
    );

    if (body instanceof HttpServerResponse.HttpServerResponse) {
      return body;
    }

    // Reject oversized uploads before loading the whole file into memory.
    const fileInfo = yield* FileSystem.FileSystem.pipe(
      Effect.flatMap((fs) => fs.stat(body.file.path)),
      Effect.catch(() => Effect.succeed(null)),
    );
    if (fileInfo && fileInfo.size > FileSystem.MiB(50)) {
      return HttpServerResponse.text("Audio file too large (50 MiB maximum).", { status: 413 });
    }

    const binary = yield* FileSystem.FileSystem.pipe(
      Effect.flatMap((fileSystem) => fileSystem.readFile(body.file.path)),
      Effect.catch(() =>
        Effect.succeed<Uint8Array | HttpServerResponse.HttpServerResponse>(
          HttpServerResponse.text("Unable to read uploaded audio.", { status: 400 }),
        ),
      ),
    );

    if (binary instanceof HttpServerResponse.HttpServerResponse) {
      return binary;
    }

    const startedAt = performance.now();
    const result = yield* requestWhisperTranscription({
      config: resolveWhisperConfig(),
      upload: {
        binary,
        mimeType: body.file.contentType || "audio/webm",
        fileName: body.file.name || "recording.webm",
      },
    }).pipe(
      Effect.tapBoth({
        onFailure: (error) =>
          Effect.sync(() => {
            console.info("[voice-transcription] server_http_failed", {
              code: error.code,
              durationMs: Math.round(performance.now() - startedAt),
            });
          }),
        onSuccess: () =>
          Effect.sync(() => {
            console.info("[voice-transcription] server_http_completed", {
              durationMs: Math.round(performance.now() - startedAt),
            });
          }),
      }),
      Effect.match({
        onFailure: (error) =>
          HttpServerResponse.json(
            { code: error.code, message: error.message },
            {
              status: error.code === "unavailable" ? 503 : 502,
            },
          ),
        onSuccess: (result) => HttpServerResponse.json(result, { status: 200 }),
      }),
    );

    return result;
  }),
);

export const staticAndDevRouteLayer = HttpRouter.add(
  "GET",
  "*",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    if (Option.isNone(url)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }

    const config = yield* ServerConfig;
    if (config.devUrl) {
      // In dev mode the Vite dev server only listens on localhost, so a redirect
      // to config.devUrl would send mobile clients (WKWebView on a phone) to
      // localhost on the *phone*, where nothing is listening.
      // Proxy the request through the desktop server instead so mobile clients
      // get the correct HTML/JS/CSS without knowing about the Vite dev server.
      const targetUrl = new URL(url.value.pathname + url.value.search, config.devUrl.href);
      // Proxy failures are infrastructure defects — callers cannot recover from them.
      const proxied = yield* Effect.tryPromise(() => fetch(targetUrl.href)).pipe(Effect.orDie);
      const body = yield* Effect.tryPromise(() => proxied.arrayBuffer()).pipe(Effect.orDie);
      const contentType = proxied.headers.get("content-type") ?? "application/octet-stream";
      return HttpServerResponse.uint8Array(new Uint8Array(body), {
        status: proxied.status,
        contentType,
      });
    }

    if (!config.staticDir) {
      return HttpServerResponse.text("No static directory configured and no dev URL set.", {
        status: 503,
      });
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const staticRoot = path.resolve(config.staticDir);
    const staticRequestPath = url.value.pathname === "/" ? "/index.html" : url.value.pathname;
    const rawStaticRelativePath = staticRequestPath.replace(/^[/\\]+/, "");
    const hasRawLeadingParentSegment = rawStaticRelativePath.startsWith("..");
    const staticRelativePath = path.normalize(rawStaticRelativePath).replace(/^[/\\]+/, "");
    const hasPathTraversalSegment = staticRelativePath.startsWith("..");
    if (
      staticRelativePath.length === 0 ||
      hasRawLeadingParentSegment ||
      hasPathTraversalSegment ||
      staticRelativePath.includes("\0")
    ) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const isWithinStaticRoot = (candidate: string) =>
      candidate === staticRoot ||
      candidate.startsWith(staticRoot.endsWith(path.sep) ? staticRoot : `${staticRoot}${path.sep}`);

    let filePath = path.resolve(staticRoot, staticRelativePath);
    if (!isWithinStaticRoot(filePath)) {
      return HttpServerResponse.text("Invalid static file path", { status: 400 });
    }

    const ext = path.extname(filePath);
    if (!ext) {
      filePath = path.resolve(filePath, "index.html");
      if (!isWithinStaticRoot(filePath)) {
        return HttpServerResponse.text("Invalid static file path", { status: 400 });
      }
    }

    const fileInfo = yield* fileSystem
      .stat(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!fileInfo || fileInfo.type !== "File") {
      const indexPath = path.resolve(staticRoot, "index.html");
      const indexData = yield* fileSystem
        .readFile(indexPath)
        .pipe(Effect.catch(() => Effect.succeed(null)));
      if (!indexData) {
        return HttpServerResponse.text("Not Found", { status: 404 });
      }
      return HttpServerResponse.uint8Array(indexData, {
        status: 200,
        contentType: "text/html; charset=utf-8",
      });
    }

    const contentType = Mime.getType(filePath) ?? "application/octet-stream";
    const data = yield* fileSystem
      .readFile(filePath)
      .pipe(Effect.catch(() => Effect.succeed(null)));
    if (!data) {
      return HttpServerResponse.text("Internal Server Error", { status: 500 });
    }

    return HttpServerResponse.uint8Array(data, {
      status: 200,
      contentType,
    });
  }),
);
