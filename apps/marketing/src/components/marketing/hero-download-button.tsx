"use client";

import { Button } from "@/components/ui/button";
import { fetchLatestRelease, RELEASES_URL } from "@/lib/releases";
import { useEffect, useState } from "react";

type Platform = { os: "mac" | "win" | "linux"; label: string; arch?: "arm64" | "x64" };

/** Chrome/Safari on Apple Silicon still report "Intel Mac OS X" in `userAgent`; use Client Hints when available. */
async function resolveMacArch(): Promise<"arm64" | "x64" | null> {
  const nav = navigator as Navigator & {
    userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }> };
  };
  try {
    const values = await nav.userAgentData?.getHighEntropyValues?.(["architecture"]);
    const a = values?.architecture?.toLowerCase();
    if (a === "x86" || a === "x86_64") return "x64";
    if (a === "arm" || a === "aarch64") return "arm64";
  } catch {
    /* ignore — fall through */
  }
  return null;
}

function detectPlatform(): Platform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return { os: "win", label: "Download for Windows" };
  if (/Mac/i.test(ua)) return { os: "mac", label: "Download for macOS" };
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
  if (platform.os === "mac" && platform.arch) {
    const preferred = assets.find((a) => a.name.endsWith(`-${platform.arch}.dmg`));
    // Rosetta: arm64 Macs can run x64 builds; never serve arm64 DMG as fallback for x64 users.
    const secondary =
      platform.arch === "arm64"
        ? assets.find((a) => a.name.endsWith("-x64.dmg"))
        : undefined;
    return (preferred ?? secondary)?.browser_download_url ?? null;
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
    const base = detectPlatform();
    if (!base) return;
    setLabel(base.label);

    void (async () => {
      let platform: Platform = base;
      if (base.os === "mac") {
        const arch = await resolveMacArch();
        if (arch === null) {
          setHref("/download");
          return;
        }
        platform = { ...base, arch };
      }

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
