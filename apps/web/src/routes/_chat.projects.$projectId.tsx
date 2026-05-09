import { ProjectId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { AppLoadingScreen } from "../components/AppLoadingScreen";
import { ProjectOverviewPage } from "../components/ProjectOverviewPage";
import { useStore } from "../store";

function ProjectOverviewRouteView() {
  const projectId = Route.useParams({
    select: (params) => ProjectId.makeUnsafe(params.projectId),
  });
  const bootstrapComplete = useStore((s) => s.bootstrapComplete);
  // Match the thread route: render the loading screen until projects have
  // arrived from the websocket bootstrap. Without this, hard reloads of
  // /projects/X flash a "Project not found" splash for ~100-500ms before
  // the real page appears.
  if (!bootstrapComplete) {
    return <AppLoadingScreen />;
  }
  return <ProjectOverviewPage projectId={projectId} />;
}

export const Route = createFileRoute("/_chat/projects/$projectId")({
  component: ProjectOverviewRouteView,
});
