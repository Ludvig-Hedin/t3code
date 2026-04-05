/**
 * Static registry of slash commands available in each provider's CLI.
 *
 * These are pass-through commands — when selected, the text is inserted into
 * the composer and sent to the provider agent, which handles them natively,
 * exactly as it would in the CLI.
 *
 * T3Code-owned commands (model, plan, default) are intentionally excluded here;
 * they appear at the top of the slash menu and are handled by T3Code itself.
 *
 * Sources:
 *   - Codex:       https://developers.openai.com/codex/cli/slash-commands
 *   - Claude Code: https://code.claude.com/docs/en/commands
 *   - Gemini:      https://geminicli.com/docs/reference/commands/
 */

import type { ProviderKind } from "@t3tools/contracts";

export interface ProviderSlashCommandDef {
  /** Command name without the leading slash, e.g. "clear" */
  name: string;
  /** Short description shown in the dropdown */
  description: string;
  /**
   * Whether the command accepts arguments.
   * When true, selection inserts "/name " (with trailing space) so the user
   * can immediately type args. When false, inserts "/name" with no space.
   */
  hasArgs: boolean;
}

// ---------------------------------------------------------------------------
// T3Code-owned commands excluded from every provider list below.
// These appear at the top of the slash menu and are handled by T3Code itself,
// so we strip them out of any provider command list to avoid duplicates.
// ---------------------------------------------------------------------------
const T3CODE_OWNED = new Set(["model", "plan", "default", "compact"]);

function cmd(name: string, description: string, hasArgs = false): ProviderSlashCommandDef {
  return { name, description, hasArgs };
}

// ---------------------------------------------------------------------------
// Codex CLI commands
// Source: https://developers.openai.com/codex/cli/slash-commands
// ---------------------------------------------------------------------------
const CODEX_COMMANDS: readonly ProviderSlashCommandDef[] = [
  cmd("fast", "Toggle fast mode (on / off / status)", true),
  cmd("personality", "Set communication style (friendly / pragmatic / none)", true),
  cmd("experimental", "Toggle experimental features", false),
  cmd("new", "Start a fresh conversation", false),
  cmd("clear", "Clear terminal and begin new chat", false),
  cmd("resume", "Reload a previous saved conversation", false),
  cmd("fork", "Clone current conversation into new thread", false),
  cmd("quit", "Exit the CLI", false),
  cmd("exit", "Exit the CLI", false),
  cmd("permissions", "Adjust approval settings (Auto, Read Only, etc.)", false),
  cmd("status", "Display session configuration and token usage stats", false),
  cmd("copy", "Copy latest completed response to clipboard", false),
  cmd("diff", "Show Git diff including untracked files", false),
  cmd("review", "Request Codex analysis of working tree changes", false),
  cmd("mention", "Attach specific files or folders to conversation", true),
  cmd("mcp", "List available Model Context Protocol tools", false),
  cmd("apps", "Browse and insert connectors as $app-slug mentions", false),
  cmd("agent", "Switch active agent thread for subagent inspection", false),
  cmd("compact", "Summarize conversation to conserve context tokens", false),
  cmd("statusline", "Configure and reorder TUI footer status items", false),
  cmd("ps", "Display background terminal status and recent output", false),
  cmd("init", "Generate AGENTS.md scaffold for repository instructions", false),
  cmd("debug-config", "Print config layer diagnostics and policy details", false),
  cmd("feedback", "Submit logs and diagnostics to maintainers", false),
  cmd("logout", "Sign out and clear local credentials", false),
].filter((c) => !T3CODE_OWNED.has(c.name));

