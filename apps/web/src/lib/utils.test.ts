import { assert, afterEach, beforeEach, describe, it, vi } from "vitest";

import { isWindowsPlatform, resolveApiUrl } from "./utils";

beforeEach(() => {
  vi.stubGlobal("window", {
    desktopBridge: {
      getWsUrl: () => "ws://localhost:4321",
    },
    location: {
      origin: "http://localhost:5733",
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isWindowsPlatform", () => {
  it("matches Windows platform identifiers", () => {
    assert.isTrue(isWindowsPlatform("Win32"));
    assert.isTrue(isWindowsPlatform("Windows"));
    assert.isTrue(isWindowsPlatform("windows_nt"));
  });

  it("does not match darwin", () => {
    assert.isFalse(isWindowsPlatform("darwin"));
  });
});

describe("resolveApiUrl", () => {
  it("converts websocket server URLs to http api URLs", () => {
    const apiUrl = resolveApiUrl({
      pathname: "/api/setup/import/scan",
    });

    assert.match(apiUrl, /^http:/);
    assert.include(apiUrl, "/api/setup/import/scan");
  });
});
