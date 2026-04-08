# Design: Remote Access + Keep Mac Awake

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Cloudflare Named Tunnel bundled into Electron + Keep Awake toggle

---

## 1. Problem

The mobile companion only works on the same WiFi as the Mac. Closing the laptop lid puts the Mac to sleep and kills the connection. Users cannot continue a session from their phone on LTE, a different WiFi, or when away from their desk.

---

## 2. Goals

- Phone connects to Bird Code from **any network** (LTE, different WiFi, VPN) with **no re-scanning** ever.
- The permanent tunnel URL is embedded in the pairing QR once — the phone reconnects to it forever.
- Mac stays awake and accessible while **plugged in**, including with the lid closed.
- Setup takes one action: log into a free Cloudflare account in the browser. Nothing else.
- Users who don't know what Cloudflare is are reassured clearly — Bird Code does not see, store, or relay their data; the tunnel is encrypted end-to-end and runs entirely under their own Cloudflare account.

---

## 3. Architecture

```
iPhone (WKWebView)
  └─ HTTPS ──► https://<uuid>.cfargotunnel.com   (permanent)
                    │
                    ▼
         Cloudflare Edge (encrypted relay)
                    │
                    ▼
         cloudflared process  (on user's Mac, under their Cloudflare account)
                    │
                    ▼
         Bird Code HTTP/WS server  (localhost:PORT)
```

- All traffic is encrypted (HTTPS/WSS).
- The tunnel runs under the **user's own** Cloudflare account — Bird Code (the product) never has access.
- `cloudflared` is the official open-source Cloudflare tunnel binary. It is downloaded once on first use, not bundled with the app.

---

## 4. Components

### 4.1 `cloudflared` binary management

- **Pinned version:** The implementation must target a specific, pinned cloudflared release tag (e.g. `2024.12.2`) rather than `latest`. The pinned version and update strategy must be documented in-code as a constant so bumping the version is a single-line change. The code must reject binaries from any version other than the pinned one unless an explicit upgrade flow is followed.
- **Checksum trust model:** SHA256 checksums must come from an independent trusted source — either hard-coded into the application binary for the pinned release (preferred for reproducible installs) OR fetched from a separately signed manifest/signature endpoint, NOT from the same GitHub release URL as the binary. This prevents a compromised release from supplying a matching but malicious binary.
- **Install path:** `userData/bin/cloudflared` — cached permanently. Subsequent launches verify the binary's version string matches the pinned version before use. If the version does not match (e.g. manual replacement), re-download.
- **Verification before execution:** Always verify checksum/signature before marking the binary as ready. If verification fails, delete and re-download (up to 3 attempts) before surfacing an error.
- Show a progress indicator: _"Downloading secure tunnel software (≈30 MB)…"_

### 4.2 `TunnelManager` (`apps/desktop/src/tunnelManager.ts`)

Responsibilities:

