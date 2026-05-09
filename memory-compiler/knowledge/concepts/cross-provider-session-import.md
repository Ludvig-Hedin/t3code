---
title: "Cross-Provider Session Import from JSONL Files"
aliases: [session-import, jsonl-parsing, claude-code-import, codex-import]
tags: [data-import, file-parsing, integration, migration]
sources:
  - "daily/2026-04-23.md"
created: 2026-04-23
updated: 2026-04-23
---

# Cross-Provider Session Import from JSONL Files

Importing conversation threads from external AI coding assistants (Claude Code, Codex CLI) requires parsing `.jsonl` session files that use different directory structures, metadata formats, and boilerplate patterns. The scanner must handle nested date-based subdirectories (Codex), extract workspace associations from session metadata, derive meaningful titles from actual user messages (not filenames), and filter out common boilerplate patterns to avoid polluting titles.

## Key Points

- **Parse `.jsonl` format** — Claude Code and Codex both write `.jsonl` (not `.json`/`.md`); original scanner only matched wrong extensions
- **Handle nested directories** — Codex uses `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`; must recurse through date hierarchy
- **Extract real titles** — First non-boilerplate user message, not UUID filename; filter `<environment_context>`, `# AGENTS.md instructions`, `<local-command-*>`, etc.
- **Group by workspace** — Codex `session_meta.payload.cwd` maps threads to projects; Claude Code uses workspace metadata in history directory
- **Cap and sort** — Limit to 100 threads per project, sort newest-first to prioritize recent conversations

## Details

### JSONL File Format

Both providers write conversations as newline-delimited JSON:

**Claude Code format** (`~/.claude/projects/*/[uuid].jsonl`):

```jsonl
{"type":"message","role":"user","content":"How do I implement auth?"}
{"type":"message","role":"assistant","content":"Let me help..."}
{"type":"tool_call","tool":"Read","params":{"file":"auth.ts"}}
{"type":"tool_result","tool":"Read","content":"...file contents..."}
```

**Codex format** (`~/.codex/sessions/2026/04/23/rollout-[uuid].jsonl`):

```jsonl
{"type":"session_meta","payload":{"cwd":"/Users/x/project","model":"gpt-4"}}
{"type":"user","content":"Implement login"}
{"type":"assistant","content":"I'll create the login component"}
{"type":"tool","name":"write_file","args":{"path":"login.tsx"}}
```

### Original Bug

The scanner only matched `.json` and `.md` extensions:

**❌ Wrong:**

```typescript
const sessionFiles = await glob("**/*.{json,md}", {
  cwd: historyDir,
  absolute: true,
});
// Returns: [] — misses all .jsonl files!
```

**✅ Fixed:**

```typescript
const sessionFiles = await glob("**/*.jsonl", {
  cwd: historyDir,
  absolute: true,
});
// Returns: ["[uuid].jsonl", ...] — finds all sessions
```

### Nested Directory Traversal

Codex sessions live in `YYYY/MM/DD/` subdirectories:

**Implementation:**

```typescript
async function scanCodexSessions(codexDir: string): Promise<ImportedThread[]> {
  // Pattern: ~/.codex/sessions/YYYY/MM/DD/*.jsonl
  const sessionFiles = await glob("**/**/**/*.jsonl", {
    cwd: path.join(codexDir, "sessions"),
    absolute: true,
  });

  const threads: ImportedThread[] = [];

  for (const file of sessionFiles) {
    const session = await parseCodexSession(file);
    if (session) threads.push(session);
  }

  return threads;
}
```

The `**/**/**/*.jsonl` pattern matches three levels of nesting (`YYYY/MM/DD`) followed by any `.jsonl` file.

### Title Extraction

Thread titles should come from actual user messages, not filenames:

**Title extraction logic:**

```typescript
function extractThreadTitle(messages: Message[], file?: string): string {
  // Boilerplate patterns to skip
  const BOILERPLATE_PATTERNS = [
    /^<environment_context>/,
    /^# AGENTS\.md/,
    /^<local-command-/,
    /^<cwd>/,
    /^Session started/,
    /^Claude Code session/,
  ];

  for (const msg of messages) {
    if (msg.role !== "user") continue;

    const content = extractTextContent(msg.content);
    if (!content || content.length < 10) continue;

    // Skip boilerplate
    if (BOILERPLATE_PATTERNS.some((p) => p.test(content))) {
      continue;
    }

    // Found real user message — use first 80 chars
    return content.slice(0, 80);
  }

  if (file) return path.basename(file, ".jsonl");
  return "";
}

function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;

  // Handle structured content blocks
  for (const block of content) {
    if (block.type === "text") return block.text;
  }

  return "";
}
```

**Before (UUID filenames):**

```
Thread: "f8e4a2b1-3c9d-4e7f-a6b2-1d8c4e9f2a3b"
Thread: "9d2f1e4a-7c3b-4a8e-b1d5-6f9e2c3a7b8d"
```

