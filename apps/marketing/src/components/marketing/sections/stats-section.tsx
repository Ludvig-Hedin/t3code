/** Outcome-focused bullets — maps to real product behavior (see AGENTS.md for engineering detail). */
export function StatsSection() {
  const rows = [
    {
      k: "Live session",
      v: "Updates stream in as the agent works—you are not refreshing tabs or guessing whether a turn finished.",
    },
    {
      k: "Your providers",
      v: "Codex and Claude use the authentication you already set up with their tools; Bird Code is the workspace around them.",
    },
    {
      k: "Clear timeline",
      v: "Messages, replies, and work entries show up as structured steps—not one opaque blob of text.",
    },
    {
      k: "Project context",
      v: "Threads, terminal, and diff all read the same folder you opened, so nothing drifts to the wrong tree.",
    },
  ] as const;

  return (
    <section
      className="border-y border-border bg-muted/30 py-10 md:py-12"
      aria-labelledby="stats-heading"
    >
      <div className="container mx-auto px-6">
        <div className="mb-8 max-w-2xl">
          <h2 id="stats-heading" className="text-lg font-semibold tracking-tight text-foreground">
            What stays in sync
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            WebSocket push and provider wiring are documented in{" "}
            <code className="font-mono text-xs">AGENTS.md</code>—below is what you see in the
            window.
          </p>
        </div>
        <dl className="grid gap-6 md:grid-cols-2">
          {rows.map(({ k, v }) => (
            <div key={k} className="border-l-2 border-border pl-4">
              <dt className="font-mono text-xs font-medium text-foreground">{k}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
