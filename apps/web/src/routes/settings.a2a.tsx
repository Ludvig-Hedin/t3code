import { createFileRoute } from "@tanstack/react-router";

import { A2aAgentsPanel } from "../components/settings/A2aAgentsPanel";

export const Route = createFileRoute("/settings/a2a")({
  component: A2aAgentsPanel,
});
