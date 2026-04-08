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
  ClipboardListIcon,
  CodeIcon,
  FileTextIcon,
  GitBranchIcon,
  GitMergeIcon,
  GlobeIcon,
  LayersIcon,
  Loader2Icon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  NetworkIcon,
  PaletteIcon,
  PlusIcon,
  RocketIcon,
  ScaleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TestTube2Icon,
  TrashIcon,
  TrendingUpIcon,
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

  // ---- From obra/superpowers (https://github.com/obra/superpowers) ----

  {
    name: "tdd",
    title: "Test-driven development",
    category: "Engineering",
    icon: <TestTube2Icon className="size-4" />,
    description:
      "Write the failing test first, then minimal code to pass it. Strict Red-Green-Refactor cycle.",
    preview:
      "No production code without a prior failing test. Covers the full RED-GREEN-REFACTOR cycle with anti-patterns.",
    content: [
      "## The Iron Law",
      "",
      "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.",
      "",
      "Write code before the test? Delete it. Start over. No exceptions.",
      "",
      "## Red-Green-Refactor",
      "",
      "**RED — Write a failing test**",
      "- One behavior per test",
      "- Clear descriptive name (no 'and' — split if needed)",
      "- Use real code (avoid mocks unless unavoidable)",
      "- Run it — confirm it fails for the expected reason (feature missing, not a typo)",
      "",
      "**GREEN — Write minimal code to pass**",
      "- Write the simplest code that makes the test green",
      "- Do not add extra features or refactor unrelated code",
      "- Run it — confirm all tests pass with clean output",
      "",
      "**REFACTOR — Clean up**",
      "- Only after green",
      "- Remove duplication, improve names, extract helpers",
      "- All tests must remain green after each change",
      "",
      "## Common Rationalizations — All Are Wrong",
      "",
      "- 'Too simple to test' — Simple code breaks. Test takes 30 seconds.",
      "- 'I'll test after' — Tests passing immediately prove nothing.",
      "- 'I already manually tested it' — Ad-hoc is not systematic. No record, can't re-run.",
      "- 'Just this once' — That's how untested code accumulates.",
      "- 'Keep as reference while writing tests' — You'll adapt it. That's testing-after. Delete means delete.",
      "",
      "## Checklist Before Marking Done",
      "",
      "- [ ] Every new function/method has a test that failed first",
      "- [ ] Each test failed for the expected reason (feature missing, not a syntax error)",
      "- [ ] Minimal code written to pass each test",
      "- [ ] All tests pass with clean output",
      "- [ ] Edge cases and error paths are covered",
    ].join("\n"),
  },
  {
    name: "verify-before-done",
    title: "Verify before done",
    category: "Engineering",
    icon: <CheckCircleIcon className="size-4" />,
    description:
      "Run verification commands and confirm their output before claiming work is complete.",
    preview:
      "Evidence before assertions: run tests/lint/build fresh, read the full output, then report status.",
    content: [
      "## Core Mandate",
      "",
      "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.",
      "",
      "Claiming work is complete without running verification is dishonesty, not efficiency.",
      "",
      "## Five Steps — Always Follow Before Any Status Claim",
      "",
      "1. **Identify** the verification command (tests, lint, build, type-check)",
      "2. **Run** it completely and freshly — no cached output",
      "3. **Read** the full output and exit code",
      "4. **Verify** the output actually confirms the claim",
      "5. **Only then** report status — cite the evidence",
      "",
      "## What Counts As Verification",
      "",
      "- Tests: Run the test suite, confirm it passes",
      "- Lint: Run the linter, confirm no errors",
      "- Build: Run the build, confirm it compiles",
      "- Type-check: Run type-check, confirm no type errors",
      "- UI: Open the browser and confirm the feature works end-to-end",
      "",
      "## Red Flags",
      "",
      "- Using 'should', 'probably', 'seems to' — these signal missing verification",
      "- Saying 'Done!' or 'Great!' before running anything",
      "- Reporting results from a previous run, not a fresh one",
      "- Running only the happy-path test, not the full suite",
      "- Assuming a passing CI from a previous commit counts",
    ].join("\n"),
  },
  {
    name: "implementation-plan",
    title: "Write implementation plan",
    category: "Engineering",
    icon: <ClipboardListIcon className="size-4" />,
    description: "Create a detailed step-by-step implementation plan before writing any code.",
    preview:
      "Breaks work into self-contained TDD tasks with exact file paths, real code, and verification commands.",
    content: [
      "## Purpose",
      "",
      "Generate a detailed implementation plan before touching code. Every task must be self-contained and executable by someone unfamiliar with the codebase.",
      "",
      "## Plan Structure",
      "",
      "### Header",
      "- Goal: one sentence",
      "- Architecture overview (what gets built, how it fits together)",
      "- Tech stack and key files affected",
      "",
      "### File Map",
      "List every file to be created or modified before writing tasks.",
      "",
      "### Tasks",
      "Each task must include:",
      "- Title (imperative, one action)",
      "- Files to create/modify (exact paths, not 'something in src/')",
      "- What to write (real code, not pseudocode or 'add validation')",
      "- Verification command with expected output",
      "- Commit message",
      "",
      "## Task Granularity",
      "",
      "One task = one action:",
      "- Write failing test → verify RED → implement → verify GREEN → commit",
      "",
      "## Rules",
      "",
      "- No placeholders. 'TBD', 'add validation', 'implement later' are plan failures.",
      "- Include actual code, not descriptions of code.",
      "- Every task ends with a passing test and a commit.",
      "- Check existing files before inventing new patterns — use codebase conventions.",
      "- Save the plan to: docs/plans/YYYY-MM-DD-<feature>.md",
    ].join("\n"),
  },
  {
    name: "request-code-review",
    title: "Request code review",
    category: "Engineering",
    icon: <CodeIcon className="size-4" />,
    description:
      "Prepare and dispatch a structured code review after completing a feature or task.",
    preview:
      "Gets the commit SHA range, provides focused context to the reviewer, and acts on findings by severity.",
    content: [
      "## When to Request",
      "",
      "- After completing a major feature or task",
      "- Before merging to main",
      "- When stuck and needing a fresh perspective",
      "- After fixing a complex bug",
      "",
      "## How to Request",
      "",
      "1. **Get the commit range:**",
      "   ```bash",
      "   BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main",
      "   HEAD_SHA=$(git rev-parse HEAD)",
      "   ```",
      "",
      "2. **Provide the reviewer with:**",
      "   - What was implemented (specific, not vague)",
      "   - Requirements or plan reference",
      "   - BASE_SHA and HEAD_SHA to scope the diff",
      "   - Known trade-offs or concerns",
      "",
      "3. **Act on feedback:**",
      "   - Critical: fix immediately",
      "   - Important: fix before proceeding",
      "   - Minor: log for later",
      "   - Incorrect feedback: push back with clear technical reasoning",
      "",
      "## Focus the Review",
      "",
      "Give the reviewer a specific scope:",
      "- 'Check the error handling in getUserById'",
      "- 'Verify the migration is reversible'",
      "- 'Confirm the caching strategy is correct'",
      "",
      "Focused reviews catch more real issues than broad ones.",
      "",
      "## Never",
      "",
      "- Skip review because 'it's a small change'",
      "- Ignore Critical findings",
      "- Proceed with unresolved Important issues",
      "- Dismiss reviewer feedback without investigation",
    ].join("\n"),
  },

  // ---- From nextlevelbuilder/ui-ux-pro-max-skill (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) ----

  {
    name: "ui-ux-pro-max",
    title: "UI/UX Pro Max",
    category: "Design",
    icon: <WandSparklesIcon className="size-4" />,
    description:
      "Comprehensive UI/UX design intelligence: 67 styles, 161 industry rules, 57 font pairings, 161 color palettes.",
    preview:
      "Design system generator with industry-specific guidance, accessibility rules, and multi-stack implementation.",
    content: [
      "## Role",
      "",
      "You are a professional UI/UX engineer and designer with deep expertise in building polished, production-ready interfaces across all major platforms and frameworks.",
      "",
      "## Design System Analysis — Run First",
      "",
      "When starting any design task, first analyze:",
      "",
      "1. **Product type** — SaaS, e-commerce, health, finance, creative, etc.",
      "2. **UI style** — Minimalism, Glassmorphism, Neumorphism, Brutalism, Claymorphism, etc.",
      "3. **Color palette** — Industry-aligned primary, secondary, and neutral palette",
      "4. **Typography** — Font pairing and type scale appropriate for the domain",
      "5. **Spacing system** — Consistent 4px or 8px base grid",
      "",
      "## Design Priorities (in order)",
      "",
      "1. **Accessibility** (CRITICAL) — 4.5:1 contrast ratio minimum, keyboard navigation, descriptive labels",
      "2. **Touch & Interaction** (CRITICAL) — 44×44pt minimum touch targets, 8px+ spacing between targets",
      "3. **Performance** (HIGH) — WebP/AVIF images, lazy loading, CLS < 0.1",
      "4. **Visual hierarchy** — Clear reading order, intentional emphasis, whitespace as a tool",
      "5. **Consistency** — Design tokens over hardcoded values, same patterns for same behaviors",
      "",
      "## Industry-Specific Guidance",
      "",
      "- **Tech/SaaS**: Clean and functional. Neutral palette + one accent. Data-dense but scannable.",
      "- **Finance**: Trust-first. Dark navy/gray, minimal decoration, strong typographic hierarchy.",
      "- **Health**: Calm and clear. Avoid red except for alerts. High contrast text, approachable tone.",
      "- **E-commerce**: Conversion-focused. High-quality imagery, clear CTAs, fast perceived load.",
      "- **Creative/Agency**: Bold personality. Strong typography, distinctive color, intentional space.",
      "- **Emerging tech (AI/Crypto)**: Forward-looking. Dark themes, subtle gradients, precise grids.",
      "",
      "## Before Delivering Any UI",
      "",
      "- [ ] Light and dark mode both tested independently",
      "- [ ] Color contrast passes 4.5:1 for body text, 3:1 for large text and UI components",
      "- [ ] Touch targets are 44×44pt minimum with adequate spacing",
      "- [ ] Safe areas respected (notches, gesture bars, status bars)",
      "- [ ] Responsive: mobile (375px), tablet (768px), desktop (1280px)",
      "- [ ] All interactive states present: hover, focus, active, disabled, loading, error, empty",
      "",
      "## Never",
      "",
      "- Use arbitrary colors — reference tokens or a defined palette",
      "- Use font sizes below 14px for body text",
      "- Add decorative elements that increase cognitive load without purpose",
      "- Omit hover, focus, active, disabled, or loading states",
      "- Ship without testing both light and dark themes",
    ].join("\n"),
  },

  // ---- From reference/skills ----

  {
    name: "accessibility-review",
    title: "Accessibility review",
    category: "Design",
    icon: <ShieldCheckIcon className="size-4" />,
    description:
      "Audit a design or page for WCAG 2.1 AA compliance: contrast, keyboard, touch targets, screen reader.",
    preview:
      "Structured a11y audit across Perceivable, Operable, Understandable, and Robust criteria with severity ratings.",
    content: [
      "## Goal",
      "",
      "Audit the specified design or page for WCAG 2.1 AA compliance.",
      "",
      "## WCAG 2.1 AA Quick Reference",
      "",
      "**Perceivable**",
      "- 1.1.1 Non-text content has alt text",
      "- 1.3.1 Info and structure conveyed semantically",
      "- 1.4.3 Contrast ratio ≥ 4.5:1 (normal text), ≥ 3:1 (large text)",
      "- 1.4.11 Non-text contrast ≥ 3:1 (UI components, graphics)",
      "",
      "**Operable**",
      "- 2.1.1 All functionality available via keyboard",
      "- 2.4.3 Logical focus order",
      "- 2.4.7 Visible focus indicator",
      "- 2.5.5 Touch target ≥ 44×44 CSS pixels",
      "",
      "**Understandable**",
      "- 3.2.1 Predictable on focus (no unexpected changes)",
      "- 3.3.1 Error identification (describe the error)",
      "- 3.3.2 Labels or instructions for inputs",
      "",
      "**Robust**",
      "- 4.1.2 Name, role, value for all UI components",
      "",
      "## Testing Steps",
      "",
      "1. Automated scan (catches ~30% of issues)",
      "2. Keyboard-only navigation — can you reach and operate everything?",
      "3. Color contrast check for all text and UI components",
      "4. Touch target size verification",
      "5. Zoom to 200% — does layout break?",
      "6. Screen reader pass (VoiceOver / NVDA) for critical flows",
      "",
      "## Output Format",
      "",
      "For each finding: WCAG criterion, severity (🔴 Critical / 🟡 Major / 🟢 Minor), description, recommendation.",
      "",
      "Include a color contrast table and keyboard navigation table.",
      "",
      "Conclude with a prioritized fix list.",
    ].join("\n"),
  },
  {
    name: "design-critique",
    title: "Design critique",
    category: "Design",
    icon: <SearchIcon className="size-4" />,
    description:
      "Get structured design feedback across usability, hierarchy, consistency, and accessibility.",
    preview:
      "Multi-dimension critique: first impression, usability, hierarchy, consistency, a11y, and priority fixes.",
    content: [
      "## Goal",
      "",
      "Provide structured feedback on the design. Adapt depth to the stage: exploration gets directional feedback, final polish gets precision.",
      "",
      "## Critique Framework",
      "",
      "**1. First Impression (2 seconds)**",
      "- What draws the eye first? Is that correct?",
      "- What is the emotional reaction?",
      "- Is the purpose immediately clear?",
      "",
      "**2. Usability**",
      "- Can the user accomplish their goal?",
      "- Is the navigation intuitive?",
      "- Are interactive elements obvious?",
      "- Are there unnecessary steps?",
      "",
      "**3. Visual Hierarchy**",
      "- Is there a clear reading order?",
      "- Are the right elements emphasized?",
      "- Is whitespace used effectively?",
      "- Is typography creating the right hierarchy?",
      "",
      "**4. Consistency**",
      "- Does it follow the design system?",
      "- Are spacing, colors, and typography consistent?",
      "- Do similar elements behave similarly?",
      "",
      "**5. Accessibility**",
      "- Color contrast ratios",
      "- Touch target sizes",
      "- Text readability",
      "",
      "## Feedback Principles",
      "",
      "- Be specific: 'The CTA competes with the nav' not 'the layout is confusing'",
      "- Explain why: connect feedback to design principles or user needs",
      "- Suggest alternatives: don't just identify problems, propose solutions",
      "- Acknowledge what works: include positive observations",
      "",
      "## Output",
      "",
      "Sections: Overall Impression, Usability findings, Visual Hierarchy, Consistency, Accessibility, What Works Well, Priority Recommendations (top 3).",
    ].join("\n"),
  },
  {
    name: "design-handoff",
    title: "Design handoff",
    category: "Design",
    icon: <FileTextIcon className="size-4" />,
    description:
      "Generate comprehensive developer handoff specs: layout, tokens, states, responsive behavior, edge cases.",
    preview:
      "Spec sheet covering measurements, design tokens, component variants, states, breakpoints, and motion.",
    content: [
      "## Goal",
      "",
      "Generate developer handoff documentation that leaves nothing for the developer to guess.",
      "",
      "## What to Include",
      "",
      "**Visual Specifications**",
      "- Exact measurements (padding, margins, widths) in design token references",
      "- Responsive breakpoints and behavior",
      "- Component variants and their use cases",
      "",
      "**Interaction Specifications**",
      "- Click/tap behavior",
      "- Hover, focus, active, disabled, loading, error states",
      "- Transitions and animations (duration, easing)",
      "- Gesture support where applicable",
      "",
      "**Content Specifications**",
      "- Character limits and truncation rules",
      "- Empty states",
      "- Loading states",
      "- Error states",
      "",
      "**Edge Cases**",
      "- Minimum and maximum content lengths",
      "- Long strings (internationalization)",
      "- Missing or slow-loading data",
      "",
      "**Accessibility**",
      "- Focus order",
      "- ARIA labels and roles",
      "- Keyboard interactions",
      "",
      "## Principles",
      "",
      "- Use tokens, not values: reference 'spacing-md', not '16px'",
      "- Show all states — if a state isn't specced, the dev will guess",
      "- Describe the why: help developers make good judgment calls",
      "",
      "## Output Format",
      "",
      "Tables for: Design Tokens Used, Component States, Responsive Breakpoints, Edge Cases, and Animation/Motion.",
    ].join("\n"),
  },
  {
    name: "design-system",
    title: "Design system",
    category: "Design",
    icon: <LayersIcon className="size-4" />,
    description:
      "Audit for inconsistencies, document component variants and states, or design a new pattern.",
    preview:
      "Three modes: audit (naming, token coverage, completeness), document (variants, states, a11y), extend (new pattern).",
    content: [
      "## Modes",
      "",
      "Run in one of three modes:",
      "",
      "- **audit** — Check the full system for naming inconsistencies, hardcoded values, and missing docs",
      "- **document [component]** — Write documentation for a specific component",
      "- **extend [pattern]** — Design a new component or pattern that fits the existing system",
      "",
      "## Design System Components",
      "",
      "**Design Tokens** — Colors (brand, semantic, neutral), Typography, Spacing, Borders, Shadows, Motion",
      "",
      "**Components** — Variants (primary, secondary, ghost), States (default, hover, active, disabled, loading, error), Sizes, Accessibility",
      "",
      "**Patterns** — Forms, Navigation, Data display, Feedback (toasts, modals, inline messages)",
      "",
      "## Audit Output",
      "",
      "- Naming consistency issues",
      "- Token coverage: how many hardcoded hex/px values exist?",
      "- Component completeness: states, variants, documentation score",
      "- Priority actions (top 3)",
      "",
      "## Document Output",
      "",
      "- Description and when to use",
      "- Props/properties table",
      "- All states with visual and behavior description",
      "- Accessibility: ARIA role, keyboard, screen reader announcement",
      "- Do's and Don'ts",
      "- Code example",
      "",
      "## Extend Output",
      "",
      "- Problem this component solves",
      "- Relationship to existing components",
      "- Proposed API, variants, states, token usage",
      "- Open questions for design review",
      "",
      "## Principles",
      "",
      "- Consistency over creativity — the system prevents reinventing the wheel",
      "- Flexibility within constraints — components should be composable",
      "- Document everything — if it's not documented, it doesn't exist",
    ].join("\n"),
  },
  {
    name: "ux-copy",
    title: "UX copy",
    category: "Design",
    icon: <MessageSquareTextIcon className="size-4" />,
    description:
      "Write or review UX copy: microcopy, error messages, empty states, CTAs, and onboarding text.",
    preview:
      "Clear, concise, consistent, human copy. Covers CTAs, errors, confirmations, empty states, and tooltips.",
    content: [
      "## Goal",
      "",
      "Write or review UX copy for any interface context. Adapt tone to the user's emotional state and the platform's voice.",
      "",
      "## Principles",
      "",
      "1. **Clear** — Say exactly what you mean. No jargon, no ambiguity.",
      "2. **Concise** — Use the fewest words that convey the full meaning.",
      "3. **Consistent** — Same terms for the same things everywhere.",
      "4. **Useful** — Every word should help the user accomplish their goal.",
      "5. **Human** — Write like a helpful person, not a robot or a legal document.",
      "",
      "## Copy Patterns",
      "",
      "**CTAs** — Start with a verb. Be specific.",
      "- ✅ 'Create account', 'Save changes', 'Download report'",
      "- ❌ 'Submit', 'OK', 'Click here'",
      "",
      "**Error messages** — What happened + Why + How to fix.",
      "- ✅ 'Payment declined. Your card was rejected by your bank. Try a different card or contact your bank.'",
      "- ❌ 'Error 402. Payment failed.'",
      "",
      "**Empty states** — What this is + Why it's empty + How to start.",
      "- ✅ 'No projects yet. Create your first project to start collaborating.'",
      "- ❌ 'No results found.'",
      "",
      "**Confirmation dialogs** — Make the action and consequence clear.",
      "- ✅ 'Delete 3 files? This can't be undone.' → 'Delete files' / 'Keep files'",
      "- ❌ 'Are you sure?' → 'OK' / 'Cancel'",
      "",
      "## Tone by Context",
      "",
      "- Success: celebratory but not over the top",
      "- Error: empathetic and helpful",
      "- Warning: clear and actionable",
      "- Neutral/informational: concise and direct",
      "",
      "## Output Format",
      "",
      "Recommended copy, 2-3 alternatives with tone notes, rationale, and localization notes if relevant.",
    ].join("\n"),
  },

  // ---- New additions from reference/skills ----

  {
    name: "architecture",
    title: "Architecture decision",
    category: "Engineering",
    icon: <NetworkIcon className="size-4" />,
    description:
      "Create an Architecture Decision Record (ADR) or evaluate a system design with options and trade-offs.",
    preview:
      "Structured ADR format: context, options with trade-off table, decision, consequences, and action items.",
    content: [
      "## Modes",
      "",
      "- **Create an ADR** — 'Should we use Kafka or SQS for our event bus?'",
      "- **Evaluate a design** — 'Review this microservices proposal'",
      "- **System design** — 'Design the notification system for our app'",
      "",
      "## ADR Format",
      "",
      "```",
      "# ADR-[number]: [Title]",
      "",
      "Status: Proposed | Accepted | Deprecated | Superseded",
      "Date: [Date]",
      "Deciders: [Who needs to sign off]",
      "",
      "## Context",
      "[What is the situation? What forces are at play?]",
      "",
      "## Decision",
      "[What is the change we're proposing?]",
      "",
      "## Options Considered",
      "",
      "### Option A: [Name]",
      "| Dimension      | Assessment         |",
      "|----------------|--------------------|",
      "| Complexity     | Low / Med / High   |",
      "| Cost           | [Assessment]       |",
      "| Scalability    | [Assessment]       |",
      "| Team familiarity | [Assessment]     |",
      "",
      "Pros: [List]",
      "Cons: [List]",
      "",
      "### Option B: [Name]  [Same format]",
      "",
      "## Trade-off Analysis",
      "[Key trade-offs with clear reasoning]",
      "",
      "## Consequences",
      "- [What becomes easier]",
      "- [What becomes harder]",
      "- [What we'll need to revisit]",
      "",
      "## Action Items",
      "1. [ ] [Implementation step]",
      "2. [ ] [Follow-up]",
      "```",
      "",
      "## Tips",
      "",
      "- State constraints upfront — 'Must handle 10K rps' or 'Ship in 2 weeks' shapes the answer",
      "- Name your options explicitly even if you're leaning one way",
      "- Include non-functional requirements: latency, cost, team expertise, maintenance burden",
    ].join("\n"),
  },
  {
    name: "deploy-checklist",
    title: "Deploy checklist",
    category: "Git",
    icon: <RocketIcon className="size-4" />,
    description:
      "Generate a pre-deployment verification checklist before shipping a release to production.",
    preview:
      "Pre-deploy, deploy, post-deploy, and rollback trigger sections. Customizes for migrations, flags, and breaking changes.",
    content: [
      "## Goal",
      "",
      "Generate a pre-deployment checklist tailored to this release. Run before every deploy — even routine ones.",
      "",
      "## Checklist",
      "",
      "**Pre-Deploy**",
      "- [ ] All tests passing in CI",
      "- [ ] Code reviewed and approved",
      "- [ ] No known critical bugs in release",
      "- [ ] Database migrations tested (if applicable)",
      "- [ ] Feature flags configured (if applicable)",
      "- [ ] Rollback plan documented",
      "- [ ] On-call team notified",
      "",
      "**Deploy**",
      "- [ ] Deploy to staging and verify",
      "- [ ] Run smoke tests",
      "- [ ] Deploy to production (canary if available)",
      "- [ ] Monitor error rates and latency for 15 min",
      "- [ ] Verify key user flows work end-to-end",
      "",
      "**Post-Deploy**",
      "- [ ] Confirm metrics are nominal",
      "- [ ] Update release notes / changelog",
      "- [ ] Notify stakeholders",
      "- [ ] Close related tickets",
      "",
      "**Rollback Triggers**",
      "- Error rate exceeds [X]%",
      "- P50 latency exceeds [X]ms",
      "- [Critical user flow] fails",
      "",
      "## Customization",
      "",
      "Tell me about your deploy to customize:",
      "- 'We use feature flags' → adds flag verification steps",
      "- 'This includes a database migration' → adds migration-specific checks",
      "- 'This is a breaking API change' → adds consumer notification steps",
      "",
      "## Principle",
      "",
      "Decide rollback criteria BEFORE deploying, not during an incident.",
    ].join("\n"),
  },
  {
    name: "testing-strategy",
    title: "Testing strategy",
    category: "Engineering",
    icon: <TestTube2Icon className="size-4" />,
    description:
      "Design a test strategy and plan: pyramid, coverage targets, test types by component, and gap analysis.",
    preview:
      "Testing pyramid framework with strategy by component type, coverage focus, and a concrete test plan output.",
    content: [
      "## Goal",
      "",
      "Design an effective testing strategy balancing coverage, speed, and maintenance for the described system or component.",
      "",
      "## Testing Pyramid",
      "",
      "```",
      "      /  E2E  \\         Few, slow, high confidence",
      "     / Integration \\    Some, medium speed",
      "    /   Unit Tests  \\   Many, fast, focused",
      "```",
      "",
      "## Strategy by Component Type",
      "",
      "- **API endpoints**: Unit tests for business logic, integration tests for HTTP layer, contract tests for consumers",
      "- **Data pipelines**: Input validation, transformation correctness, idempotency",
      "- **Frontend**: Component tests, interaction tests, visual regression, accessibility",
      "- **Infrastructure**: Smoke tests, chaos engineering, load tests",
      "",
      "## What to Cover",
      "",
      "Focus on:",
      "- Business-critical paths",
      "- Error handling and failure modes",
      "- Edge cases and boundary values",
      "- Security boundaries",
      "- Data integrity",
      "",
      "Skip:",
      "- Trivial getters/setters",
      "- Framework code",
      "- One-off scripts",
      "",
      "## Output",
      "",
      "Produce a test plan with:",
      "- What to test and why",
      "- Test type for each area (unit / integration / E2E)",
      "- Coverage targets",
      "- Example test cases",
      "- Gaps in existing coverage",
    ].join("\n"),
  },
  {
    name: "documentation-writer",
    // Distinct title to avoid the duplicate "Write documentation" card from write-documentation.
    title: "Technical documentation",
    category: "Documentation",
    icon: <FileTextIcon className="size-4" />,
    description:
      "Write and maintain technical documentation: README, API docs, runbooks, architecture docs, onboarding guides.",
    preview:
      "Five document types with structured sections, principles, and reader-first writing guidelines.",
    content: [
      "## Document Types",
      "",
      "**README**",
      "- What this is and why it exists",
      "- Quick start (< 5 minutes to first success)",
      "- Configuration and usage",
      "- Contributing guide",
      "",
      "**API Documentation**",
      "- Endpoint reference with request/response examples",
      "- Authentication and error codes",
      "- Rate limits and pagination",
      "- SDK examples",
      "",
      "**Runbook**",
      "- When to use this runbook",
      "- Prerequisites and access needed",
      "- Step-by-step procedure with exact commands",
      "- Rollback steps",
      "- Escalation path",
      "",
      "**Architecture Doc**",
      "- Context and goals",
      "- High-level design with diagrams",
      "- Key decisions and trade-offs",
      "- Data flow and integration points",
      "",
      "**Onboarding Guide**",
      "- Environment setup",
      "- Key systems and how they connect",
      "- Common tasks with walkthroughs",
      "- Who to ask for what",
      "",
      "## Principles",
      "",
      "1. **Write for the reader** — Who is reading this and what do they need?",
      "2. **Start with the most useful information** — Don't bury the lede",
      "3. **Show, don't tell** — Code examples, commands, and screenshots over prose",
      "4. **Keep it current** — Outdated docs are worse than no docs",
      "5. **Link, don't duplicate** — Reference other docs instead of copying content",
    ].join("\n"),
  },
  {
    name: "brand-review",
    title: "Brand review",
    category: "Marketing",
    icon: <MegaphoneIcon className="size-4" />,
    description:
      "Review content against brand voice, style guide, and messaging pillars. Flag deviations by severity with before/after fixes.",
    preview:
      "Evaluates voice, tone, terminology, messaging alignment, style compliance, and legal/compliance flags.",
    content: [
      "## Goal",
      "",
      "Review the provided content against brand guidelines. Flag deviations by severity with specific before/after improvements.",
      "",
      "## Review Dimensions",
      "",
      "**Voice and Tone**",
      "- Does content match the defined brand voice attributes?",
      "- Is tone appropriate for the content type and audience?",
      "- Flag specific sentences that deviate and explain why",
      "",
      "**Terminology and Language**",
      "- Are preferred brand terms used correctly?",
      "- Any 'avoid' terms or phrases present?",
      "- Are product and feature names correctly capitalized?",
      "",
      "**Messaging Alignment**",
      "- Does content align with defined messaging pillars?",
      "- Are claims consistent with approved positioning?",
      "",
      "**Style Guide Compliance**",
      "- Grammar and punctuation per style guide",
      "- Formatting conventions (headers, lists, numbers, dates)",
      "- Acronym usage (defined on first use?)",
      "",
      "**Legal / Compliance Flags (Always Checked)**",
      "- Unsubstantiated superlatives ('best', 'fastest', 'only')",
      "- Missing disclaimers on financial, health, or guarantee claims",
      "- Comparative claims against competitors",
      "- Testimonials without attribution or disclosure",
      "",
      "## Output Format",
      "",
      "1. **Summary** — overall alignment, biggest strength, top improvement needed",
      "2. **Findings table** — Issue | Location | Severity (High/Medium/Low) | Suggestion",
      "3. **Revised sections** — before/after for the top 3-5 highest-severity issues",
      "4. **Legal/compliance flags** — listed separately with recommended actions",
    ].join("\n"),
  },
  {
    name: "brand-voice-enforcement",
    title: "Brand voice enforcement",
    category: "Marketing",
    icon: <MegaphoneIcon className="size-4" />,
    description:
      "Apply existing brand guidelines to content creation — emails, proposals, social posts, presentations.",
    preview:
      "Loads brand guidelines, applies voice constants and tone flexes, generates on-brand content, and explains choices.",
    content: [
      "## When to Use",
      "",
      "Use when writing emails, proposals, pitch decks, LinkedIn posts, Slack messages, sales content, or any communication where brand voice must be applied.",
      "",
      "## Workflow",
      "",
      "**1. Load brand guidelines** (in order of priority)",
      "- Check if guidelines were generated earlier in this session",
      "- Check for `.claude/brand-voice-guidelines.md` in the working folder",
      "- If not found, ask the user to paste guidelines or describe their brand voice",
      "",
      "**2. Analyze the request**",
      "- Content type (email, post, presentation, etc.)",
      "- Target audience (role, seniority, industry)",
      "- Key messages needed",
      "- Length, format, and tone constraints",
      "",
      "**3. Apply voice constants**",
      "Voice stays fixed across all content:",
      "- Apply brand personality attributes ('We Are / We Are Not')",
      "- Use approved terminology; reject prohibited terms",
      "- Follow messaging framework and value propositions",
      "",
      "**4. Flex tone for context**",
      "Tone adapts by channel and situation:",
      "- Blog: informative, conversational, educational",
      "- Social (LinkedIn): professional, thought-provoking, concise",
      "- Email: personal, helpful, action-oriented",
      "- Error messages: empathetic, helpful, blame-free",
      "- Incident response: transparent, accountable",
      "",
      "**5. Validate and explain**",
      "- Briefly note which brand guidelines were applied",
      "- Explain key voice and tone decisions",
      "- Offer to refine based on feedback",
      "",
      "## Handling Conflicts",
      "",
      "When the request conflicts with guidelines: explain the conflict, give a recommendation, and offer options (follow guidelines strictly, adapt for context, or override).",
    ].join("\n"),
  },
  {
    name: "compliance-check",
    title: "Compliance check",
    category: "Legal",
    icon: <ScaleIcon className="size-4" />,
    description:
      "Surface applicable regulations, required approvals, and risk areas for a proposed feature or initiative.",
    preview:
      "Checks GDPR, CCPA, HIPAA, and other regulations. Outputs requirements, risk areas, approvals needed, and recommended actions.",
    content: [
      "## Important",
      "",
      "This assists with compliance workflows but does not provide legal advice. Always verify current requirements with qualified legal professionals.",
      "",
      "## Goal",
      "",
      "Assess the proposed action or feature for applicable regulations, compliance requirements, and risk areas.",
      "",
      "## What to Describe",
      "",
      "Tell me what you're planning. Examples:",
      "- 'We want to launch a referral program with cash rewards'",
      "- 'We're adding biometric authentication to our mobile app'",
      "- 'We need to process EU customer data in our US data center'",
      "- 'Marketing wants to use customer testimonials in ads'",
      "",
      "## Key Regulations Checked",
      "",
      "- **GDPR** — EU personal data processing, lawful basis, data subject rights, breach notification, international transfers",
      "- **CCPA / CPRA** — California consumer rights: access, delete, opt-out, correct",
      "- **HIPAA** — Health data, covered entities, PHI handling",
      "- Others as applicable: LGPD (Brazil), PIPEDA (Canada), PDPA (Singapore), PIPL (China), UK GDPR",
      "",
      "## Output Format",
      "",
      "**Summary** — Proceed / Proceed with conditions / Requires further review",
      "",
      "**Applicable regulations table** — Regulation | Relevance | Key requirements",
      "",
      "**Requirements checklist** — Requirement | Status | Action needed",
      "",
      "**Risk areas** — Risk | Severity | Mitigation",
      "",
      "**Approvals needed** — Approver | Why | Status",
      "",
      "**Recommended actions** — Prioritized list of next steps",
    ].join("\n"),
  },
  {
    name: "performance-report",
    title: "Marketing performance report",
    category: "Marketing",
    icon: <TrendingUpIcon className="size-4" />,
    description:
      "Build a marketing performance report with key metrics, trend analysis, wins, misses, and prioritized recommendations.",
    preview:
      "Executive summary, metrics dashboard, trend analysis, what worked/didn't, insights, and next-period priorities.",
    content: [
      "## Report Types",
      "",
      "- **Campaign report** — performance of a specific campaign",
      "- **Channel report** — email, social, paid, SEO, or content",
      "- **Overall marketing report** — cross-channel summary (weekly, monthly, quarterly)",
      "",
      "## Report Structure",
      "",
      "**1. Executive Summary**",
      "- 2-3 sentence overview of performance",
      "- Headline metric with trend direction (up/down/flat vs. prior period)",
      "- One key win and one area of concern",
      "",
      "**2. Key Metrics Dashboard**",
      "Table: Metric | This Period | Prior Period | Change | Target | Status",
      "Status: On track / At risk / Off track",
      "",
      "**3. Trend Analysis**",
      "- Performance trend over the period",
      "- Notable inflection points and what caused them",
      "- Comparison to benchmarks or targets",
      "",
      "**4. What Worked**",
      "- Top 3-5 wins with specific data",
      "- Why these performed well",
      "- How to replicate or scale",
      "",
      "**5. What Needs Improvement**",
      "- Bottom 3-5 performers with data",
      "- Hypotheses for underperformance",
      "- Recommended fixes",
      "",
      "**6. Recommendations**",
      "For each: What to do | Why (linked to data) | Impact | Effort | Priority",
      "",
      "Prioritize in effort/impact matrix: do first, plan for next sprint, deprioritize.",
      "",
      "**7. Next Period Focus**",
      "- Top 3 priorities",
      "- Tests or experiments to run",
      "- Targets for key metrics",
    ].join("\n"),
  },
  {
    name: "seo-audit",
    title: "SEO audit",
    category: "Marketing",
    icon: <GlobeIcon className="size-4" />,
    description:
      "Comprehensive SEO audit: keyword research, on-page analysis, content gaps, technical checks, and competitor comparison.",
    preview:
      "Full site audit covering keywords, on-page issues, content gaps, technical SEO, and a prioritized quick wins vs. strategic investments action plan.",
    content: [
      "## Audit Types",
      "",
      "- **Full site audit** — end-to-end SEO review (default)",
      "- **Keyword research** — identify keyword opportunities for a topic or domain",
      "- **Content gap analysis** — find topics competitors rank for that you don't",
      "- **Technical SEO check** — crawlability, speed, structured data, infrastructure",
      "- **Competitor SEO comparison** — head-to-head benchmarking",
      "",
      "## Audit Sections",
      "",
      "**1. Keyword Research**",
      "- Primary and secondary keywords with search demand and difficulty",
      "- Long-tail and question-based opportunities",
      "- Intent classification: informational, navigational, commercial, transactional",
      "",
      "**2. On-Page Analysis**",
      "- Title tags (unique, 50-60 chars, includes keyword)",
      "- Meta descriptions (compelling, 150-160 chars, has a CTA)",
      "- H1 (exactly one, includes primary keyword)",
      "- Internal linking, image alt text, URL structure",
      "",
      "**3. Content Gap Analysis**",
      "- Topics competitors rank for that you don't cover",
      "- Thin or outdated content (under 300 words or 12+ months old)",
      "- Missing content types and funnel-stage gaps",
      "",
      "**4. Technical SEO Checklist**",
      "- Page speed, mobile-friendliness, structured data (schema markup)",
      "- Crawlability: robots.txt, sitemap, canonicals, noindex usage",
      "- Broken links, HTTPS, Core Web Vitals (LCP, CLS, INP)",
      "",
      "**5. Competitor Comparison**",
      "- Keyword overlap and gaps",
      "- Content depth and publishing frequency",
      "- SERP feature ownership (featured snippets, PAA, image packs)",
      "",
      "## Output",
      "",
      "Executive summary → Keyword opportunity table → On-page issues table → Content gap recommendations → Technical checklist → Competitor comparison",
      "",
      "**Action plan split into:**",
      "- Quick Wins (do this week, under 2 hours each)",
      "- Strategic Investments (plan for this quarter)",
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
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-6 pt-4">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background from-[calc(100%-24px)] to-transparent">
        <div className="flex flex-col gap-2 pb-6 pt-0">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Skills</h2>
          <p className="text-[13px] text-muted-foreground">
            Browse every available skill, inspect details before adding them, and manage your
            installed copies.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8">
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
