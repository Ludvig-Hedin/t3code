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
    const parsed = JSON.parse(raw) as Partial<RemoteSettings>;
    return { ...defaultRemoteSettings, ...parsed };
  } catch {
    return { ...defaultRemoteSettings };
  }
}

export function writeRemoteSettings(userDataPath: string, settings: RemoteSettings): void {
  const filePath = Path.join(userDataPath, SETTINGS_FILE);
  FS.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
}
