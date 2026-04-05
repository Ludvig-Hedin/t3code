import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SITE } from "@/lib/site";

export function FaqSection() {
  const general = [
    {
      q: "What runs on my machine?",
      a: "The Bird Code app and a small local service. Codex, Claude, and Gemini still authenticate the way you already set them up—Bird Code does not replace those logins or add a separate account.",
    },
    {
      q: "Do I need a Bird Code account?",
      a: "No. You sign in through each provider (OpenAI, Anthropic, Google, and so on) for Codex, Claude, or Gemini—same as today. Bird Code just hosts the workspace around them.",
    },
    {
      q: "Where does the repo live?",
      a: "On your disk. You open a folder; threads and the terminal use that path. Nothing goes to a Bird Code cloud—check each provider’s policy for what leaves your machine when the agent runs.",
    },
    {
      q: "Linux?",
      a: "Yes—AppImage on the releases page, alongside macOS and Windows builds.",
    },
  ] as const;

  const mobile = [
    {
      q: "Is there an iOS app?",
      a: "A companion app is rolling out via TestFlight-style invites. It pairs to your desktop session—it is not a full replacement for the desktop app.",
    },
    {
      q: "Does the phone run the agent?",
      a: "No. Your desktop runs the agent; the phone follows the same thread and lets you send short messages when you are away from the keyboard.",
    },
  ] as const;

  return (
    <section className="bg-background py-10 md:py-12" aria-labelledby="faq-heading">
      <div className="container mx-auto px-6">
        <div className="mb-8 max-w-2xl">
          <h2 id="faq-heading" className="text-lg font-semibold tracking-tight text-foreground">
            FAQ
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Still stuck? Open an issue on{" "}
            <a
              href={SITE.github}
              className="font-medium text-foreground underline underline-offset-4 hover:no-underline"
            >
              GitHub
            </a>
            .
          </p>
        </div>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Desktop
            </h3>
            <Accordion type="single" collapsible className="w-full">
              {general.map(({ q, a }, i) => (
                <AccordionItem key={q} value={`g-${i}`}>
                  <AccordionTrigger className="text-left text-sm">{q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Mobile
            </h3>
            <Accordion type="single" collapsible className="w-full">
              {mobile.map(({ q, a }, i) => (
                <AccordionItem key={q} value={`m-${i}`}>
                  <AccordionTrigger className="text-left text-sm">{q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
