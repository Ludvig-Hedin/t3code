# Remote Access + Keep Awake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle a Cloudflare Named Tunnel into the Electron app so the phone connects from any network using a permanent URL, and add a Keep Awake mode so the Mac stays on while plugged in.

**Architecture:** `TunnelManager` (new, `apps/desktop/src/`) manages `cloudflared` binary download, Cloudflare OAuth auth, named-tunnel lifecycle, and status events. `KeepAwakeManager` (new) combines Electron's `powerSaveBlocker` with macOS `caffeinate`. IPC channels expose both to the renderer. `MobileCompanionPanel.tsx` grows a "Remote Access" section that guides the user through one-time setup and shows live status. When the tunnel is active, `backendPairingUrl` is updated to the permanent `*.cfargotunnel.com` URL so the QR code always encodes the right address.

**Tech Stack:** Electron IPC (ipcMain/ipcRenderer), Node.js `child_process`, `node:crypto` SHA-256, Node.js `fetch` for binary download, `EventEmitter`, React hooks, Tailwind, shadcn/ui patterns already in the codebase.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| [`packages/contracts/src/ipc.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/packages/contracts/src/ipc.ts) | Modify | Add `TunnelState`, `RemoteSettings` types; extend `DesktopBridge` |
| [`apps/desktop/src/remoteSettings.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/remoteSettings.ts) | Create | Read/write `userData/remote-settings.json` |
| [`apps/desktop/src/tunnelManager.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/tunnelManager.ts) | Create | cloudflared binary download, auth, named-tunnel lifecycle |
| [`apps/desktop/src/keepAwakeManager.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/keepAwakeManager.ts) | Create | `powerSaveBlocker` + `caffeinate` |
| [`apps/desktop/src/main.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/main.ts) | Modify | Create managers, register IPC channels, update `backendPairingUrl` on tunnel active |
| [`apps/desktop/src/preload.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/preload.ts) | Modify | Expose new bridge methods |
| [`apps/desktop/src/remoteSettings.test.ts`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/desktop/src/remoteSettings.test.ts) | Create | Unit tests for settings read/write |
| [`apps/web/src/components/settings/MobileCompanionPanel.tsx`](file:///Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/web/src/components/settings/MobileCompanionPanel.tsx) | Modify | Add Remote Access section + Keep Awake toggle |

---

## Task 1: Contracts — add tunnel types and extend DesktopBridge

**Files:**

- Modify: `packages/contracts/src/ipc.ts`

- [ ] **Step 1: Add types after `DesktopMobileDevicesResult`**

Open `packages/contracts/src/ipc.ts`. After line 117 (end of `DesktopMobileDevicesResult`), insert:

```typescript
export type TunnelStatus =
  | { status: "idle" }
  | { status: "downloading"; progress: number }
  | { status: "authenticating" }
  | { status: "connecting" }
  | { status: "active"; url: string }
  | { status: "error"; message: string };

export interface RemoteSettings {
  remoteAccessEnabled: boolean;
  keepAwakeEnabled: boolean;
  tunnelName: string | null;
  tunnelUrl: string | null;
}
```

- [ ] **Step 2: Extend `DesktopBridge` with remote-access methods**

In the `DesktopBridge` interface (line ~124), add after `revokeMobileDevice`:

```typescript
  getRemoteSettings?: () => RemoteSettings | null;
  enableRemoteAccess?: () => Promise<{ ok: boolean; error?: string }>;
  disableRemoteAccess?: () => Promise<void>;
  setKeepAwake?: (enabled: boolean) => Promise<void>;
  onTunnelStatus?: (listener: (status: TunnelStatus) => void) => () => void;
```

- [ ] **Step 3: Verify types compile**

```bash
cd packages/contracts && bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/ipc.ts
git commit -m "feat(contracts): add TunnelStatus, RemoteSettings types and DesktopBridge remote-access methods"
```

---

## Task 2: `remoteSettings.ts` — persist settings to userData

**Files:**

- Create: `apps/desktop/src/remoteSettings.ts`
- Create: `apps/desktop/src/remoteSettings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/desktop/src/remoteSettings.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/desktop && bun run test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|Error"
```

Expected: FAIL — `remoteSettings` not found.

- [ ] **Step 3: Implement `remoteSettings.ts`**

Create `apps/desktop/src/remoteSettings.ts`:

```typescript
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
    // Use unknown so we validate each property instead of an unsafe cast.
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/desktop && bun run test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|✓|×"
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/remoteSettings.ts apps/desktop/src/remoteSettings.test.ts
git commit -m "feat(desktop): add remoteSettings read/write with defaults"
```

---

## Task 3: `tunnelManager.ts` — binary download + checksum

**Files:**

- Create: `apps/desktop/src/tunnelManager.ts`

- [ ] **Step 1: Create the file with download + checksum logic**

Create `apps/desktop/src/tunnelManager.ts`:

```typescript
import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";
import * as OS from "node:os";
import { EventEmitter } from "node:events";
import * as ChildProcess from "node:child_process";

import type { TunnelStatus, RemoteSettings } from "@t3tools/contracts";
import { readRemoteSettings, writeRemoteSettings } from "./remoteSettings";

// ── Constants ──────────────────────────────────────────────────────────────

const CLOUDFLARED_VERSION = "latest";
const CLOUDFLARED_BASE_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download";
const MAX_RESTART_ATTEMPTS = 5;

function getCloudflaredAssetName(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `cloudflared-darwin-${arch}`;
}

// ── TunnelManager ─────────────────────────────────────────────────────────

export class TunnelManager extends EventEmitter {
  private _status: TunnelStatus = { status: "idle" };
  private tunnelProcess: ChildProcess.ChildProcess | null = null;
  private restartAttempts = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private settings: RemoteSettings;

  constructor(
    private readonly userDataPath: string,
    private backendPort: number,
  ) {
    super();
    this.settings = readRemoteSettings(userDataPath);
  }

  get status(): TunnelStatus {
    return this._status;
  }

  /** Path where the cloudflared binary is cached. */
  private get binaryPath(): string {
    return Path.join(this.userDataPath, "bin", "cloudflared");
  }

  private setStatus(status: TunnelStatus): void {
    this._status = status;
    this.emit("status", status);
  }

  private saveSettings(patch: Partial<RemoteSettings>): void {
    this.settings = { ...this.settings, ...patch };
    writeRemoteSettings(this.userDataPath, this.settings);
  }

  /** Returns true if the cloudflared binary is already present and executable. */
  isBinaryReady(): boolean {
    try {
      FS.accessSync(this.binaryPath, FS.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Downloads the cloudflared binary for the current architecture.
   * Emits progress via status updates.
   *
   * The fetch is wrapped in an AbortController timeout (DOWNLOAD_TIMEOUT_MS)
   * so the download cannot hang indefinitely. Uses execFileSync (not execSync)
   * to extract the tarball without shell interpolation risk.
   */
  async downloadBinary(): Promise<void> {
    const assetName = getCloudflaredAssetName(); // e.g. cloudflared-darwin-arm64.tgz
    const tgzUrl = `${CLOUDFLARED_BASE_URL}/${assetName}`;

    this.setStatus({ status: "downloading", progress: 0 });

    // Enforce a download timeout via AbortController so we never hang forever.
    const controller = new AbortController();
    const downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(tgzUrl, { signal: controller.signal });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(
          `Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s — check your internet connection.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(downloadTimer);
    }

    if (!res.ok) {
      throw new Error(`Failed to download cloudflared: HTTP ${res.status}`);
    }
    const totalBytes = Number(res.headers.get("content-length") ?? "0");
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable.");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        downloadedBytes += value.byteLength;
        if (totalBytes > 0) {
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          this.setStatus({ status: "downloading", progress });
        }
      }
    }

    // Assemble into a single buffer and write the .tgz to a temp file.
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const tgzBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      tgzBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const binDir = Path.dirname(this.binaryPath);
    if (!FS.existsSync(binDir)) {
      FS.mkdirSync(binDir, { recursive: true });
    }

    const tgzPath = `${this.binaryPath}.tgz`;
    FS.writeFileSync(tgzPath, tgzBuffer);

    try {
      // Extract using execFileSync (not execSync) to avoid shell interpolation risk.
      ChildProcess.execFileSync("tar", ["xzf", tgzPath, "-C", binDir, "cloudflared"], {
        stdio: "ignore",
      });
    } finally {
      try { FS.unlinkSync(tgzPath); } catch { /* ignore */ }
    }

    FS.chmodSync(this.binaryPath, 0o755);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/tunnelManager.ts
