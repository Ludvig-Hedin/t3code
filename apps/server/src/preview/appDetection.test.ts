import { describe, expect, it } from "vitest";
import {
  detectPortFromLine,
  buildDetectionCandidates,
  detectPackageManager,
  createStandalonePreviewCommand,
  parseStandalonePreviewCommand,
} from "./appDetection";

describe("detectPortFromLine", () => {
  it("detects vite local URL", () => {
    expect(detectPortFromLine("  ➜  Local:   http://localhost:5173/")).toBe(5173);
  });
  it("detects next.js output", () => {
    expect(detectPortFromLine("   - Local:        http://localhost:3000")).toBe(3000);
  });
  it("detects plain localhost:PORT", () => {
    expect(detectPortFromLine("Server running at http://localhost:8080")).toBe(8080);
  });
  it("detects 127.0.0.1:PORT", () => {
    expect(detectPortFromLine("Listening on 127.0.0.1:4000")).toBe(4000);
  });
  it("detects 0.0.0.0:PORT patterns", () => {
    expect(detectPortFromLine("Running on http://0.0.0.0:5000")).toBe(5000);
  });
  it("detects 'Listening on port N'", () => {
    expect(detectPortFromLine("Listening on port 3001")).toBe(3001);
  });
  it("returns null for non-port lines", () => {
    expect(detectPortFromLine("Compiling... done in 1.2s")).toBeNull();
  });
  it("ignores port 0", () => {
    expect(detectPortFromLine("listening on 0.0.0.0:0")).toBeNull();
  });
});

describe("buildDetectionCandidates", () => {
  it("returns web candidate for root package.json with dev script", () => {
    const entries = [{ relativePath: "package.json", hasDevScript: true, hasBunLock: true }];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.id).toBe("web");
    expect(candidates[0]!.command).toBe("bun run dev");
    expect(candidates[0]!.type).toBe("browser");
  });

  it("finds apps/web as separate candidate", () => {
    const entries = [
      { relativePath: "apps/web/package.json", hasDevScript: true, hasBunLock: false },
    ];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates.some((c) => c.id === "web" && c.cwd === "/repo/apps/web")).toBe(true);
  });

  it("marks server apps as logs type", () => {
    const entries = [
      { relativePath: "apps/server/package.json", hasDevScript: true, hasBunLock: true },
    ];
    const candidates = buildDetectionCandidates("/repo", entries);
    const server = candidates.find((c) => c.id === "server");
    expect(server?.type).toBe("logs");
  });

  it("detects python manage.py", () => {
    const entries = [{ relativePath: "manage.py", hasDevScript: false, hasBunLock: false }];
    const candidates = buildDetectionCandidates("/repo", entries);
    expect(candidates.some((c) => c.command.includes("manage.py"))).toBe(true);
  });

  it("detects a standalone html file", () => {
    const entries = [{ relativePath: "index.html", hasDevScript: false, hasBunLock: false }];
    const candidates = buildDetectionCandidates("/repo", entries);
    const html = candidates.find((c) => c.id === "html");
    expect(html).toMatchObject({
      id: "html",
      label: "HTML",
      cwd: "/repo",
      type: "browser",
    });
    expect(parseStandalonePreviewCommand(html?.command ?? "")).toEqual({
      relativePath: "index.html",
      kind: "html",
    });
  });

  it("encodes standalone preview commands", () => {
    const command = createStandalonePreviewCommand({
      relativePath: "notes.md",
      kind: "markdown",
    });
    expect(parseStandalonePreviewCommand(command)).toEqual({
      relativePath: "notes.md",
      kind: "markdown",
    });
  });
});

describe("detectPackageManager", () => {
  it("returns bun when bun.lock present", () => {
    expect(detectPackageManager(["bun.lock", "package.json"])).toBe("bun");
  });
  it("returns pnpm when pnpm-lock.yaml present", () => {
    expect(detectPackageManager(["pnpm-lock.yaml", "package.json"])).toBe("pnpm");
  });
  it("returns yarn when yarn.lock present", () => {
    expect(detectPackageManager(["yarn.lock", "package.json"])).toBe("yarn");
  });
  it("falls back to npm", () => {
    expect(detectPackageManager(["package.json"])).toBe("npm");
  });
});
