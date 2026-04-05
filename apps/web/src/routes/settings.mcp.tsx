import { createFileRoute } from "@tanstack/react-router";

import { McpAndPluginsPanel } from "../components/settings/McpAndPluginsPanel";

export const Route = createFileRoute("/settings/mcp")({
  component: McpAndPluginsPanel,
});