- `authenticate()` — runs `cloudflared tunnel login`. Opens `dash.cloudflare.com` in the system browser. User logs in once. Cloudflare saves a credential certificate to `~/.cloudflared/cert.pem` (Cloudflare's standard location — the app never reads this file).
- `ensureTunnel()` — runs `cloudflared tunnel create birdcode-{stableId}` on first setup. Saves tunnel name + UUID to `userData/remote-settings.json`. All subsequent launches re-use the same UUID → same permanent URL. Format: `https://<uuid>.cfargotunnel.com`.
- `start(port)` — spawns `cloudflared tunnel --no-autoupdate run --url http://localhost:{port} {tunnelName}`. Parses stdout for the confirmed public URL. Emits status updates.
- `stop()` — graceful shutdown: send **SIGTERM** to the cloudflared child process, wait up to **`SHUTDOWN_TIMEOUT` (5 s)**, then escalate to **SIGKILL** if still alive. Register `app.on('will-quit')` and `app.on('before-quit')` hooks to call `stop()` so normal exits are clean. On abnormal shutdown (crash), detect orphaned cloudflared processes on next startup by scanning for a PID file written before launch; if the PID is still alive and owned by the same user, send SIGTERM to clean it up.
- Status states: `idle | downloading | authenticating | connecting | active | error(message)`.
- Auto-restarts the tunnel process if it crashes, with a precise exponential backoff policy: up to **5 total attempts** (constant `MAX_TUNNEL_ATTEMPTS = 5`), initial delay **1 s**, multiplier **2×** (delays: 1 s, 2 s, 4 s, 8 s, 16 s), cap **16 s**. Reset the retry counter to 0 after a successful run **or** after the tunnel stays continuously up for **5 minutes**.

### 4.3 `KeepAwakeManager` (`apps/desktop/src/keepAwakeManager.ts`)

- `enable()` — calls `electron.powerSaveBlocker.start('prevent-app-suspension')` AND spawns `caffeinate -s -w {electronPid}` as a child process. `caffeinate` is built into macOS — no install required. Together these prevent idle sleep and system sleep when plugged in.
- `disable()` — stops the powerSaveBlocker and kills the caffeinate process.
- Behaviour table:

  | Power state | Lid state | Result                          |
  | ----------- | --------- | ------------------------------- |
  | Plugged in  | Open      | Awake ✅                        |
  | Plugged in  | Closed    | Awake ✅                        |
  | Battery     | Open      | Awake ✅                        |
  | Battery     | Closed    | Sleeps ⚠️ (macOS enforces this) |

### 4.4 Settings persistence (`userData/remote-settings.json`)

```json
{
  "schemaVersion": 1,
  "remoteAccessEnabled": false,
  "keepAwakeEnabled": false,
  "tunnelName": "birdcode-abc123",
  "tunnelUrl": "https://<uuid>.cfargotunnel.com"
}
```

**Durability requirements:**

- **Atomic writes:** Always write to `remote-settings.json.tmp` first, then `rename()` to `remote-settings.json`. This prevents a partial write from corrupting the settings file.
- **Robust reads:** Validate all fields on read (reject unknown types, not just an unsafe cast). Log non-ENOENT errors. Return defaults on any parse failure.
- **Schema migration:** On read, check `schemaVersion`. If missing or outdated, migrate silently to the current schema and rewrite.
- **Account change detection:** When loading settings, if `tunnelName` is present but the Cloudflare account credential (`cert.pem`) is missing or has changed, flag the tunnel as orphaned and prompt the user to re-authenticate rather than silently failing to connect.

### 4.5 IPC channels (additions to `apps/desktop/src/main.ts` + `preload.ts`)

| Channel                    | Direction               | Payload                                                                                                   |
| -------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `tunnel:authenticate`      | renderer → main         | —                                                                                                         |
| `tunnel:enable`            | renderer → main         | `Promise<{ ok: true } \| { ok: false; error: string; code?: string }>`                                    |
| `tunnel:disable`           | renderer → main         | `Promise<{ ok: true } \| { ok: false; error: string }>`                                                   |
| `tunnel:status`            | main → renderer (push)  | `TunnelStatus \| { error: string }`                                                                       |
| `tunnel:status:request`    | renderer → main         | — (request current status snapshot on connect)                                                            |
| `keepAwake:set`            | renderer → main         | `{ enabled: boolean }` — must validate boolean type; invalid input returns `{ ok: false; error: string }` |
| `remote-settings:request`  | renderer → main (async) | — → `Promise<RemoteSettings>` (replaces sync `remote-settings:get`)                                       |
| `remote-settings:response` | main → renderer         | `RemoteSettings \| { error: string }`                                                                     |

**Contract requirements:**

- `tunnel:enable` and `tunnel:disable` must return a typed `{ ok: boolean, error?: string, code?: string }` result on both success and failure — never throw into the renderer.
- `keepAwake:set` validates that the payload is boolean; non-boolean inputs return `{ ok: false, error: "expected boolean" }`.
- `remote-settings:get` (synchronous) is **deprecated** — migrate to async `remote-settings:request` / `remote-settings:response` to avoid blocking the renderer event loop during file I/O.
- Initial `tunnel:status` push is sent only after the renderer signals readiness via `tunnel:status:request` to avoid races on startup.

### 4.6 `backendPairingUrl` / `backendPairingCode` (update in `main.ts`)

URL selection logic per tunnel state:

| Tunnel state                  | `backendPairingUrl`                            | QR behaviour                       |
| ----------------------------- | ---------------------------------------------- | ---------------------------------- |
| `active`                      | `tunnelUrl` (permanent)                        | Show QR immediately                |
| `connecting`/`authenticating` | Last-known stable URL if set; otherwise LAN IP | Show QR greyed / "tentative" badge |
| `downloading`                 | LAN IP                                         | Show QR greyed                     |
| `error` / `idle` / not set    | LAN IP (existing behaviour)                    | Show QR normally (LAN-only caveat) |

**UX notes:**

- Disable (visually grey) the pairing QR during `connecting`/`authenticating` states to prevent scanning an unstable or not-yet-active link.
- If a scan fails after a tunnel transition, surface a one-tap retry in Settings that falls back to the LAN URL and tells the user to re-scan once the tunnel is active.

### 4.7 `MobileCompanionPanel.tsx` — new "Remote Access" section

**State: Not set up**

```
─────────────────────────────────────
🌐 Remote Access                [Off]

Connect from any network — home, office,
or LTE — without re-scanning the QR code.

Powered by Cloudflare Tunnel. Your phone
connects directly to your Mac through an
encrypted tunnel that only you control.
Bird Code never sees your data.

[Set Up Remote Access →]
─────────────────────────────────────
```

**State: Downloading**

```
─────────────────────────────────────
🌐 Remote Access            [spinner]
Downloading secure tunnel software… (≈30 MB)
─────────────────────────────────────
```

**State: Authenticating** (distinct from connecting — user action required)

```
─────────────────────────────────────
🌐 Remote Access            [spinner]
Waiting for Cloudflare login…
A browser window opened — sign in with
your free Cloudflare account, then return.
─────────────────────────────────────
```

**State: Connecting** (tunnel is starting, no user action needed)

```
─────────────────────────────────────
🌐 Remote Access            [spinner]
Establishing secure tunnel…
─────────────────────────────────────
```

**State: Error (recoverable)**

```
─────────────────────────────────────
🔴 Remote Access            [Off]
⚠ Could not connect: <error message>
  Check network or Cloudflare login.

[Retry]   [Re-setup]
─────────────────────────────────────
```

**State: Error (non-recoverable — e.g. auth expired)**

```
─────────────────────────────────────
🔴 Remote Access            [Off]
⚠ Cloudflare credentials expired or invalid.
  Please complete setup again.

[Open Setup]
─────────────────────────────────────
```

**State: Active**

```
─────────────────────────────────────
🟢 Remote Access               [On ●]
birdcode-abc123.cfargotunnel.com
Accessible from any network.

                           [Disable]
─────────────────────────────────────
```

**Keep Awake toggle (always visible, independent)**

```
─────────────────────────────────────
☕ Keep Mac Awake             [toggle]
Mac stays on and reachable while plugged in.
Closing the lid on battery will still sleep.
─────────────────────────────────────
```

### 4.8 iOS app

No changes required. The pairing QR embeds the permanent tunnel URL when remote access is active. The iOS app stores it on first scan and reconnects to it forever — same code path as the LAN URL.

---

## 5. Trust & Privacy copy (shown in settings)

> **Your tunnel, your data.**
> Remote Access uses Cloudflare Tunnel — the same technology used by banks and hospitals to secure private connections. The tunnel runs entirely under your own free Cloudflare account. Bird Code never touches your traffic. Your code, your sessions, your files stay between your phone and your Mac.

---

## 6. User setup flow — once, ever

1. Open **Settings → Mobile** in Bird Code.
2. Click **Set Up Remote Access**.
3. App downloads the Cloudflare tunnel software (~30 MB, one time).
4. Browser opens to `dash.cloudflare.com` — create a free account or log in.
5. Click "Authorize" in the browser. Window closes.
6. Done. The QR code in settings now encodes your permanent remote URL.
7. Scan it from your iPhone once. Never scan again.

---

## 7. Error handling

All error descriptions below specify whether they are **retriable** (automatic retry via `MAX_TUNNEL_ATTEMPTS`) or require a **restart** (user must tap Retry or Re-setup).

| Error                                       | Behaviour                                                                                                                                                      | UI                                                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Download fails / network timeout**        | Retriable — retry up to 3 times with backoff                                                                                                                   | "Check your internet connection." + [Retry]                                                                          |
| **Cloudflare login timeout (5 min)**        | Requires restart — user must re-initiate                                                                                                                       | "Login didn't complete — try again." + [Retry]                                                                       |
| **Tunnel crashes**                          | Retriable — auto-restart with exponential backoff (1 s, 2 s, 4 s, 8 s, 16 s, cap 16 s); uses `MAX_TUNNEL_ATTEMPTS = 5`. After 5 failures, show error + [Retry] | "Tunnel disconnected. Retrying… (N/5)" → after exhaustion: "Could not stay connected." + [Retry]                     |
| **Startup timeout (30 s)**                  | Retriable via restart                                                                                                                                          | "Tunnel didn't become ready in 30 s." + [Retry]                                                                      |
| **Binary corrupted / checksum mismatch**    | Re-download up to 3 times; after 3 failures mark binary as unusable, stop auto-retries                                                                         | "Download verification failed. Clear cache and try again." + [Retry]                                                 |
| **Port conflict (`localhost:PORT` in use)** | Requires user action                                                                                                                                           | "Port {PORT} is in use. Please stop the conflicting process or change the Bird Code port." + [Change port] / [Retry] |
| **CloudflarePermissionError**               | Requires restart — user must re-auth or switch accounts                                                                                                        | "Your Cloudflare account lacks tunnel creation permissions. Please re-authenticate." + [Re-authenticate]             |
| **Network transient errors (DNS, drops)**   | Retriable — treated as crash/restart path with same backoff                                                                                                    | Same as tunnel crash path                                                                                            |

---

## 8. Out of scope

- Windows / Linux support (macOS only for this iteration).
- Custom domains (Cloudflare named subdomain is sufficient).
- Multi-Mac / shared account management.
- Tunnel usage analytics or diagnostics beyond the status indicator.
