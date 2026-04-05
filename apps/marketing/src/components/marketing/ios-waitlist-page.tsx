"use client";

import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";
import { CtaIosWaitlistSection } from "./sections/cta-ios-waitlist-section";

export function IosWaitlistPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteNav />
      <main className="flex-1">
        <div className="container mx-auto max-w-3xl px-6 pt-12 pb-6 md:pt-14">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            iOS companion
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your desktop runs the agent and holds the repo. The phone follows the same thread and
            lets you send quick messages after you pair from settings—no duplicate runtime on the
            device.
          </p>
        </div>
        <CtaIosWaitlistSection />
        <div className="container mx-auto max-w-3xl px-6 pb-16 text-sm text-muted-foreground">
          <p>
            Pairing details live in the repo README as the flow stabilizes; treat TestFlight builds
            as preview-only until we say otherwise.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
