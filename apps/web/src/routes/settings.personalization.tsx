import { createFileRoute } from "@tanstack/react-router";
import { PersonalizationSettingsPanel } from "../components/settings/SettingsPanels";

export const Route = createFileRoute("/settings/personalization")({
  component: PersonalizationSettingsPanel,
});
