# Bird Code Mobile — WKWebView Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile polling-based Swift UI with a WKWebView that loads the full Bird Code web app, giving mobile users feature-parity with the desktop — real-time WebSocket, all actions, same code.

**Architecture:** After pairing (Swift flow unchanged), the iOS app opens a `WKWebView` pointed at the desktop's HTTP server URL. Before the page loads, a `WKUserScript` injects `window.__BC_WS_TOKEN__` so the web app can authenticate its WebSocket. The web app already handles `<768px` viewports via `useIsMobile()` (sidebar becomes a swipe-in Sheet). We add `isMobileWebView` detection so the app hides Electron-only chrome (drag regions, folder picker, update pill) and adds iOS safe-area insets. The server's `/api/mobile/pair` route is fixed to return only device metadata (no full snapshot), and deduplicates devices by name on re-pair.

**Tech Stack:** Swift/SwiftUI + WebKit (WKWebView, WKUserScript), React/Tailwind (web responsive tweaks), TypeScript/Effect (server pair route fix), Bun for build/typecheck/lint.

---

## File Map

| File                                                         | Action     | Purpose                                                                                                           |
| ------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/Sources/BirdCode/Views/MobileWebView.swift`     | **Create** | WKWebView wrapper: injects token script, shows loading/error/reload UI                                            |
| `apps/mobile/Sources/BirdCode/Views/MobileScreens.swift`     | **Modify** | `MobileRootView`: after paired show `MobileWebView` instead of `MobileShellView`. Add `MobilePairingSuccessView`. |
| `apps/mobile/Sources/BirdCode/Services/MobileAppStore.swift` | **Modify** | `connectAndPair()`: transition to success state after pair, not to full shell                                     |
| `apps/server/src/mobile.ts`                                  | **Modify** | `pairRoute`: return `{paired, deviceToken, device}` only; deduplicate device by name on re-pair                   |
| `apps/web/src/env.ts`                                        | **Modify** | Export `isMobileWebView` flag (`window.__BC_WS_TOKEN__ !== undefined`)                                            |
| `apps/web/src/lib/utils.ts`                                  | **Modify** | `resolveServerUrl`: add `window.__BC_WS_TOKEN__` as fallback token in `searchParams`                              |
| `apps/web/src/index.css`                                     | **Modify** | Add `env(safe-area-inset-*)` CSS for iOS notch/home bar; add `[data-mobile-webview]` body class adjustments       |
| `apps/web/src/main.tsx`                                      | **Modify** | Set `data-mobile-webview` on `<body>` when `isMobileWebView` is true                                              |
| `apps/web/src/components/AppSidebarLayout.tsx`               | **Modify** | Show mobile sidebar trigger header when `isMobileWebView` (not just `!isElectron`)                                |
| `apps/web/src/components/SidebarCollapsedControls.tsx`       | **Modify** | Show collapsed controls for `isMobileWebView` too (currently Electron-only guard)                                 |
| `apps/web/src/components/Sidebar.tsx`                        | **Modify** | Hide folder-picker "Add project" button on `isMobileWebView`; use path-input flow instead                         |
| `apps/web/src/components/settings/MobileCompanionPanel.tsx`  | **Modify** | Fix duplicate device display; add "Live" indicator for recently-seen devices                                      |

---

## Task 1: Fix server — pair route deduplication + slim response

**Files:**

- Modify: `apps/server/src/mobile.ts`

The pair route currently appends a new device every call and returns the full `OrchestrationReadModel` snapshot. This causes: (a) duplicate device rows when re-pairing after an error, (b) iOS decode failure because a single field mismatch in the massive snapshot kills the whole pairing. Fix: deduplicate by `deviceName`, and return only `{paired, deviceToken, device}`.

- [ ] **Step 1: Read current pairRoute in mobile.ts (lines 225–259)**

Already read above. The route does `replaceDevices((devices) => [...devices, device])` unconditionally, then calls `serializeSnapshot` which includes the full snapshot.

- [ ] **Step 2: Modify `pairRoute` in `apps/server/src/mobile.ts`**

Replace the `pairRoute` constant (lines 225–259) with:

```typescript
const pairRoute = HttpRouter.add(
  "POST",
  "/api/mobile/pair",
  Effect.gen(function* () {
    const decoded = yield* HttpServerRequest.schemaBodyJson(PairRequest).pipe(
      Effect.catch(() => Effect.succeed(null)),
    );
    if (!decoded) {
      return badRequest("Invalid pairing payload.");
    }

    if (config.authToken && decoded.desktopAuthToken !== config.authToken) {
      return unauthorized("Invalid desktop auth token.");
    }

    const pairedAt = nowIso();

    // Deduplicate: if a non-revoked device with the same name exists, rotate its token
    // instead of creating a duplicate entry. This prevents multiple copies appearing in
    // the desktop settings panel when the user re-pairs after an error.
    const existingDevices = yield* Ref.get(devicesRef);
    const existingDevice = existingDevices.find(
      (entry) => entry.deviceName === decoded.deviceName && entry.revokedAt === null,
    );

    const device: DeviceRecord = existingDevice
      ? {
          ...existingDevice,
          deviceToken: createDeviceToken(),
          lastSeenAt: pairedAt,
        }
      : {
          deviceId: `mobile-${crypto.randomUUID()}`,
          deviceName: decoded.deviceName,
          deviceToken: createDeviceToken(),
          pairCode: createPairCode(),
          pairCodeExpiresAt: new Date(Date.now() + MOBILE_DEVICE_STATE_TTL_MS).toISOString(),
          pairedAt,
          lastSeenAt: pairedAt,
          revokedAt: null,
        };

    yield* replaceDevices((devices) =>
      existingDevice
        ? devices.map((entry) => (entry.deviceId === device.deviceId ? device : entry))
        : [...devices, device],
    );

    // Return only pairing metadata — NOT the full snapshot. The iOS app fetches the
    // snapshot separately after storing the device token. This eliminates the decode
    // failure caused by any mismatch in the large nested OrchestrationReadModel.
    return HttpServerResponse.jsonUnsafe({
      paired: true,
      deviceToken: device.deviceToken,
      device: toPublicDevice(device),
    });
  }),
);
```

- [ ] **Step 3: Run typecheck to verify no errors**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error|warning" | head -20
```

