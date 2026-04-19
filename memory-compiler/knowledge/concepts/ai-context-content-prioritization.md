---
title: "AI Context Content Prioritization for System Prompts"
aliases: [system-prompt-content, ai-context-priority, project-instructions-quality]
tags: [ai, system-prompts, context-engineering, developer-tools]
sources:
  - "daily/2026-04-18.md"
created: 2026-04-18
updated: 2026-04-18
---

# AI Context Content Prioritization for System Prompts

When feeding project knowledge into an AI coding assistant's system prompt, raw content dumping is counterproductive. The information must be prioritized by what the AI actually needs to produce correct code. The priority order is: (1) project identity and tech stack, (2) coding standards and conventions, (3) architecture and how things connect, (4) current state and recent changes, (5) file structure and where things are. Content that doesn't serve these categories (verbose changelogs, marketing copy, redundant docs) should be filtered or deprioritized.

## Key Points

- **Prioritize by AI utility, not document importance** — A README may be "important" to humans but contains noise for AI coding; `package.json` dependencies are more useful
- **Auto-extract structured data** — File trees and tech stacks can be generated automatically from the filesystem and `package.json`, avoiding stale manual documentation
- **Weight and truncate within token budget** — Higher-priority content gets more tokens; lower-priority content is summarized or truncated
- **What users want vs what AI needs** — Users want "AI that just knows my project"; AI needs correct file paths, import conventions, and architecture patterns
- **Filter noise aggressively** — Changelog entries, verbose inline documentation, and repetitive boilerplate waste context window space

## Details

### The Priority Hierarchy

Through analysis of what makes AI coding assistants effective, a clear priority order emerged:

**Priority 1: Project Identity (must include)**
- What is this project? What does it do?
- Tech stack: framework, language, key libraries
- Source: auto-extracted from `package.json` dependencies

**Priority 2: Coding Standards (must include)**
- How to write code in this project
- Naming conventions, import patterns, component structure
- Source: CLAUDE.md, eslint config, prettier config

**Priority 3: Architecture (should include)**
- How components/modules connect
- Data flow patterns
- Key directories and their purposes
- Source: PROJECT.md, directory structure analysis

**Priority 4: Current State (nice to have)**
- What's been done recently
- Active branches, recent commits
- Source: git log, recent changes

**Priority 5: File Structure (nice to have)**
- Directory tree
- Where specific types of files live
- Source: auto-generated file tree

### Why Raw Dumping Fails

The original memory compiler concatenated all `.md` files from configured source directories into a single output. This produced problems:

1. **Noise overwhelms signal** — Changelog entries ("Fixed button color on 2026-03-15") provide no value for future coding decisions
2. **No deduplication** — The same pattern described in README.md, CLAUDE.md, and PROJECT.md appears three times
3. **Missing critical info** — File tree and dependency list (the most useful context for AI) were never included because they aren't `.md` files
4. **No token awareness** — Output could exceed context window limits without warning

### Auto-Generated vs Manual Content

The most reliable context comes from auto-extraction rather than manual documentation:

| Source | Method | Reliability |
|--------|--------|-------------|
| Tech stack | Parse `package.json` dependencies | Always current |
| File tree | Generate from filesystem | Always current |
| Import patterns | Analyze source files | Always current |
| Architecture docs | Manual (CLAUDE.md, PROJECT.md) | May be stale |
| Coding standards | Manual + eslint/prettier config | Usually current |

The improved compiler adds auto-generation for file trees and tech stack extraction from `package.json`, supplementing manual documentation with always-current structured data.

### What Developers Actually Want

From the session's analysis: developers want an AI assistant that "just knows" their project. Specifically:

- **Correct file paths** — AI suggests importing from `@/components/Button`, not `./components/Button` or a nonexistent path
- **Correct conventions** — If the project uses `camelCase` for functions, AI doesn't generate `snake_case`
- **Awareness of existing components** — AI reuses `<Dialog>` from the component library instead of creating a new modal
- **Architecture understanding** — AI knows that data flows through RPC handlers, not direct database access

Each of these maps to a priority level: file paths need file structure (P5), conventions need coding standards (P2), existing components need architecture knowledge (P3), and data flow needs architecture (P3).

### Section Weighting Implementation

Content sections are assigned weight multipliers that determine how much of the token budget they receive:

```typescript
const SECTION_WEIGHTS = {
  'project-identity': 1.0,    // Always include fully
  'coding-standards': 0.9,    // Almost always include fully
  'architecture': 0.7,        // Include but may truncate
  'file-structure': 0.5,      // Summarize if space is tight
  'recent-changes': 0.3,      // First to be cut
  'changelog': 0.1,           // Almost always excluded
};
```

Within a fixed token budget (e.g., 8000 tokens for system prompt context), higher-weighted sections consume their full allocation first; lower-weighted sections get remaining space.

## Related Concepts

- [[concepts/memory-compiler-three-stage-pipeline]] — The pipeline that produces the content being prioritized
- [[concepts/standalone-to-workspace-package-refactoring]] — The compiler refactoring that enabled content prioritization improvements
- [[concepts/project-instructions-injection-pipeline]] — How prioritized content reaches the AI chat system prompt
- [[concepts/knowledge-base-index-and-log]] — The knowledge base index is itself a prioritized retrieval mechanism

## Sources

- [[daily/2026-04-18]] — "Current State - Problems: Dumps too much raw content without prioritization; No distinction between 'must know' and 'nice to know'; Missing critical info: file tree, dependencies, recent changes; Includes noise: changelog entries, verbose docs"
- [[daily/2026-04-18]] — "Content priority order for AI context: project identity → coding standards → architecture → current state → file structure"
- [[daily/2026-04-18]] — "What Users Want: AI that 'just knows' their project; No repeated explanations; Correct file paths and imports; Awareness of project conventions"
- [[daily/2026-04-18]] — "Recommendations: Add automatic file tree generation; Extract dependency info from package.json; Prioritize/weight content sections; Add 'freshness' scoring; Smart truncation within token budget"
