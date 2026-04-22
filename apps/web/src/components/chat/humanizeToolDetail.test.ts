import { truncate } from "@t3tools/shared/String";
import { describe, expect, it } from "vitest";
import {
  formatSkillSlug,
  humanizeShellCommand,
  humanizeToolDetail,
  relativizePath,
  splitTopLevelShell,
} from "./humanizeToolDetail";

describe("relativizePath", () => {
  it("strips the workspace root prefix from absolute paths", () => {
    expect(relativizePath("/repo/project/src/app.ts", "/repo/project")).toBe("src/app.ts");
  });

  it("returns the original path when the cwd does not match", () => {
    expect(relativizePath("/tmp/app.ts", "/repo/project")).toBe("/tmp/app.ts");
  });

  it("returns the original path when cwd is undefined", () => {
    expect(relativizePath("/repo/project/src/app.ts", undefined)).toBe("/repo/project/src/app.ts");
  });

  it("returns '.' when the path matches the cwd exactly", () => {
    expect(relativizePath("/repo/project", "/repo/project")).toBe(".");
  });

  it("handles trailing slash on cwd", () => {
    expect(relativizePath("/repo/project/src/app.ts", "/repo/project/")).toBe("src/app.ts");
  });
});

describe("formatSkillSlug", () => {
  it("formats a namespaced skill slug with en-dash", () => {
    expect(formatSkillSlug("superpowers:systematic-debugging")).toBe(
      "Superpowers \u2013 Systematic Debugging",
    );
  });

  it("formats a multi-word namespaced skill slug", () => {
    expect(formatSkillSlug("code-review:code-review")).toBe("Code Review \u2013 Code Review");
  });

  it("formats a single-segment slug as plain title case", () => {
    expect(formatSkillSlug("commit")).toBe("Commit");
  });

  it("handles multi-word dashed slug", () => {
    expect(formatSkillSlug("writing-plans")).toBe("Writing Plans");
  });
});

describe("humanizeToolDetail", () => {
  const cwd = "/repo/project";

  it("humanizes Grep tool calls with a relative path", () => {
    expect(
      humanizeToolDetail(
        'Grep: {"pattern":"onProviderModelChange","path":"/repo/project/apps/web/src"}',
        cwd,
      ),
    ).toBe('Searched for "onProviderModelChange" in apps/web/src');
  });

  it("falls back to project files for Grep calls without a path", () => {
    expect(humanizeToolDetail('Grep: {"pattern":"foo"}', cwd)).toBe(
      'Searched for "foo" in project files',
    );
  });

  it("appends (listing matching files) hint for files_with_matches output mode", () => {
    expect(
      humanizeToolDetail('Grep: {"pattern":"foo","output_mode":"files_with_matches"}', cwd),
    ).toBe('Searched for "foo" in project files (listing matching files)');
  });

  it("humanizes Read tool calls with line ranges", () => {
    expect(
      humanizeToolDetail(
        'Read: {"file_path":"/repo/project/apps/web/src/components/ChatView.tsx","offset":10,"limit":5}',
        cwd,
      ),
    ).toBe("Read apps/web/src/components/ChatView.tsx (lines 11\u201315)");
  });

  it("humanizes Edit tool calls", () => {
    expect(humanizeToolDetail('Edit: {"file_path":"/repo/project/src/app.ts"}', cwd)).toBe(
      "Edited src/app.ts",
    );
  });

  it("humanizes Edit with replace_all flag", () => {
    expect(
      humanizeToolDetail('Edit: {"file_path":"/repo/project/src/app.ts","replace_all":true}', cwd),
    ).toBe("Edited src/app.ts (replace all)");
  });

  it("humanizes Write tool calls", () => {
    expect(humanizeToolDetail('Write: {"path":"/repo/project/src/app.ts"}', cwd)).toBe(
      "Wrote src/app.ts",
    );
  });

  it("humanizes Glob tool calls", () => {
    expect(
      humanizeToolDetail('Glob: {"pattern":"**/*.tsx","path":"/repo/project/apps/web"}', cwd),
    ).toBe('Found files matching "**/*.tsx" in apps/web');
  });

  it("humanizes Agent tool calls", () => {
    expect(
      humanizeToolDetail('Agent: {"description":"Investigate the stuck preview render"}', cwd),
    ).toBe("Delegated: Investigate the stuck preview render");
  });

  it("humanizes Agent with subagent_type and description", () => {
    expect(
      humanizeToolDetail(
        'Agent: {"description":"Explore code","subagent_type":"superpowers:code-reviewer"}',
        cwd,
      ),
    ).toBe("Delegated to Superpowers \u2013 Code Reviewer: Explore code");
  });

  it("humanizes WebFetch tool calls", () => {
    expect(humanizeToolDetail('WebFetch: {"url":"https://example.com/docs"}', cwd)).toBe(
      "Fetched https://example.com/docs",
    );
  });

  it("humanizes WebSearch tool calls", () => {
    expect(humanizeToolDetail('WebSearch: {"query":"vite react suspense patterns"}', cwd)).toBe(
      'Searched web for "vite react suspense patterns"',
    );
  });

  it("humanizes Bash tool calls with plain-text payloads", () => {
    expect(humanizeToolDetail("Bash: bun run lint", cwd)).toBe("Run bun run lint.");
  });

  it("humanizes Skill tool calls with namespace preserved", () => {
    expect(humanizeToolDetail('Skill: {"skill":"superpowers:systematic-debugging"}', cwd)).toBe(
      "Used skill: Superpowers \u2013 Systematic Debugging",
    );
  });

  it("humanizes Skill tool calls with a single-segment slug", () => {
    expect(humanizeToolDetail('Skill: {"skill":"commit"}', cwd)).toBe("Used skill: Commit");
  });

  it("humanizes Skill tool calls with args", () => {
    expect(humanizeToolDetail('Skill: {"skill":"commit","args":"-m fix"}', cwd)).toBe(
      "Used skill: Commit (-m fix)",
    );
  });

  it("humanizes TodoWrite tool calls with item count", () => {
    expect(
      humanizeToolDetail(
        'TodoWrite: {"todos":[{"content":"a","status":"pending","activeForm":"A"},{"content":"b","status":"pending","activeForm":"B"}]}',
        cwd,
      ),
    ).toBe("Updated todo list (2 items)");
  });

  it("preserves info for unknown tools by showing the first useful field", () => {
    // ExitPlanMode has no useful string fields in this example — falls back to tool name
    expect(humanizeToolDetail('ExitPlanMode: {"allowedPrompts":[]}', cwd)).toBe("ExitPlanMode");
  });

  it("shows the first descriptive field for unknown tools", () => {
    expect(humanizeToolDetail('MagicTool: {"name":"my-thing","extra":42}', cwd)).toBe(
      "MagicTool: my-thing",
    );
  });

  it("relativizes paths for unknown tools that include a file_path", () => {
    expect(humanizeToolDetail('MagicTool: {"file_path":"/repo/project/src/app.ts"}', cwd)).toBe(
      "MagicTool: src/app.ts",
    );
  });

  it("returns null for malformed input (no separator)", () => {
    expect(humanizeToolDetail("not a structured detail", cwd)).toBeNull();
  });

  it("returns null when a known JSON-based tool payload is malformed", () => {
    expect(humanizeToolDetail('Read: {"file_path"', cwd)).toBeNull();
  });

  it("truncates long values in summaries", () => {
    const longQuery = "x".repeat(120);
    expect(humanizeToolDetail(`WebSearch: {"query":"${longQuery}"}`, cwd)).toBe(
      `Searched web for "${truncate(longQuery, 80)}"`,
    );
  });
});

