import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readRemoteSettings, writeRemoteSettings, defaultRemoteSettings } from "./remoteSettings";

describe("remoteSettings", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = FS.mkdtempSync(Path.join(OS.tmpdir(), "birdcode-test-"));
  });

  afterEach(() => {
    FS.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when file does not exist", () => {
    const settings = readRemoteSettings(tmpDir);
    expect(settings).toEqual(defaultRemoteSettings);
  });

  it("round-trips settings", () => {
    const s = {
      remoteAccessEnabled: true,
      keepAwakeEnabled: true,
      tunnelName: "birdcode-abc",
      tunnelUrl: "https://abc.cfargotunnel.com",
    };
    writeRemoteSettings(tmpDir, s);
    expect(readRemoteSettings(tmpDir)).toEqual(s);
  });

  it("returns defaults on corrupted file", () => {
    const filePath = Path.join(tmpDir, "remote-settings.json");
    FS.writeFileSync(filePath, "{ not valid json }");
    expect(readRemoteSettings(tmpDir)).toEqual(defaultRemoteSettings);
  });
});
