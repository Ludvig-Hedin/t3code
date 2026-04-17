import { createFileRoute } from "@tanstack/react-router";

import { PromptImprovementSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/prompt-improvement")({
  component: PromptImprovementSettingsPanel,
});
