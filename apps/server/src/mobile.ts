import {
  ClientOrchestrationCommand,
  type OrchestrationReadModel,
  type ThreadId,
  TrimmedNonEmptyString,
} from "@t3tools/contracts";
import { buildMobileThreadSummaries } from "@t3tools/shared/orchestrationMobile";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import { Effect, FileSystem, Layer, Option, Path, Ref, Schema } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  Headers as HttpHeaders,
} from "effect/unstable/http";

import { CheckpointDiffQuery } from "./checkpointing/Services/CheckpointDiffQuery";
import { ServerConfig } from "./config";
import { normalizeDispatchCommand } from "./orchestration/Normalizer";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery";

const MOBILE_DEVICE_STATE_TTL_MS = 10 * 60 * 1000;
const MOBILE_AUTH_HEADER = "authorization";

const PairRequest = Schema.Struct({
  deviceName: TrimmedNonEmptyString,
  desktopAuthToken: Schema.optional(TrimmedNonEmptyString),
});

const DeviceRecord = Schema.Struct({
  deviceId: TrimmedNonEmptyString,
  deviceName: TrimmedNonEmptyString,
  deviceToken: TrimmedNonEmptyString,
  pairCode: TrimmedNonEmptyString,
  pairCodeExpiresAt: Schema.String,
  pairedAt: Schema.String,
  lastSeenAt: Schema.String,
  revokedAt: Schema.NullOr(Schema.String),
});
type DeviceRecord = typeof DeviceRecord.Type;

interface DevicePublic {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly pairCode: string;
  readonly pairCodeExpiresAt: string;
  readonly pairedAt: string;
  readonly lastSeenAt: string;
  readonly revokedAt: string | null;
}

const DeviceRegistry = Schema.Struct({
  devices: Schema.Array(DeviceRecord),
});

const DeviceRegistryJson = fromLenientJson(DeviceRegistry);

const RevokeRequest = Schema.Struct({
  deviceId: TrimmedNonEmptyString,
});

function nowIso(): string {
  return new Date().toISOString();
}

function createRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function createDeviceToken(): string {
  return Buffer.from(createRandomBytes(32)).toString("base64url");
}

