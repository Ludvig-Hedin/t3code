/**
 * Static Bird Code UI snapshots for the “mixed teams” feature row.
 */
import {
  MarketingAssistantBubble,
  MarketingChatHeaderBar,
  MarketingComposerFrame,
  MarketingMessagesArea,
  MarketingToolWorkRow,
  MarketingUserBubble,
  MarketingWorkLogCard,
} from "@/components/marketing/marketing-app-preview";

const PROJECT = "bird-code";

export function FeaturePreviewPlan() {
  return (
    <div className="pointer-events-none flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background select-none">
      <MarketingChatHeaderBar threadTitle="Dark mode rollout" projectName={PROJECT} />
      <MarketingMessagesArea>
        <MarketingUserBubble>Propose steps before editing shared theme tokens.</MarketingUserBubble>
        <MarketingWorkLogCard>
          <MarketingToolWorkRow
            variant="read"
            primary="read_file"
            secondary="src/styles/tokens.css"
          />
        </MarketingWorkLogCard>
        <MarketingAssistantBubble>
          Plan: (1) audit consumers of `--surface`, (2) add dark variants, (3) snapshot key screens.
        </MarketingAssistantBubble>
      </MarketingMessagesArea>
      <MarketingComposerFrame placeholder="Reply or request changes…" />
    </div>
  );
}

export function FeaturePreviewTimeline() {
  return (
    <div className="pointer-events-none flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background select-none">
      <MarketingChatHeaderBar threadTitle="Design review" projectName={PROJECT} />
      <MarketingMessagesArea>
        <MarketingUserBubble>Is the agent stuck on the migration?</MarketingUserBubble>
        <MarketingWorkLogCard>
          <MarketingToolWorkRow
            variant="run"
            primary="run_terminal_cmd"
            secondary="npm run typecheck"
          />
        </MarketingWorkLogCard>
        <MarketingAssistantBubble>
          Typecheck passed; it is merging duplicate CSS modules next. You should see a work-log tick
          when done.
        </MarketingAssistantBubble>
      </MarketingMessagesArea>
    </div>
  );
}

export function FeaturePreviewTerminal() {
  return (
    <div className="pointer-events-none flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-background select-none">
      <MarketingChatHeaderBar threadTitle="Debug flaky test" projectName={PROJECT} />
      <div className="min-h-0 flex-1 border-y border-border/60 bg-muted/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        <p className="text-foreground/90">$ npm run test -- ws-reconnect</p>
        <p className="text-rose-300/90">AssertionError: expected …</p>
        <p className="opacity-80">at mockClose (ws-reconnect.test.ts:112)</p>
      </div>
      <MarketingComposerFrame placeholder="Paste the failing output…" />
    </div>
  );
}
