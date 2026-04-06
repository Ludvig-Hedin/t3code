import * as Crypto from "node:crypto";
import * as FS from "node:fs";
import * as Path from "node:path";
import * as OS from "node:os";
import { EventEmitter } from "node:events";
import * as ChildProcess from "node:child_process";

import type { TunnelStatus, RemoteSettings } from "@t3tools/contracts";
import { readRemoteSettings, writeRemoteSettings } from "./remoteSettings";

// ── Constants ──────────────────────────────────────────────────────────────

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
  // Guard flag to prevent concurrent enable() calls (e.g. double-click).
  private _enabling = false;
  // Tracks the in-flight authenticate/ensureTunnel process so stop() can kill it.
  private activeSetupProcess: ChildProcess.ChildProcess | null = null;

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
   * Emits progress via status updates. Verifies SHA-256 checksum.
   */
  async downloadBinary(): Promise<void> {
    const assetName = getCloudflaredAssetName();
    const binaryUrl = `${CLOUDFLARED_BASE_URL}/${assetName}`;
    const checksumUrl = `${CLOUDFLARED_BASE_URL}/${assetName}.sha256sum`;

    this.setStatus({ status: "downloading", progress: 0 });

    // Download checksum file first (small, fast).
    const checksumRes = await fetch(checksumUrl);
    if (!checksumRes.ok) {
      throw new Error(`Failed to fetch checksum: HTTP ${checksumRes.status}`);
    }
    const checksumText = await checksumRes.text();
    const expectedHash = checksumText.trim().split(/\s+/)[0];
    if (!expectedHash || expectedHash.length !== 64) {
      throw new Error("Checksum file format unexpected — expected SHA-256 hex.");
    }

    // Download binary with progress tracking.
    const binaryRes = await fetch(binaryUrl);
    if (!binaryRes.ok) {
      throw new Error(`Failed to fetch cloudflared binary: HTTP ${binaryRes.status}`);
    }
    const totalBytes = Number(binaryRes.headers.get("content-length") ?? "0");
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    const reader = binaryRes.body?.getReader();
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

    // Assemble buffer and verify checksum.
    const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const buffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const actualHash = Crypto.createHash("sha256").update(buffer).digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(
        `Checksum mismatch for ${assetName}. Expected ${expectedHash}, got ${actualHash}.`,
      );
    }

    // Write binary and make it executable.
    const binDir = Path.dirname(this.binaryPath);
    if (!FS.existsSync(binDir)) {
      FS.mkdirSync(binDir, { recursive: true });
    }
    FS.writeFileSync(this.binaryPath, buffer);
    FS.chmodSync(this.binaryPath, 0o755);
  }

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
      // Track so stop() can kill this if called while auth is in progress.
      this.activeSetupProcess = proc;
      const timeout = setTimeout(
        () => {
          proc.kill();
          reject(new Error("Cloudflare login timed out after 5 minutes. Please try again."));
        },
        5 * 60 * 1000,
      );
      proc.on("close", (code) => {
        this.activeSetupProcess = null;
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`cloudflared tunnel login exited with code ${code}.`));
      });
      proc.on("error", (err) => {
        this.activeSetupProcess = null;
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
      // Track so stop() can kill this if called while tunnel creation is in progress.
      this.activeSetupProcess = proc;
      proc.stdout?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      proc.stderr?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      proc.on("close", (code) => {
        this.activeSetupProcess = null;
        if (code === 0) resolve(combined);
        else reject(new Error(`cloudflared tunnel create failed (exit ${code}):\n${combined}`));
      });
      proc.on("error", (err) => {
        this.activeSetupProcess = null;
        reject(err);
      });
    });

    // Parse UUID from output: "Created tunnel {name} with id {uuid}"
    const match = /\bid ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      output,
    );
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
    // Guard against double-start: if a tunnel is already running, stop it first.
    if (this.tunnelProcess) {
      this.stop();
    }
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
    // Kill any in-flight setup process (authenticate / ensureTunnel) so it
    // doesn't continue running orphaned after the user requests a stop.
    if (this.activeSetupProcess) {
      this.activeSetupProcess.kill("SIGTERM");
      this.activeSetupProcess = null;
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
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      // cloudflared emits this line when the tunnel is established.
      if (!ready && /registered tunnel connection|ready to proxy/i.test(text)) {
        ready = true;
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
}
