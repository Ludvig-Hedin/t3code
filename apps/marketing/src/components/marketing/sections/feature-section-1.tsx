import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Visual left, copy right on large screens; stacked copy-first on small screens. */
export function FeatureSection1({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border-t border-border bg-background py-16 md:py-24", className)}
      aria-labelledby={id}
    >
      <div className="container mx-auto px-6">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 min-w-0 lg:order-1">{children}</div>
          <div className="order-1 space-y-5 text-center lg:order-2 lg:text-left">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h2
              id={id}
              className="text-pretty text-xl font-semibold tracking-tight text-foreground md:text-2xl"
            >
              {title}
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground md:text-[15px] md:leading-relaxed">
              {description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
