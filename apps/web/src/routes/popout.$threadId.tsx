/**
 * /popout/:threadId — renders a single chat thread in a sidebar-less popout window.
 *
 * On mount we write `sessionStorage["is-popout-window"] = "1"` so that any
 * subsequent in-tab navigation (e.g. "New Thread") also renders without the
 * sidebar, because `isPopoutWindow` in env.ts reads that flag at module-load
 * time for all future page visits within this browser tab.
 */
import { ThreadId } from "@t3tools/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import ChatView from "../components/ChatView";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";

function PopoutThreadRouteView() {
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });
  const navigate = useNavigate();
  const bootstrapComplete = useStore((store) => store.bootstrapComplete);
  const threadExists = useStore((store) => store.threads.some((t) => t.id === threadId));
  const draftThreadExists = useComposerDraftStore((store) =>
    Object.hasOwn(store.draftThreadsByThreadId, threadId),
  );
  const routeThreadExists = threadExists || draftThreadExists;

  // Persist the "popout" flag so subsequent navigations within this tab keep
  // rendering without the sidebar even when the URL is no longer /popout/…
  useEffect(() => {
    sessionStorage.setItem("is-popout-window", "1");
  }, []);

  // Redirect to the thread list if the thread no longer exists.
  useEffect(() => {
    if (!bootstrapComplete) return;
    if (!routeThreadExists) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, navigate, routeThreadExists]);

  if (!bootstrapComplete || !routeThreadExists) return null;

  return (
    <div className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <ChatView threadId={threadId} />
    </div>
  );
}

export const Route = createFileRoute("/popout/$threadId")({
  component: PopoutThreadRouteView,
});
