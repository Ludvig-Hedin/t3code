/**
 * pluginCatalog.ts — Catalog of plugins, MCP servers, and integrations for
 * the Apps & Plugins page. Pure TypeScript — no React, no app imports.
 *
 * Each item may have multiple ProviderInstruction entries, including
 * multiple per-provider (e.g. Figma has both a Plugin and MCP Server on Codex).
 *
 * Install command patterns:
 *   Claude:    claude mcp add <name> -- npx -y <pkg>
 *   OpenCode:  opencode mcp add --name <name> -- npx -y <pkg>
 *   Cursor:    configSnippet (JSON) → merge into .cursor/mcp.json
 *   Gemini:    configSnippet (JSON) → merge into ~/.gemini/settings.json
 *   Codex:     codex plugin install <name>  (plugin)
 *              configSnippet (JSON) → merge into ~/.codex/config.json (MCP)
 */

export type PluginProvider = "codex" | "claude" | "opencode" | "cursor" | "gemini" | "ollama";

export type PluginCategory =
  | "featured"
  | "coding"
  | "design"
  | "productivity"
  | "communication"
  | "data";

export type IntegrationType = "plugin" | "mcp" | "extension";

export interface ProviderInstruction {
  provider: PluginProvider;
  /** "plugin" = provider-native plugin/skill, "mcp" = MCP server, "extension" = IDE extension */
  integrationType: IntegrationType;
  /**
   * Shell command to copy and run. Null when the setup is config-file only.
   * Claude: "claude mcp add <name> -- npx -y <pkg>"
   * OpenCode: "opencode mcp add --name <name> -- npx -y <pkg>"
   * Codex plugin: "codex plugin install <name>"
   */
  cliCommand: string | null;
  /**
   * JSON configuration snippet to copy into a config file.
   * Used for Cursor (.cursor/mcp.json) and Gemini (~/.gemini/settings.json).
   */
  configSnippet?: string;
  /** Human-readable description of what to do with cliCommand or configSnippet. */
  cliLabel?: string;
  /** Authoritative docs/README for this integration. */
  docsUrl: string;
}

export interface PluginCatalogItem {
  id: string;
  name: string;
  description: string;
  /**
   * Domain for Google's Favicon API:
   *   https://www.google.com/s2/favicons?domain={domain}&sz=64
   */
  domain: string;
  /**
   * Optional direct icon URL. Tried first; falls back to favicon API on error.
   * Use for Google Workspace products whose subdomains return the generic G.
   */
  iconUrl?: string;
  /** Tailwind bg-* class for the colored-letter fallback tile. */
  fallbackColor: string;
  /** Single letter to show in fallback tile. Defaults to name[0]. */
  fallbackInitial?: string;
  category: PluginCategory;
  /** Which providers have at least one instruction (drives filter pills). */
  providers: PluginProvider[];
  instructions: ProviderInstruction[];
  /**
   * Optional lifecycle status. "coming-soon" marks items that lack actionable
   * install data so the UI can hide install buttons or show a badge instead.
   */
  status?: "coming-soon";
}

// ---------------------------------------------------------------------------
// Instruction builder helpers
// ---------------------------------------------------------------------------

/**
 * Returns a standard JSON configSnippet string for Cursor / Gemini / Codex
 * MCP configuration. The JSON represents the full mcpServers entry to merge.
 */
function mcpConfig(name: string, pkg: string): string {
  return `{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["-y", "${pkg}"]
    }
  }
}`;
}

/**
 * Generates a full set of MCP instructions for all 5 main providers.
 * Codex gets a JSON configSnippet (not a CLI command) since Codex MCP is
 * configured via ~/.codex/config.json rather than a CLI subcommand.
 */
function mcp(serverName: string, pkg: string, docsUrl: string): ProviderInstruction[] {
  const cfg = mcpConfig(serverName, pkg);
  return [
    {
      provider: "claude",
      integrationType: "mcp",
      cliCommand: `claude mcp add ${serverName} -- npx -y ${pkg}`,
      cliLabel: "Run in terminal",
      docsUrl,
    },
    {
      provider: "opencode",
      integrationType: "mcp",
      cliCommand: `opencode mcp add --name ${serverName} -- npx -y ${pkg}`,
      cliLabel: "Run in terminal",
      docsUrl,
    },
    {
      provider: "cursor",
      integrationType: "mcp",
      cliCommand: null,
      configSnippet: cfg,
      cliLabel: "Merge into .cursor/mcp.json",
      docsUrl,
    },
    {
      provider: "codex",
      integrationType: "mcp",
      cliCommand: null,
      configSnippet: cfg,
      cliLabel: "Merge into ~/.codex/config.json",
      docsUrl,
    },
    {
      provider: "gemini",
      integrationType: "mcp",
      cliCommand: null,
      configSnippet: cfg,
      cliLabel: "Merge into ~/.gemini/settings.json",
      docsUrl,
    },
  ];
}