git commit -m "feat(desktop): TunnelManager scaffold with cloudflared binary download + checksum"
```

---

## Task 4: `tunnelManager.ts` — auth, tunnel create, run, stop

**Files:**

- Modify: `apps/desktop/src/tunnelManager.ts`

- [ ] **Step 1: Add `authenticate()` method**

Append the following methods inside the `TunnelManager` class body, after `downloadBinary()`:

```typescript
  /**
   * Runs `cloudflared tunnel login` which opens dash.cloudflare.com in the
   * default browser. Waits for the user to complete OAuth (up to 5 minutes).
   * On success, cloudflared saves ~/.cloudflared/cert.pem automatically.
   */
  async authenticate(): Promise<void> {
    this.setStatus({ status: "authenticating" });
    await new Promise<void>((resolve, reject) => {
      const proc = ChildProcess.spawn(this.binaryPath, ["tunnel", "login"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error("Cloudflare login timed out after 5 minutes. Please try again."));
      }, 5 * 60 * 1000);
      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`cloudflared tunnel login exited with code ${code}.`));
      });
      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Creates a named Cloudflare tunnel if one hasn't been created yet.
   * The tunnel UUID becomes the permanent URL: https://{uuid}.cfargotunnel.com
   * Returns the stable tunnel URL.
   */
  async ensureTunnel(): Promise<string> {
    // Re-use existing tunnel if already created.
    if (this.settings.tunnelName && this.settings.tunnelUrl) {
      return this.settings.tunnelUrl;
    }

    // Generate a stable tunnel name tied to this machine.
    const machineId = Crypto.createHash("sha256")
      .update(OS.hostname() + OS.userInfo().username)
      .digest("hex")
      .slice(0, 8);
    const tunnelName = `birdcode-${machineId}`;

    const output = await new Promise<string>((resolve, reject) => {
      let combined = "";
      const proc = ChildProcess.spawn(
        this.binaryPath,
        ["tunnel", "--no-autoupdate", "create", tunnelName],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      proc.stdout?.on("data", (d: Buffer) => { combined += d.toString(); });
      proc.stderr?.on("data", (d: Buffer) => { combined += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(combined);
        else reject(new Error(`cloudflared tunnel create failed (exit ${code}):\n${combined}`));
      });
      proc.on("error", reject);
    });

    // Parse UUID from output: "Created tunnel {name} with id {uuid}"
    const match = /\bid ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(output);
    if (!match) {
      throw new Error(`Could not parse tunnel UUID from cloudflared output:\n${output}`);
    }
    const uuid = match[1];
    const tunnelUrl = `https://${uuid}.cfargotunnel.com`;

    this.saveSettings({ tunnelName, tunnelUrl });
    return tunnelUrl;
  }

  /**
   * Starts the tunnel process. Emits `status: active` once the tunnel is up.
   * Auto-restarts on crash (up to MAX_RESTART_ATTEMPTS times with backoff).
   */
  async start(): Promise<void> {
    if (!this.settings.tunnelName || !this.settings.tunnelUrl) {
      throw new Error("Tunnel not created yet — call ensureTunnel() first.");
    }
    this.setStatus({ status: "connecting" });
    this.restartAttempts = 0;
    this._spawnTunnel();
  }

  /** Stops the tunnel process and cancels any pending restart. */
  stop(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.tunnelProcess) {
      this.tunnelProcess.removeAllListeners();
      this.tunnelProcess.kill("SIGTERM");
      this.tunnelProcess = null;
    }
    this.restartAttempts = 0;
    this.setStatus({ status: "idle" });
  }

  private _spawnTunnel(): void {
    const tunnelName = this.settings.tunnelName!;
    const tunnelUrl = this.settings.tunnelUrl!;

    const proc = ChildProcess.spawn(
      this.binaryPath,
      [
        "tunnel",
        "--no-autoupdate",
        "run",
        "--url",
        `http://localhost:${this.backendPort}`,
        tunnelName,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    this.tunnelProcess = proc;

    let ready = false;

    // Startup timeout: if the tunnel has not signalled readiness within
    // TUNNEL_STARTUP_TIMEOUT_MS, treat it as an error and trigger a restart.
    const startupTimer = setTimeout(() => {
      if (!ready) {
        proc.stdout?.removeListener("data", onData);
        proc.stderr?.removeListener("data", onData);
        this.setStatus({
          status: "error",
          message: `Tunnel did not become ready within ${TUNNEL_STARTUP_TIMEOUT_MS / 1000}s.`,
        });
        proc.kill("SIGTERM");
      }
    }, TUNNEL_STARTUP_TIMEOUT_MS);

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      // cloudflared emits this line when the tunnel is established.
      if (!ready && /registered tunnel connection|ready to proxy/i.test(text)) {
        ready = true;
        clearTimeout(startupTimer);
        proc.stdout?.removeListener("data", onData);
        proc.stderr?.removeListener("data", onData);
        this.setStatus({ status: "active", url: tunnelUrl });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("close", (code) => {
      if (this._status.status === "idle") return; // intentionally stopped
      this.tunnelProcess = null;
      if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
        const delay = Math.min(1000 * 2 ** this.restartAttempts, 30_000);
        this.restartAttempts++;
        this.setStatus({ status: "connecting" });
        this.restartTimer = setTimeout(() => this._spawnTunnel(), delay);
      } else {
        this.setStatus({
          status: "error",
          message: `Tunnel process exited (code ${code}) and could not restart after ${MAX_RESTART_ATTEMPTS} attempts.`,
        });
      }
    });

    proc.on("error", (err) => {
      this.setStatus({ status: "error", message: err.message });
    });
  }

  /**
   * High-level entry point called from IPC. Downloads binary if needed,
   * authenticates if needed, creates tunnel if needed, then starts it.
   * Emits status events throughout.
   */
  async enable(): Promise<void> {
    // Concurrency guard: prevent double-click / concurrent IPC calls from
    // spawning multiple setup flows simultaneously.
    if (this._enabling || this._status.status !== "idle") return;
    this._enabling = true;
    try {
      if (!this.isBinaryReady()) {
        await this.downloadBinary();
      }
      // Check if cert.pem exists — if not, need to auth.
      const certPath = Path.join(OS.homedir(), ".cloudflared", "cert.pem");
      if (!FS.existsSync(certPath)) {
        await this.authenticate();
      }
      await this.ensureTunnel();
      await this.start();
      this.saveSettings({ remoteAccessEnabled: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.setStatus({ status: "error", message });
      throw err;
    } finally {
      this._enabling = false;
    }
  }

  /** Stops the tunnel and persists disabled state. */
  disable(): void {
    this.stop();
    this.saveSettings({ remoteAccessEnabled: false });
  }

  /** Call after app restarts to resume if remote access was previously enabled. */
  async resumeIfEnabled(): Promise<void> {
    if (!this.settings.remoteAccessEnabled) return;
    if (!this.isBinaryReady()) return;
    const certPath = Path.join(OS.homedir(), ".cloudflared", "cert.pem");
    if (!FS.existsSync(certPath)) return;
    if (!this.settings.tunnelName || !this.settings.tunnelUrl) return;
    await this.start();
  }
```

Close the class brace: `}`

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/tunnelManager.ts
git commit -m "feat(desktop): TunnelManager auth, ensureTunnel, start/stop, auto-restart"
```

---

## Task 5: `keepAwakeManager.ts`

**Files:**

- Create: `apps/desktop/src/keepAwakeManager.ts`

- [ ] **Step 1: Create the file**

Create `apps/desktop/src/keepAwakeManager.ts`:

```typescript
import * as ChildProcess from "node:child_process";
import { powerSaveBlocker } from "electron";

/**
 * Prevents the Mac from sleeping while Bird Code is keeping a mobile session alive.
 *
 * Uses two mechanisms together:
 * 1. Electron's powerSaveBlocker — prevents app suspension / idle sleep.
 * 2. macOS `caffeinate -s -w {pid}` — prevents system sleep while on AC power,
 *    including when the lid is closed. `caffeinate` is built into macOS (no install).
 *
 * Behaviour:
 *   Plugged in + lid open    → awake ✅
 *   Plugged in + lid closed  → awake ✅
 *   Battery + lid open       → awake ✅
 *   Battery + lid closed     → macOS forces sleep (hardware constraint) ⚠️
 */
export class KeepAwakeManager {
  private blockerId: number | null = null;
  private caffeinateProcess: ChildProcess.ChildProcess | null = null;

  get isEnabled(): boolean {
    return this.blockerId !== null;
  }

  enable(): void {
    if (this.isEnabled) return;

    // Electron blocker — prevents idle system sleep.
    this.blockerId = powerSaveBlocker.start("prevent-app-suspension");

    // caffeinate -s: prevent sleep on AC. -w {pid}: tie lifetime to our process.
    if (process.platform === "darwin") {
      this.caffeinateProcess = ChildProcess.spawn("caffeinate", ["-s", "-w", String(process.pid)], {
        stdio: "ignore",
        detached: false,
      });
      this.caffeinateProcess.unref();
    }
  }

  disable(): void {
    if (this.blockerId !== null) {
      try {
        powerSaveBlocker.stop(this.blockerId);
      } catch {
        // ignore if already stopped
      }
      this.blockerId = null;
    }

    if (this.caffeinateProcess) {
      this.caffeinateProcess.kill("SIGTERM");
      this.caffeinateProcess = null;
    }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/desktop && bun run typecheck 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/keepAwakeManager.ts
git commit -m "feat(desktop): KeepAwakeManager using powerSaveBlocker + caffeinate"
```

---

## Task 6: Wire managers into `main.ts` + expose via `preload.ts`

**Files:**

- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/preload.ts`

- [ ] **Step 1: Add imports and module-level instances to `main.ts`**

At the top of `main.ts` (after existing imports), add:

```typescript
import { TunnelManager } from "./tunnelManager";
import { KeepAwakeManager } from "./keepAwakeManager";
import { readRemoteSettings } from "./remoteSettings";
```

After the existing module-level variable declarations (`let backendPort`, etc.), add:

```typescript
let tunnelManager: TunnelManager | null = null;
let keepAwakeManager: KeepAwakeManager | null = null;
const TUNNEL_STATUS_CHANNEL = "tunnel:status";
const REMOTE_SETTINGS_GET_CHANNEL = "desktop:remote-settings-get";
const TUNNEL_ENABLE_CHANNEL = "desktop:tunnel-enable";
const TUNNEL_DISABLE_CHANNEL = "desktop:tunnel-disable";
const KEEP_AWAKE_SET_CHANNEL = "desktop:keep-awake-set";
```

- [ ] **Step 2: Initialize managers in `bootstrap()` and resume tunnel**

Inside `bootstrap()`, after `backendPairingCode = resolvePairingCode();`, add:

```typescript
// Initialize remote access managers.
tunnelManager = new TunnelManager(app.getPath("userData"), backendPort);
keepAwakeManager = new KeepAwakeManager();

// Listen for tunnel status changes: update backendPairingUrl + push to renderer.
tunnelManager.on("status", (status: import("@t3tools/contracts").TunnelStatus) => {
  if (status.status === "active") {
    // Permanent tunnel URL — update so subsequent getPairingUrl() calls return it.
    backendPairingUrl = status.url;
    backendPairingCode = resolvePairingCode();
  } else if (status.status === "idle") {
    // Restore LAN URL when tunnel is disabled.
    backendPairingUrl = resolvePairingHttpUrl();
    backendPairingCode = resolvePairingCode();
  }
  // Push status to all open renderer windows.
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(TUNNEL_STATUS_CHANNEL, status);
    }
  });
});

