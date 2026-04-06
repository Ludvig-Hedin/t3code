import { createFileRoute } from "@tanstack/react-router";
import { GitSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/git")({
  component: GitSettingsPanel,
});