describe("humanizeShellCommand", () => {
  const cwd = "/Users/ludvighedin/Programming/personal/AB/coder-new/t3code";

  it("strips the shell wrapper and humanizes chained pwd + rg --files commands", () => {
    expect(
      humanizeShellCommand(
        `/bin/zsh -lc "pwd && rg --files -g 'PROJECT.md' -g 'AGENTS.md' -g 'package.json' -g 'src/**' -g 'app/**' -g 'components/**' -g 'pages/**' -g 'routes/**' -g 'ui/**' ."`,
        cwd,
      ),
    ).toBe("Print the current folder, then list key project files and source directories.");
  });

  it("humanizes sed file reads into line-range descriptions", () => {
    expect(
      humanizeShellCommand(
        `/bin/zsh -lc "sed -n '400,560p' apps/web/src/components/chat/MessagesTimeline.tsx"`,
        cwd,
      ),
    ).toBe("Print lines 400–560 of apps/web/src/components/chat/MessagesTimeline.tsx.");
  });

  it("humanizes cat into a show-file description", () => {
    expect(humanizeShellCommand(`/bin/zsh -lc 'cat package.json'`, cwd)).toBe("Show package.json.");
  });

  it("humanizes rg searches and compresses nested source paths", () => {
    expect(
      humanizeShellCommand(
        `/bin/zsh -lc "rg -n \\"ChatView|Message|Thread\\" apps/web/src/components apps/web/src/routes apps/web/src -g '!**/node_modules/**' | head -n 200"`,
        cwd,
      ),
    ).toBe(
      'Search in apps/web/src for "ChatView", "Message", or "Thread" (skip node_modules) (first 200 matches).',
    );
  });
});

describe("splitTopLevelShell", () => {
  it("splits on a single pipe but keeps logical OR (||) inside a segment", () => {
    expect(splitTopLevelShell("a|b", "|")).toEqual(["a", "b"]);
    expect(splitTopLevelShell("a||b", "|")).toEqual(["a||b"]);
    expect(splitTopLevelShell("rg foo || true | head -n 1", "|")).toEqual([
      "rg foo || true",
      "head -n 1",
    ]);
  });

  it("still splits chained && the same way", () => {
    expect(splitTopLevelShell("a&&b", "&&")).toEqual(["a", "b"]);
  });
});
