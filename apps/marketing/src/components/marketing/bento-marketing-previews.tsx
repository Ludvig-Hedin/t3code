/**
 * Static Bird Code UI snapshots for the marketing bento grid (non-interactive).
 */
import {
  MarketingAppWindow,
  MarketingAssistantBubble,
  MarketingChatHeaderBar,
  MarketingComposerFrame,
  MarketingMessagesArea,
  MarketingSidebarThreadStatic,
  MarketingToolWorkRow,
  MarketingUserBubble,
  MarketingWorkLogCard,
} from "@/components/marketing/marketing-app-preview";

const PROJECT = "bird-code";

export function IosCtaPreview() {
  return (
    <div className="pointer-events-none h-full w-full select-none overflow-hidden rounded-tl-lg border border-border bg-background">
      <MarketingChatHeaderBar threadTitle="Ship dark mode" projectName={PROJECT} />
      <MarketingMessagesArea>
        <MarketingUserBubble>Status on the theme toggle PR?</MarketingUserBubble>
        <MarketingAssistantBubble>
          Almost merged—one snapshot test to update. I can push the fix after lunch.
        </MarketingAssistantBubble>
      </MarketingMessagesArea>
    </div>
  );
}

export function BentoPreviewThreads() {
  return (
    <div className="pointer-events-none h-full min-h-[240px] select-none md:min-h-[260px]">
      <MarketingAppWindow
        sidebar={
          <>
            <MarketingSidebarThreadStatic title="Auth hardening" active={false} />
            <MarketingSidebarThreadStatic title="README polish" active />
            <MarketingSidebarThreadStatic title="Flaky tests" active={false} />
          </>
        }
      >
        <MarketingChatHeaderBar threadTitle="README polish" projectName={PROJECT} />
        <MarketingMessagesArea>
          <MarketingUserBubble>
            Add a short “Local dev” section with install and env steps.
          </MarketingUserBubble>
          <MarketingAssistantBubble>
            Here is a draft you can paste under ## Local dev—tight, copy-paste friendly, and matches
            your package scripts.
          </MarketingAssistantBubble>
        </MarketingMessagesArea>
      </MarketingAppWindow>
    </div>
  );
}

export function BentoPreviewWorkLog() {
  return (
    <div className="pointer-events-none flex h-full min-h-[240px] flex-col overflow-hidden md:min-h-[260px]">
      <MarketingChatHeaderBar threadTitle="Refactor API client" projectName={PROJECT} />
      <MarketingMessagesArea>
        <MarketingUserBubble>Trace where we call GET /v1/session.</MarketingUserBubble>
        <MarketingWorkLogCard>
          <MarketingToolWorkRow variant="read" primary="read_file" secondary="src/api/client.ts" />
          <MarketingToolWorkRow
            variant="read"
            primary="read_file"
            secondary="src/auth/session.ts"
          />
        </MarketingWorkLogCard>
        <MarketingAssistantBubble>
          Both call sites funnel through `fetchSession` in `client.ts`; cookies attach in the same
          helper.
        </MarketingAssistantBubble>
      </MarketingMessagesArea>
    </div>
  );
}

export function BentoPreviewTerminal() {
  return (
    <div className="pointer-events-none flex h-full min-h-[240px] flex-col overflow-hidden md:min-h-[260px]">
      <MarketingChatHeaderBar threadTitle="Fix failing tests" projectName={PROJECT} />
      <div className="min-h-0 flex-1 border-y border-border/60 bg-muted/20 px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
        <p className="text-foreground/90">$ npm run test -- --run</p>
        <p className="text-foreground/75">Tests: 42 passed, 42 total</p>
        <p className="opacity-70">Done in 3.2s.</p>
      </div>
      <MarketingComposerFrame placeholder="Paste stderr or ask a follow-up…" />
    </div>
  );
}

export function BentoPreviewSettings() {
  return (
    <div className="pointer-events-none flex h-full min-h-[240px] flex-col overflow-hidden md:min-h-[260px]">
      <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
        Session
      </div>
      <div className="flex flex-1 flex-col gap-0 divide-y divide-border/80 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-2 py-2">
          <span>Provider</span>
          <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-foreground">
            Codex
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span>Skills folder</span>
          <span className="max-w-[55%] truncate font-mono text-[10px] text-foreground/90">
            ~/.bird-code/skills
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <span>Mobile pairing</span>
          <span className="text-[11px] text-foreground/80">Off</span>
        </div>
      </div>
    </div>
  );
}
