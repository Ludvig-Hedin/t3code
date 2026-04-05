import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/**
 * Comparison layout v2: one prominent column for Bird Code, stacked alternatives beside it.
 * Reads clearer than four equal-width cards on wide screens.
 */
export function ComparisonSection2() {
  return (
    <section
      className="border-t border-border bg-muted/30 py-12 md:py-16"
      aria-labelledby="compare-heading"
    >
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12 md:text-left">
          <h2
            id="compare-heading"
            className="text-xl font-semibold tracking-tight text-foreground md:text-2xl"
          >
            How Bird Code fits next to other tools
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
            Bird Code wraps Codex, Claude, and Gemini in one desktop window—Cursor and OpenCode
            chats are on the roadmap—so threads stay tied to your repo without switching apps. Add
            the iPhone companion when you want to follow along away from your desk.
          </p>
        </div>

        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-12 lg:gap-8">
          <Card className="border-border bg-background shadow-sm lg:col-span-5 lg:min-h-[280px]">
            <CardHeader className="border-b border-border/80 pb-4">
              <CardTitle className="text-base font-semibold text-foreground">Bird Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-5 text-sm leading-relaxed text-muted-foreground">
              <p>
                One window for Codex, Claude, and Gemini today—threads, a readable work log, diff,
                and terminal—with Cursor and OpenCode chats planned for the same workspace.
              </p>
              <p className="text-foreground/90">
                Best when you want several agents in one place instead of a different app for every
                conversation.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-col justify-center gap-0 lg:col-span-7">
            <Card className="rounded-lg border-border bg-background shadow-none">
              <CardContent className="flex flex-col gap-4 p-5 sm:p-6">
                <CompareRow
                  title="Codex (CLI)"
                  body="The official terminal-first Codex—the same capabilities Bird Code drives from the desktop."
                  foot="Stay on the CLI if you only need Codex and rarely leave the shell."
                />
                <Separator className="bg-border/80" />
                <CompareRow
                  title="Cursor"
                  body="AI built into the editor—inline edits and multi-file refactors inside VS Code."
                  foot="Choose Cursor when the editor is your main surface all day."
                />
                <Separator className="bg-border/80" />
                <CompareRow
                  title="Claude Code"
                  body="Anthropic's agent CLI for Claude subscribers—terminal-first workflows."
                  foot="Use it when you want Claude without a separate desktop shell."
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompareRow({ title, body, foot }: { title: string; body: string; foot: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <p className="text-sm leading-relaxed text-foreground/85">{foot}</p>
    </div>
  );
}
