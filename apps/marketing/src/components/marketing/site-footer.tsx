"use client";

import { Separator } from "@/components/ui/separator";
import { FooterThemeToggle } from "@/components/marketing/footer-theme-toggle";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background py-10 lg:py-14" role="contentinfo">
      <div className="container mx-auto flex flex-col gap-8 px-6">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <a href="/" className="flex items-center gap-2.5 font-semibold text-foreground">
            <img src="/favicon.svg" alt="" width={28} height={28} className="rounded-md" />
            {SITE.name}
          </a>
          <nav
            className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground"
            aria-label="Footer"
          >
            <a href="/features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="/download" className="transition-colors hover:text-foreground">
              Download
            </a>
            <a href="/ios-waitlist" className="transition-colors hover:text-foreground">
              iOS waitlist
            </a>
            <a
              href={SITE.github}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
        <Separator className="bg-border/50" />
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-center text-xs leading-snug text-muted-foreground sm:text-left">
            © {new Date().getFullYear()} {SITE.name}. Open builds on GitHub — no account required to
            try the desktop app.
          </p>
          <FooterThemeToggle />
        </div>
      </div>
    </footer>
  );
}
