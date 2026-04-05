/**
 * SkillsManager — Main UI for browsing, adding, removing, and importing agent skills.
 *
 * Follows the Agent Skills standard (agentskills.io). Ported from the reference
 * SolidJS implementation in reference/coder to React, using t3code's UI components.
 */
import {
  ArrowRightIcon,
  BookTextIcon,
  BrainCircuitIcon,
  CheckCircleIcon,
  CodeIcon,
  FileTextIcon,
  GitBranchIcon,
  GitMergeIcon,
  Loader2Icon,
  PaletteIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TestTube2Icon,
  TrashIcon,
  WandSparklesIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Textarea } from "~/components/ui/textarea";
import { toastManager } from "~/components/ui/toast";
import { getWsRpcClient } from "~/wsRpcClient";

// --- Types ---

interface Skill {
  name: string;
  description: string;
  location: string;
  content: string;
  managed: boolean;
}

interface Template {
  name: string;
  title: string;
  category: string;
  icon: ReactNode;
  description: string;
  preview: string;
  content: string;
}

type DetailItem =
  | { type: "template"; item: Template; installed: boolean }
  | { type: "skill"; item: Skill; installed: boolean };

// --- Built-in templates ---
// These are starter skill templates users can add with one click.

const TEMPLATES: Template[] = [
  {
    name: "beautiful-design",
    title: "Beautiful design",
    category: "Design",
    icon: <PaletteIcon className="size-4" />,
    description: "Refine an existing UI into a tighter, calmer, product-ready visual design.",
    preview:
      "Restyles existing UI without changing layout or behavior, with tighter spacing, calmer surfaces, and stronger hierarchy.",
    content: [
      "## Role",
      "",
      "You are a front-end product designer and UI engineer. Your job is to take this existing UI and make it look more refined, minimal, and product-ready without changing the core layout or functionality.",
      "",
      "Design it as if it was featured in a UI design contest and won for excellent UX/UI, strong visual refinement, and delightful product feel.",
      "",
      "Use enough spacing, keep things tight and small.",
      "",
      "## Goals",
      "",
      "- Make the UI feel tighter, cleaner, and more mature.",
      "- Reduce the AI dashboard or chatbot vibe.",
      "- Improve spacing, hierarchy, and visual grouping.",
      "- Make typography feel intentional and compact.",
      "",
      "## Hard constraints",
      "",
      "- No purple background colors.",
      "- Use accent colors very sparingly, mainly for key actions or highlights.",
      "- Prefer neutral backgrounds with subtle contrast between sections.",
      "- Preserve all functional elements and states. Do not delete features; restyle them.",
      "",
      "## Design principles",
      "",
      "- Use a consistent spacing system such as a 4/8px scale for padding, gaps, and section rhythm.",
      "- Tighten text by reducing airy tracking and using slightly lower line-height for dense but readable UI copy.",
      "- Improve visual grouping with spacing, subtle dividers, and light surface shifts instead of heavy borders.",
      "- Avoid large empty areas unless they serve a clear purpose.",
      "- Tone down decoration. Avoid heavy glows, gradients, neon colors, glassmorphism, or generic AI visuals.",
      "- Prefer solid fills, subtle shadows if needed, and clean shapes.",
      "- Keep corner radii consistent across the app.",
      "",
      "## Implementation instructions",
      "",
      "- Refactor existing styles rather than rewriting the full UI from scratch.",
      "- Keep class names and component structure as stable as possible. Focus on tokens and style rules.",
      "- Introduce or refine design tokens if helpful for colors, spacing, radii, and typography.",
      "- For any new color, ensure sufficient contrast and keep the palette small and coherent.",
      "",
      "## Output requirement",
      "",
      "- Include a brief explanation of key visual changes made and why, focusing on spacing, typography, and grouping.",
    ].join("\n"),
  },
  {
    name: "ux-assessment",
    title: "UX assessment",
    category: "Research",
    icon: <SearchIcon className="size-4" />,
    description:
      "Review one app area for clarity, friction, hierarchy, discoverability, and ease of use.",
    preview:
      "Audits one product area for clarity, cognitive load, discoverability, friction, and practical UX improvements.",
    content: [
      "## Role",
      "",
      "You are a senior UX designer and product usability expert.",
      "",
      "## Task",
      "",
      "Perform a UX assessment of the following part of the app:",
      "",
      "{AREA OF THE APP}",
      "",
      "## Scope",
      "",
      "Focus on usability for typical users: clarity, intuitiveness, speed of understanding, and ease of use.",
      "",
      "Do not focus on screen reader accessibility, WCAG rules, or ARIA. Instead focus on:",
      "",
      "- clarity and intuitive design",
      "- cognitive load and friction",
      "- discoverability and user confidence",
      "- speed of understanding and interaction flow",
      "",
      "## Phase 1: Understand the area",
      "",
      "First inspect the relevant code. Determine the goal, main tasks, primary user flow, key UI components, and what information users must understand.",
      "",
      "## Phase 2: UX heuristic assessment",
      "",
      "Evaluate the area for clarity, cognitive load, information hierarchy, interaction friction, discoverability, feedback, consistency, and speed of understanding.",
      "",
      "## Phase 3: Gap analysis",
      "",
      "For each UX problem provide: Problem, Why it is confusing, How users might misunderstand it, Severity level.",
      "",
      "## Phase 4: UX improvement suggestions",
      "",
      "For each issue propose specific, implementable improvements.",
      "",
      "## Phase 5: Quick wins vs structural improvements",
      "",
      "Separate recommendations into Quick Wins (small changes, high impact) and Structural Improvements (larger redesigns).",
    ].join("\n"),
  },
  {
    name: "code-review",
    title: "Code review",
    category: "Engineering",
    icon: <CodeIcon className="size-4" />,
    description:
      "Review code from the current session for correctness, safety, maintainability, and gaps.",
    preview:
      "Runs a structured review for correctness, safety, maintainability, testing gaps, and approval readiness.",
    content: [
      "## Role",
      "",
      "Act as a senior software engineer and conscious reviewer.",
      "",
      "## Goal",
      "",
      "Review the code generated in the current session for correctness, safety, maintainability, and best practices.",
      "",
      "## Review steps",
      "",
      "1. Validate correctness and alignment with the original request.",
      "2. Check for safety issues such as insecure code, injection risks, secrets, or unsafe dependencies.",
      "3. Search for errors, edge cases, performance issues, and readability problems.",
      "4. Confirm reliability and note whether tests exist. If missing, suggest the smallest useful tests.",
      "5. Summarize findings and what was validated.",
      "6. State whether the code is safe to approve and why.",
      "",
      "## Restrictions",
      "",
      "- Read the changed code.",
      "- Do not hallucinate files or changes.",
      "- Do not skip the review step.",
      "- Do not recommend shipping if the review does not pass.",
      "",
      "## Output format",
      "",
      "- Section 1: Review Summary (correctness, safety, improvements, testing)",
      "- Section 2: Fixed Code (if changes were made)",
      "- Section 3: Approval status",
    ].join("\n"),
  },
  {
    name: "github-branch-versioning-analysis",
    title: "Git branch strategy",
    category: "Git",
    icon: <GitBranchIcon className="size-4" />,
    description:
      "Audit branch organization and versioning, then recommend a cleaner release and branching model.",
    preview:
      "Shows current git state first, then proposes branch naming, release tagging, changelog discipline, and workflow automation.",
    content: [
      "# GitHub Branch Organization & Versioning Analysis",
      "",
      "## Investigate current state",
      "",
      "- Check local git branches with `git branch -a`.",
      "- Review the GitHub repository branch structure if remote access is available.",
      "- Analyze existing commit history and naming patterns.",
      "- Document the current versioning approach, if any.",
      "",
      "## Implement organized branch strategy",
      "",
      "### Branch naming convention",
      "",
      "- `feature/YYYY-MM-DD-short-description`",
      "- `fix/YYYY-MM-DD-issue-description`",
      "- `release/v1.x.x` for stable versions",
      "",
      "### Release versioning",
      "",
      "- `v1.0.0`: MVP, `v1.1.0`: feature increments",
      "",
      "### Documentation strategy",
      "",
      "- Tag each working milestone with date and description.",
      "- Update `CHANGELOG.md` with version numbers.",
      "- Create GitHub releases for major features.",
      "",
      "## Tasks",
      "",
      "1. Audit the current git structure.",
      "2. Propose an organized branching model.",
      "3. Identify whether the current stable state is suitable for `v1.0.0`.",
      "4. Propose an automated versioning workflow.",
      "",
      "## Output requirements",
      "",
      "- Show the current state first.",
      "- Then recommend the improved organization.",
      "- Do not create branches, tags, or releases unless the user explicitly asks.",
    ].join("\n"),
  },
  {
    name: "write-tests",
    title: "Write tests",
    category: "Engineering",
    icon: <TestTube2Icon className="size-4" />,
    description:
      "Write comprehensive unit, integration, and edge case tests for the code in the current session.",
    preview:
      "Analyzes changed code, identifies untested paths, and writes meaningful tests covering happy paths and edge cases.",
    content: [
      "## Role",
      "",
      "You are a senior test engineer. Your job is to write comprehensive, meaningful tests for the code in the current session.",
      "",
      "## Approach",
      "",
      "1. Read all changed or newly added code carefully.",
      "2. Identify the public API surface: functions, classes, components, and routes.",
      "3. Map every code path, branch, and edge case that needs coverage.",
      "4. Write tests that are: fast, independent, deterministic, and readable.",
      "5. Prefer integration tests over mocks where the real behavior matters.",
      "",
      "## Test categories to cover",
      "",
      "- Happy path: expected inputs produce expected outputs.",
      "- Edge cases: empty inputs, boundary values, maximum values.",
      "- Error cases: invalid inputs, missing data, network failures.",
      "- State transitions: async behavior, loading states, error recovery.",
      "",
      "## Constraints",
      "",
      "- Use the test framework already configured in the project.",
      "- Do not modify production code.",
      "- Do not add unnecessary mocks — prefer real implementations.",
      "- Each test should have a clear name describing what it tests.",
      "",
      "## Output",
      "",
      "Write the test files with all tests. Summarize what was tested and what gaps remain.",
    ].join("\n"),
  },
  {
    name: "security-audit",
    title: "Security audit",
    category: "Engineering",
    icon: <ShieldCheckIcon className="size-4" />,
    description:
      "Audit the current code changes for security vulnerabilities, injection risks, and exposure.",
    preview:
      "Checks for injection risks, secrets, auth flaws, data exposure, and dependency vulnerabilities.",
    content: [
      "## Role",
      "",
      "You are a security engineer. Audit the current code changes for security issues.",
      "",
      "## What to check",
      "",
      "**Input validation**",
      "- SQL injection, XSS, command injection, path traversal.",
      "- Any user input that reaches a database, shell, or file system without sanitization.",
      "",
      "**Authentication & authorization**",
      "- Missing auth checks on API routes.",
      "- Privilege escalation risks.",
      "- Insecure session or token handling.",
      "",
      "**Data exposure**",
      "- Secrets or credentials committed to code.",
      "- Sensitive data in logs, error messages, or API responses.",
      "- PII exposure.",
      "",
      "**Dependencies**",
      "- Known CVEs in newly added packages.",
      "- Packages with unusual permissions or network access.",
      "",
      "**Rate limiting & abuse**",
      "- Endpoints vulnerable to brute force or enumeration.",
      "- Missing rate limiting on auth endpoints.",
      "",
      "## Output format",
      "",
      "For each finding: Severity (Critical/High/Medium/Low), Description, Affected file and line, Recommended fix.",
      "",
      "Conclude with: overall risk level and immediate action items.",
    ].join("\n"),
  },
  {
    name: "write-documentation",
    title: "Write documentation",
    category: "Documentation",
    icon: <BookTextIcon className="size-4" />,
    description:
      "Generate clear README, JSDoc comments, and API documentation for the current code changes.",
    preview:
      "Writes README sections, inline JSDoc comments, and usage examples for newly written or changed code.",
    content: [
      "## Role",
      "",
      "You are a technical writer. Generate documentation for the code changes in the current session.",
      "",
      "## What to document",
      "",
      "1. **README sections** — Usage, configuration, API reference for public-facing changes.",
      "2. **Inline comments** — JSDoc/TSDoc for all exported functions, classes, and types.",
      "3. **Usage examples** — Working code snippets showing common use cases.",
      "4. **Configuration** — Document all env vars, config options, and their defaults.",
      "",
      "## Documentation principles",
      "",
      "- Explain WHY, not just WHAT.",
      "- Include working examples, not pseudocode.",
      "- Document edge cases and gotchas.",
      "- Keep it concise — no padding.",
      "",
      "## Constraints",
      "",
      "- Match the documentation style already used in the project.",
      "- Do not document internal implementation details unless they affect callers.",
      "- Do not invent behavior — only document what the code actually does.",
      "",
      "## Output",
      "",
      "Write the documentation inline in the relevant files. Show a summary of what was documented.",
    ].join("\n"),
  },
  {
    name: "performance-review",
    title: "Performance review",
    category: "Engineering",
    icon: <ZapIcon className="size-4" />,
    description:
      "Identify N+1 queries, slow renders, memory leaks, and performance bottlenecks in the current code.",
    preview:
      "Analyzes code for database query patterns, React render costs, bundle size, and runtime performance issues.",
    content: [
      "## Role",
      "",
      "You are a performance engineer. Identify performance issues in the current code changes.",
      "",
      "## What to analyze",
      "",
      "**Database**",
      "- N+1 query patterns.",
      "- Missing indexes on frequently queried fields.",
      "- Unbounded queries (no pagination or limit).",
      "- Unnecessary data fetching (over-fetching columns or relations).",
      "",
      "**Frontend**",
      "- Unnecessary re-renders (missing memoization, unstable references).",
      "- Large bundle additions (check import cost).",
      "- Expensive computations in render functions.",
      "- Missing virtualization for large lists.",
      "",
      "**General**",
      "- Synchronous operations blocking the event loop.",
      "- Missing caching for expensive or repeated computations.",
      "- Memory leaks from event listeners or subscriptions not cleaned up.",
      "",
      "## Output format",
      "",
      "For each issue: Description, Estimated impact (High/Medium/Low), File and line, Recommended fix.",
      "",
      "Conclude with a prioritized action list.",
    ].join("\n"),
  },
  {
    name: "write-pr-description",
    title: "Write PR description",
    category: "Git",
    icon: <GitMergeIcon className="size-4" />,
    description:
      "Generate a clear, informative pull request description from the current git diff.",
    preview:
      "Reads the git diff and writes a PR title, summary, motivation, and testing checklist.",
    content: [
      "## Role",
      "",
      "You are a senior engineer. Write a clear, informative pull request description for the current changes.",
      "",
      "## Steps",
      "",
      "1. Run `git diff main...HEAD` (or the appropriate base branch) to see all changes.",
      "2. Run `git log main...HEAD --oneline` to see the commit history.",
      "3. Identify the purpose, scope, and impact of the changes.",
      "",
      "## PR description structure",
      "",
      "**Title**: Short (under 70 chars), imperative mood. E.g. 'Add user avatar upload'.",
      "",
      "**Summary**: 2-3 sentences describing what changed and why.",
      "",
      "**Changes**: Bulleted list of the key changes grouped by area.",
      "",
      "**Motivation**: Why this change is needed. What problem it solves.",
      "",
      "**Testing**: Checklist of how to verify the changes work.",
      "",
      "**Notes**: Any migration steps, breaking changes, or caveats.",
      "",
      "## Constraints",
      "",
      "- Be specific. Reference file names and function names.",
      "- Do not explain implementation details that are obvious from the code.",
      "- Flag breaking changes explicitly.",
    ].join("\n"),
  },
  {
    name: "write-release-notes",
    title: "Write release notes",
    category: "Documentation",
    icon: <FileTextIcon className="size-4" />,
    description:
      "Generate user-facing release notes from git history and changed files for the current version.",
    preview:
      "Reads git log and changed files, then writes clear release notes grouped by features, fixes, and breaking changes.",
    content: [
      "## Role",
      "",
      "You are a technical writer. Generate clear, user-facing release notes for the current version.",
      "",
      "## Steps",
      "",
      "1. Run `git log --oneline` to see recent commits.",
      "2. Check `CHANGELOG.md` if it exists for existing format to match.",
      "3. Identify the version number from `package.json` or `VERSION`.",
      "",
      "## Release notes structure",
      "",
      "**Version & date** at the top.",
      "",
      "**New features** — What users can now do that they couldn't before.",
      "",
      "**Improvements** — Existing functionality that got better.",
      "",
      "**Bug fixes** — Issues that were resolved.",
      "",
      "**Breaking changes** — Anything that requires user action to upgrade.",
      "",
      "## Tone and style",
      "",
      "- Write for end users, not engineers.",
      "- Focus on user benefit, not implementation detail.",
      "- Be specific: 'Search is now 3x faster' beats 'Improved search performance'.",
      "- Keep entries short (1-2 sentences each).",
      "",
      "## Output",
      "",
      "Write the release notes ready to paste into CHANGELOG.md or a GitHub release.",
    ].join("\n"),
  },
  {
    name: "debug-issue",
    title: "Debug issue",
    category: "Engineering",
    icon: <BrainCircuitIcon className="size-4" />,
    description:
      "Systematically investigate a bug with root cause analysis before proposing any fix.",
    preview:
      "Four-phase debugging: investigate, analyze, hypothesize, implement. No fixes without root cause.",
    content: [
      "## Role",
      "",
      "You are a systematic debugger. Follow the four-phase debugging protocol.",
      "",
      "## Iron law",
      "",
      "Do not propose or implement any fix until you have identified the root cause.",
      "",
      "## Phase 1: Investigate",
      "",
      "1. Read the error message or description carefully.",
      "2. Find the exact file, function, and line where the failure occurs.",
      "3. Read the surrounding code to understand the expected behavior.",
      "4. Check git log to see if this area was recently changed.",
      "",
      "## Phase 2: Analyze",
      "",
      "1. Trace the code path that leads to the error.",
      "2. Identify all variables, state, and external inputs involved.",
      "3. Map every branch that could produce the observed behavior.",
      "4. Note any assumptions in the code that might be invalid.",
      "",
      "## Phase 3: Hypothesize",
      "",
      "1. State your root cause hypothesis clearly: 'This fails because X when Y.'",
      "2. Identify what evidence would confirm or refute the hypothesis.",
      "3. Check that evidence. Update hypothesis if needed.",
      "",
      "## Phase 4: Implement",
      "",
      "1. Fix only what the root cause requires.",
      "2. Do not over-engineer or refactor unrelated code.",
      "3. Add a test that would have caught this bug.",
      "4. Verify the fix resolves the original issue.",
    ].join("\n"),
  },
];

