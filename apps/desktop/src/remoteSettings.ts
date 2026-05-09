import * as FS from "node:fs";
import * as Path from "node:path";

import type { RemoteSettings } from "@t3tools/contracts";

export { type RemoteSettings };

const SETTINGS_FILE = "remote-settings.json";

export const defaultRemoteSettings: RemoteSettings = {
  remoteAccessEnabled: false,
  keepAwakeEnabled: false,
  tunnelName: null,
  tunnelUrl: null,
};

export function readRemoteSettings(userDataPath: string): RemoteSettings {
  const filePath = Path.join(userDataPath, SETTINGS_FILE);
  try {
    const raw = FS.readFileSync(filePath, "utf8");
    // Use unknown instead of an unsafe cast so we validate each property type.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const validated: Partial<RemoteSettings> = {};
    if (typeof parsed.remoteAccessEnabled === "boolean") {
      validated.remoteAccessEnabled = parsed.remoteAccessEnabled;
    }
    if (typeof parsed.keepAwakeEnabled === "boolean") {
      validated.keepAwakeEnabled = parsed.keepAwakeEnabled;
    }
    if (typeof parsed.tunnelName === "string" || parsed.tunnelName === null) {
      validated.tunnelName = parsed.tunnelName as string | null;
    }
    if (typeof parsed.tunnelUrl === "string" || parsed.tunnelUrl === null) {
      validated.tunnelUrl = parsed.tunnelUrl as string | null;
    }
    return { ...defaultRemoteSettings, ...validated };
  } catch (err) {
    // ENOENT is expected on first run — skip logging for that case.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[remoteSettings] Failed to read ${filePath}: ${(err as Error).message}`);
    }
    return { ...defaultRemoteSettings };
  }
}

export function writeRemoteSettings(userDataPath: string, settings: RemoteSettings): void {
  const filePath = Path.join(userDataPath, SETTINGS_FILE);
  FS.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
}

// Promise-chain mutex so concurrent callers (keep-awake IPC handler + tunnel
// manager) don't read-modify-write `remote-settings.json` and clobber each
// other. All updates funnel through `updateRemoteSettings` and run serially.
let writeQueue: Promise<RemoteSettings> = Promise.resolve(defaultRemoteSettings);

/**
 * Atomically read-modify-write the remote-settings file. The merger receives
 * the latest persisted settings and returns the patch (or full settings) to
 * persist. Returns the resulting merged settings.
 */
export function updateRemoteSettings(
  userDataPath: string,
  merger: (current: RemoteSettings) => Partial<RemoteSettings>,
): Promise<RemoteSettings> {
  const next = writeQueue.then(() => {
    const current = readRemoteSettings(userDataPath);
    const patch = merger(current);
    const merged: RemoteSettings = { ...current, ...patch };
    writeRemoteSettings(userDataPath, merged);
    return merged;
  });
  // Keep the queue alive even if a step rejects, so subsequent updates still
  // run. We swallow the error here for the chain — callers see it via `next`.
  writeQueue = next.catch(() => readRemoteSettings(userDataPath));
  return next;
}
