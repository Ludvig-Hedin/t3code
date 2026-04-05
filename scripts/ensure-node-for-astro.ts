#!/usr/bin/env bun
/**
 * Astro 6 requires Node >=22.12. Many dev shells still default to Node 20 on PATH.
 * Prepend the repo .nvmrc-matching nvm install to PATH (no interactive `nvm use`),
 * or delegate to `fnm exec` when available.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(scriptDir, "..");

function readNvmrcMajor(): string | null {
  const p = join(repoRoot, ".nvmrc");
  if (!existsSync(p)) return null;
  const line = readFileSync(p, "utf8").trim().split(/\s+/)[0];
  return line?.split(".")[0] ?? null;
}

function semverOk(version: string): boolean {
  const parts = version.replace(/^v/, "").split(".").map(Number);
  const a = parts[0] ?? 0;
  const b = parts[1] ?? 0;
  return (a === 22 && b >= 12) || a >= 23;
}

function currentNodeVersion(env: NodeJS.ProcessEnv): string | null {
  const r = spawnSync("node", ["-p", "process.version"], { encoding: "utf8", env });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function nvmBinPath(): string | null {
  const major = readNvmrcMajor();
  if (!major) return null;
  const nvmDir = process.env.NVM_DIR ?? join(process.env.HOME ?? "", ".nvm");
  const versionsDir = join(nvmDir, "versions", "node");
  if (!existsSync(versionsDir)) return null;
  const dirs = readdirSync(versionsDir)
    .filter((d) => d.startsWith(`v${major}.`))
    .map((d) => {
      const parts = d.slice(1).split(".").map(Number);
      const key = (parts[0] ?? 0) * 1e6 + (parts[1] ?? 0) * 1e3 + (parts[2] ?? 0);
      return { name: d, key };
    })
    .toSorted((a, b) => a.key - b.key);
  if (dirs.length === 0) return null;
  return join(versionsDir, dirs[dirs.length - 1]!.name, "bin");
}

function resolveLocalBin(cmd: string): string {
  const localUnix = join(process.cwd(), "node_modules", ".bin", cmd);
  if (existsSync(localUnix)) return localUnix;
  if (process.platform === "win32") {
    const p = `${localUnix}.cmd`;
    if (existsSync(p)) return p;
  }
  return cmd;
}

function hasFnm(): boolean {
  return spawnSync("fnm", ["--version"], { stdio: "ignore" }).status === 0;
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error("usage: ensure-node-for-astro.ts <command> [args...]");
  process.exit(1);
}

let env = process.env as NodeJS.ProcessEnv;
let v = currentNodeVersion(env);

if (!v || !semverOk(v)) {
  if (hasFnm()) {
    const r = spawnSync("fnm", ["exec", "--", ...argv], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
    });
    process.exit(r.status ?? 1);
  }
  const bin = nvmBinPath();
  if (bin) {
    env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    v = currentNodeVersion(env);
  }
}

if (!v || !semverOk(v)) {
  console.error(
    `Node.js >=22.12 is required for Astro. Found: ${v ?? "none"}. Install Node 24 per repo root .nvmrc (e.g. nvm install 24 && nvm use).`,
  );
  process.exit(1);
}

const cmd = resolveLocalBin(argv[0]!);
const r = spawnSync(cmd, argv.slice(1), { stdio: "inherit", env, cwd: process.cwd() });
process.exit(r.status ?? 1);
