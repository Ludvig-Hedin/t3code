import { createFileRoute } from "@tanstack/react-router";

import { KeybindingsPanel } from "../components/settings/KeybindingsPanel";

export const Route = createFileRoute("/settings/keybindings")({
  component: KeybindingsPanel,
});