// ---------------------------------------------------------------------------
// Claude Code CLI commands
// Source: https://code.claude.com/docs/en/commands
// ---------------------------------------------------------------------------
const CLAUDE_AGENT_COMMANDS: readonly ProviderSlashCommandDef[] = [
  cmd("add-dir", "Add a working directory for file access", true),
  cmd("agents", "Manage agent configurations", false),
  cmd("btw", "Ask a quick side question without adding to conversation", true),
  cmd("clear", "Clear conversation history and free up context", false),
  cmd("compact", "Compact conversation with optional focus instructions", true),
  cmd("config", "Open settings interface", false),
  cmd("context", "Visualize current context usage", false),
  cmd("copy", "Copy last assistant response to clipboard", false),
  cmd("cost", "Show token usage statistics", false),
  cmd("diff", "Open interactive diff viewer for uncommitted changes", false),
  cmd("effort", "Set model effort level (low / medium / high / max)", true),
  cmd("exit", "Exit the CLI", false),
  cmd("export", "Export current conversation as plain text", true),
  cmd("feedback", "Submit feedback about Claude Code", false),
  cmd("help", "Show help and available commands", false),
  cmd("hooks", "View hook configurations for tool events", false),
  cmd("ide", "Manage IDE integrations and show status", false),
  cmd("init", "Initialize project with a CLAUDE.md guide", false),
  cmd("keybindings", "Open or create keybindings configuration file", false),
  cmd("login", "Sign in to your Anthropic account", false),
  cmd("logout", "Sign out from your Anthropic account", false),
  cmd("mcp", "Manage MCP server connections and OAuth authentication", false),
  cmd("memory", "Edit CLAUDE.md memory files", false),
  cmd("permissions", "Manage allow, ask, and deny rules for tool permissions", false),
  cmd("rewind", "Rewind conversation and/or code to a previous point", false),
  cmd("resume", "Resume a conversation by ID or name", true),
  cmd("security-review", "Analyze pending changes for security vulnerabilities", false),
  cmd("skills", "List available skills", false),
  cmd("stats", "Visualize daily usage, session history, and streaks", false),
  cmd("status", "Show version, model, account, and connectivity", false),
  cmd("theme", "Change the color theme", false),
  cmd("usage", "Show plan usage limits and rate limit status", false),
].filter((c) => !T3CODE_OWNED.has(c.name));

// ---------------------------------------------------------------------------
// Gemini CLI commands
// Source: https://geminicli.com/docs/reference/commands/
// ---------------------------------------------------------------------------
const GEMINI_COMMANDS: readonly ProviderSlashCommandDef[] = [
  cmd("about", "Show version info", false),
  cmd("agents", "Manage local and remote subagents", false),
  cmd("auth", "Open dialog to change authentication method", false),
  cmd("bug", "File issues about Gemini CLI", false),
  cmd("clear", "Clear terminal screen and visible history", false),
  cmd("commands", "Manage custom slash commands", false),
  cmd("compress", "Replace entire chat context with a summary", false),
  cmd("copy", "Copy last output to clipboard", false),
  cmd("dir", "Manage workspace directories", true),
  cmd("docs", "Open Gemini CLI documentation in browser", false),
  cmd("editor", "Open dialog for selecting supported editors", false),
  cmd("extensions", "Manage extensions", false),
  cmd("help", "Display help information and available commands", false),
  cmd("hooks", "Manage lifecycle hooks", false),
  cmd("ide", "Manage IDE integration", false),
  cmd("init", "Generate tailored GEMINI.md context file", false),
  cmd("mcp", "Manage Model Context Protocol servers", false),
  cmd("memory", "Manage instructional context from GEMINI.md files", false),
  cmd("permissions", "Manage folder trust settings", false),
  cmd("privacy", "Display Privacy Notice and consent options", false),
  cmd("quit", "Exit Gemini CLI", false),
  cmd("restore", "Restore project files to pre-tool-execution state", false),
  cmd("resume", "Browse and resume conversation sessions", false),
  cmd("rewind", "Navigate backward through conversation", false),
  cmd("settings", "Open settings editor", false),
  cmd("skills", "Manage Agent Skills", false),
  cmd("stats", "Display session statistics", false),
  cmd("theme", "Open dialog to change visual theme", false),
  cmd("tools", "Display available tools", false),
  cmd("vim", "Toggle vim mode", false),
].filter((c) => !T3CODE_OWNED.has(c.name));

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------
export const PROVIDER_SLASH_COMMANDS: Record<ProviderKind, readonly ProviderSlashCommandDef[]> = {
  codex: CODEX_COMMANDS,
  claudeAgent: CLAUDE_AGENT_COMMANDS,
  gemini: GEMINI_COMMANDS,
};

/**
 * Returns all pass-through slash commands for a given provider.
 * Returns an empty array for unknown providers.
 */
export function getProviderSlashCommands(
  provider: ProviderKind,
): readonly ProviderSlashCommandDef[] {
  return PROVIDER_SLASH_COMMANDS[provider] ?? [];
}
