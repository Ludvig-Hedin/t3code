"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { IosCtaPreview } from "@/components/marketing/bento-marketing-previews";
import { ArrowRight } from "lucide-react";
import * as React from "react";

/** cta-section-5 pattern — iOS waitlist */
export function CtaIosWaitlistSection({
  compact = false,
  showDetailLink = false,
}: {
  compact?: boolean;
  /** When true, show a link to `/ios-waitlist` (e.g. on the home page). */
  showDetailLink?: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sent" | "error">("idle");

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const endpoint = import.meta.env.PUBLIC_IOS_WAITLIST_ENDPOINT as string | undefined;
    if (!endpoint) {
      setStatus("sent");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        setStatus(res.ok ? "sent" : "error");
      } catch {
        setStatus("error");
      }
    })();
  }

  const inner = (
    <div
      className={`mx-auto max-w-7xl overflow-hidden rounded-xl border border-border bg-muted/30 ${compact ? "" : "lg:rounded-xl"} lg:pl-12`}
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
        <div className="flex flex-1 flex-col gap-6 px-6 pb-10 pt-12 text-center lg:items-start lg:gap-8 lg:px-0 lg:pb-16 lg:text-left">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">iOS</p>
            <h2 className="text-xl font-semibold text-foreground md:text-2xl">
              TestFlight waitlist
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Pair the iPhone app to your desktop with a QR code from settings. Read and send on the
            same session your Mac or PC is running—no second agent on the phone. Invites go out in
            batches; we only use your email for the list.
          </p>
          {status === "sent" ? (
            <p className="text-sm font-medium text-foreground">
              You are on the list. Watch GitHub for release notes and TestFlight announcements.
            </p>
          ) : (
            <form
              onSubmit={onSubmit}
              className="flex w-full max-w-md flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div className="flex flex-1 flex-col gap-2 text-left">
                <Label htmlFor="waitlist-email" className="text-foreground/90">
                  Email
                </Label>
                <Input
                  id="waitlist-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  className="border-border bg-background text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <Button type="submit" className="gap-2 sm:shrink-0" variant="default">
                Join waitlist
                <ArrowRight className="size-4" />
              </Button>
            </form>
          )}
          {status === "error" ? (
            <p className="text-sm text-muted-foreground">
              Something went wrong—try again or open an issue on the GitHub repo.
            </p>
          ) : null}
          {import.meta.env.DEV && !import.meta.env.PUBLIC_IOS_WAITLIST_ENDPOINT ? (
            <p className="text-xs text-muted-foreground">
              Dev: set <code className="rounded bg-muted px-1">PUBLIC_IOS_WAITLIST_ENDPOINT</code>{" "}
              to POST JSON <code className="rounded bg-muted px-1">{"{ email }"}</code> in
              production.
            </p>
          ) : null}
          {showDetailLink ? (
            <Button asChild variant="ghost" className="text-muted-foreground hover:text-foreground">
              <a href="/ios-waitlist">Full details</a>
            </Button>
          ) : null}
        </div>
        <div className="flex-1 px-6 lg:pl-0">
          <AspectRatio ratio={4 / 3}>
            <div className="absolute inset-0">
              <IosCtaPreview />
            </div>
          </AspectRatio>
        </div>
      </div>
    </div>
  );

  if (compact) {
    return (
      <section className="bg-background py-10 md:py-14" aria-labelledby="ios-waitlist-heading">
        <div className="container mx-auto px-6">{inner}</div>
      </section>
    );
  }

  return (
    <section className="bg-background py-16 lg:py-24" aria-labelledby="ios-waitlist-heading">
      <div className="container mx-auto px-6">
        <h2 id="ios-waitlist-heading" className="sr-only">
          iOS waitlist
        </h2>
        {inner}
      </div>
    </section>
  );
}
