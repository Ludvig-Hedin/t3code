/** Text-only — no decorative icons */
export function FeatureChecklistSection() {
  const items = [
    {
      title: "Turns and approvals",
      body: "Pending tool approvals and user-input prompts block the composer until resolved—state is tracked per thread, not globally.",
    },
    {
      title: "Reconnect behavior",
      body: "The client is built for WebSocket churn: reconnect, resume session, and keep the timeline consistent when streams drop mid-turn.",
    },
    {
      title: "Git-aware diff",
      body: "If the project is a repo, the diff panel reads git state from the thread cwd; if not, the UI tells you plainly.",
    },
    {
      title: "iOS companion (beta)",
      body: "Optional mobile client pairs to the desktop session (QR-first)—follow threads, not run the full agent on the phone.",
    },
  ] as const;

  return (
    <section className="bg-background py-10 md:py-12">
      <div className="container mx-auto px-6">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Behavior that matters under load
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These are explicit product choices from the orchestration layer—not marketing
            adjectives.
          </p>
        </div>
        <ul className="grid gap-5 md:grid-cols-2">
          {items.map(({ title, body }) => (
            <li key={title} className="border-l-2 border-border pl-4">
              <h3 className="text-sm font-medium text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
