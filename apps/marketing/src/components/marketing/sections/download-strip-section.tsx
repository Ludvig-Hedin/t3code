import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function DownloadStripSection() {
  return (
    <section
      className="border-y border-border bg-card py-8"
      aria-labelledby="download-strip-heading"
    >
      <div className="container mx-auto flex flex-col gap-4 px-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="download-strip-heading" className="text-sm font-medium text-foreground">
            Get the desktop app
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            macOS, Windows, and Linux builds live on GitHub Releases—grab the installer for your
            platform and check the notes for checksums.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <a href="/download">
            /download
            <ArrowRight className="size-4" />
          </a>
        </Button>
      </div>
    </section>
  );
}
