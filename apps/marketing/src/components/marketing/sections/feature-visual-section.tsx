import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  FeaturePreviewPlan,
  FeaturePreviewTerminal,
  FeaturePreviewTimeline,
} from "@/components/marketing/feature-marketing-previews";

/** Three concrete UI states: proposed plan, timeline, terminal */
export function FeatureVisualSection() {
  const cards = [
    {
      title: "Plans you can act on",
      body: "When the agent proposes a plan, it shows up as a card you can read, accept, or reject before the rest of the turn continues.",
      Preview: FeaturePreviewPlan,
    },
    {
      title: "One thread, one scroll",
      body: "Your messages, the reply, and work entries sit together so you see how a turn starts and when it finishes.",
      Preview: FeaturePreviewTimeline,
    },
    {
      title: "Terminal in reach",
      body: "Open it from the header when you need it; it runs in the project folder for installs, tests, or pasting errors back into the composer.",
      Preview: FeaturePreviewTerminal,
    },
  ] as const;

  return (
    <section className="border-t border-border bg-muted/20 py-10 md:py-12">
      <div className="container mx-auto px-6">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Plan card, timeline, thread terminal
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Three views the desktop client already shows: accept or reject a proposed plan, scroll
            one thread for the turn, open the shell in the folder you opened.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-4">
          {cards.map(({ title, body, Preview }) => (
            <div key={title} className="flex flex-col gap-3">
              <AspectRatio ratio={4 / 3}>
                <div className="absolute inset-0 overflow-hidden rounded-lg border border-border bg-card">
                  <Preview />
                </div>
              </AspectRatio>
              <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
