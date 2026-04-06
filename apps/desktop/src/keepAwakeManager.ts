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
