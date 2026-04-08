import { Outlet, createFileRoute } from "@tanstack/react-router";

// GlobalShortcutsHandler (chat.new / chat.newLocal / Escape) was previously
// rendered here as ChatRouteGlobalShortcuts. It has been lifted to
// AppSidebarLayout so the shortcuts work from every page, not just chat routes.

function ChatRouteLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
