"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLatestPrereleaseRelease, fetchLatestRelease, RELEASES_URL } from "@/lib/releases";
import { SITE } from "@/lib/site";
import { useEffect, useState } from "react";

import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

function resolveAssetHrefs(release: {
  assets?: { name: string; browser_download_url: string }[];
}): Record<string, string> {
  const next: Record<string, string> = {};
  const pairs: [string, string][] = [
    ["arm64.dmg", "arm64.dmg"],
    ["x64.dmg", "x64.dmg"],
    ["x64.exe", "x64.exe"],
    ["x86_64.AppImage", "x86_64.AppImage"],
  ];
  for (const [key, suffix] of pairs) {
    const match = (release.assets ?? []).find((a) => a.name.endsWith(`-${suffix}`));
    next[key] = match?.browser_download_url ?? RELEASES_URL;
  }
  return next;
}

export function DownloadPage() {
  const [version, setVersion] = useState<string>("Loading latest release…");
  const [changelog, setChangelog] = useState<string | null>(null);
  const [hrefs, setHrefs] = useState<Record<string, string>>({});

  const [betaVersion, setBetaVersion] = useState<string | null>(null);
  const [betaChangelog, setBetaChangelog] = useState<string | null>(null);
  const [betaHrefs, setBetaHrefs] = useState<Record<string, string>>({});
  const [betaState, setBetaState] = useState<"loading" | "none" | "ready">("loading");

  useEffect(() => {
    void (async () => {
      try {
        const release = await fetchLatestRelease();
        if (release.tag_name) setVersion(`Latest (${release.tag_name})`);
        if (release.html_url) setChangelog(release.html_url);
        setHrefs(resolveAssetHrefs(release));
      } catch {
        setVersion("Could not load release info.");
        setHrefs({
          "arm64.dmg": RELEASES_URL,
          "x64.dmg": RELEASES_URL,
          "x64.exe": RELEASES_URL,
          "x86_64.AppImage": RELEASES_URL,
        });
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const pre = await fetchLatestPrereleaseRelease();
        if (!pre?.tag_name) {
          setBetaState("none");
          return;
        }
        setBetaVersion(pre.tag_name);
        setBetaChangelog(pre.html_url ?? null);
        setBetaHrefs(resolveAssetHrefs(pre));
        setBetaState("ready");
      } catch {
        setBetaState("none");
      }
    })();
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="container mx-auto flex flex-1 flex-col px-6 py-16 md:py-24">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Download {SITE.name}
          </h1>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <span>{version}</span>
            {changelog ? (
              <a
                href={changelog}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4"
              >
                Release notes ↗
              </a>
            ) : null}
          </p>

          <div className="mt-12 flex flex-col gap-10">
            <PlatformBlock
              title="macOS"
              items={[
                { label: "Apple Silicon (arm64)", sub: ".dmg", asset: "arm64.dmg" },
                { label: "Intel (x64)", sub: ".dmg", asset: "x64.dmg" },
              ]}
              hrefs={hrefs}
            />
            <PlatformBlock
              title="Windows"
              items={[{ label: "Windows 10, 11", sub: ".exe", asset: "x64.exe" }]}
              hrefs={hrefs}
            />
            <PlatformBlock
              title="Linux"
              items={[{ label: "x86_64", sub: "AppImage", asset: "x86_64.AppImage" }]}
              hrefs={hrefs}
            />

            <Card className="border-amber-500/35 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg text-foreground">Beta (unstable) — macOS</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Pre-releases can break, corrupt data, or crash. Use only if you are okay living on
                  the edge and reporting bugs.
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {betaState === "loading" ? (
                  <p className="text-sm text-muted-foreground">Checking for a beta build…</p>
                ) : betaState === "none" ? (
                  <p className="text-sm text-muted-foreground">
                    No GitHub <strong className="text-foreground">pre-release</strong> right now.
                    When we publish one, downloads will show up here automatically. You can still
                    browse{" "}
                    <a
                      href={RELEASES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground underline underline-offset-4"
                    >
                      all releases
                    </a>
                    .
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Beta {betaVersion}</span>
                      {betaChangelog ? (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={betaChangelog}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-foreground underline underline-offset-4"
                          >
                            Notes ↗
                          </a>
                        </>
                      ) : null}
                    </p>
                    <PlatformBlock
                      title=""
                      items={[
                        {
                          label: "Apple Silicon (arm64)",
                          sub: ".dmg · unstable",
                          asset: "arm64.dmg",
                        },
                        { label: "Intel (x64)", sub: ".dmg · unstable", asset: "x64.dmg" },
                      ]}
                      hrefs={betaHrefs}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="mt-12 text-center text-sm text-muted-foreground">
            Looking for older builds? Browse{" "}
            <a
              href={RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline underline-offset-4"
            >
              GitHub Releases
            </a>
            .
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild variant="outline">
              <a href="/">Back to home</a>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function PlatformBlock({
  title,
  items,
  hrefs,
}: {
  title: string;
  items: { label: string; sub: string; asset: string }[];
  hrefs: Record<string, string>;
}) {
  return (
    <section className="flex flex-col gap-3">
      {title ? (
        <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
          {title}
        </h2>
      ) : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ label, sub, asset }) => (
          <a
            key={asset}
            href={hrefs[asset] ?? RELEASES_URL}
            className="flex flex-col rounded-lg border border-border bg-card/40 px-4 py-3 transition-colors hover:bg-muted/50"
          >
            <span className="font-semibold text-foreground">{label}</span>
            <span className="text-sm text-muted-foreground">{sub}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
