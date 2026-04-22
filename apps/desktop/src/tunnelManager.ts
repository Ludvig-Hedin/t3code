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
/** Maximum ms to wait for the cloudflared binary download before aborting. */
const DOWNLOAD_TIMEOUT_MS = 120_000; // 2 minutes
/** Maximum ms to wait for `cloudflared tunnel create` to complete. */
const TUNNEL_CREATE_TIMEOUT_MS = 60_000; // 1 minute
/** Maximum ms to wait for the tunnel to become ready after spawning. */
const TUNNEL_STARTUP_TIMEOUT_MS = 30_000; // 30 seconds

function getCloudflaredAssetName(): string {
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  // Cloudflare ships macOS binaries as .tgz archives — no bare executables or
  // checksum files are published for darwin. The tarball contains a single binary.
  return `cloudflared-darwin-${arch}.tgz`;
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
   *
   * Cloudflare ships macOS releases as .tgz archives (a single `cloudflared`
   * binary inside). There are no separate checksum files for darwin releases —
   * HTTPS from GitHub is the trust anchor. We download the tarball, write it to
   * a temp file, extract with `tar xzf`, then place the binary.
   */
  async downloadBinary(): Promise<void> {
    const assetName = getCloudflaredAssetName(); // e.g. cloudflared-darwin-arm64.tgz
    const tgzUrl = `${CLOUDFLARED_BASE_URL}/${assetName}`;

    this.setStatus({ status: "downloading", progress: 0 });

    // Keep the AbortController alive for the entire download (fetch + body read)
    // so a stalled stream is cancelled the same way as a stalled connection.
    const controller = new AbortController();
    const downloadTimer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(tgzUrl, { signal: controller.signal });
    } catch (err) {
      clearTimeout(downloadTimer);
      if ((err as Error).name === "AbortError") {
        throw new Error(
          `Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s — check your internet connection.`,
        );
      }
      throw err;
    }

    if (!res.ok) {
      clearTimeout(downloadTimer);
      throw new Error(`Failed to download cloudflared: HTTP ${res.status}`);
    }
    const totalBytes = Number(res.headers.get("content-length") ?? "0");
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;
    const reader = res.body?.getReader();
    if (!reader) {
      clearTimeout(downloadTimer);
      throw new Error("Response body is not readable.");
    }

    // Race each read against the shared abort signal; if the timer fires while
    // the stream is stalled the AbortController cancels the underlying fetch
    // body and reader.read() will reject with an AbortError.
    try {
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
    } catch (err) {
      reader.releaseLock();
      if ((err as Error).name === "AbortError") {
        throw new Error(
          `Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s — check your internet connection.`,
        );
      }
      throw err;
    } finally {
      // Clear the timer whether reading succeeded or failed.
      clearTimeout(downloadTimer);
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
      // Use execFileSync (not execSync) to avoid shell interpolation risk when
      // tgzPath or binDir contain special characters.
      ChildProcess.execFileSync("tar", ["xzf", tgzPath, "-C", binDir, "cloudflared"], {
        stdio: "ignore",
      });
    } finally {
      try {
        FS.unlinkSync(tgzPath);
      } catch {
        /* ignore */
      }
    }

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
   *
   * If the tunnel name already exists on Cloudflare (e.g. from a previous
   * failed setup where settings were never persisted), we look it up via
   * `cloudflared tunnel list` instead of failing.
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

    let createOutput: string | null = null;
    try {
      createOutput = await new Promise<string>((resolve, reject) => {
        let combined = "";
        let settled = false;
        const settle = (fn: () => void) => {
          if (!settled) {
            settled = true;
            fn();
          }
        };

        const proc = ChildProcess.spawn(
          this.binaryPath,
          ["tunnel", "--no-autoupdate", "create", tunnelName],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        // Track so stop() can kill this if called while tunnel creation is in progress.
        this.activeSetupProcess = proc;

        // Timeout guard: kill and reject if cloudflared doesn't exit in time.
        const creationTimer = setTimeout(() => {
          this.activeSetupProcess = null;
          proc.kill("SIGKILL");
          settle(() =>
            reject(
              new Error(
                `cloudflared tunnel create timed out after ${TUNNEL_CREATE_TIMEOUT_MS / 1000}s.`,
              ),
            ),
          );
        }, TUNNEL_CREATE_TIMEOUT_MS);

        proc.stdout?.on("data", (d: Buffer) => {
          combined += d.toString();
        });
        proc.stderr?.on("data", (d: Buffer) => {
          combined += d.toString();
        });
        proc.on("close", (code) => {
          this.activeSetupProcess = null;
          clearTimeout(creationTimer);
          if (code === 0) {
            settle(() => resolve(combined));
          } else {
            settle(() =>
              reject(new Error(`cloudflared tunnel create failed (exit ${code}):\n${combined}`)),
            );
          }
        });
        proc.on("error", (err) => {
          this.activeSetupProcess = null;
          clearTimeout(creationTimer);
          settle(() => reject(err));
        });
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Cloudflare reports the tunnel already exists — this happens when a
      // previous setup run created it but crashed before saving settings.
      if (/already exist/i.test(msg)) {
        return this._lookupExistingTunnel(tunnelName);
      }
      throw err;
    }

    // Parse UUID from output: "Created tunnel {name} with id {uuid}"
    const match = /\bid ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      createOutput,
    );
    if (!match) {
      throw new Error(`Could not parse tunnel UUID from cloudflared output:\n${createOutput}`);
    }
    const uuid = match[1];
    const tunnelUrl = `https://${uuid}.cfargotunnel.com`;

    this.saveSettings({ tunnelName, tunnelUrl });
    return tunnelUrl;
  }

  /**
   * Looks up a previously-created tunnel by name using `cloudflared tunnel list --output json`.
   * Used when `tunnel create` fails because the name already exists on Cloudflare.
   */
  private async _lookupExistingTunnel(tunnelName: string): Promise<string> {
    const output = await new Promise<string>((resolve, reject) => {
      let combined = "";
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      const proc = ChildProcess.spawn(
        this.binaryPath,
        ["tunnel", "--no-autoupdate", "list", "--output", "json"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      this.activeSetupProcess = proc;

      const timer = setTimeout(() => {
        this.activeSetupProcess = null;
        proc.kill("SIGKILL");
        settle(() =>
          reject(
            new Error(
              `cloudflared tunnel list timed out after ${TUNNEL_CREATE_TIMEOUT_MS / 1000}s.`,
            ),
          ),
        );
      }, TUNNEL_CREATE_TIMEOUT_MS);

      proc.stdout?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      proc.stderr?.on("data", (d: Buffer) => {
        combined += d.toString();
      });
      proc.on("close", (code) => {
        this.activeSetupProcess = null;
        clearTimeout(timer);
        if (code === 0) settle(() => resolve(combined));
        else
          settle(() =>
            reject(new Error(`cloudflared tunnel list failed (exit ${code}):\n${combined}`)),
          );
      });
      proc.on("error", (err) => {
        this.activeSetupProcess = null;
        clearTimeout(timer);
        settle(() => reject(err));
      });
    });

    let tunnels: unknown;
    try {
      tunnels = JSON.parse(output);
    } catch {
      throw new Error(`Could not parse cloudflared tunnel list output:\n${output}`);
    }
    if (!Array.isArray(tunnels)) {
      throw new Error(`Unexpected tunnel list format:\n${output}`);
    }
    const found = (tunnels as unknown[]).find(
      (t): t is Record<string, unknown> =>
        typeof t === "object" && t !== null && (t as Record<string, unknown>).name === tunnelName,
    );
    if (typeof found?.id !== "string") {
      throw new Error(`Tunnel '${tunnelName}' not found in cloudflared account.`);
    }
    const tunnelUrl = `https://${found.id}.cfargotunnel.com`;
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
    this._resetState();
    this.setStatus({ status: "idle" });
  }

  /**
   * Tears down any active processes and timers without emitting a status event.
   * Used internally so enable()-on-retry doesn't flash an "idle" state to the UI.
   */
  private _resetState(): void {
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
    // TUNNEL_STARTUP_TIMEOUT_MS, set an error status and kill the process so
    // the close handler can schedule a restart (or exhaust MAX_RESTART_ATTEMPTS).
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

      // Prefer success detection: the same chunk can mention error-ish words while
      // still registering; never treat that as fatal if readiness is also signaled.
      const looksReady = /registered tunnel connection|ready to proxy/i.test(text);

      // cloudflared emits this line when the tunnel is established.
      if (!ready && looksReady) {
        ready = true;
        // Clear the startup timeout — normal flow proceeds.
        clearTimeout(startupTimer);
        proc.stdout?.removeListener("data", onData);
        proc.stderr?.removeListener("data", onData);
        this.setStatus({ status: "active", url: tunnelUrl });
        return;
      }

      // cloudflared reports errors before exiting (DNS, API connection failures, etc.)
      // Use explicit phrases — avoid bare "error"/"refused", which match too loosely.
      const looksFatalStartup =
        /\bERR\b|\bfailed to\b|\bunable to\b|\bfailure\b|no such host|\bdial tcp\b|connection\s+refused|permission\s+denied/i.test(
          text,
        );
      if (!ready && looksFatalStartup) {
        ready = true;
        clearTimeout(startupTimer);
        proc.stdout?.removeListener("data", onData);
        proc.stderr?.removeListener("data", onData);
        const errorMessage = text.slice(0, 200).trim();
        this.setStatus({
          status: "error",
          message: `Tunnel initialization failed: ${errorMessage}`,
        });
        proc.kill("SIGTERM");
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("close", (code) => {
      // Always clear the startup timer when the process exits.
      clearTimeout(startupTimer);
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
      clearTimeout(startupTimer);
      // Clear the stored reference so we don't hold onto a defunct process.
      this.tunnelProcess = null;
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
    if (this._enabling) return;
    // Allow retry from error state; any other non-idle state means setup is
    // already in progress.
    if (this._status.status !== "idle" && this._status.status !== "error") return;
    this._enabling = true;
    // Tear down lingering state from a previous failed attempt and immediately
    // surface "connecting" so the UI transitions out of the error state the
    // moment the user clicks retry — before the potentially-slow binary
    // download or Cloudflare API call.
    if (this._status.status === "error") {
      this._resetState();
      this.setStatus({ status: "connecting" });
    }
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
