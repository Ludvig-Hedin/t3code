import { SITE } from "@/lib/site";

import { HeroAppDemo } from "../hero-app-demo";
import { HeroDownloadButton } from "../hero-download-button";

export function HeroSection() {
  return (
    <section
      className="border-b border-border bg-background py-12 md:py-16"
      aria-labelledby="hero-heading"
    >
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-3xl px-2 text-center sm:px-4 md:px-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {SITE.tagline}
          </p>
          <h1
            id="hero-heading"
            className="mt-5 text-pretty text-3xl font-semibold tracking-tight text-foreground md:mt-6 md:text-4xl md:leading-[1.12] lg:text-[2.625rem]"
          >
            Desktop shell for Codex, Claude, and Gemini on your checkout
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-[15px] md:leading-relaxed">
            You don&apos;t have to switch apps: Codex, Claude, and Gemini conversations already run
            here, with Cursor and OpenCode chats planned for the same workspace. Open a folder once:
            threads, git, diff, and the thread terminal all read that path. Sign in with the same
            Codex, Claude, or Gemini setup you already use—Bird Code does not add another account.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-10">
            <HeroDownloadButton />
          </div>
        </div>
      </div>

      <div className="mt-10 w-full px-3 sm:mt-12 sm:px-6 lg:mt-14 lg:px-10">
        <div
          className="mx-auto w-full max-w-[min(100%,min(1200px,100vw-1.5rem))] overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-sm"
          style={{ maxHeight: "min(90vh, 880px)" }}
        >
          <div className="h-[min(78vh,680px)] min-h-[360px] sm:min-h-[420px] md:min-h-[480px]">
            <HeroAppDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
