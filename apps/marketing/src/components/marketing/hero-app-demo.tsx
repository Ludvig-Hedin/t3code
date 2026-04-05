"use client";

import * as React from "react";

import {
  MarketingAppWindow,
  MarketingAssistantBubble,
  MarketingChatHeaderBar,
  MarketingHeroComposer,
  MarketingMessagesArea,
  MarketingSidebarBrand,
  MarketingSidebarNavRows,
  MarketingSidebarProjectsSection,
  MarketingSidebarThreadButton,
  MarketingSidebarThreadStatic,
  MarketingToolWorkRow,
  MarketingUserBubble,
  MarketingWorkLogCard,
  MarketingWorkingRow,
} from "@/components/marketing/marketing-app-preview";
import {
  PROJECT_FOLDER,
  SCENARIOS,
  THREAD_ORDER,
  THREADS,
  type DemoMsg,
  type ThreadId,
} from "@/components/marketing/hero-demo-scenarios";

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function preventHeroComposerSubmit(e: React.SubmitEvent<HTMLFormElement>) {
  e.preventDefault();
}

function renderMessage(m: DemoMsg, rowKey: string) {
  if (m.kind === "user") {
    return <MarketingUserBubble key={rowKey}>{m.text}</MarketingUserBubble>;
  }
  if (m.kind === "tool") {
    const variant = m.name === "run_terminal_cmd" ? "run" : "read";
    return (
      <MarketingWorkLogCard key={rowKey}>
        <MarketingToolWorkRow variant={variant} primary={m.name} secondary={m.detail} />
      </MarketingWorkLogCard>
    );
  }
  return <MarketingAssistantBubble key={rowKey}>{m.text}</MarketingAssistantBubble>;
}