function createPairCode(): string {
  const raw = Array.from(createRandomBytes(3), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
}

function getBearerToken(request: HttpServerRequest.HttpServerRequest): string | null {
  const header = HttpHeaders.get(request.headers, MOBILE_AUTH_HEADER);
  if (Option.isNone(header)) return null;
  const normalized = header.value.trim();
  if (!normalized) return null;
  const match = /^Bearer\s+(.+)$/i.exec(normalized);
  if (match?.[1]) {
    return match[1].trim() || null;
  }
  return normalized;
}

function toPublicDevice(device: DeviceRecord): DevicePublic {
  const { deviceToken: _deviceToken, ...publicDevice } = device;
  return publicDevice;
}

function comparePublicDevices(left: DevicePublic, right: DevicePublic): number {
  return (
    right.lastSeenAt.localeCompare(left.lastSeenAt) ||
    left.deviceName.localeCompare(right.deviceName)
  );
}

function unauthorized(message: string) {
  return HttpServerResponse.text(message, { status: 401 });
}

function badRequest(message: string) {
  return HttpServerResponse.text(message, { status: 400 });
}

export const mobileCompanionRouteLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const checkpointDiffQuery = yield* CheckpointDiffQuery;
    const devicesRef = yield* Ref.make<ReadonlyArray<DeviceRecord>>([]);

    const readRegistry = Effect.gen(function* () {
      const exists = yield* fs
        .exists(config.mobileDevicesPath)
        .pipe(Effect.orElseSucceed(() => false));
      if (!exists) {
        return { devices: [] as ReadonlyArray<DeviceRecord> };
      }
      const raw = yield* fs
        .readFileString(config.mobileDevicesPath)
        .pipe(Effect.orElseSucceed(() => `{"devices":[]}\n`));
      const decoded = Schema.decodeUnknownExit(DeviceRegistryJson)(raw);
      if (decoded._tag === "Failure") {
        yield* Effect.logWarning("failed to parse mobile device registry, using empty state", {
          path: config.mobileDevicesPath,
        });
        return { devices: [] as ReadonlyArray<DeviceRecord> };
      }
      return decoded.value;
    });

    yield* readRegistry.pipe(Effect.flatMap((registry) => Ref.set(devicesRef, registry.devices)));

    const persistRegistry = (devices: ReadonlyArray<DeviceRecord>) => {
      const encoded = `${JSON.stringify({ devices }, null, 2)}\n`;
      const tempPath = `${config.mobileDevicesPath}.${process.pid}.${Date.now()}.tmp`;
      return Effect.gen(function* () {
        yield* fs.makeDirectory(path.dirname(config.mobileDevicesPath), { recursive: true });
        yield* fs.writeFileString(tempPath, encoded);
        yield* fs.rename(tempPath, config.mobileDevicesPath);
      }).pipe(
        Effect.ensuring(fs.remove(tempPath, { force: true }).pipe(Effect.ignore({ log: true }))),
      );
    };

    const replaceDevices = (updater: (devices: ReadonlyArray<DeviceRecord>) => DeviceRecord[]) =>
      Ref.modify(devicesRef, (devices) => {
        const nextDevices = updater(devices);
        return [nextDevices, nextDevices] as const;
      }).pipe(Effect.tap(persistRegistry));

    const withAuthorizedDevice = (token: string) =>
      Ref.get(devicesRef).pipe(
        Effect.flatMap((devices) => {
          const device = devices.find(
            (entry) => entry.deviceToken === token && entry.revokedAt === null,
          );
          if (!device) {
            return Effect.fail(new Error("Unknown or revoked device token."));
          }

          const lastSeenAt = nowIso();
          return replaceDevices((current) =>
            current.map((entry) =>
              entry.deviceId === device.deviceId
                ? {
                    ...entry,
                    lastSeenAt,
                  }
                : entry,
            ),
          ).pipe(
            Effect.as({
              ...device,
              lastSeenAt,
            }),
          );
        }),
      );

    const loadSnapshot = () => projectionSnapshotQuery.getSnapshot();

    const revokeDeviceById = (deviceId: string) =>
      replaceDevices((devices) =>
        devices.map((entry) =>
          entry.deviceId === deviceId && entry.revokedAt === null
            ? { ...entry, revokedAt: nowIso() }
            : entry,
        ),
      );

    const serializeSnapshot = (
      snapshot: OrchestrationReadModel,
      device: DevicePublic,
      extra?: Record<string, unknown>,
    ) =>
      HttpServerResponse.jsonUnsafe({
        snapshot,
        threadSummaries: buildMobileThreadSummaries(snapshot),
        device,
        serverTime: nowIso(),
        ...extra,
      });

    const authorizeRequestDevice = (token: string) =>
      withAuthorizedDevice(token).pipe(
        Effect.map(Option.some),
        Effect.catch(() => Effect.succeed(Option.none<DevicePublic>())),
      );

    const pairRoute = HttpRouter.add(
      "POST",
      "/api/mobile/pair",
      Effect.gen(function* () {
        const decoded = yield* HttpServerRequest.schemaBodyJson(PairRequest).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );
        if (!decoded) {
          return badRequest("Invalid pairing payload.");
        }

        if (config.authToken && decoded.desktopAuthToken !== config.authToken) {
          return unauthorized("Invalid desktop auth token.");
        }

        const pairedAt = nowIso();
        const device: DeviceRecord = {
          deviceId: `mobile-${crypto.randomUUID()}`,
          deviceName: decoded.deviceName,
          deviceToken: createDeviceToken(),
          pairCode: createPairCode(),
          pairCodeExpiresAt: new Date(Date.now() + MOBILE_DEVICE_STATE_TTL_MS).toISOString(),
          pairedAt,
          lastSeenAt: pairedAt,
          revokedAt: null,
        };

        yield* replaceDevices((devices) => [...devices, device]);
        const snapshot = yield* loadSnapshot();
        return serializeSnapshot(snapshot, toPublicDevice(device), {
          paired: true,
          deviceToken: device.deviceToken,
        });
      }),
    );

    const snapshotRoute = HttpRouter.add(
      "GET",
      "/api/mobile/snapshot",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = getBearerToken(request);
        if (!token) {
          return unauthorized("Missing device token.");
        }
        const device = yield* authorizeRequestDevice(token);
        if (Option.isNone(device)) {
          return unauthorized("Unknown or revoked device token.");
        }
        const snapshot = yield* loadSnapshot();
        return serializeSnapshot(snapshot, device.value);
      }),
    );

    const dispatchRoute = HttpRouter.add(
      "POST",
      "/api/mobile/dispatch",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = getBearerToken(request);
        if (!token) {
          return unauthorized("Missing device token.");
        }
        const device = yield* authorizeRequestDevice(token);
        if (Option.isNone(device)) {
          return unauthorized("Unknown or revoked device token.");
        }
        const command = yield* HttpServerRequest.schemaBodyJson(ClientOrchestrationCommand).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );
        if (!command) {
          return badRequest("Invalid orchestration command payload.");
        }

        const normalizedCommand = yield* normalizeDispatchCommand(command);
        const result = yield* orchestrationEngine.dispatch(normalizedCommand);
        const snapshot = yield* loadSnapshot();
        return HttpServerResponse.jsonUnsafe({
          result,
          snapshot,
          threadSummaries: buildMobileThreadSummaries(snapshot),
          device: device.value,
        });
      }),
    );

    const diffRoute = HttpRouter.add(
      "GET",
      "/api/mobile/diff",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = getBearerToken(request);
        if (!token) {
          return unauthorized("Missing device token.");
        }
        const device = yield* authorizeRequestDevice(token);
        if (Option.isNone(device)) {
          return unauthorized("Unknown or revoked device token.");
        }
        const url = HttpServerRequest.toURL(request);
        if (Option.isNone(url)) {
          return badRequest("Invalid mobile diff URL.");
        }

        const threadId = url.value.searchParams.get("threadId");
        const toTurnCount = url.value.searchParams.get("toTurnCount");
        const fromTurnCount = url.value.searchParams.get("fromTurnCount");
        if (!threadId || !toTurnCount) {
          return badRequest("Missing threadId or toTurnCount.");
        }

        const parsedToTurnCount = Number(toTurnCount);
        if (!Number.isFinite(parsedToTurnCount) || parsedToTurnCount < 0) {
          return badRequest("Invalid toTurnCount.");
        }

        if (fromTurnCount !== null) {
          const parsedFromTurnCount = Number(fromTurnCount);
          if (!Number.isFinite(parsedFromTurnCount) || parsedFromTurnCount < 0) {
            return badRequest("Invalid fromTurnCount.");
          }
          const diff = yield* checkpointDiffQuery.getTurnDiff({
            threadId: threadId as ThreadId,
            fromTurnCount: parsedFromTurnCount,
            toTurnCount: parsedToTurnCount,
          });
          return HttpServerResponse.jsonUnsafe({
            diff,
            device: device.value,
          });
        }

        const diff = yield* checkpointDiffQuery.getFullThreadDiff({
          threadId: threadId as ThreadId,
          toTurnCount: parsedToTurnCount,
        });
        return HttpServerResponse.jsonUnsafe({
          diff,
          device: device.value,
        });
      }),
    );

    const devicesRoute = HttpRouter.add(
      "GET",
      "/api/mobile/devices",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = getBearerToken(request);
        if (!token) {
          return unauthorized("Missing device token.");
        }
        const device = yield* authorizeRequestDevice(token);
        if (Option.isNone(device)) {
          return unauthorized("Unknown or revoked device token.");
        }
        const devices = yield* Ref.get(devicesRef);
        return HttpServerResponse.jsonUnsafe({
          devices: devices
            .filter((entry) => entry.revokedAt === null)
            .map(toPublicDevice)
            .toSorted(comparePublicDevices),
          device: device.value,
        });
      }),
    );

    const revokeRoute = HttpRouter.add(
      "POST",
      "/api/mobile/devices/revoke",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const token = getBearerToken(request);
        if (!token) {
          return unauthorized("Missing device token.");
        }
        let actingDevice: DevicePublic | null = null;
        const decoded = yield* HttpServerRequest.schemaBodyJson(RevokeRequest).pipe(
          Effect.catch(() => Effect.succeed(null)),
        );
        if (!decoded) {
          return badRequest("Invalid revoke payload.");
        }

        if (config.authToken && token === config.authToken) {
          yield* revokeDeviceById(decoded.deviceId);
        } else {
          const currentDevice = yield* authorizeRequestDevice(token);
          if (Option.isNone(currentDevice)) {
            return unauthorized("Unknown or revoked device token.");
          }
          actingDevice = currentDevice.value;
          yield* revokeDeviceById(decoded.deviceId);
        }

        const devices = yield* Ref.get(devicesRef);
        const fallbackDeviceRecord: DeviceRecord = {
          deviceId: "desktop",
          deviceName: "Bird Code Desktop",
          deviceToken: "desktop-admin",
          pairCode: "DESK-ADM",
          pairCodeExpiresAt: nowIso(),
          pairedAt: nowIso(),
          lastSeenAt: nowIso(),
          revokedAt: null,
        };
        const responseDevice =
          actingDevice ??
          toPublicDevice(
            devices.find((entry) => entry.revokedAt === null) ?? devices[0] ?? fallbackDeviceRecord,
          );
        return HttpServerResponse.jsonUnsafe({
          devices: devices
            .filter((entry) => entry.revokedAt === null)
            .map(toPublicDevice)
            .toSorted(comparePublicDevices),
          device: responseDevice,
        });
      }),
    );

    return Layer.mergeAll(
      pairRoute,
      snapshotRoute,
      dispatchRoute,
      diffRoute,
      devicesRoute,
      revokeRoute,
    );
  }),
);
