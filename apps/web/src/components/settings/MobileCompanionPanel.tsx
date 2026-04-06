"use client";

import { CheckIcon, CopyIcon, GlobeIcon, MoonIcon, PencilIcon, QrCodeIcon, SmartphoneIcon, WifiIcon, XIcon } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { RemoteSettings, TunnelStatus } from "@t3tools/contracts";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { toastManager } from "../ui/toast";
import { cn } from "~/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type PairingPayload = {
  kind: "birdcode-pairing";
  version: 1;
  serverURL: string;
  desktopAuthToken?: string;
};

type DesktopMobileDevice = {
  deviceId: string;
  deviceName: string;
  pairCode: string;
  pairCodeExpiresAt: string;
  pairedAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

const APP_PAIRING_KIND = "birdcode-pairing" as const;
const DEVICE_NAMES_KEY = "birdcode:device-names";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function resolveDesktopPairingUrl(): string | null {
  if (typeof window === "undefined") return null;
  const desktopPairingUrl = window.desktopBridge?.getPairingUrl?.();
  if (typeof desktopPairingUrl !== "string") return null;
  const trimmed = desktopPairingUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (isLoopbackHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildPairingPayload(serverURL: string): PairingPayload {
  const desktopAuthToken = window.desktopBridge?.getDesktopAuthToken?.();
  return {
    kind: APP_PAIRING_KIND,
    version: 1,
    serverURL,
    ...(typeof desktopAuthToken === "string" && desktopAuthToken.length > 0
      ? { desktopAuthToken }
      : {}),
  };
}

function base64UrlEncode(input: string): string {
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  return input;
}

function buildPairingCode(payload: PairingPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `birdcode://pair?payload=${encoded}`;
}

/** Load per-device custom names from localStorage. */
function loadDeviceNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DEVICE_NAMES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Save per-device custom names to localStorage. */
function saveDeviceNames(names: Record<string, string>) {
  try {
    localStorage.setItem(DEVICE_NAMES_KEY, JSON.stringify(names));
  } catch {
    // ignore
  }
}

// ── DeviceRow ─────────────────────────────────────────────────────────────────

function DeviceRow({
  device,
  customName,
  onSaveCustomName,
  onDisconnect,
  isDisconnecting,
}: {
  device: DesktopMobileDevice;
  customName: string | undefined;
  onSaveCustomName: (deviceId: string, name: string) => void;
  onDisconnect: (device: DesktopMobileDevice) => void;
  isDisconnecting: boolean;
}) {
  const displayName = customName ?? device.deviceName;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync if display name changes externally
  useEffect(() => {
    if (!isEditing) setEditValue(displayName);
  }, [displayName, isEditing]);

  const startEdit = () => {
    setEditValue(displayName);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== displayName) {
      onSaveCustomName(device.deviceId, trimmed);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setEditValue(displayName);
    setIsEditing(false);
  };

  const isLive = Date.now() - new Date(device.lastSeenAt).getTime() < 35_000;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-xs/5">
      {/* Avatar */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
        {displayName.slice(0, 1).toUpperCase()}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") cancelEdit();
              }}
              className="h-6 py-0 text-sm"
              aria-label="Rename device"
            />
            <button
              type="button"
              onClick={commitEdit}
              className="rounded p-0.5 text-success hover:bg-success/10"
              aria-label="Save name"
            >
              <CheckIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded p-0.5 text-muted-foreground hover:bg-accent"
              aria-label="Cancel rename"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
            <button
              type="button"
              onClick={startEdit}
              className="rounded p-0.5 text-muted-foreground/60 hover:text-foreground"
              aria-label="Rename device"
            >
              <PencilIcon className="size-3" />
            </button>
          </div>
        )}

        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {isLive ? (
            <span className="flex items-center gap-1 text-green-500">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          ) : (
            <span>
              Last seen{" "}
              {new Date(device.lastSeenAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
          <span className="text-muted-foreground/50">·</span>
          <span className="font-mono text-[10px]">Code {device.pairCode}</span>
        </div>
      </div>

      {/* Disconnect */}
      <Button
        variant="outline"
        size="xs"
        disabled={isDisconnecting}
        onClick={() => onDisconnect(device)}
        className="shrink-0"
      >
        {isDisconnecting ? "Disconnecting…" : "Disconnect"}
      </Button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BirdCodeMobileCompanionPanel() {
  // tunnelStatus must be declared before serverURL so the useMemo dep is in scope.
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatus>(() => {
    const settings = window.desktopBridge?.getRemoteSettings?.();
    if (settings?.remoteAccessEnabled && settings.tunnelUrl) {
      return { status: "connecting" };
    }
    return { status: "idle" };
  });

  const [remoteSettings, setRemoteSettings] = useState<RemoteSettings | null>(() =>
    window.desktopBridge?.getRemoteSettings?.() ?? null,
  );

  const [isEnabling, setIsEnabling] = useState(false);

  useEffect(() => {
    const unsub = window.desktopBridge?.onTunnelStatus?.((status) => {
      setTunnelStatus(status);
      if (status.status === "active" || status.status === "idle") {
        setRemoteSettings(window.desktopBridge?.getRemoteSettings?.() ?? null);
      }
    });
    return unsub;
  }, []);

  // Re-resolve when tunnel status changes so QR auto-updates to tunnel URL.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const serverURL = useMemo(() => resolveDesktopPairingUrl(), [tunnelStatus.status]);
  const pairingCode = useMemo(() => {
    if (!serverURL) return "";
    return buildPairingCode(buildPairingPayload(serverURL));
  }, [serverURL]);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [pairedDevices, setPairedDevices] = useState<DesktopMobileDevice[]>([]);
  const [disconnectingDeviceId, setDisconnectingDeviceId] = useState<string | null>(null);
  const [customNames, setCustomNames] = useState<Record<string, string>>(loadDeviceNames);
  const [copied, setCopied] = useState(false);

  const refreshDevices = useCallback(() => {
    const result = window.desktopBridge?.getMobileDevices?.();
    if (result == null) return;
    setPairedDevices(result.devices ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsGenerating(true);
    if (!serverURL) {
      setQrDataUrl(null);
      setIsGenerating(false);
      return () => {
        cancelled = true;
      };
    }
    void QRCode.toDataURL(pairingCode, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 200,
      scale: 8,
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pairingCode, serverURL]);

  useEffect(() => {
    refreshDevices();
    const interval = window.setInterval(refreshDevices, 4_000);
    return () => window.clearInterval(interval);
  }, [refreshDevices]);

  const handleDisconnect = async (device: DesktopMobileDevice) => {
    const confirmed = await window.desktopBridge?.confirm?.(
      `Disconnect ${customNames[device.deviceId] ?? device.deviceName} from Bird Code?`,
    );
    if (!confirmed) return;
    setDisconnectingDeviceId(device.deviceId);
    try {
      const result = await window.desktopBridge?.revokeMobileDevice?.({
        deviceId: device.deviceId,
      });
      if (result?.devices) {
        setPairedDevices(result.devices);
      } else {
        refreshDevices();
      }
      toastManager.add({ title: "Device disconnected", type: "success" });
    } catch {
      toastManager.add({ title: "Disconnect failed", description: "Try again.", type: "error" });
    } finally {
      setDisconnectingDeviceId(null);
    }
  };

  const handleSaveCustomName = useCallback((deviceId: string, name: string) => {
    setCustomNames((prev) => {
      const next = { ...prev, [deviceId]: name };
      saveDeviceNames(next);
      return next;
    });
  }, []);

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

  const handleCopyCode = useCallback(async () => {
    if (!pairingCode) {
      toastManager.add({ title: "Pairing code unavailable", type: "info" });
      return;
    }
    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      toastManager.add({ title: "Copy unavailable", type: "info" });
      return;
    }
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toastManager.add({ title: "Copy failed", type: "error" });
    }
  }, [pairingCode]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Mobile devices
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pair Bird Code</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Scan the QR from Bird Code on your phone, or copy the pairing code into another device.
        </p>
      </div>

      <div className="flex flex-col gap-4 pb-8">
        {/* ── Remote Access ───────────────────────────────────────────── */}
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
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Works by creating a private encrypted tunnel between your phone and this Mac
                  through your own free{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 transition-colors hover:text-foreground"
                    onClick={() =>
                      void window.desktopBridge?.openExternal?.("https://cloudflare.com")
                    }
                  >
                    Cloudflare
                  </button>{" "}
                  account. Bird Code never sees your data — the tunnel runs entirely under your
                  account and only your devices can connect.
                </p>
                <p className="text-xs text-muted-foreground">
                  You'll be asked to log in to Cloudflare once. After that, it works automatically
                  every time you open Bird Code.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => void handleEnableRemoteAccess()}
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
                  <p className="mt-1 break-all font-mono text-xs text-foreground">
                    {tunnelStatus.url}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The QR code below now encodes this URL — scan it once from your iPhone and it
                  will always connect, even on different Wi-Fi or LTE.
                </p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => void handleDisableRemoteAccess()}
                >
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
                  onClick={() => void handleEnableRemoteAccess()}
                  disabled={isEnabling}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Keep Mac Awake ──────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <MoonIcon className="size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold text-foreground">Keep Mac Awake</p>
                <p className="text-xs text-muted-foreground">
                  Mac stays on and reachable while plugged in. Closing the lid on battery will
                  still sleep.
                </p>
              </div>
            </div>
            <Switch
              checked={remoteSettings?.keepAwakeEnabled ?? false}
              onCheckedChange={(checked) => void handleToggleKeepAwake(checked)}
              aria-label="Keep Mac awake"
            />
          </div>
        </div>

        {/* Pairing card — QR beside the pairing code info */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          <div className="border-b px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <SmartphoneIcon className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Pair a phone</h2>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Scan this QR from Bird Code on iPhone or paste the pairing code into another device.
            </p>
          </div>

          {serverURL ? (
            <div className="flex items-start gap-4 p-4 sm:p-5">
              {/* QR code */}
              <div
                className={cn(
                  "shrink-0 overflow-hidden rounded-xl border bg-white p-1.5 shadow-xs/5",
                  isGenerating && "animate-pulse",
                )}
              >
                {qrDataUrl ? (
                  <img
                    alt="Bird Code desktop pairing QR"
                    className="size-[7.5rem] object-contain"
                    src={qrDataUrl}
                  />
                ) : (
                  <div className="flex size-[7.5rem] items-center justify-center">
                    <QrCodeIcon className="size-8 text-muted-foreground/40" />
                  </div>
                )}
              </div>

              {/* Pairing code + copy */}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Click to copy, then paste it into Bird Code on your device.
                </p>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="group w-full rounded-xl border bg-background/60 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                  aria-label="Copy pairing code"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Pairing code
                    </span>
                    {copied ? (
                      <span className="flex items-center gap-1 text-[10px] text-success">
                        <CheckIcon className="size-3" /> Copied
                      </span>
                    ) : (
                      <CopyIcon className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
                    )}
                  </div>
                  <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-foreground">
                    {pairingCode}
                  </p>
                </button>

                <Button
                  variant="outline"
                  size="xs"
                  disabled={!pairingCode}
                  onClick={handleCopyCode}
                  className="w-full"
                >
                  <CopyIcon className="size-3" />
                  {copied ? "Copied!" : "Copy pairing code"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="m-4 rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm text-muted-foreground">
              Open Bird Code in the desktop app to generate a reachable pairing code. The browser
              fallback was disabled to avoid emitting a localhost QR by mistake.
            </div>
          )}
        </div>

        {/* Connected devices */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs/5">
          <div className="border-b px-4 py-3 sm:px-5">
            <h2 className="text-sm font-semibold text-foreground">Connected devices</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Rename or disconnect devices paired with this desktop.
            </p>
          </div>
          <div className="space-y-2 p-4 sm:p-5">
            {pairedDevices.length > 0 ? (
              pairedDevices.map((device) => (
                <DeviceRow
                  key={device.deviceId}
                  device={device}
                  customName={customNames[device.deviceId]}
                  onSaveCustomName={handleSaveCustomName}
                  onDisconnect={handleDisconnect}
                  isDisconnecting={disconnectingDeviceId === device.deviceId}
                />
              ))
            ) : (
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-sm font-medium text-foreground">No connected devices yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pair Bird Code on iPhone, then come back here to manage the connection.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
