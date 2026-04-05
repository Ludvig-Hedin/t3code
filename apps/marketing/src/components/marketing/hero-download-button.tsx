"use client";

import { Button } from "@/components/ui/button";
import { fetchLatestRelease, RELEASES_URL } from "@/lib/releases";
import { useEffect, useState } from "react";

type Platform = { os: "mac" | "win" | "linux"; label: string; arch?: string };

function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return { os: "win", label: "Download for Windows" };
  if (/Mac/i.test(ua)) return { os: "mac", label: "Download for macOS", arch: "arm64" };
  if (/Linux/i.test(ua)) return { os: "linux", label: "Download for Linux" };
  return null;
}

function pickAsset(
  assets: { name: string; browser_download_url: string }[],
  platform: Platform,
): string | null {
  if (platform.os === "win") {
    return assets.find((a) => a.name.endsWith("-x64.exe"))?.browser_download_url ?? null;
  }
  if (platform.os === "mac") {
    const preferred = assets.find((a) => a.name.endsWith(`-${platform.arch}.dmg`));
    const fallback = assets.find((a) => a.name.endsWith(".dmg"));
    return (preferred ?? fallback)?.browser_download_url ?? null;
  }
  if (platform.os === "linux") {
    return assets.find((a) => a.name.endsWith(".AppImage"))?.browser_download_url ?? null;
  }
  return null;
}

export function HeroDownloadButton() {
  const [href, setHref] = useState(RELEASES_URL);
  const [label, setLabel] = useState("Download");

  useEffect(() => {
    const platform = detectPlatform();
    if (!platform) return;
    setLabel(platform.label);

    void (async () => {
      try {
        const release = await fetchLatestRelease();
        const url = pickAsset(release.assets ?? [], platform);
        if (url) setHref(url);
      } catch {
        setHref(RELEASES_URL);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
      <Button asChild size="lg" className="rounded-full px-8">
        <a href={href}>{label}</a>
      </Button>
      <a
        href="/download"
        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        All platforms
      </a>
    </div>
  );
}
