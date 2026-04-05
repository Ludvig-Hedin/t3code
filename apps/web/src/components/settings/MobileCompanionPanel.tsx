"use client";

import { CopyIcon, QrCodeIcon, SmartphoneIcon } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../ui/button";
import { Card, CardFooter, CardHeader, CardPanel, CardTitle, CardDescription } from "../ui/card";
import { toastManager } from "../ui/toast";
import { cn } from "~/lib/utils";

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
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (isLoopbackHost(parsed.hostname)) {
      return null;
    }
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

export function BirdCodeMobileCompanionPanel() {
  const serverURL = useMemo(() => resolveDesktopPairingUrl(), []);
  const pairingCode = useMemo(() => {
    if (!serverURL) return "";
    return buildPairingCode(buildPairingPayload(serverURL));
  }, [serverURL]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [pairedDevices, setPairedDevices] = useState<DesktopMobileDevice[]>([]);

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
      width: 360,
      scale: 8,
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrDataUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pairingCode, serverURL]);

  useEffect(() => {
    let cancelled = false;

    const loadDevices = () => {
      const result = window.desktopBridge?.getMobileDevices?.();
      if (cancelled || result == null) {
        return;
      }
      setPairedDevices(result.devices ?? []);
    };

    loadDevices();
    const interval = window.setInterval(loadDevices, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleCopy = async () => {
    if (!pairingCode) {
      toastManager.add({
        title: "Pairing code unavailable",
        description: "Open Bird Code in the desktop app to generate a reachable QR.",
        type: "info",
      });
      return;
    }

    if (typeof navigator === "undefined" || navigator.clipboard == null) {
      toastManager.add({
        title: "Copy unavailable",
        description: "Use the QR code or copy the server URL manually.",
        type: "info",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(pairingCode);
      toastManager.add({
        title: "Pairing code copied",
        description: "Paste it into Bird Code on your phone or tablet.",
        type: "success",
      });
    } catch {
      toastManager.add({
        title: "Copy failed",
        description: "Use the QR code or copy the server URL manually.",
        type: "error",
      });
    }
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Mobile devices
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Pair Bird Code</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Open this tab on the desktop, scan the QR from Bird Code on your phone, or copy the
          pairing code into another device. The QR now points at the desktop&apos;s pairable server
          address.
        </p>
      </div>

      <div className="flex flex-col gap-4 pb-8">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Desktop pairing QR</CardTitle>
            <CardDescription>
              This QR points Bird Code at the desktop server running in this window and includes the
              hidden pairing token automatically.
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-4">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <SmartphoneIcon className="size-4 text-muted-foreground" />
                <span>Scan from another device</span>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Bird Code will read the QR, take the server URL and hidden desktop auth token from
                it, and then pair without asking you to hunt for anything.
              </p>
              {serverURL ? (
                <div className="flex flex-col items-center gap-4">
                  <div
                    className={cn(
                      "flex items-center justify-center",
                      isGenerating && "animate-pulse",
                    )}
                  >
                    {qrDataUrl ? (
                      <img
                        alt="Bird Code desktop pairing QR"
                        className="h-[9.75rem] w-[9.75rem] rounded-xl border bg-background p-2 object-contain shadow-xs/5"
                        src={qrDataUrl}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <QrCodeIcon className="size-9 text-muted-foreground" />
                        <div className="text-sm text-muted-foreground">Generating QR code…</div>
                      </div>
                    )}
                  </div>
                  <div className="w-full rounded-xl border bg-background/72 p-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Pairing code
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-foreground">
                      {pairingCode}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm text-muted-foreground">
                  Open Bird Code in the desktop app to generate a reachable pairing code. The
                  browser fallback was disabled so it can&apos;t emit a localhost QR by mistake.
                </div>
              )}
            </div>
          </CardPanel>
          <CardFooter className="border-t">
            <Button variant="outline" disabled={!pairingCode} onClick={handleCopy}>
              <CopyIcon className="size-4" />
              Copy pairing code
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Paired devices</CardTitle>
            <CardDescription>
              Bird Code updates this list automatically when a phone pairs with the desktop.
            </CardDescription>
          </CardHeader>
          <CardPanel className="space-y-4">
            {pairedDevices.length > 0 ? (
              <div className="space-y-3">
                {pairedDevices.map((device) => (
                  <div
                    key={device.deviceId}
                    className="rounded-2xl border bg-background/72 p-4 shadow-xs/5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
                        {device.deviceName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">
                            {device.deviceName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Code {device.pairCode}
                          </div>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Last seen{" "}
                          {new Date(device.lastSeenAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                        {device.revokedAt ? (
                          <div className="mt-1 text-xs text-destructive">Revoked</div>
                        ) : (
                          <div className="mt-1 text-xs text-success">Paired</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="text-sm font-medium text-foreground">No paired devices yet</div>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Pair Bird Code on iPhone, then come back here to see it listed.
                </p>
              </div>
            )}
          </CardPanel>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>How it works</CardTitle>
            <CardDescription>Keep the flow simple and predictable.</CardDescription>
          </CardHeader>
          <CardPanel className="space-y-4">
            <div className="space-y-3">
              <Step number="1" title="Open Bird Code on iPhone">
                Go to Settings and open the Pair tab.
              </Step>
              <Step number="2" title="Scan or paste">
                Scan the desktop QR, or paste the pairing code into the app.
              </Step>
              <Step number="3" title="Pair automatically">
                Bird Code stores the device token and reconnects on its own.
              </Step>
            </div>

            <div className="rounded-2xl border bg-muted/30 p-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Desktop note
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The QR encodes the desktop server URL and pairing token in one shareable code so you
                do not need to copy anything manually.
              </p>
            </div>
          </CardPanel>
        </Card>
      </div>
    </div>
  );
}

function Step({ number, title, children }: { number: string; title: string; children: string }) {
  return (
    <div className="rounded-2xl border bg-background/72 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
          {number}
        </div>
        <div className="text-sm font-medium text-foreground">{title}</div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
