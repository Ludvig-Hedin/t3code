import type { ReactNode } from "react";

import {
  BentoPreviewSettings,
  BentoPreviewTerminal,
  BentoPreviewThreads,
  BentoPreviewWorkLog,
} from "@/components/marketing/bento-marketing-previews";
import { FeatureSection1 } from "@/components/marketing/sections/feature-section-1";
import { FeatureSection2 } from "@/components/marketing/sections/feature-section-2";

function PreviewFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/90 bg-muted/30 p-4 shadow-sm md:p-6">
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_0_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
        <div className="min-h-[260px] md:min-h-[300px]">{children}</div>
      </div>
    </div>
  );
}

/**
 * Four alternating feature rows (threads → work log → terminal → settings).
 * Replaces the old single “bento” grid for clearer rhythm and breathing room.
 */
export function ProductSurfaceFeatures() {
  return (
    <>
      <section
        className="border-t border-border bg-muted/20 py-10 md:py-12"
        aria-labelledby="product-surfaces-intro"
      >
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="product-surfaces-intro"
              className="text-pretty text-lg font-semibold tracking-tight text-foreground md:text-xl"
            >
              Four surfaces from the shipped UI
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-[15px] md:leading-relaxed">
              Stay in one app for Codex, Claude, and Gemini today—Cursor and OpenCode chats are on
              the roadmap—then use the same four surfaces from the shipped UI: sidebar threads, work
              log, in-repo terminal, and local settings (not a separate marketing theme).
            </p>
          </div>
        </div>
      </section>

      <FeatureSection1
        id="feature-threads"
        eyebrow="Organize"
        title="Pick up where you left off"
        description="Point the app at a repo once; every thread stays in that project. Switch conversations without losing your tree, git state, or history."
      >
        <PreviewFrame>
          <BentoPreviewThreads />
        </PreviewFrame>
      </FeatureSection1>

      <FeatureSection2
        id="feature-worklog"
        className="bg-muted/25"
        eyebrow="Transparency"
        title="See what actually happened"
        description="Tools run, files change, and each step fits the turn—skimmable in seconds. When you step away and come back, you are not decoding a wall of raw output."
      >
        <PreviewFrame>
          <BentoPreviewWorkLog />
        </PreviewFrame>
      </FeatureSection2>

      <FeatureSection1
        id="feature-terminal"
        eyebrow="Control"
        title="Run commands without breaking context"
        description="Tests, installs, and fixes run in the project directory. Paste output back into the composer when the agent needs it—same window, tight loop."
      >
        <PreviewFrame>
          <BentoPreviewTerminal />
        </PreviewFrame>
      </FeatureSection1>

      <FeatureSection2
        id="feature-settings"
        className="bg-muted/25"
        eyebrow="Yours"
        title="Your machine, your defaults"
        description="Choose providers, models, and shortcuts that match how you work. Sign in with the same Codex, Claude, or Gemini setup you already use—no Bird Code account required."
      >
        <PreviewFrame>
          <BentoPreviewSettings />
        </PreviewFrame>
      </FeatureSection2>
    </>
  );
}