**After (real messages):**

```
Thread: "How do I implement authentication with JWT?"
Thread: "Add dark mode toggle to the settings page"
```

### Workspace Association

Each session must be associated with its project:

**Claude Code** (workspace embedded in history directory name):

```typescript
// ~/.claude/projects/my-project-abc123/[uuid].jsonl
const workspaceName = path.basename(path.dirname(file));
// Returns: "my-project-abc123"

const projectCwd = resolveProjectCwd(workspaceName);
// Query ~/.claude/config for actual cwd
```

**Codex** (workspace in session metadata):

```typescript
function parseCodexSession(file: string): ImportedThread | null {
  const lines = fs.readFileSync(file, "utf-8").split("\n");

  let projectCwd: string | null = null;
  const messages: Message[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const entry = JSON.parse(line);

    if (entry.type === "session_meta") {
      // Extract workspace from metadata
      projectCwd = entry.payload.cwd;
    }

    if (entry.type === "user" || entry.type === "assistant") {
      messages.push({
        role: entry.type,
        content: entry.content,
      });
    }
  }

  if (!projectCwd || messages.length === 0) return null;

  return {
    title: extractThreadTitle(messages, file),
    projectCwd,
    messages,
    createdAt: fs.statSync(file).birthtime,
  };
}
```

### Grouping by Project

Threads are grouped by `cwd` before import:

```typescript
function groupThreadsByProject(threads: ImportedThread[]): Map<string, ImportedThread[]> {
  const grouped = new Map<string, ImportedThread[]>();

  for (const thread of threads) {
    const existing = grouped.get(thread.projectCwd) ?? [];
    grouped.set(thread.projectCwd, [...existing, thread]);
  }

  return grouped;
}
```

This allows the UI to show:

```
Project: /Users/x/my-app (18 threads)
Project: /Users/x/other-project (7 threads)
```

### Performance Optimization

**Head-read window** (8KB) instead of reading entire files:

```typescript
async function extractThreadTitleFromHead(file: string): Promise<string> {
  const fd = await fs.promises.open(file, "r");
  const buffer = Buffer.alloc(8192); // 8KB head
  await fd.read(buffer, 0, 8192, 0);
  await fd.close();

  const head = buffer.toString("utf-8");
  const lines = head.split("\n");

  // Parse first few messages only
  for (const line of lines.slice(0, 20)) {
    if (!line.trim()) continue;
    // ... extract title ...
  }
}
```

This avoids loading multi-MB session files entirely into memory just to extract the title.

**Cap at 100 threads per project:**

```typescript
function importThreads(projectCwd: string, threads: ImportedThread[]) {
  // Sort newest-first, take top 100
  const sorted = threads
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);

  for (const thread of sorted) {
    createThread({
      projectId: findProjectByCwd(projectCwd),
      title: thread.title,
      messages: thread.messages,
    });
  }
}
```

### Smoke Test Results

**Claude Code discovery:**

```
Found: 733 threads across 19 projects
Titles: Real user messages
Grouped by: Workspace name → cwd mapping
```

**Codex discovery:**

```
Found: 495 threads across 17 projects
Titles: Real user messages (no boilerplate)
Grouped by: session_meta.payload.cwd
```

**Total:** 1,228 threads imported from external providers without manual migration.

## Related Concepts

- [[concepts/flush-pipeline-failure-modes]] — Similar JSONL parsing for Claude Agent SDK transcript files
- [[concepts/lazy-file-tree-rpc-expansion]] — Similar file system scanning with RPC endpoints
- [[concepts/git-branch-resolution-fallbacks]] — Similar fallback chain pattern for handling variance across repos
- [[concepts/external-service-initialization-fallback]] — Similar multi-phase discovery with fallbacks
- [[concepts/systematic-feature-implementation-phases]] — Import follows contracts-first pattern (Phase 1: types, Phase 2: scanner, Phase 3: UI)

## Sources

- [[daily/2026-04-23]] — "Import UI was already wired in both onboarding (step 4) and settings — the actual bug was server-side. Scanner only matched `.json`/`.md` but Claude Code & Codex write `.jsonl`"
- [[daily/2026-04-23]] — "Codex nests sessions under `YYYY/MM/DD/` subdirectories (not flat). Thread titles were coming from UUID filenames instead of actual user messages"
- [[daily/2026-04-23]] — "Extract real titles from first non-boilerplate user message. Filter out common boilerplate patterns: `<environment_context>`, `# AGENTS.md instructions`, `<local-command-*>`, etc."
- [[daily/2026-04-23]] — "Group threads by actual workspace `cwd` from session metadata (not history dir name). Bumped head-read window to 8KB to handle long preambles. Cap at 100 threads per project, sort newest-first"
- [[daily/2026-04-23]] — "Smoke test showed: 733 Claude threads (19 projects) + 495 Codex threads (17 projects) discovered"
