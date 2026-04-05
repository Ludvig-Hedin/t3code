"use client";

import { Button } from "@/components/ui/button";
import { SITE } from "@/lib/site";
import { Menu, X } from "lucide-react";
import { useState } from "react";

const MENU_ITEMS = [
  { label: "Features", href: "/features" },
  { label: "Download", href: "/download" },
  { label: "iOS waitlist", href: "/ios-waitlist" },
] as const;

function NavMenuItems({ className }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-1 md:flex-row md:gap-1 ${className ?? ""}`}>
      {MENU_ITEMS.map(({ label, href }) => (
        <a key={label} href={href}>
          <Button
            variant="ghost"
            className="w-full md:w-auto text-muted-foreground hover:text-foreground"
          >
            {label}
          </Button>
        </a>
      ))}
    </div>
  );
}

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 border-b border-border/50 bg-background/85 px-4 py-2 backdrop-blur-md md:px-6"
      aria-label="Primary"
    >
      <div className="container mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-4">
          <a
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
          >
            <img src="/favicon.svg" alt="" width={28} height={28} className="rounded-md" />
            {SITE.name}
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>

        <div className="hidden items-center gap-3 md:flex md:flex-row">
          <NavMenuItems />
          <a href={SITE.github} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              GitHub
            </Button>
          </a>
        </div>

        {open ? (
          <div className="flex flex-col gap-3 pb-2 md:hidden">
            <NavMenuItems />
            <a href={SITE.github} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full">
                GitHub
              </Button>
            </a>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