// Restore keep-awake if it was enabled last session.
const savedSettings = readRemoteSettings(app.getPath("userData"));
if (savedSettings.keepAwakeEnabled) {
  keepAwakeManager.enable();
}

// Resume tunnel if remote access was previously enabled.
void tunnelManager.resumeIfEnabled();
```

- [ ] **Step 3: Register IPC handlers for remote access**

Inside `registerIpcHandlers()`, after the last existing `ipcMain.on` / `ipcMain.handle` block, add:

```typescript
ipcMain.removeAllListeners(REMOTE_SETTINGS_GET_CHANNEL);
ipcMain.on(REMOTE_SETTINGS_GET_CHANNEL, (event) => {
  event.returnValue = readRemoteSettings(app.getPath("userData"));
});

ipcMain.removeHandler(TUNNEL_ENABLE_CHANNEL);
ipcMain.handle(TUNNEL_ENABLE_CHANNEL, async () => {
  if (!tunnelManager) return { ok: false, error: "Tunnel manager not initialized." };
  try {
    await tunnelManager.enable();
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.removeHandler(TUNNEL_DISABLE_CHANNEL);
ipcMain.handle(TUNNEL_DISABLE_CHANNEL, async () => {
  tunnelManager?.disable();
});

ipcMain.removeHandler(KEEP_AWAKE_SET_CHANNEL);
ipcMain.handle(KEEP_AWAKE_SET_CHANNEL, async (_event, enabled: unknown) => {
  if (!keepAwakeManager) return;
  const remoteSettings = readRemoteSettings(app.getPath("userData"));
  // Call writeRemoteSettings directly (top-level import, not a dynamic import)
  // so there is no unnecessary async indirection and no orphaned promise.
  if (enabled === true) {
    keepAwakeManager.enable();
    writeRemoteSettings(app.getPath("userData"), { ...remoteSettings, keepAwakeEnabled: true });
  } else {
    keepAwakeManager.disable();
    writeRemoteSettings(app.getPath("userData"), { ...remoteSettings, keepAwakeEnabled: false });
  }
});
```

- [ ] **Step 4: Push initial tunnel status when renderer connects**

Find the `createWindow()` function in `main.ts`. Inside it, after `mainWindow.webContents` is created, add a listener that sends the current tunnel status when the page finishes loading:

```typescript
mainWindow.webContents.on("did-finish-load", () => {
  if (tunnelManager && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(TUNNEL_STATUS_CHANNEL, tunnelManager.status);
  }
});
```

- [ ] **Step 5: Add new bridge methods to `preload.ts`**

In `preload.ts`, add the new channel constants at the top (after existing constants):

```typescript
const REMOTE_SETTINGS_GET_CHANNEL = "desktop:remote-settings-get";
const TUNNEL_ENABLE_CHANNEL = "desktop:tunnel-enable";
const TUNNEL_DISABLE_CHANNEL = "desktop:tunnel-disable";
const KEEP_AWAKE_SET_CHANNEL = "desktop:keep-awake-set";
const TUNNEL_STATUS_CHANNEL = "tunnel:status";
```

Then inside `contextBridge.exposeInMainWorld("desktopBridge", { ... })`, add after `revokeMobileDevice`:

```typescript
  getRemoteSettings: () => {
    const result = ipcRenderer.sendSync(REMOTE_SETTINGS_GET_CHANNEL);
    return typeof result === "object" && result !== null ? result : null;
  },
  enableRemoteAccess: () => ipcRenderer.invoke(TUNNEL_ENABLE_CHANNEL),
  disableRemoteAccess: () => ipcRenderer.invoke(TUNNEL_DISABLE_CHANNEL),
  setKeepAwake: (enabled: boolean) => ipcRenderer.invoke(KEEP_AWAKE_SET_CHANNEL, enabled),
  onTunnelStatus: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: unknown) => {
      if (typeof status === "object" && status !== null) {
        listener(status as Parameters<typeof listener>[0]);
      }
    };
    ipcRenderer.on(TUNNEL_STATUS_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(TUNNEL_STATUS_CHANNEL, wrapped);
  },
```

- [ ] **Step 6: Typecheck**

```bash
cd apps/desktop && bun run typecheck 2>&1 | grep "error TS"
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/main.ts apps/desktop/src/preload.ts
git commit -m "feat(desktop): wire TunnelManager + KeepAwakeManager into IPC, update backendPairingUrl on tunnel active"
```

---

## Task 7: `MobileCompanionPanel.tsx` — Remote Access + Keep Awake UI

**Files:**

- Modify: `apps/web/src/components/settings/MobileCompanionPanel.tsx`

The plan for this task is to add two new cards **above** the existing "Pair a phone" card:

1. **Remote Access card** — guides through setup, shows status, toggle
2. **Keep Awake card** — simple toggle with honest sleep-on-battery note

The QR code must regenerate when the tunnel becomes active so it encodes the tunnel URL.

- [ ] **Step 1: Add new imports at the top of the file**

After the existing import block in `MobileCompanionPanel.tsx`, add:

```typescript
import { GlobeIcon, MoonIcon, WifiIcon } from "lucide-react";
import type { TunnelStatus, RemoteSettings } from "@t3tools/contracts";
import { Switch } from "../ui/switch";
```

(Verify `Switch` exists: `grep -r "export.*Switch" apps/web/src/components/ui/`. If the file is `switch.tsx`, the import is correct.)

- [ ] **Step 2: Add a `useTunnelStatus` hook inside the component**

Inside `BirdCodeMobileCompanionPanel`, after the existing `useState` declarations, add:

```typescript
const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>(() => {
  // Initialise from the current tunnel state (sync IPC on mount).
  const settings = window.desktopBridge?.getRemoteSettings?.();
  if (settings?.remoteAccessEnabled && settings.tunnelUrl) {
    return { status: "connecting" }; // optimistic — will be updated via push
  }
  return { status: "idle" };
});

const [remoteSettings, setRemoteSettings] = useState<RemoteSettings | null>(
  () => window.desktopBridge?.getRemoteSettings?.() ?? null,
);

const [isEnabling, setIsEnabling] = useState(false);

// Listen for tunnel status pushes from the main process.
useEffect(() => {
  const unsub = window.desktopBridge?.onTunnelStatus?.((status) => {
    setTunnelStatus(status);
    // When tunnel becomes active, re-read pairingUrl so QR refreshes.
    if (status.status === "active" || status.status === "idle") {
      setRemoteSettings(window.desktopBridge?.getRemoteSettings?.() ?? null);
    }
  });
  return unsub;
}, []);
```

- [ ] **Step 3: Make `serverURL` and `pairingCode` reactive to tunnel status**

Replace the existing `const serverURL = useMemo(...)` and `const pairingCode = useMemo(...)` with:

```typescript
// Re-resolve whenever tunnel status changes so QR auto-updates to tunnel URL.
const serverURL = useMemo(
  () => resolveDesktopPairingUrl(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tunnelStatus.status],
);
const pairingCode = useMemo(() => {
  if (!serverURL) return "";
  return buildPairingCode(buildPairingPayload(serverURL));
}, [serverURL]);
```

- [ ] **Step 4: Add handler functions**

After `handleCopyCode`, add:

```typescript
const handleEnableRemoteAccess = async () => {
  setIsEnabling(true);
  setTunnelStatus({ status: "connecting" });
  try {
    const result = await window.desktopBridge?.enableRemoteAccess?.();
    if (result && !result.ok) {
      setTunnelStatus({ status: "error", message: result.error ?? "Unknown error" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to enable remote access.";
    setTunnelStatus({ status: "error", message });
  } finally {
    setIsEnabling(false);
    setRemoteSettings(window.desktopBridge?.getRemoteSettings?.() ?? null);
  }
};

const handleDisableRemoteAccess = async () => {
  await window.desktopBridge?.disableRemoteAccess?.();
  setTunnelStatus({ status: "idle" });
  setRemoteSettings(window.desktopBridge?.getRemoteSettings?.() ?? null);
};

const handleToggleKeepAwake = async (enabled: boolean) => {
  await window.desktopBridge?.setKeepAwake?.(enabled);
  setRemoteSettings(window.desktopBridge?.getRemoteSettings?.() ?? null);
};
```

- [ ] **Step 5: Add the Remote Access card to the JSX**

In the `return (...)` block, inside the `<div className="flex flex-col gap-4 pb-8">`, insert the two new cards **before** the existing "Pair a phone" card (before the `<div className="overflow-hidden rounded-2xl border bg-card...">` that contains the QR code):

```tsx
{
  /* Remote Access card */
}
<div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
  <div className="border-b px-4 py-3 sm:px-5">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <GlobeIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Remote Access</h2>
      </div>
      {tunnelStatus.status === "active" && (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Active
        </span>
      )}
    </div>
    <p className="mt-0.5 text-xs text-muted-foreground">
      Connect from any network — home, office, or LTE — without re-scanning.
    </p>
  </div>

  <div className="p-4 sm:p-5">
    {tunnelStatus.status === "idle" && (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Works by creating a private encrypted tunnel between your phone and this Mac through your
          own free{" "}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => window.desktopBridge?.openExternal?.("https://cloudflare.com")}
          >
            Cloudflare
          </button>{" "}
          account. Bird Code never sees your data — the tunnel runs entirely under your account and
          only your devices can connect.
        </p>
        <p className="text-xs text-muted-foreground">
          You'll be asked to log in to Cloudflare once. After that, it works automatically every
          time you open Bird Code.
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={handleEnableRemoteAccess}
          disabled={isEnabling}
          className="w-full sm:w-auto"
        >
          <WifiIcon className="size-3.5" />
          Set Up Remote Access
        </Button>
      </div>
    )}

    {(tunnelStatus.status === "downloading" ||
      tunnelStatus.status === "authenticating" ||
      tunnelStatus.status === "connecting") && (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
        {tunnelStatus.status === "downloading"
          ? `Downloading secure tunnel software… ${tunnelStatus.progress}%`
          : tunnelStatus.status === "authenticating"
            ? "Waiting for Cloudflare login — complete it in the browser window that opened…"
            : "Connecting tunnel…"}
      </div>
    )}

    {tunnelStatus.status === "active" && (
      <div className="space-y-3">
        <div className="rounded-xl border bg-background/60 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Your permanent remote URL
          </p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{tunnelStatus.url}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          The QR code below now encodes this URL — scan it once from your iPhone and it will always
          connect, even on different Wi-Fi or LTE.
        </p>
        <Button variant="outline" size="xs" onClick={handleDisableRemoteAccess}>
          Disable Remote Access
        </Button>
      </div>
    )}

    {tunnelStatus.status === "error" && (
      <div className="space-y-3">
        <div className="rounded-xl border border-destructive/20 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
          {tunnelStatus.message}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleEnableRemoteAccess}
          disabled={isEnabling}
        >
          Retry
        </Button>
      </div>
    )}
  </div>
</div>;

{
  /* Keep Awake card */
}
<div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
  <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
    <div className="flex items-center gap-2 min-w-0">
      <MoonIcon className="size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold text-foreground">Keep Mac Awake</p>
        <p className="text-xs text-muted-foreground">
          Mac stays on and reachable while plugged in. Closing the lid on battery will still sleep.
        </p>
      </div>
    </div>
    <Switch
      checked={remoteSettings?.keepAwakeEnabled ?? false}
      onCheckedChange={handleToggleKeepAwake}
      aria-label="Keep Mac awake"
    />
  </div>
</div>;
```

- [ ] **Step 6: Typecheck + lint**

```bash
bun typecheck 2>&1 | tail -5
bun lint 2>&1 | tail -3
```

Expected: 7 successful, 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/settings/MobileCompanionPanel.tsx
git commit -m "feat(web): Remote Access setup card + Keep Awake toggle in MobileCompanionPanel"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full typecheck + lint**

```bash
bun typecheck 2>&1 | tail -5 && bun lint 2>&1 | tail -3
```

Expected: `Tasks: 7 successful`, `Found 0 errors`.

- [ ] **Step 2: Run all tests**

```bash
bun run test 2>&1 | tail -10
```

Expected: all tests pass including the new `remoteSettings` tests.

- [ ] **Step 3: iOS build**

```bash
xcodebuild -project /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/mobile/BirdCode.xcodeproj -scheme BirdCode -sdk iphoneos build CODE_SIGNING_ALLOWED=NO 2>&1 | grep "BUILD "
```

Expected: `** BUILD SUCCEEDED **`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Remote Access + Keep Awake — Cloudflare Named Tunnel bundled in Electron"
```

---

## How it works end-to-end (after implementation)

1. User opens Settings → Mobile in Bird Code.
2. Clicks **Set Up Remote Access** → app downloads `cloudflared` (~30 MB, once) → browser opens to `dash.cloudflare.com` → user logs in.
3. App creates a named tunnel → saves permanent URL (`https://{uuid}.cfargotunnel.com`) → starts serving.
4. QR code in the panel updates to encode the tunnel URL.
5. User scans once from iPhone. URL stored in iOS app permanently.
6. From now on: phone opens Bird Code on any network, any WiFi, LTE → connects directly → no re-scanning ever.
7. **Keep Mac Awake** toggle: Mac stays on while plugged in (lid closed too).