/**
 * Generates a Codex-only plugin instruction (from the Codex plugin marketplace).
 * Reference: https://developers.openai.com/codex/plugins
 */
function codexPlugin(
  pluginName: string,
  docsUrl = "https://developers.openai.com/codex/plugins",
): ProviderInstruction {
  return {
    provider: "codex",
    integrationType: "plugin",
    cliCommand: `codex plugin install ${pluginName}`,
    cliLabel: "Run in terminal",
    docsUrl,
  };
}

/**
 * Generates MCP instructions for a server whose args differ from the standard
 * `npx -y <pkg>` pattern (e.g. `npx convex mcp start`, or remote SSE URLs).
 */
function mcpCustomConfig(name: string, args: string[]): string {
  return `{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ${JSON.stringify(args)}
    }
  }
}`;
}

function mcpRemoteConfig(name: string, url: string): string {
  return `{
  "mcpServers": {
    "${name}": {
      "url": "${url}"
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Catalog — 52 items across 6 categories
// ---------------------------------------------------------------------------

export const PLUGIN_CATALOG: PluginCatalogItem[] = [
  // =========================================================================
  // FEATURED
  // =========================================================================
  {
    id: "github",
    name: "GitHub",
    description: "Triage PRs, manage issues, run CI checks, create releases, and search repos.",
    domain: "github.com",
    fallbackColor: "bg-neutral-800",
    category: "featured",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("github"),
      ...mcp(
        "github",
        "@modelcontextprotocol/server-github",
        "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
      ),
    ],
  },
  {
    id: "linear",
    name: "Linear",
    description:
      "Find and reference Linear issues, view cycles, manage projects, and create tickets.",
    domain: "linear.app",
    fallbackColor: "bg-violet-600",
    category: "featured",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("linear"),
      ...mcp(
        "linear",
        "@linear/mcp-server",
        "https://github.com/linear/linear/tree/master/packages/mcp",
      ),
    ],
  },
  {
    id: "figma",
    name: "Figma",
    description:
      "Read designs, inspect components, access tokens, and export assets for code. Published by Figma Inc.",
    domain: "figma.com",
    fallbackColor: "bg-pink-600",
    category: "featured",
    // Figma has BOTH a Codex native plugin and an MCP server everywhere
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      // Codex: native plugin (from the Codex plugin marketplace)
      codexPlugin("figma"),
      // All providers: MCP server (figma-developer-mcp, published by Figma)
      ...mcp("figma", "figma-developer-mcp", "https://github.com/figma/figma-developer-mcp"),
    ],
  },
  {
    id: "notion",
    name: "Notion",
    description: "Read and write Notion pages, search your workspace, and manage databases.",
    domain: "notion.so",
    fallbackColor: "bg-neutral-700",
    category: "featured",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("notion"),
      ...mcp(
        "notion",
        "@notionhq/notion-mcp-server",
        "https://github.com/makenotion/notion-mcp-server",
      ),
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, read channels, search your workspace, and manage notifications.",
    domain: "slack.com",
    fallbackColor: "bg-purple-700",
    category: "featured",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("slack"),
      ...mcp(
        "slack",
        "@modelcontextprotocol/server-slack",
        "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
      ),
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description:
      "Query live Postgres databases with natural language. Inspect schemas, run migrations.",
    domain: "postgresql.org",
    fallbackColor: "bg-blue-700",
    category: "data",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "postgres",
      "@modelcontextprotocol/server-postgres",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    ),
  },

  // =========================================================================
  // CODING & DEVOPS
  // =========================================================================
  {
    id: "supabase",
    name: "Supabase",
    description:
      "Manage your Supabase project: tables, auth users, edge functions, and SQL queries.",
    domain: "supabase.com",
    fallbackColor: "bg-emerald-700",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("supabase"),
      ...mcp(
        "supabase",
        "@supabase/mcp-server-supabase",
        "https://github.com/supabase-community/supabase-mcp",
      ),
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy projects, inspect deployments, manage domains, and view build logs.",
    domain: "vercel.com",
    fallbackColor: "bg-neutral-900",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("vercel"),
      ...mcp("vercel", "@vercel/mcp-adapter", "https://github.com/vercel/mcp"),
    ],
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    description: "Manage Workers, KV namespaces, R2 buckets, DNS records, and D1 databases.",
    domain: "cloudflare.com",
    fallbackColor: "bg-orange-500",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("cloudflare"),
      ...mcp(
        "cloudflare",
        "@cloudflare/mcp-server-cloudflare",
        "https://github.com/cloudflare/mcp-server-cloudflare",
      ),
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    description:
      "Look up errors, traces, and performance issues. Inspect recent events and triage exceptions.",
    domain: "sentry.io",
    fallbackColor: "bg-purple-800",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("sentry"),
      ...mcp("sentry", "@sentry/mcp-server", "https://github.com/getsentry/sentry-mcp"),
    ],
  },
  {
    id: "jira",
    name: "Jira",
    description:
      "Search and update Jira tickets, transition issues, view sprints, and manage backlogs.",
    domain: "atlassian.com",
    fallbackColor: "bg-blue-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("jira"),
      ...mcp("jira", "@atlassian/mcp-atlassian", "https://github.com/atlassian/mcp-atlassian"),
    ],
  },
  {
    id: "docker",
    name: "Docker",
    description: "Manage containers, images, volumes, and Compose stacks from your AI assistant.",
    domain: "docker.com",
    fallbackColor: "bg-sky-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp("docker", "@docker/mcp-server", "https://github.com/docker/mcp-servers"),
  },
  {
    id: "aws",
    name: "AWS",
    description:
      "Query S3, EC2, Lambda, and CloudWatch. Manage infrastructure with natural language.",
    domain: "aws.amazon.com",
    fallbackColor: "bg-orange-600",
    category: "coding",
    // mcp() generates instructions for all 5 providers; keep providers in sync.
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp("aws", "@aws/mcp-servers", "https://github.com/awslabs/mcp"),
  },
  {
    id: "neon",
    name: "Neon",
    description:
      "Serverless Postgres — create branches, run SQL, manage projects, and scale databases.",
    domain: "neon.tech",
    fallbackColor: "bg-teal-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("neon"),
      ...mcp(
        "neon",
        "@neondatabase/mcp-server-neon",
        "https://github.com/neondatabase/mcp-server-neon",
      ),
    ],
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description:
      "Search the web and get real-time results with Brave's privacy-focused search API.",
    domain: "search.brave.com",
    fallbackColor: "bg-orange-700",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "brave-search",
      "@modelcontextprotocol/server-brave-search",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    ),
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description:
      "Control a headless Chrome browser, scrape web pages, take screenshots, and automate UI flows.",
    domain: "pptr.dev",
    fallbackColor: "bg-green-700",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "puppeteer",
      "@modelcontextprotocol/server-puppeteer",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
    ),
  },
  {
    id: "datadog",
    name: "Datadog",
    description:
      "Query metrics, logs, and traces. Inspect dashboards, monitors, and service health.",
    domain: "datadoghq.com",
    fallbackColor: "bg-violet-700",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("datadog", "@datadog/mcp-server", "https://github.com/DataDog/datadog-mcp"),
  },
  {
    id: "firebase",
    name: "Firebase",
    description:
      "Manage Firestore collections, Auth users, Realtime Database, and Firebase Functions.",
    domain: "firebase.google.com",
    fallbackColor: "bg-yellow-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "firebase",
      "@gannonh/firebase-mcp",
      "https://github.com/gannonh/firebase-mcp",
    ),
  },
  {
    id: "convex",
    name: "Convex",
    description:
      "Query and mutate your Convex backend. Inspect tables, functions, logs, and deployments in real time.",
    domain: "convex.dev",
    fallbackColor: "bg-orange-500",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: "claude mcp add convex -- npx -y convex@latest mcp start",
        cliLabel: "Run in terminal",
        docsUrl: "https://docs.convex.dev/ai/convex-mcp-server",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand: "opencode mcp add --name convex -- npx -y convex@latest mcp start",
        cliLabel: "Run in terminal",
        docsUrl: "https://docs.convex.dev/ai/convex-mcp-server",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("convex", ["-y", "convex@latest", "mcp", "start"]),
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://docs.convex.dev/ai/using-cursor",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("convex", ["-y", "convex@latest", "mcp", "start"]),
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://docs.convex.dev/ai/convex-mcp-server",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("convex", ["-y", "convex@latest", "mcp", "start"]),
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://docs.convex.dev/ai/convex-mcp-server",
      },
    ],
  },
  {
    id: "clerk",
    name: "Clerk",
    description:
      "Manage users, organizations, sessions, and auth flows via Clerk's hosted MCP server.",
    domain: "clerk.com",
    fallbackColor: "bg-violet-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: "claude mcp add clerk -- npx -y mcp-remote https://mcp.clerk.com/mcp",
        cliLabel: "Run in terminal",
        docsUrl: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand: "opencode mcp add --name clerk -- npx -y mcp-remote https://mcp.clerk.com/mcp",
        cliLabel: "Run in terminal",
        docsUrl: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("clerk", ["-y", "mcp-remote", "https://mcp.clerk.com/mcp"]),
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://clerk.com/docs/guides/ai/mcp/connect-mcp-client",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("clerk", ["-y", "mcp-remote", "https://mcp.clerk.com/mcp"]),
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpCustomConfig("clerk", ["-y", "mcp-remote", "https://mcp.clerk.com/mcp"]),
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://clerk.com/docs/guides/ai/mcp/clerk-mcp-server",
      },
    ],
  },
  {
    id: "webflow",
    name: "Webflow",
    description:
      "Manage Webflow sites, pages, collections, and CMS content via the official Webflow Data API.",
    domain: "webflow.com",
    fallbackColor: "bg-blue-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: "claude mcp add --transport sse webflow https://mcp.webflow.com/sse",
        cliLabel: "Run in terminal (requires Webflow API token via OAuth)",
        docsUrl: "https://developers.webflow.com/mcp/reference/getting-started",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand:
          "WEBFLOW_TOKEN=your_token opencode mcp add --name webflow -- npx -y webflow-mcp-server@latest",
        cliLabel: "Set WEBFLOW_TOKEN first, then run",
        docsUrl: "https://github.com/webflow/mcp-server",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpRemoteConfig("webflow", "https://mcp.webflow.com/sse"),
        cliLabel: "Merge into .cursor/mcp.json (SSE remote)",
        docsUrl: "https://developers.webflow.com/mcp/reference/getting-started",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpRemoteConfig("webflow", "https://mcp.webflow.com/sse"),
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://github.com/webflow/mcp-server",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: mcpRemoteConfig("webflow", "https://mcp.webflow.com/sse"),
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://github.com/webflow/mcp-server",
      },
    ],
  },
  {
    id: "context7",
    name: "Context7",
    description:
      "Live, version-specific library docs injected into your prompt. Add 'use context7' to any message to pull current official documentation for any package.",
    domain: "context7.com",
    fallbackColor: "bg-teal-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp("context7", "@upstash/context7-mcp", "https://github.com/upstash/context7"),
  },
  {
    id: "tavily",
    name: "Tavily",
    description:
      "Real-time web search built for AI agents. Returns clean, structured results optimised for LLM consumption.",
    domain: "tavily.com",
    fallbackColor: "bg-blue-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        // Tavily provides an HTTP-transport hosted endpoint — cleanest for Claude
        cliCommand: `claude mcp add --transport http tavily "https://mcp.tavily.com/mcp/?tavilyApiKey=YOUR_API_KEY"`,
        cliLabel: "Run in terminal (replace YOUR_API_KEY)",
        docsUrl: "https://docs.tavily.com/documentation/mcp",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand: "opencode mcp add --name tavily -- npx -y tavily-mcp",
        cliLabel: "Run in terminal (set TAVILY_API_KEY env var)",
        docsUrl: "https://github.com/tavily-ai/tavily-mcp",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": { "TAVILY_API_KEY": "YOUR_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://docs.tavily.com/documentation/mcp",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": { "TAVILY_API_KEY": "YOUR_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://github.com/tavily-ai/tavily-mcp",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "tavily": {
      "command": "npx",
      "args": ["-y", "tavily-mcp"],
      "env": { "TAVILY_API_KEY": "YOUR_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://docs.tavily.com/documentation/mcp",
      },
    ],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description:
      "Structured step-by-step reasoning. Helps the AI break down complex problems, revise plans, and branch thought paths before acting.",
    domain: "modelcontextprotocol.io",
    fallbackColor: "bg-indigo-600",
    fallbackInitial: "ST",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "sequential-thinking",
      "@modelcontextprotocol/server-sequential-thinking",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    ),
  },
  {
    id: "playwright",
    name: "Playwright",
    description:
      "Browser automation by Microsoft. Navigate pages, click elements, fill forms, take screenshots, and run end-to-end tests.",
    domain: "playwright.dev",
    fallbackColor: "bg-green-700",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "playwright",
      "@playwright/mcp@latest",
      "https://github.com/microsoft/playwright-mcp",
    ),
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    description:
      "Control and inspect a live Chrome browser. Debug JS, analyse network requests, capture performance traces, and take screenshots.",
    domain: "developer.chrome.com",
    fallbackColor: "bg-yellow-500",
    fallbackInitial: "CD",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "chrome-devtools",
      "chrome-devtools-mcp@latest",
      "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    ),
  },
  {
    id: "resend",
    name: "Resend",
    description:
      "Send transactional and marketing emails via Resend's API. Compose and dispatch emails directly from your AI agent.",
    domain: "resend.com",
    fallbackColor: "bg-neutral-800",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: "claude mcp add resend -- npx -y resend-mcp",
        cliLabel: "Run in terminal (set RESEND_API_KEY + SENDER_EMAIL_ADDRESS env vars)",
        docsUrl: "https://github.com/resend/resend-mcp",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand: "opencode mcp add --name resend -- npx -y resend-mcp",
        cliLabel: "Run in terminal (set RESEND_API_KEY + SENDER_EMAIL_ADDRESS env vars)",
        docsUrl: "https://github.com/resend/resend-mcp",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_YOUR_KEY",
        "SENDER_EMAIL_ADDRESS": "you@yourdomain.com"
      }
    }
  }
}`,
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://github.com/resend/resend-mcp",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_YOUR_KEY",
        "SENDER_EMAIL_ADDRESS": "you@yourdomain.com"
      }
    }
  }
}`,
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://github.com/resend/resend-mcp",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_YOUR_KEY",
        "SENDER_EMAIL_ADDRESS": "you@yourdomain.com"
      }
    }
  }
}`,
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://github.com/resend/resend-mcp",
      },
    ],
  },
  {
    id: "mem0",
    name: "Mem0",
    description:
      "Persistent memory for AI agents. Store and retrieve facts, preferences, and past interactions across conversations.",
    domain: "mem0.ai",
    fallbackColor: "bg-purple-600",
    category: "coding",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: "claude mcp add mem0 -- npx -y @mem0/mcp-server",
        cliLabel: "Run in terminal (set MEM0_API_KEY env var — get key at app.mem0.ai)",
        docsUrl: "https://github.com/mem0ai/mem0-mcp",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand: "opencode mcp add --name mem0 -- npx -y @mem0/mcp-server",
        cliLabel: "Run in terminal (set MEM0_API_KEY env var)",
        docsUrl: "https://github.com/mem0ai/mem0-mcp",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "mem0": {
      "command": "npx",
      "args": ["-y", "@mem0/mcp-server"],
      "env": { "MEM0_API_KEY": "YOUR_MEM0_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://github.com/mem0ai/mem0-mcp",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "mem0": {
      "command": "npx",
      "args": ["-y", "@mem0/mcp-server"],
      "env": { "MEM0_API_KEY": "YOUR_MEM0_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://github.com/mem0ai/mem0-mcp",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "mem0": {
      "command": "npx",
      "args": ["-y", "@mem0/mcp-server"],
      "env": { "MEM0_API_KEY": "YOUR_MEM0_API_KEY" }
    }
  }
}`,
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://github.com/mem0ai/mem0-mcp",
      },
    ],
  },

  // =========================================================================
  // DESIGN
  // =========================================================================
  {
    id: "canva",
    name: "Canva",
    description: "Generate and edit Canva designs, browse templates, and export creative assets.",
    domain: "canva.com",
    fallbackColor: "bg-cyan-600",
    category: "design",
    // No cliCommand/configSnippet available yet — install flow is docs-only.
    status: "coming-soon",
    providers: ["claude", "cursor"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://www.canva.com/developers/",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://www.canva.com/developers/",
      },
    ],
  },
  {
    id: "framer",
    name: "Framer",
    description:
      "Inspect Framer components, extract design tokens, and convert layouts to production code.",
    domain: "framer.com",
    fallbackColor: "bg-blue-500",
    category: "design",
    // No cliCommand/configSnippet available yet — install flow is docs-only.
    status: "coming-soon",
    providers: ["claude", "cursor"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://www.framer.com/developers/",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://www.framer.com/developers/",
      },
    ],
  },
  {
    id: "miro",
    name: "Miro",
    description:
      "Read and create Miro boards, add sticky notes, shapes, and diagrams from your AI assistant.",
    domain: "miro.com",
    fallbackColor: "bg-yellow-500",
    category: "design",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "miro",
      "@miroapp/mcp-server-miro",
      "https://github.com/miroapp/mcp-server-miro",
    ),
  },
  {
    id: "storybook",
    name: "Storybook",
    description:
      "Browse and inspect component stories, test variants, and validate UI documentation.",
    domain: "storybook.js.org",
    fallbackColor: "bg-rose-600",
    category: "design",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("storybook", "@chromatic-com/mcp", "https://github.com/chromaui/mcp"),
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    description:
      "Upload, transform, and manage images and videos. Apply AI tagging, resize, crop, and deliver optimised assets.",
    domain: "cloudinary.com",
    fallbackColor: "bg-blue-500",
    category: "design",
    // Official Cloudinary MCP packages: @cloudinary/asset-management-mcp
    // Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand:
          "claude mcp add cloudinary -- npx -y --package @cloudinary/asset-management-mcp mcp start",
        cliLabel:
          "Run in terminal (set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)",
        docsUrl: "https://github.com/cloudinary/mcp-servers",
      },
      {
        provider: "opencode",
        integrationType: "mcp",
        cliCommand:
          "opencode mcp add --name cloudinary -- npx -y --package @cloudinary/asset-management-mcp mcp start",
        cliLabel: "Run in terminal (set Cloudinary env vars first)",
        docsUrl: "https://github.com/cloudinary/mcp-servers",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "cloudinary": {
      "command": "npx",
      "args": ["-y", "--package", "@cloudinary/asset-management-mcp", "mcp", "start"],
      "env": {
        "CLOUDINARY_CLOUD_NAME": "YOUR_CLOUD_NAME",
        "CLOUDINARY_API_KEY": "YOUR_API_KEY",
        "CLOUDINARY_API_SECRET": "YOUR_API_SECRET"
      }
    }
  }
}`,
        cliLabel: "Merge into .cursor/mcp.json",
        docsUrl: "https://cloudinary.com/documentation/cloudinary_llm_mcp",
      },
      {
        provider: "codex",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "cloudinary": {
      "command": "npx",
      "args": ["-y", "--package", "@cloudinary/asset-management-mcp", "mcp", "start"],
      "env": {
        "CLOUDINARY_CLOUD_NAME": "YOUR_CLOUD_NAME",
        "CLOUDINARY_API_KEY": "YOUR_API_KEY",
        "CLOUDINARY_API_SECRET": "YOUR_API_SECRET"
      }
    }
  }
}`,
        cliLabel: "Merge into ~/.codex/config.json",
        docsUrl: "https://github.com/cloudinary/mcp-servers",
      },
      {
        provider: "gemini",
        integrationType: "mcp",
        cliCommand: null,
        configSnippet: `{
  "mcpServers": {
    "cloudinary": {
      "command": "npx",
      "args": ["-y", "--package", "@cloudinary/asset-management-mcp", "mcp", "start"],
      "env": {
        "CLOUDINARY_CLOUD_NAME": "YOUR_CLOUD_NAME",
        "CLOUDINARY_API_KEY": "YOUR_API_KEY",
        "CLOUDINARY_API_SECRET": "YOUR_API_SECRET"
      }
    }
  }
}`,
        cliLabel: "Merge into ~/.gemini/settings.json",
        docsUrl: "https://github.com/cloudinary/mcp-servers",
      },
    ],
  },

  // =========================================================================
  // PRODUCTIVITY
  // =========================================================================
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Search, read, and create files across Drive, Docs, Sheets, and Slides.",
    domain: "drive.google.com",
    // drive.google.com returns the generic Google G — use the Workspace icon
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
    fallbackColor: "bg-yellow-500",
    fallbackInitial: "D",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("google-drive"),
      ...mcp(
        "gdrive",
        "@modelcontextprotocol/server-gdrive",
        "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
      ),
    ],
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description:
      "Read and create calendar events, check availability, and manage meeting schedules.",
    domain: "calendar.google.com",
    iconUrl:
      "https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg",
    fallbackColor: "bg-blue-500",
    fallbackInitial: "C",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "google-calendar",
      "@googleapis/mcp-server-google-calendar",
      "https://github.com/googleapis/mcp-server-google-calendar",
    ),
  },
  {
    id: "gmail",
    name: "Gmail",
    description:
      "Read, draft, search, and send emails. Manage labels and stay on top of your inbox.",
    domain: "mail.google.com",
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7e/Gmail_icon_%282020%29.svg",
    fallbackColor: "bg-red-500",
    fallbackInitial: "M",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("gmail"),
      ...mcp(
        "gmail",
        "@googleapis/mcp-server-gmail",
        "https://github.com/googleapis/mcp-server-gmail",
      ),
    ],
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Geocode addresses, get directions, search places, and compute distances.",
    domain: "maps.google.com",
    iconUrl: "https://upload.wikimedia.org/wikipedia/commons/a/aa/Google_Maps_icon_%282020%29.svg",
    fallbackColor: "bg-green-600",
    fallbackInitial: "M",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "google-maps",
      "@modelcontextprotocol/server-google-maps",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps",
    ),
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description:
      "Read and write notes in your Obsidian vault. Search across your personal knowledge base.",
    domain: "obsidian.md",
    fallbackColor: "bg-violet-700",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "obsidian",
      "mcp-obsidian",
      "https://github.com/MarkusPfundstein/mcp-obsidian",
    ),
  },
  {
    id: "airtable",
    name: "Airtable",
    description:
      "Query and write records in Airtable bases. Build automations over your structured data.",
    domain: "airtable.com",
    fallbackColor: "bg-yellow-600",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("airtable", "@airtable/mcp-server", "https://github.com/airtable/mcp-server"),
  },
  {
    id: "asana",
    name: "Asana",
    description: "Create and manage tasks, projects, and workflows. Track work across your team.",
    domain: "asana.com",
    fallbackColor: "bg-red-500",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "asana",
      "@asana/mcp-server-asana",
      "https://github.com/Asana/mcp-server-asana",
    ),
  },
  {
    id: "todoist",
    name: "Todoist",
    description: "Create and manage tasks, projects, and priorities. Keep your to-dos in sync.",
    domain: "todoist.com",
    fallbackColor: "bg-red-600",
    category: "productivity",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp(
      "todoist",
      "@abhiz123/todoist-mcp-server",
      "https://github.com/abhiz123/todoist-mcp-server",
    ),
  },

  // =========================================================================
  // COMMUNICATION
  // =========================================================================
  {
    id: "discord",
    name: "Discord",
    description: "Send messages, read channels, manage roles, and search your Discord servers.",
    domain: "discord.com",
    fallbackColor: "bg-indigo-600",
    category: "communication",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("discord", "mcp-discord", "https://github.com/v-3/discordmcp"),
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send and receive Telegram messages, manage bots, and read group conversations.",
    domain: "telegram.org",
    fallbackColor: "bg-sky-500",
    category: "communication",
    // No cliCommand/configSnippet available yet — install flow is docs-only.
    status: "coming-soon",
    providers: ["claude", "cursor"],
    instructions: [
      {
        provider: "claude",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://core.telegram.org/bots/api",
      },
      {
        provider: "cursor",
        integrationType: "mcp",
        cliCommand: null,
        docsUrl: "https://core.telegram.org/bots/api",
      },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description:
      "Query CRM contacts, deals, and companies. Create activities and manage your pipeline.",
    domain: "hubspot.com",
    fallbackColor: "bg-orange-600",
    category: "communication",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("hubspot", "@hubspot/mcp-server", "https://github.com/HubSpot/mcp-server"),
  },
  {
    id: "intercom",
    name: "Intercom",
    description: "Look up customer conversations, create support tickets, and reply to users.",
    domain: "intercom.com",
    fallbackColor: "bg-blue-600",
    category: "communication",
    providers: ["claude", "opencode", "cursor"],
    instructions: mcp(
      "intercom",
      "@intercom/mcp-server-intercom",
      "https://github.com/intercom/mcp-server-intercom",
    ),
  },
  {
    id: "zoom",
    name: "Zoom",
    description: "Schedule meetings, list recordings, manage webinars, and look up contacts.",
    domain: "zoom.us",
    fallbackColor: "bg-blue-600",
    category: "communication",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("zoom", "@zoom/mcp-server", "https://github.com/zoom/mcp-server"),
  },

  // =========================================================================
  // DATA & ANALYTICS
  // =========================================================================
  {
    id: "stripe",
    name: "Stripe",
    description: "Inspect payments, customers, subscriptions, and refunds. Query your Stripe data.",
    domain: "stripe.com",
    fallbackColor: "bg-indigo-500",
    category: "data",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("stripe"),
      ...mcp("stripe", "@stripe/mcp", "https://github.com/stripe/agent-toolkit"),
    ],
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description:
      "Query MongoDB Atlas collections using natural language. Inspect documents and aggregations.",
    domain: "mongodb.com",
    fallbackColor: "bg-green-700",
    category: "data",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: [
      codexPlugin("mongodb"),
      ...mcp(
        "mongodb",
        "@mongodb-js/mongodb-mcp-server",
        "https://github.com/mongodb-js/mongodb-mcp-server",
      ),
    ],
  },
  {
    id: "snowflake",
    name: "Snowflake",
    description:
      "Run SQL against Snowflake data warehouses. Explore schemas and build analytics queries.",
    domain: "snowflake.com",
    fallbackColor: "bg-sky-600",
    category: "data",
    providers: ["claude", "opencode", "cursor", "gemini"],
    instructions: mcp("snowflake", "@snowflake-labs/mcp", "https://github.com/Snowflake-Labs/mcp"),
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    description:
      "Query Mixpanel events and funnel reports. Analyze user behavior and product metrics.",
    domain: "mixpanel.com",
    fallbackColor: "bg-blue-700",
    category: "data",
    providers: ["claude", "opencode", "cursor"],
    instructions: mcp("mixpanel", "@mixpanel/mcp-server", "https://developer.mixpanel.com"),
  },
  {
    id: "sqlite",
    name: "SQLite",
    description:
      "Query local SQLite databases. Perfect for prototyping, local data, and lightweight analytics.",
    domain: "sqlite.org",
    fallbackColor: "bg-sky-700",
    fallbackInitial: "S",
    category: "data",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "sqlite",
      "@modelcontextprotocol/server-sqlite",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    ),
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description:
      "Read, write, and manage local files and directories. Essential for file-based workflows.",
    domain: "nodejs.org",
    fallbackColor: "bg-emerald-600",
    fallbackInitial: "F",
    category: "data",
    providers: ["claude", "opencode", "cursor", "codex", "gemini"],
    instructions: mcp(
      "filesystem",
      "@modelcontextprotocol/server-filesystem",
      "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    ),
  },
];

// ---------------------------------------------------------------------------
// Metadata constants
// ---------------------------------------------------------------------------

export const SECTION_ORDER: { key: PluginCategory; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "coding", label: "Coding & DevOps" },
  { key: "design", label: "Design" },
  { key: "productivity", label: "Productivity" },
  { key: "communication", label: "Communication" },
  { key: "data", label: "Data & Analytics" },
];

export const PROVIDER_LABELS: Record<PluginProvider, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  ollama: "Ollama",
};

/**
 * Domains used for the provider logo favicons in filter pills and dialog rows.
 * Gemini uses gemini.google.com which returns the Gemini star icon (not the G).
 */
export const PROVIDER_DOMAINS: Record<PluginProvider, string> = {
  codex: "openai.com",
  claude: "claude.ai",
  opencode: "opencode.ai",
  cursor: "cursor.com",
  gemini: "gemini.google.com",
  ollama: "ollama.com",
};

export const INTEGRATION_TYPE_LABELS: Record<IntegrationType, string> = {
  plugin: "Plugin",
  mcp: "MCP Server",
  extension: "Extension",
};
