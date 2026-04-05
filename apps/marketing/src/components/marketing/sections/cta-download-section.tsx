import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CtaDownloadSection() {
  return (
    <section
      className="border-t border-border bg-muted/30 py-10 md:py-12"
      aria-labelledby="cta-download-heading"
    >
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg border border-border bg-card p-6 md:flex-row md:items-center md:p-8">
          <div className="max-w-xl">
            <h2 id="cta-download-heading" className="text-sm font-medium text-foreground">
              Ready to try
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose your platform, install, then sign in with Codex or Claude in settings and open
              a project folder to start a thread.
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <a href="/download">
              View downloads
              <ArrowRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
