import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkLogEntry } from "../../session-logic";
import { WorkEntryRow } from "./WorkEntryRow";

function makeEntry(overrides: Partial<WorkLogEntry>): WorkLogEntry {
  return {
    id: overrides.id ?? "entry-1",
    createdAt: overrides.createdAt ?? "2026-04-18T12:00:00.000Z",
    label: overrides.label ?? "File change",
    tone: overrides.tone ?? "tool",
    ...overrides,
  };
}

describe("WorkEntryRow", () => {
  const workspaceRoot = "/repo/project";

  it("shows the edited file path from structured file-change detail", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        entry={makeEntry({
          itemType: "file_change",
          label: "File change",
          detail:
            'Edit: {"file_path":"/repo/project/apps/web/src/components/ChatView.tsx","replace_all":true}',
          changedFiles: ["/repo/project/apps/web/src/components/ChatView.tsx"],
        })}
        workspaceRoot={workspaceRoot}
      />,
    );

    expect(markup).toContain("Edited apps/web/src/components/ChatView.tsx (replace all)");
    expect(markup).not.toContain("Wrote File change");
  });

  it("falls back to changed file metadata when the provider label is generic", () => {
    const markup = renderToStaticMarkup(
      <WorkEntryRow
        entry={makeEntry({
          itemType: "file_change",
          label: "File change",
          changedFiles: [
            "/repo/project/apps/server/src/provider/Layers/CodexAdapter.ts",
            "/repo/project/apps/web/src/components/chat/WorkEntryRow.tsx",
          ],
        })}
        workspaceRoot={workspaceRoot}
      />,
    );

    expect(markup).toContain("Edited apps/server/src/provider/Layers/CodexAdapter.ts");
    expect(markup).toContain("apps/web/src/components/chat/WorkEntryRow.tsx");
    expect(markup).not.toContain("Wrote File change");
  });
});
