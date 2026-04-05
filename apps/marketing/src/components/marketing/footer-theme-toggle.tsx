"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyThemeMode,
  getStoredThemeMode,
  type MarketingThemeMode,
  MARKETING_THEME_STORAGE_KEY,
} from "@/lib/marketing-theme";

const MODES: { mode: MarketingThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light theme", Icon: Sun },
  { mode: "system", label: "Use system theme", Icon: Monitor },
  { mode: "dark", label: "Dark theme", Icon: Moon },
];

export function FooterThemeToggle() {
  const [current, setCurrent] = useState<MarketingThemeMode>("system");
  const skipNextPersist = useRef(true);

  useLayoutEffect(() => {
    const mode = getStoredThemeMode();
    setCurrent(mode);
    applyThemeMode(mode);
    localStorage.setItem(MARKETING_THEME_STORAGE_KEY, mode);
  }, []);

  useEffect(() => {
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    applyThemeMode(current);
    localStorage.setItem(MARKETING_THEME_STORAGE_KEY, current);
  }, [current]);

  useEffect(() => {
    if (current !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [current]);

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border border-border/50 bg-muted/25 p-0.5"
      role="group"
      aria-label="Theme"
    >
      {MODES.map(({ mode, label, Icon }) => {
        const on = current === mode;
        return (
          <Button
            key={mode}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "rounded-md text-muted-foreground hover:text-foreground",
              on && "bg-background text-foreground shadow-sm",
            )}
            aria-pressed={on}
            aria-label={label}
            onClick={() => setCurrent(mode)}
          >
            <Icon className="size-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
