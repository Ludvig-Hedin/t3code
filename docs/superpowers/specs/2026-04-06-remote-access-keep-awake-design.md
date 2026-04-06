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

- On first "Enable Remote Access": download the correct binary (`cloudflared-darwin-arm64` or `amd64`) from Cloudflare's official GitHub releases into `userData/bin/cloudflared`.
- Show a progress indicator: _"Downloading secure tunnel software (≈30 MB)…"_
- Verify SHA256 checksum against Cloudflare's published checksums before executing.
- Binary is cached permanently — subsequent launches skip download.

### 4.2 `TunnelManager` (`apps/desktop/src/tunnelManager.ts`)

Responsibilities:

- `authenticate()` — runs `cloudflared tunnel login`. Opens `dash.cloudflare.com` in the system browser. User logs in once. Cloudflare saves a credential certificate to `~/.cloudflared/cert.pem` (Cloudflare's standard location — the app never reads this file).
- `ensureTunnel()` — runs `cloudflared tunnel create birdcode-{stableId}` on first setup. Saves tunnel name + UUID to `userData/remote-settings.json`. All subsequent launches re-use the same UUID → same permanent URL. Format: `https://<uuid>.cfargotunnel.com`.
- `start(port)` — spawns `cloudflared tunnel --no-autoupdate run --url http://localhost:{port} {tunnelName}`. Parses stdout for the confirmed public URL. Emits status updates.
- `stop()` — kills the child process cleanly.
- Status states: `idle | downloading | authenticating | connecting | active | error(message)`.
- Auto-restarts the tunnel process if it crashes (max 5 attempts with backoff).

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
  "remoteAccessEnabled": false,
  "keepAwakeEnabled": false,
  "tunnelName": "birdcode-abc123",
  "tunnelUrl": "https://<uuid>.cfargotunnel.com"
}
```

### 4.5 IPC channels (additions to `apps/desktop/src/main.ts` + `preload.ts`)

| Channel               | Direction              | Payload                                       |
| --------------------- | ---------------------- | --------------------------------------------- |
| `tunnel:authenticate` | renderer → main        | —                                             |
| `tunnel:enable`       | renderer → main        | —                                             |
| `tunnel:disable`      | renderer → main        | —                                             |
| `tunnel:status`       | main → renderer (push) | `{ state: TunnelState, url: string \| null }` |
| `keepAwake:set`       | renderer → main        | `{ enabled: boolean }`                        |
| `remote-settings:get` | renderer → main (sync) | — → `RemoteSettings`                          |

### 4.6 `backendPairingUrl` / `backendPairingCode` (update in `main.ts`)

- When tunnel is `active`: `backendPairingUrl = tunnelUrl`. QR encodes the permanent public URL.
- When tunnel is off or not set up: falls back to LAN IP (existing behaviour).
- Pairing QR in settings panel auto-reflects whichever is active — no extra UI choice needed.

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

**State: Downloading / Connecting**

```
─────────────────────────────────────
🌐 Remote Access            [spinner]
Downloading secure tunnel… (30 MB)
─────────────────────────────────────
```

or

```
Waiting for Cloudflare login…
(A browser window has opened — sign in
with your free Cloudflare account)
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

- Download fails → retry button + clear message ("Check your internet connection").
- Cloudflare login times out (5 min) → show "Login didn't complete — try again".
- Tunnel crashes → auto-restart with exponential backoff; after 5 failures show error in panel with "Retry" button.
- `cloudflared` binary corrupted (checksum mismatch) → delete and re-download.

---

## 8. Out of scope

- Windows / Linux support (macOS only for this iteration).
- Custom domains (Cloudflare named subdomain is sufficient).
- Multi-Mac / shared account management.
- Tunnel usage analytics or diagnostics beyond the status indicator.
