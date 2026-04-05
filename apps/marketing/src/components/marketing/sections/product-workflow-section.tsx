/** Step list — no icon grid; mirrors actual navigation in the app */
export function ProductWorkflowSection() {
  const steps = [
    {
      n: "01",
      title: "Open a project",
      body: "Choose a folder on disk. Threads, git, and the terminal all stay scoped to that path—your repo stays local.",
    },
    {
      n: "02",
      title: "Start or resume a thread",
      body: "Each thread keeps its own messages, in-flight work, and anything waiting on you. Jump between threads from the sidebar without losing history.",
    },
    {
      n: "03",
      title: "Send from the composer",
      body: "Pick provider and model, write your prompt, and attach terminal output or images if you need them. Replies stream into the same timeline.",
    },
    {
      n: "04",
      title: "Review tools, diff, shell",
      body: "Watch the work log when tools run, open the diff panel for changes, and use the thread terminal when you need to run something or capture output.",
    },
  ] as const;

  return (
    <section className="bg-background py-10 md:py-12" aria-labelledby="workflow-heading">
      <div className="container mx-auto px-6">
        <h2
          id="workflow-heading"
          className="max-w-2xl text-lg font-semibold tracking-tight text-foreground"
        >
          How a session usually goes
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Open a project, work in threads, send from the composer, then review what changed—same
          rhythm every time.
        </p>
        <ol className="mt-8 grid gap-6 border-t border-border pt-8 md:grid-cols-2">
          {steps.map(({ n, title, body }) => (
            <li key={n} className="flex gap-4">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{n}</span>
              <div>
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