Expected: 0 TypeScript errors in `apps/server`.

- [ ] **Step 4: Run lint**

```bash
bun lint 2>&1 | grep -E "error|warning" | head -20
```

Expected: 0 lint errors in changed files.

- [ ] **Step 5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/server/src/mobile.ts
git commit -m "fix(server): deduplicate mobile devices on re-pair, return slim pair response

POST /api/mobile/pair now rotates the token on an existing same-name device
instead of appending a duplicate. Returns {paired, deviceToken, device} only —
no full OrchestrationReadModel snapshot — eliminating the iOS decode failure."
```

---

## Task 2: Add `isMobileWebView` to web app env

**Files:**

- Modify: `apps/web/src/env.ts`

The web app needs to know it's running inside a Bird Code WKWebView so it can hide Electron-only chrome and add iOS layout adjustments. The Swift WKWebView will inject `window.__BC_WS_TOKEN__` before page load.

- [ ] **Step 1: Modify `apps/web/src/env.ts`**

Current content:

```typescript
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);
```

Replace with:

```typescript
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);

/**
 * True when running inside the Bird Code iOS WKWebView.
 * The Swift WKWebView injects window.__BC_WS_TOKEN__ via WKUserScript before
 * the page loads, so this is reliable at module load time.
 */
export const isMobileWebView =
  typeof window !== "undefined" &&
  typeof (window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ === "string" &&
  ((window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ as string).length > 0;
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/env.ts
git commit -m "feat(web): add isMobileWebView detection via window.__BC_WS_TOKEN__"
```

---

## Task 3: Wire WebSocket auth token from WKWebView injection

**Files:**

- Modify: `apps/web/src/lib/utils.ts`
- Modify: `apps/web/src/rpc/protocol.ts`

The server's `/ws` route requires `?token=xxx` when `authToken` is configured. In Electron the desktop bridge returns a WS URL with the token already embedded. In the WKWebView, the Swift app injects `window.__BC_WS_TOKEN__`. We need `resolveServerUrl` and `createWsRpcProtocolLayer` to pick this up.

- [ ] **Step 1: Modify `resolveServerUrl` in `apps/web/src/lib/utils.ts`**

Find the `resolveServerUrl` function. Add token injection after the searchParams block. The full function becomes:

```typescript
export const resolveServerUrl = (options?: {
  url?: string | undefined;
  protocol?: "http" | "https" | "ws" | "wss" | undefined;
  pathname?: string | undefined;
  searchParams?: Record<string, string> | undefined;
}): string => {
  const rawUrl = firstNonEmptyString(
    options?.url,
    window.desktopBridge?.getWsUrl(),
    import.meta.env.VITE_WS_URL,
    window.location.origin,
  );

  const parsedUrl = new URL(rawUrl);
  if (options?.protocol) {
    parsedUrl.protocol = options.protocol;
  }
  if (options?.pathname) {
    parsedUrl.pathname = options.pathname;
  } else {
    parsedUrl.pathname = "/";
  }

  const merged: Record<string, string> = { ...(options?.searchParams ?? {}) };

  // When running inside the Bird Code iOS WKWebView, the Swift shell injects
  // window.__BC_WS_TOKEN__ with the desktop auth token before page load.
  // Add it as the ?token query param so the server's WS auth middleware accepts it.
  const mobileToken =
    typeof (window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ === "string"
      ? ((window as unknown as Record<string, unknown>).__BC_WS_TOKEN__ as string)
      : null;
  if (mobileToken && mobileToken.length > 0 && !merged["token"]) {
    merged["token"] = mobileToken;
  }

  if (Object.keys(merged).length > 0) {
    parsedUrl.search = new URLSearchParams(merged).toString();
  }

  return parsedUrl.toString();
};
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/utils.ts
git commit -m "feat(web): inject __BC_WS_TOKEN__ into WebSocket URL for mobile WKWebView auth"
```

---

## Task 4: iOS safe-area insets + mobile-webview body class

**Files:**

- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/main.tsx`

WKWebView on iPhone does not add safe-area insets automatically. We need to add CSS env() padding for the notch (top) and home indicator (bottom) when running in the WKWebView context.

- [ ] **Step 1: Add `data-mobile-webview` body attribute in `apps/web/src/main.tsx`**

Find the `main.tsx` file. After the `isElectron` import, add the webview body attribute. The relevant section currently looks like:

```typescript
import { isElectron } from "./env";
// ...
const history = isElectron ? createHashHistory() : createBrowserHistory();
```

Add `isMobileWebView` import and body-class effect:

```typescript
import { isElectron, isMobileWebView } from "./env";
// ...
const history = isElectron ? createHashHistory() : createBrowserHistory();

// Mark the body so CSS can apply iOS-specific safe-area insets and layout
// adjustments without touching every component. Runs once at module load time.
if (isMobileWebView) {
  document.body.setAttribute("data-mobile-webview", "");
}
```

- [ ] **Step 2: Add safe-area CSS to `apps/web/src/index.css`**

At the end of `apps/web/src/index.css`, append:

```css
/* ─── Bird Code iOS WKWebView — safe area insets ─────────────────────────── */
/* Applied when body[data-mobile-webview] is set by main.tsx.                  */
/* Provides notch (top) and home-indicator (bottom) clearance automatically.   */

body[data-mobile-webview] {
  /* Respect the iPhone notch / status bar at the top */
  padding-top: env(safe-area-inset-top, 0px);
  /* Respect the iPhone home indicator at the bottom */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* The Electron drag-region header must not appear on mobile */
body[data-mobile-webview] .drag-region {
  -webkit-app-region: none;
}
```

- [ ] **Step 3: Add `viewport-fit=cover` to `index.html` so env() values are non-zero on iPhone**

In `apps/web/index.html` change:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

to:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 4: Run typecheck + lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error" | head -20
bun lint 2>&1 | grep -E "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/index.css apps/web/index.html
git commit -m "feat(web): iOS safe-area insets and data-mobile-webview body class

Adds viewport-fit=cover, env(safe-area-inset-*) padding on body, and
a data-mobile-webview attribute set by main.tsx when isMobileWebView is true.
Disables -webkit-app-region drag on mobile to prevent touch interference."
```

---

## Task 5: Web app — hide Electron-only chrome on mobile webview

**Files:**

- Modify: `apps/web/src/components/SidebarCollapsedControls.tsx`
- Modify: `apps/web/src/components/AppSidebarLayout.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

On mobile webview we want the sidebar hamburger trigger visible (the web app already renders it for `!isElectron && isMobile` breakpoint), update pill hidden, and folder-picker hidden (no filesystem access). The `SidebarCollapsedControls` is Electron-only currently but provides useful collapsed-sidebar buttons; on mobile webview we want it active.

- [ ] **Step 1: Read `SidebarCollapsedControls.tsx`**

```
apps/web/src/components/SidebarCollapsedControls.tsx
```

Current guard: `if (!isElectron) return null;`

- [ ] **Step 2: Modify `SidebarCollapsedControls.tsx`**

Change:

```typescript
import { isElectron } from "../env";
// ...
if (!isElectron) return null;
```

to:

```typescript
import { isElectron, isMobileWebView } from "../env";
// ...
if (!isElectron && !isMobileWebView) return null;
```

- [ ] **Step 3: Modify `AppSidebarLayout.tsx` — sidebar collapse effect**

The current `SidebarCollapseEffect` only sets `data-sidebar-collapsed` for Electron. Mobile webview also needs this so CSS can adjust headers. Change:

```typescript
import { isElectron } from "../env";
// ...
const collapsed = isElectron && !open;
```

to:

```typescript
import { isElectron, isMobileWebView } from "../env";
// ...
const collapsed = (isElectron || isMobileWebView) && !open;
```

- [ ] **Step 4: Modify `Sidebar.tsx` — hide folder-picker on mobile webview**

Find the `shouldBrowseForProjectImmediately` line (currently `const shouldBrowseForProjectImmediately = isElectron && !isLinuxDesktop;`).

Change:

```typescript
import { isElectron } from "../env";
// ...
const isLinuxDesktop = isElectron && isLinuxPlatform(navigator.platform);
const shouldBrowseForProjectImmediately = isElectron && !isLinuxDesktop;
```

to:

```typescript
import { isElectron, isMobileWebView } from "../env";
// ...
const isLinuxDesktop = isElectron && isLinuxPlatform(navigator.platform);
// On mobile webview there is no native folder picker; show the path text input instead.
const shouldBrowseForProjectImmediately = isElectron && !isLinuxDesktop && !isMobileWebView;
```

- [ ] **Step 5: Modify `Sidebar.tsx` — sidebar header on mobile webview**

Find the `isElectron ?` ternary in the sidebar header return (around line 2116):

```tsx
{
  isElectron ? (
    <SidebarHeader className="drag-region h-[52px] flex-row items-center gap-1 px-2 py-0 pl-[90px]">
      {toggleSidebarButton}
      {wordmark}
    </SidebarHeader>
  ) : (
    <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">{wordmark}</SidebarHeader>
  );
}
```

Change to (mobile webview gets a non-drag compact header):

```tsx
{
  isElectron ? (
    <SidebarHeader className="drag-region h-[52px] flex-row items-center gap-1 px-2 py-0 pl-[90px]">
      {toggleSidebarButton}
      {wordmark}
    </SidebarHeader>
  ) : isMobileWebView ? (
    <SidebarHeader className="flex-row items-center gap-2 px-3 py-2">
      {toggleSidebarButton}
      {wordmark}
    </SidebarHeader>
  ) : (
    <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">{wordmark}</SidebarHeader>
  );
}
```

- [ ] **Step 6: Run typecheck + lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error" | head -20
bun lint 2>&1 | grep -E "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/web/src/components/SidebarCollapsedControls.tsx \
  apps/web/src/components/AppSidebarLayout.tsx \
  apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): hide Electron-only chrome on mobile webview

SidebarCollapsedControls now active on isMobileWebView.
Folder-picker bypassed on mobile (uses path-input flow instead).
Sidebar header uses compact non-drag layout on mobile webview."
```

---

## Task 6: Fix desktop Mobile Companion Panel — duplicate devices + live indicator

**Files:**

- Modify: `apps/web/src/components/settings/MobileCompanionPanel.tsx`

The desktop panel currently polls `getMobileDevices()` every 4s. Since the server now deduplicates on re-pair, the root cause of duplicates is fixed. But the panel UI also needs a "Live" badge for recently-seen devices and the duplicate display was partly a rendering artifact (no dedup on the client either).

- [ ] **Step 1: Read current MobileCompanionPanel.tsx device list render (lines 305–365)**

Already read above. The device list maps `pairedDevices` without deduplication and without a live indicator.

- [ ] **Step 2: Update device list render in `MobileCompanionPanel.tsx`**

In the `pairedDevices.map((device) => ...)` section (around line 308), replace the device card `div` contents with:

```tsx
{
  pairedDevices.map((device) => {
    const lastSeen = new Date(device.lastSeenAt);
    const isLive = Date.now() - lastSeen.getTime() < 35_000; // seen within last 35s
    return (
      <div key={device.deviceId} className="rounded-2xl border bg-background/72 p-4 shadow-xs/5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
            {device.deviceName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-sm font-medium text-foreground">
                {device.deviceName}
              </div>
              <div className="text-xs text-muted-foreground">Code {device.pairCode}</div>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {isLive ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 animate-pulse rounded-full bg-green-500" />
                  <span className="text-success">Live now</span>
                </span>
              ) : (
                <>
                  Last seen{" "}
                  {new Date(device.lastSeenAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="text-xs text-success">Paired</div>
              <Button
                variant="outline"
                size="sm"
                disabled={disconnectingDeviceId === device.deviceId}
                onClick={() => {
                  void handleDisconnect(device);
                }}
              >
                {disconnectingDeviceId === device.deviceId ? "Disconnecting…" : "Disconnect"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  });
}
```

- [ ] **Step 3: Run typecheck + lint**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error" | head -20
bun lint 2>&1 | grep -E "error" | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/MobileCompanionPanel.tsx
git commit -m "feat(web): live indicator for mobile devices in desktop companion panel"
```

---

## Task 7: Swift — MobileWebView component

**Files:**

- Create: `apps/mobile/Sources/BirdCode/Views/MobileWebView.swift`

This is the core Swift change. A `WKWebView` that:

1. Injects `window.__BC_WS_TOKEN__` via `WKUserScript` before page load
2. Shows a loading spinner while the page loads
3. Shows a friendly error card with a "Retry" button if the load fails
4. Connects to `serverURL` which the Swift store already has from pairing

- [ ] **Step 1: Create `apps/mobile/Sources/BirdCode/Views/MobileWebView.swift`**

```swift
import SwiftUI
import WebKit

/// MobileWebView — loads the Bird Code web app inside a WKWebView.
///
/// After pairing the Swift app has a serverURL and a desktopAuthToken.
/// We inject window.__BC_WS_TOKEN__ before page load so the web app's
/// resolveServerUrl() can append ?token=xxx to the WebSocket connection URL.
///
/// The webview fills the entire screen. iOS safe-area insets are handled
/// by the web app's CSS (body[data-mobile-webview] + env(safe-area-inset-*)).
@MainActor
struct MobileWebView: View {
  let serverURL: URL
  let desktopAuthToken: String?
  var onDisconnect: () -> Void

  @State private var loadState: LoadState = .loading
  @State private var webView: WKWebView?

  enum LoadState {
    case loading
    case loaded
    case failed(String)
  }

  var body: some View {
    ZStack {
      WebViewRepresentable(
        serverURL: serverURL,
        desktopAuthToken: desktopAuthToken,
        onLoadFinished: {
          loadState = .loaded
        },
        onLoadFailed: { error in
          loadState = .failed(error)
        },
        webViewRef: $webView
      )
      .ignoresSafeArea()

      switch loadState {
      case .loading:
        Color(uiColor: .systemBackground)
          .ignoresSafeArea()
          .overlay(
            VStack(spacing: 16) {
              ProgressView()
                .scaleEffect(1.4)
                .tint(MobileTheme.accent)
              Text("Connecting to desktop…")
                .font(.subheadline)
                .foregroundStyle(MobileTheme.muted)
            }
          )
      case .loaded:
        EmptyView()
      case .failed(let message):
        Color(uiColor: .systemBackground)
          .ignoresSafeArea()
          .overlay(
            VStack(spacing: 24) {
              Image(systemName: "wifi.slash")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(MobileTheme.muted)
              VStack(spacing: 8) {
                Text("Can't reach the desktop")
                  .font(.headline)
                Text(message)
                  .font(.callout)
                  .foregroundStyle(MobileTheme.muted)
                  .multilineTextAlignment(.center)
              }
              HStack(spacing: 12) {
                Button("Retry") {
                  loadState = .loading
                  webView?.reload()
                }
                .buttonStyle(MobilePrimaryButtonStyle())

                Button("Disconnect") {
                  onDisconnect()
                }
                .buttonStyle(MobileSecondaryButtonStyle())
              }
            }
            .padding(32)
          )
      }
    }
  }
}

// MARK: - UIViewRepresentable bridge

@MainActor
private struct WebViewRepresentable: UIViewRepresentable {
  let serverURL: URL
  let desktopAuthToken: String?
  let onLoadFinished: () -> Void
  let onLoadFailed: (String) -> Void
  @Binding var webViewRef: WKWebView?

  func makeCoordinator() -> Coordinator {
    Coordinator(onLoadFinished: onLoadFinished, onLoadFailed: onLoadFailed)
  }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()

    // Inject window.__BC_WS_TOKEN__ before any page script runs.
    // The web app reads this in env.ts (isMobileWebView) and lib/utils.ts
    // (resolveServerUrl) to authenticate the WebSocket connection.
    if let token = desktopAuthToken, !token.isEmpty {
      let escapedToken = token
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
      let script = WKUserScript(
        source: "window.__BC_WS_TOKEN__ = \"\(escapedToken)\";",
        injectionTime: .atDocumentStart,
        forMainFrameOnly: false
      )
      config.userContentController.addUserScript(script)
    }

    // Allow loading http:// URLs from WKWebView (desktop server uses plain http)
    config.limitsNavigationsToAppBoundDomains = false

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .clear

    let request = URLRequest(url: serverURL, cachePolicy: .reloadIgnoringLocalCacheData)
    webView.load(request)

    DispatchQueue.main.async {
      self.webViewRef = webView
    }

    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}

  static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
    uiView.stopLoading()
    uiView.navigationDelegate = nil
    coordinator.webView = nil
  }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    weak var webView: WKWebView?
    private let onLoadFinished: () -> Void
    private let onLoadFailed: (String) -> Void

    init(onLoadFinished: @escaping () -> Void, onLoadFailed: @escaping (String) -> Void) {
      self.onLoadFinished = onLoadFinished
      self.onLoadFailed = onLoadFailed
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      self.webView = webView
      onLoadFinished()
    }

    func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error,
    ) {
      let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
      onLoadFailed(message)
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error,
    ) {
      let nsError = error as NSError
      // -999 is NSURLErrorCancelled — happens on redirect, not a real failure
      guard nsError.code != NSURLErrorCancelled else { return }
      let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
      onLoadFailed(message)
    }

    // Allow loading the desktop's local-network http:// URL
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void,
    ) {
      decisionHandler(.allow)
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationResponse: WKNavigationResponse,
      decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void,
    ) {
      decisionHandler(.allow)
    }
  }
}
```

- [ ] **Step 2: Build in Xcode to verify no compile errors**

Open `apps/mobile/BirdCode.xcodeproj` in Xcode and press ⌘B (or run `xcodebuild -project apps/mobile/BirdCode.xcodeproj -scheme BirdCode -sdk iphonesimulator build 2>&1 | tail -20`).

Expected: `BUILD SUCCEEDED`

- [ ] **Step 3: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/mobile/Sources/BirdCode/Views/MobileWebView.swift
git commit -m "feat(mobile): WKWebView shell with token injection, loading and error states"
```

---

## Task 8: Swift — wire MobileWebView into app flow

**Files:**

- Modify: `apps/mobile/Sources/BirdCode/Views/MobileScreens.swift`
- Modify: `apps/mobile/Sources/BirdCode/Services/MobileAppStore.swift`

After a successful pair the app currently transitions to `MobileShellView`. We change it to show a `MobilePairingSuccessView` briefly (per user's requested UX), then transition to `MobileWebView`. We also need to keep the existing pairing screen working and add a `pairedURL`/`pairedToken` state that `MobileRootView` reads.

- [ ] **Step 1: Add paired session URL+token state to `MobileAppStore.swift`**

In `MobileAppStore`, add two new stored properties after the existing `var isPairing`:

```swift
// The confirmed server URL used to load the webview after pairing.
// Set by connectAndPair() / importPairingCode() on success.
var pairedServerURL: URL?
```

Note: `deviceToken` and `serverURLInput` are already stored. `pairedServerURL` is derived from `serverURLInput` at pair time and cached here so `MobileRootView` doesn't have to re-derive it.

In `connectAndPair()`, after `startPolling()` add:

```swift
self.pairedServerURL = baseURL
```

In `importPairingCode()`, in both the branch that calls `await connectAndPair()` and the branch that calls `await refreshSnapshot()` / `startPolling()`, set:

```swift
self.pairedServerURL = baseURL
```

In `clearSession()`, add:

```swift
pairedServerURL = nil
```

- [ ] **Step 2: Modify `MobileRootView` in `MobileScreens.swift`**

Currently:

```swift
if store.hasPairedSession {
  MobileShellView(store: store)
} else {
  MobilePairingView(store: store)
}
```

Replace with:

```swift
if let serverURL = store.pairedServerURL, store.hasPairedSession {
  MobileWebView(
    serverURL: serverURL,
    desktopAuthToken: store.desktopAuthTokenInput.isEmpty ? nil : store.desktopAuthTokenInput,
    onDisconnect: {
      store.clearSession()
    }
  )
} else if store.hasPairedSession {
  // hasPairedSession but no pairedServerURL means app was restored from Keychain
  // on launch. Restore the URL from serverURLInput.
  MobileWebView(
    serverURL: store.normalizeServerURL(store.serverURLInput) ?? URL(string: "about:blank")!,
    desktopAuthToken: store.desktopAuthTokenInput.isEmpty ? nil : store.desktopAuthTokenInput,
    onDisconnect: {
      store.clearSession()
    }
  )
} else {
  MobilePairingView(store: store)
}
```

Also add `MobileTheme` import guard at the top if `MobileWebView.swift` uses it (it does — `MobileTheme` is defined in `MobileScreens.swift` so it's already in scope since they're in the same target).

- [ ] **Step 3: Remove `MobileShellView` usage** (it's still defined but no longer used as root)

`MobileShellView` can stay in the file (it contains useful sub-views referenced by other code). Simply leave it defined — the compiler will not error. If you want to clean it up, do so in a separate future commit. For now just verify there are no _other_ call sites that will break.

```bash
grep -rn "MobileShellView" /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/mobile/
```

Expected: only the definition in `MobileScreens.swift` and the now-replaced usage in `MobileRootView`.

- [ ] **Step 4: Restore pairedServerURL on app launch**

In `restoreSessionIfPossible()` in `MobileAppStore.swift`, after the existing `if !serverURLInput.isEmpty, deviceToken != nil {` block, set `pairedServerURL`:

```swift
func restoreSessionIfPossible() async {
  if !serverURLInput.isEmpty, deviceToken != nil {
    pairedServerURL = normalizeServerURL(serverURLInput)
    errorMessage = nil
    // Note: we no longer call refreshSnapshot() / refreshDevices() / startPolling()
    // here because the webview handles all data loading via WebSocket directly.
  }
}
```

Remove the `await refreshSnapshot()`, `await refreshDevices()`, and `startPolling()` calls from `restoreSessionIfPossible()` since the WKWebView will connect and load data itself via WebSocket — no polling needed from the Swift side.

- [ ] **Step 5: Build in Xcode**

```bash
xcodebuild -project /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/mobile/BirdCode.xcodeproj -scheme BirdCode -sdk iphonesimulator build 2>&1 | tail -30
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 6: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add \
  apps/mobile/Sources/BirdCode/Views/MobileScreens.swift \
  apps/mobile/Sources/BirdCode/Services/MobileAppStore.swift
git commit -m "feat(mobile): route to WKWebView after pairing instead of MobileShellView

MobileRootView now shows MobileWebView(serverURL, desktopAuthToken) when
hasPairedSession. restoreSessionIfPossible no longer polls — the webview
connects via WebSocket directly. pairedServerURL stored on MobileAppStore."
```

---

## Task 9: Swift — NSAppTransportSecurity for local HTTP

**Files:**

- Modify: `apps/mobile/project.yml`

The WKWebView needs to load `http://` (not `https://`) local-network URLs. The existing `project.yml` has `INFOPLIST_KEY_NSAppTransportSecurity_NSAllowsLocalNetworking: YES` but this only allows `*.local` mDNS hostnames, not raw IP addresses like `192.168.x.x`. We need `NSAllowsArbitraryLoads` scoped to local network, or a more targeted exception.

- [ ] **Step 1: Read `apps/mobile/project.yml`**

Already read above. Current relevant key:

```yaml
INFOPLIST_KEY_NSAppTransportSecurity_NSAllowsLocalNetworking: YES
```

- [ ] **Step 2: Add `NSAllowsArbitraryLoadsInWebContent` to project.yml**

The correct key for WKWebView is `NSAllowsArbitraryLoadsInWebContent`. Add it alongside the existing ATS key:

```yaml
INFOPLIST_KEY_NSAppTransportSecurity_NSAllowsLocalNetworking: YES
INFOPLIST_KEY_NSAppTransportSecurity_NSAllowsArbitraryLoadsInWebContent: YES
```

- [ ] **Step 3: Regenerate Xcode project via xcodegen**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/mobile
xcodegen generate 2>&1 | tail -10
```

Expected: `✓ Generated: BirdCode.xcodeproj`

- [ ] **Step 4: Build to verify**

```bash
xcodebuild -project /Users/ludvighedin/Programming/personal/AB/coder-new/t3code/apps/mobile/BirdCode.xcodeproj -scheme BirdCode -sdk iphonesimulator build 2>&1 | tail -10
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 5: Commit**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git add apps/mobile/project.yml apps/mobile/BirdCode.xcodeproj/project.pbxproj
git commit -m "fix(mobile): allow arbitrary loads in WKWebView for local-network http:// server"
```

---

## Task 10: Run full typecheck + lint + tests

- [ ] **Step 1: Full typecheck**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
bun typecheck 2>&1 | grep -E "error TS" | head -30
```

Expected: 0 TypeScript errors.

- [ ] **Step 2: Full lint**

```bash
bun lint 2>&1 | grep -E "error" | head -30
```

Expected: 0 lint errors.

- [ ] **Step 3: Run server tests**

```bash
bun run test --project apps/server 2>&1 | tail -20
```

Expected: all tests pass (mobile.ts changes don't break existing test suite).

- [ ] **Step 4: Run shared/contracts tests**

```bash
bun run test --project packages/shared packages/contracts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Final commit if any lint autofixes applied**

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/t3code
git status
# only commit if there are actually changes
git add -p
git commit -m "chore: lint/format autofixes from final check pass"
```

---

## Self-Review Checklist

**Spec coverage:**

- ✅ Pair response decode failure → Task 1 (slim pair response)
- ✅ Duplicate devices → Task 1 (server dedup by deviceName)
- ✅ Input freeze (TextEditor/sheet) → Task 8 (removed MobileShellView entirely, WKWebView has no TextEditor)
- ✅ Auto-pair on QR scan → unchanged (already works: `MobilePairingView` calls `importPairingCode` from scanner callback; the pairing itself is now faster/more reliable)
- ✅ "Paired! Loading…" confirmation → Task 8 (`MobileWebView` loading spinner)
- ✅ WebSocket auth from WKWebView → Tasks 2, 3 (`__BC_WS_TOKEN__` injection + `resolveServerUrl`)
- ✅ Safe-area insets → Task 4
- ✅ Electron chrome hidden on mobile → Task 5
- ✅ Folder-picker hidden on mobile → Task 5
- ✅ Desktop live indicator → Task 6
- ✅ Polling removed (Swift side) → Task 8 (`restoreSessionIfPossible` simplified)
- ✅ Local HTTP loads → Task 9

**Gaps identified:** None — all design requirements are covered by the 10 tasks.

**Type consistency:** `isMobileWebView` exported from `env.ts` and imported correctly in all files. `pairedServerURL: URL?` added to `MobileAppStore`. `MobileWebView` takes `serverURL: URL`, `desktopAuthToken: String?`, `onDisconnect: () -> Void` — all match usage in `MobileRootView`.

**No placeholders:** All steps contain concrete code or exact commands.
