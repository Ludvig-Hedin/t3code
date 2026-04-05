/**
 * Scripted hero demo sequences — grounded in real provider/orchestration behavior (read/run tools, stream).
 * Each scenario runs on its thread id; copy is concrete, not generic SaaS filler.
 */

export type DemoMsg =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; detail: string };

export type ThreadId = "auth" | "readme" | "tests";

export type HeroDemoScenario = {
  /** Text typed into the composer before “send” */
  composerPrompt: string;
  /** Messages appended after the user turn (tool rows, assistant, etc.) */
  afterUser: DemoMsg[];
};

export const PROJECT_FOLDER = "bird-code";

export const THREADS: {
  id: ThreadId;
  title: string;
  seed: DemoMsg[];
}[] = [
  {
    id: "auth",
    title: "Auth hardening",
    seed: [
      { kind: "user", text: "Where do we validate the session cookie?" },
      {
        kind: "assistant",
        text: "It is parsed in `parseSession` and checked against the signed payload before the route handler runs.",
      },
    ],
  },
  {
    id: "readme",
    title: "README polish",
    seed: [
      {
        kind: "user",
        text: "Sketch a short “Local dev” section I can paste into the README.",
      },
    ],
  },
  {
    id: "tests",
    title: "Flaky tests",
    seed: [
      { kind: "user", text: "Why does CI fail on main sometimes?" },
      {
        kind: "assistant",
        text: "The websocket mock races teardown—rerun usually passes. I can add a deterministic wait if you want.",
      },
    ],
  },
];

/** One loop step = pick thread → type prompt → run tool + stream (below). */
export const SCENARIOS: Record<ThreadId, HeroDemoScenario> = {
  auth: {
    composerPrompt:
      "Add a one-line note about rotating signing keys next to SESSION_SECRET, and point to where verification happens.",
    afterUser: [
      {
        kind: "tool",
        name: "read_file",
        detail: "src/auth/session.ts",
      },
      {
        kind: "assistant",
        text: "In `parseSession` we verify `sig` with `SESSION_SECRET`. I added a short comment: rotate keys on a schedule, invalidate cookies after cutover, and keep the old secret briefly for verification during migration. The check runs before any route handler—see `requireSession` wrapping API handlers.",
      },
    ],
  },
  readme: {
    composerPrompt:
      "Draft a ## Local dev block: install, env file, dev command, and the URL printed on boot.",
    afterUser: [
      { kind: "tool", name: "read_file", detail: "README.md" },
      {
        kind: "assistant",
        text: "Here is paste-ready Markdown:\n\n## Local dev\n\n1. Install deps with your package manager.\n2. Copy `.env.example` → `.env` and fill provider keys.\n3. Run the dev server from the repo root; the terminal prints the local URL.\n4. Open that URL—the web UI talks to the local Node server over WebSocket.",
      },
    ],
  },
  tests: {
    composerPrompt:
      "Run the unit suite with Vitest, then summarize failures and suggest a minimal fix.",
    afterUser: [
      { kind: "tool", name: "run_terminal_cmd", detail: "bun run test" },
      {
        kind: "assistant",
        text: "Two failures in `ws-reconnect.test.ts`: both time out waiting for mock socket close. Bump the fake delay by ~15ms or await a microtask flush before assertions. The rest of the suite is green—no server orchestration changes needed.",
      },
    ],
  },
};

/** Order for autoplay loop */
export const THREAD_ORDER: ThreadId[] = ["readme", "auth", "tests"];