// --- SKILL.md parser/serializer ---

/** Parse a SKILL.md string (with YAML frontmatter) into structured fields. */
function parseSkillMd(input: string): { name: string; description: string; content: string } {
  const text = input.trim();
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Expected pasted SKILL.md content with YAML frontmatter.");

  const data = match[1] ?? "";
  const body = match[2]?.trim() ?? "";
  const name = data.match(/(?:^|\n)name:\s*(.+)\s*$/m)?.[1]?.trim();
  const description = data.match(/(?:^|\n)description:\s*(.+)\s*$/m)?.[1]?.trim();

  if (!name || !description) throw new Error("Frontmatter must include both name and description.");

  return {
    name: name.replace(/^['"]|['"]$/g, ""),
    description: description.replace(/^['"]|['"]$/g, ""),
    content: body,
  };
}

/** Serialize a skill back to SKILL.md format for the importer textarea. */
function formatSkillMd(input: { name: string; description: string; content: string }): string {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "---",
    "",
    input.content.trim(),
    "",
  ].join("\n");
}

/** Truncate text for card previews. */
function brief(text: string, max: number): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
}

// --- Sub-components ---

function SkillCard({
  title,
  category,
  icon,
  description,
  preview,
  installed,
  saving,
  removing,
  onOpen,
  onAdd,
  onRemove,
}: {
  title: string;
  category: string;
  icon: ReactNode;
  description: string;
  preview: string;
  installed: boolean;
  saving: boolean;
  removing: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50">
      {/* Clickable card body — opens the detail dialog */}
      <button type="button" className="flex flex-1 flex-col text-left" onClick={onOpen}>
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
              {category}
            </div>
            <div className="truncate text-sm font-medium text-foreground">{title}</div>
          </div>
        </div>
        <p className="line-clamp-2 pt-3 text-[13px] text-muted-foreground">
          {brief(description, 78)}
        </p>
        <p className="line-clamp-2 break-all pt-2 text-xs text-muted-foreground/60">
          {brief(preview, 92)}
        </p>
      </button>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-4">
        {installed ? (
          <Button size="xs" variant="outline" onClick={onRemove} disabled={removing}>
            {removing ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <TrashIcon className="size-3.5" />
            )}
            Remove
          </Button>
        ) : (
          <Button size="xs" variant="outline" onClick={onAdd} disabled={saving}>
            {saving ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
            Add
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={onOpen}>
          Read more
          <ArrowRightIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SkillDetailDialog({
  detail,
  open,
  onOpenChange,
  onAdd,
  onRemove,
  onEdit,
  saving,
  removing,
}: {
  detail: DetailItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: () => void;
  onRemove: () => void;
  onEdit: () => void;
  saving: boolean;
  removing: boolean;
}) {
  if (!detail) return null;

  const item = detail.item;
  const kind =
    detail.type === "template"
      ? "Built-in template"
      : detail.installed
        ? "Installed skill"
        : "Available skill";
  const source =
    detail.type === "template"
      ? "Template"
      : detail.installed
        ? "Managed copy"
        : "Read-only source";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-3xl" showCloseButton>
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground/60">
                {kind}
              </div>
              <DialogTitle className="pt-1">{item.name}</DialogTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                {source}
              </span>
              {detail.installed && (
                <span className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  Installed
                </span>
              )}
            </div>
          </div>
          <p className="max-w-[680px] text-[13px] leading-5 text-muted-foreground">
            {item.description}
          </p>
        </DialogHeader>

        <DialogPanel>
          {/* Skill content preview */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div className="pb-2 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/60">
              Skill content
            </div>
            <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-[13px] leading-6 text-foreground">
              {item.content}
            </pre>
          </div>

          {/* Source path for discovered skills */}
          {detail.type === "skill" && (
            <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="pb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground/60">
                Source path
              </div>
              <div className="break-all text-xs leading-5 text-muted-foreground">
                {(item as Skill).location}
              </div>
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {detail.installed ? (
            <Button size="sm" variant="ghost" onClick={onRemove} disabled={removing}>
              {removing ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <TrashIcon className="size-3.5" />
              )}
              Remove skill
            </Button>
          ) : (
            <Button size="sm" onClick={onAdd} disabled={saving}>
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlusIcon className="size-3.5" />
              )}
              Add skill
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}>
            {detail.installed ? "Edit in importer" : "Copy to importer"}
          </Button>
          <DialogClose render={<Button size="sm" variant="ghost" />}>Close</DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// --- Main component ---

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [raw, setRaw] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<DetailItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // AI creator state
  const [promptText, setPromptText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [lastGeneratedMethod, setLastGeneratedMethod] = useState<"ai" | "template" | null>(null);

  // Ref for scrolling to the importer after generation
  const importerRef = useRef<HTMLDivElement>(null);

  // Fetch all skills from the server
  const fetchSkills = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getWsRpcClient().skills.list();
      setSkills([...result].toSorted((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to load skills",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  // Derive installed (managed) skills
  const installedSkills = skills.filter((s) => s.managed);
  const installedNames = new Set(installedSkills.map((s) => s.name));

  // Build the "All skills" list: templates + discovered skills (not managed)
  type Entry =
    | { type: "template"; item: Template; installed: boolean }
    | { type: "skill"; item: Skill; installed: boolean };

  const allEntries: Entry[] = [];

  // Add templates that aren't already installed
  for (const template of TEMPLATES) {
    if (!installedNames.has(template.name)) {
      allEntries.push({ type: "template", item: template, installed: false });
    }
  }

  // Add discovered skills that aren't managed (project-level, global, plugins, etc.)
  for (const skill of skills) {
    if (!skill.managed) {
      allEntries.push({ type: "skill", item: skill, installed: false });
    }
  }

  // Filter entries by search query
  const filteredEntries = searchQuery.trim()
    ? allEntries.filter((entry) => {
        const q = searchQuery.toLowerCase();
        const name = entry.type === "template" ? entry.item.title : entry.item.name;
        return (
          name.toLowerCase().includes(q) ||
          entry.item.description.toLowerCase().includes(q) ||
          (entry.type === "template" && entry.item.category.toLowerCase().includes(q))
        );
      })
    : allEntries;

  // --- Actions ---

  const saveSkill = async (
    input: { name: string; description: string; content: string },
    toastMessage: string,
  ) => {
    setSaving(input.name);
    try {
      await getWsRpcClient().skills.save({
        name: input.name.trim(),
        description: input.description.trim(),
        content: input.content,
      });
      toastManager.add({
        type: "success",
        title: "Skill saved",
        description: toastMessage,
      });
      await fetchSkills();
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to save skill",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(null);
    }
  };

  const removeSkill = async (name: string) => {
    setRemoving(name);
    try {
      await getWsRpcClient().skills.delete({ name });
      toastManager.add({
        type: "success",
        title: "Skill removed",
        description: "The managed copy was removed.",
      });
      await fetchSkills();
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to remove skill",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRemoving(null);
    }
  };

  const addTemplate = (template: Template) =>
    saveSkill(
      { name: template.name, description: template.description, content: template.content },
      "The template was added as a managed skill.",
    );

  const addSkill = (skill: Skill) =>
    saveSkill(
      { name: skill.name, description: skill.description, content: skill.content },
      "The skill was added to your managed library.",
    );

  const importSkill = async () => {
    try {
      const parsed = parseSkillMd(raw);
      await saveSkill(parsed, "The imported skill was added to your managed library.");
      setRaw("");
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const generateSkill = async () => {
    if (!promptText.trim()) return;
    setGenerating(true);
    setLastGeneratedMethod(null);
    try {
      const result = await getWsRpcClient().skills.generate({ description: promptText.trim() });
      // Load generated content into the importer textarea
      setRaw(result.content);
      setLastGeneratedMethod(result.method);
      // Scroll the importer section into view
      importerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      toastManager.add({
        type: "success",
        title: result.method === "ai" ? "AI-generated skill ready" : "Skill template ready",
        description: "Review and edit in the importer below, then click Import skill.",
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Generation failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = (detail: DetailItem) => {
    setSelectedDetail(detail);
    setDetailOpen(true);
  };

  const handleDetailAdd = async () => {
    if (!selectedDetail) return;
    if (selectedDetail.type === "template") {
      await addTemplate(selectedDetail.item);
    } else {
      await addSkill(selectedDetail.item);
    }
    setDetailOpen(false);
  };

  const handleDetailRemove = async () => {
    if (!selectedDetail) return;
    await removeSkill(selectedDetail.item.name);
    setDetailOpen(false);
  };

  const handleDetailEdit = () => {
    if (!selectedDetail) return;
    setRaw(formatSkillMd(selectedDetail.item));
    setDetailOpen(false);
    // Scroll to the importer so the user can see the loaded content
    importerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 pb-10 sm:px-10 sm:pb-10">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background from-[calc(100%-24px)] to-transparent">
        <div className="flex flex-col gap-2 pb-8 pt-6">
          <h2 className="text-base font-medium text-foreground">Skills</h2>
          <p className="text-[13px] text-muted-foreground">
            Browse every available skill, inspect details before adding them, and manage your
            installed copies.
          </p>
        </div>
      </div>

      <div className="flex max-w-[960px] flex-col gap-8">
        {/* Installed skills section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Installed skills</h3>
              <p className="pt-1 text-xs text-muted-foreground">
                Managed skills currently added to your library.
              </p>
            </div>
            <div className="text-xs font-medium text-muted-foreground/60">
              {installedSkills.length} installed
            </div>
          </div>

          {installedSkills.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {installedSkills.map((skill) => (
                <SkillCard
                  key={skill.name}
                  title={skill.name}
                  category="Installed"
                  icon={<CheckCircleIcon className="size-4" />}
                  description={skill.description}
                  preview={skill.location}
                  installed
                  saving={saving === skill.name}
                  removing={removing === skill.name}
                  onOpen={() => openDetail({ type: "skill", item: skill, installed: true })}
                  onAdd={() => void addSkill(skill)}
                  onRemove={() => void removeSkill(skill.name)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
              {loading ? "Loading skills..." : "No skills added yet."}
            </div>
          )}
        </section>

        {/* All skills section (templates + discovered) */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">All skills</h3>
              <p className="pt-1 text-xs text-muted-foreground">
                Built-in templates and discovered skills from every configured source.
              </p>
            </div>
            <div className="text-xs font-medium text-muted-foreground/60">
              {allEntries.length} available
            </div>
          </div>

          {/* Search filter — shown when there are enough skills to warrant it */}
          {allEntries.length > 6 && (
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                placeholder="Filter skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-border bg-transparent py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring sm:w-64"
              />
            </div>
          )}

          {filteredEntries.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredEntries.map((entry) => (
                <SkillCard
                  key={entry.item.name}
                  title={entry.type === "template" ? entry.item.title : (entry.item as Skill).name}
                  category={entry.type === "template" ? entry.item.category : "Available"}
                  icon={
                    entry.type === "template" ? (
                      entry.item.icon
                    ) : (
                      <SparklesIcon className="size-4" />
                    )
                  }
                  description={entry.item.description}
                  preview={
                    entry.type === "template" ? entry.item.preview : (entry.item as Skill).location
                  }
                  installed={false}
                  saving={saving === entry.item.name}
                  removing={removing === entry.item.name}
                  onOpen={() => openDetail(entry)}
                  onAdd={() =>
                    void (entry.type === "template"
                      ? addTemplate(entry.item)
                      : addSkill(entry.item as Skill))
                  }
                  onRemove={() => void removeSkill(entry.item.name)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
              {loading
                ? "Loading..."
                : searchQuery.trim()
                  ? `No skills match "${searchQuery}".`
                  : "No additional skills found."}
            </div>
          )}
        </section>

        {/* Skill importer section */}
        <section ref={importerRef} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Skill importer</h3>
            {lastGeneratedMethod && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  lastGeneratedMethod === "ai"
                    ? "bg-violet-500/15 text-violet-400"
                    : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {lastGeneratedMethod === "ai" ? "AI-generated" : "Template"}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="skill-importer" className="text-xs font-medium text-foreground">
                  Paste or edit SKILL.md
                </label>
                <Textarea
                  id="skill-importer"
                  className="min-h-40 font-mono text-xs"
                  placeholder={`---\nname: my-skill\ndescription: What this skill does.\n---\n\nInstructions here...`}
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
                <p className="text-xs text-muted-foreground/60">
                  Paste a complete SKILL.md file with YAML frontmatter to import it as a managed
                  skill. Use the AI creator below to generate one.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button size="xs" onClick={() => void importSkill()} disabled={!raw.trim()}>
                  Import skill
                </Button>
                <Button size="xs" variant="outline" onClick={() => void fetchSkills()}>
                  Reload list
                </Button>
                {raw.trim() && (
                  <Button size="xs" variant="ghost" onClick={() => setRaw("")}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* AI Skill Creator section */}
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <WandSparklesIcon className="size-4 text-muted-foreground" />
              AI skill creator
            </h3>
            <p className="pt-1 text-xs text-muted-foreground">
              Describe what you want the skill to do in plain language. A SKILL.md will be generated
              and loaded into the importer above for you to review and save. Set{" "}
              <code className="text-[11px]">ANTHROPIC_API_KEY</code> for real AI generation —
              otherwise a well-structured template is used.
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="skill-creator-prompt"
                  className="text-xs font-medium text-foreground"
                >
                  Describe your skill
                </label>
                <Textarea
                  id="skill-creator-prompt"
                  className="min-h-24 text-sm"
                  placeholder="e.g. A skill that analyzes my git diff and writes a detailed pull request description with motivation, changes, and a testing checklist."
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={(e) => {
                    // Cmd/Ctrl+Enter to generate
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void generateSkill();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground/60">
                  Be specific about what the skill should do, when it should run, and what output
                  you expect. Press{" "}
                  <kbd className="rounded border border-border px-1 text-[10px]">⌘↵</kbd> to
                  generate.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  size="xs"
                  onClick={() => void generateSkill()}
                  disabled={!promptText.trim() || generating}
                >
                  {generating ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : (
                    <WandSparklesIcon className="size-3.5" />
                  )}
                  {generating ? "Generating..." : "Generate skill"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Skill detail dialog */}
      <SkillDetailDialog
        detail={selectedDetail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onAdd={() => void handleDetailAdd()}
        onRemove={() => void handleDetailRemove()}
        onEdit={handleDetailEdit}
        saving={saving === selectedDetail?.item.name}
        removing={removing === selectedDetail?.item.name}
      />
    </div>
  );
}
