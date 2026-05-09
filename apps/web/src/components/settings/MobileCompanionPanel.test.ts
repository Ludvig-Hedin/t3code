import { afterEach, assert, describe, it, vi } from "vitest";

import { resolveDesktopPairingCode } from "./MobileCompanionPanel";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveDesktopPairingCode", () => {
  it("returns the exact main-process pairing code", () => {
    vi.stubGlobal("window", {
      desktopBridge: {
        getPairingCode: () =>
          "birdcode://pair?payload=eyJraW5kIjoiYmlyZGNvZGUtcGFpcmluZyIsImxvY2FsU2VydmVyVVJMIjoiaHR0cDovLzE5Mi4xNjguMS4xMjozNzczIiwic2VydmVyVVJMIjoiaHR0cHM6Ly91dWlkLmNmYXJnb3R1bm5lbC5jb20ifQ",
      },
    });

    assert.equal(
      resolveDesktopPairingCode(),
      "birdcode://pair?payload=eyJraW5kIjoiYmlyZGNvZGUtcGFpcmluZyIsImxvY2FsU2VydmVyVVJMIjoiaHR0cDovLzE5Mi4xNjguMS4xMjozNzczIiwic2VydmVyVVJMIjoiaHR0cHM6Ly91dWlkLmNmYXJnb3R1bm5lbC5jb20ifQ",
    );
  });

  it("trims whitespace and treats an empty bridge response as unavailable", () => {
    vi.stubGlobal("window", {
      desktopBridge: {
        getPairingCode: () => "  \n  ",
      },
    });

    assert.isNull(resolveDesktopPairingCode());
  });
});
