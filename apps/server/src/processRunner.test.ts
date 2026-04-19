import { describe, expect, it } from "vitest";

import { runProcess } from "./processRunner";

describe("runProcess", () => {
  it("fails when output exceeds max buffer in default mode", async () => {
    await expect(
      runProcess("node", ["-e", "process.stdout.write('x'.repeat(2048))"], { maxBufferBytes: 128 }),
    ).rejects.toThrow("exceeded stdout buffer limit");
  });

  it("truncates output when outputMode is truncate", async () => {
    const result = await runProcess("node", ["-e", "process.stdout.write('x'.repeat(2048))"], {
      maxBufferBytes: 128,
      outputMode: "truncate",
    });

    expect(result.code).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(128);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(false);
  });

  it("invokes stdout chunk callbacks while still collecting output", async () => {
    const chunks: string[] = [];

    const result = await runProcess(
      "node",
      ["-e", "process.stdout.write('hello'); process.stdout.write(' world')"],
      {
        onStdoutChunk: (chunk) => {
          chunks.push(chunk);
        },
      },
    );

    expect(result.stdout).toBe("hello world");
    expect(chunks.join("")).toBe("hello world");
  });
});
