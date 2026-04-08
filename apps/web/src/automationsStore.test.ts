import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeNextRun,
  useAutomationsStore,
  type AutomationRuntimeState,
} from "./automationsStore";

function resetStore() {
  useAutomationsStore.setState({ automations: [] });
}

describe("automationsStore run lifecycle", () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks an automation as running and restores the previous paused state", () => {
    const automation = useAutomationsStore.getState().createAutomation({
      name: "Daily standup",
      prompt: "Summarize the day",
      project: "Bird-Code",
      frequency: "daily",
      frequencyTime: "09:00",
      frequencyDays: [],
      model: "gpt-5.4",
      provider: "codex",
      reasoningLevel: "none",
    });

    useAutomationsStore.getState().toggleAutomationStatus(automation.id);

    const previousState = useAutomationsStore.getState().runAutomation(automation.id);
    const runningAutomation = useAutomationsStore.getState().automations[0];

    expect(previousState).toEqual({ status: "paused", nextRun: null });
    expect(runningAutomation).toMatchObject({
      status: "running",
      lastRan: "2026-04-08T10:00:00.000Z",
      nextRun: computeNextRun("daily", "09:00", [], new Date("2026-04-08T10:00:00.000Z")),
    });

    const restoredState: Partial<AutomationRuntimeState> = {};
    if (previousState) {
      restoredState.status = previousState.status;
      restoredState.nextRun = previousState.nextRun;
    }

    useAutomationsStore.getState().restoreAutomationRuntimeState(automation.id, restoredState);

    expect(useAutomationsStore.getState().automations[0]).toMatchObject({
      status: "paused",
      nextRun: null,
      lastRan: "2026-04-08T10:00:00.000Z",
    });
  });
});
