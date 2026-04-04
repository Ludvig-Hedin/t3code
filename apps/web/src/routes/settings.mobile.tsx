import { createFileRoute } from "@tanstack/react-router";

import { BirdCodeMobileCompanionPanel } from "../components/settings/MobileCompanionPanel";

export const Route = createFileRoute("/settings/mobile")({
  component: BirdCodeMobileCompanionPanel,
});