export function HeroAppDemo() {
  const [activeId, setActiveId] = React.useState<ThreadId>("readme");
  const [demoExtra, setDemoExtra] = React.useState<DemoMsg[]>([]);
  const [showThinking, setShowThinking] = React.useState(false);
  const [streamText, setStreamText] = React.useState("");
  const [composerText, setComposerText] = React.useState("");
  const [isPlayingScenario, setIsPlayingScenario] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const runGeneration = React.useRef(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const activeThread = THREADS.find((t) => t.id === activeId) ?? THREADS[0];

  const scrollToBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  React.useEffect(() => {
    scrollToBottom();
  }, [activeId, demoExtra, showThinking, streamText, composerText, scrollToBottom]);

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const resetScenarioState = React.useCallback(() => {
    setDemoExtra([]);
    setShowThinking(false);
    setStreamText("");
    setComposerText("");
  }, []);

  const selectThread = (id: ThreadId) => {
    runGeneration.current += 1;
    setActiveId(id);
    resetScenarioState();
  };

  React.useEffect(() => {
    if (reducedMotion) {
      const id = THREAD_ORDER[0] ?? "readme";
      setActiveId(id);
      const sc = SCENARIOS[id];
      setDemoExtra([{ kind: "user", text: sc.composerPrompt }, ...sc.afterUser]);
      setComposerText("");
      setShowThinking(false);
      setStreamText("");
      return;
    }

    const cancelledRef = { current: false };
    const gen = ++runGeneration.current;

    async function runScenarioSteps(threadId: ThreadId) {
      const sc = SCENARIOS[threadId];
      const prompt = sc.composerPrompt;

      setActiveId(threadId);
      resetScenarioState();
      await sleep(450);
      if (runGeneration.current !== gen) return;

      for (let i = 0; i <= prompt.length; i += 1) {
        if (runGeneration.current !== gen) return;
        setComposerText(prompt.slice(0, i));
        const ch = prompt[i];
        await sleep(ch === " " ? 14 : ch === "\n" ? 28 : 10);
      }
      await sleep(220);
      if (runGeneration.current !== gen) return;

      setComposerText("");
      setDemoExtra([{ kind: "user", text: prompt }]);
      await sleep(380);
      if (runGeneration.current !== gen) return;

      setShowThinking(true);
      await sleep(1000);
      if (runGeneration.current !== gen) return;
      setShowThinking(false);

      for (const msg of sc.afterUser) {
        if (runGeneration.current !== gen) return;
        if (msg.kind === "tool") {
          setDemoExtra((prev) => [...prev, msg]);
          await sleep(520);
          continue;
        }
        if (msg.kind === "assistant") {
          const full = msg.text;
          for (let c = 0; c <= full.length; c += 1) {
            if (runGeneration.current !== gen) return;
            setStreamText(full.slice(0, c));
            await sleep(c < 24 ? 16 : 11);
          }
          if (runGeneration.current !== gen) return;
          setDemoExtra((prev) => [...prev, msg]);
          setStreamText("");
        }
      }
    }

    async function loop() {
      await sleep(900);
      while (runGeneration.current === gen) {
        if (cancelledRef.current) break;
        setIsPlayingScenario(true);
        for (const id of THREAD_ORDER) {
          if (cancelledRef.current || runGeneration.current !== gen) break;
          await runScenarioSteps(id);
          await sleep(3200);
        }
        setIsPlayingScenario(false);
        await sleep(2000);
      }
    }

    void loop();
    return () => {
      cancelledRef.current = true;
      runGeneration.current += 1;
    };
  }, [reducedMotion, resetScenarioState]);

  const seed = activeThread.seed;
  const messages: DemoMsg[] = [...seed, ...demoExtra];
  const streaming = streamText.length > 0;
  const isRunning = showThinking || streaming;

  const sidebar = (
    <>
      <MarketingSidebarBrand />
      <MarketingSidebarNavRows />
      <MarketingSidebarProjectsSection projectLabel={PROJECT_FOLDER}>
        <div className="space-y-px px-1 pb-1">
          {THREADS.map((t) =>
            isPlayingScenario ? (
              <MarketingSidebarThreadStatic key={t.id} title={t.title} active={t.id === activeId} />
            ) : (
              <MarketingSidebarThreadButton
                key={t.id}
                title={t.title}
                active={t.id === activeId}
                onClick={() => selectThread(t.id)}
              />
            ),
          )}
        </div>
      </MarketingSidebarProjectsSection>
    </>
  );

  return (
    <MarketingAppWindow sidebar={sidebar} className="h-full rounded-none border-0 shadow-none">
      <MarketingChatHeaderBar threadTitle={activeThread.title} projectName={PROJECT_FOLDER} />
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketingMessagesArea ref={scrollRef}>
          {messages.map((m, idx) => {
            const rowKey =
              m.kind === "tool"
                ? `${activeId}-tool:${m.name}:${m.detail}:${idx}`
                : `${activeId}-${m.kind}:${idx}:${m.kind === "user" || m.kind === "assistant" ? m.text.slice(0, 40) : ""}`;
            return renderMessage(m, rowKey);
          })}

          {showThinking ? <MarketingWorkingRow /> : null}

          {streaming ? (
            <MarketingAssistantBubble>
              {streamText}
              <span className="ml-0.5 inline-block h-3.5 w-px animate-pulse bg-foreground/35 align-middle" />
            </MarketingAssistantBubble>
          ) : null}
        </MarketingMessagesArea>

        <MarketingHeroComposer
          value={reducedMotion ? "" : composerText}
          placeholder="Ask anything, @tag files/folders, or use / to show available commands"
          readOnly
          isRunning={isRunning}
          isConnecting={false}
          hasSendableContent={composerText.trim().length > 0 && !isRunning}
          onSubmit={preventHeroComposerSubmit}
        />
        <p className="px-3 pb-2 text-center text-[10px] text-muted-foreground sm:px-5">
          Demo animation loops in the browser—no data is sent.
        </p>
      </div>
    </MarketingAppWindow>
  );
}
