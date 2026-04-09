// apps/web/src/components/settings/A2aAgentsPanel.tsx
/**
 * Settings panel for managing A2A (Agent-to-Agent) protocol agents.
 *
 * Allows users to:
 * - View registered agents (local + remote) with metadata
 * - Discover and register new remote agents by URL
 * - Remove registered agents
 * - Inspect agent skills and capabilities in an expandable detail view
 *
 * Follows the same layout/styling patterns as McpAndPluginsPanel.tsx.
 */
import {
  ChevronDownIcon,
  ChevronRightIcon,
  GlobeIcon,
  HardDriveIcon,
  LoaderIcon,
  NetworkIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { A2aAgentCard } from "@t3tools/contracts";

import { useA2aStore } from "../../a2aStore";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./SettingsLayout";

// ── Add Agent Form ──────────────────────────────────────────────────────────

function AddAgentForm({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoveredCard, setDiscoveredCard] = useState<A2aAgentCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { discoverAgent, registerAgent } = useA2aStore();

  async function handleDiscover() {
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }
    setDiscovering(true);
    setError(null);
    setDiscoveredCard(null);
    try {
      const card = await discoverAgent(url.trim());
      setDiscoveredCard(card);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setDiscovering(false);
    }
  }

  async function handleRegister() {
    if (!url.trim()) {
      setError("URL is required.");
      return;
    }
    setError(null);
    try {
      await registerAgent(url.trim(), name.trim() || undefined);
      toastManager.add({ type: "success", title: "Agent registered successfully" });
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toastManager.add({ type: "error", title: "Failed to register agent", description: message });
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="a2a-agent-url" className="text-xs font-medium text-muted-foreground">
          Agent URL
        </label>
        <Input
          id="a2a-agent-url"
          placeholder="https://agent.example.com/.well-known/agent.json"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleDiscover();
          }}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="a2a-agent-name" className="text-xs font-medium text-muted-foreground">
          Display name (optional)
        </label>
        <Input
          id="a2a-agent-name"
          placeholder="My Remote Agent"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Discovery result preview */}
      {discoveredCard && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-foreground">
            Discovered: {discoveredCard.name}
          </p>
          {discoveredCard.description && (
            <p className="text-xs text-muted-foreground">{discoveredCard.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {discoveredCard.skills.length} skill{discoveredCard.skills.length !== 1 ? "s" : ""} ·
            Streaming: {discoveredCard.capabilities.streaming ? "yes" : "no"}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="xs" variant="outline" onClick={() => void handleDiscover()} disabled={discovering}>
          {discovering ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <SearchIcon className="size-3.5" />
          )}
          Discover
        </Button>
        <Button size="xs" variant="default" onClick={() => void handleRegister()} disabled={discovering}>
          <PlusIcon className="size-3.5" />
          Register
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Agent Detail (expandable) ───────────────────────────────────────────────

function AgentCardRow({ agent }: { agent: A2aAgentCard }) {
  const [open, setOpen] = useState(false);
  const { removeAgent } = useA2aStore();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!window.confirm(`Remove agent "${agent.name}"?`)) return;
    setRemoving(true);
    try {
      await removeAgent(agent.id);
      toastManager.add({ type: "success", title: `Removed agent "${agent.name}"` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toastManager.add({ type: "error", title: "Failed to remove agent", description: message });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {open ? (
              <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-medium text-foreground">{agent.name}</span>
            {/* Source badge */}
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 text-xs text-muted-foreground">
              {agent.source === "local" ? (
                <HardDriveIcon className="size-3" />
              ) : (
                <GlobeIcon className="size-3" />
              )}
              {agent.source}
            </span>
            {/* Skill count */}
            <span className="text-xs text-muted-foreground">
              {agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}
            </span>
          </CollapsibleTrigger>

          <div className="ml-2 flex shrink-0 items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${agent.name}`}
              className="text-destructive hover:text-destructive"
              disabled={removing}
              onClick={() => void handleRemove()}
            >
              {removing ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <Trash2Icon className="size-3.5" />
              )}
            </Button>
          </div>
        </div>

        <CollapsiblePanel>
          <div className="mt-2 space-y-2 pl-6">
            {/* URL */}
            <p className="truncate text-xs text-muted-foreground">{agent.url}</p>

            {/* Description */}
            {agent.description && (
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            )}

            {/* Capabilities */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <ZapIcon className="size-3" />
                Streaming: {agent.capabilities.streaming ? "yes" : "no"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Push: {agent.capabilities.pushNotifications ? "yes" : "no"}
              </span>
              {agent.version && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  v{agent.version}
                </span>
              )}
            </div>

            {/* Skills list */}
            {agent.skills.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Skills</p>
                <div className="space-y-1">
                  {agent.skills.map((skill) => (
                    <div
                      key={skill.id}
                      className="rounded border border-border bg-background px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{skill.name}</span>
                        {skill.tags && skill.tags.length > 0 && (
                          <div className="flex gap-1">
                            {skill.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-muted px-1 text-[10px] text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {skill.description && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {skill.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}

// ── Agents Section ──────────────────────────────────────────────────────────

function AgentsSection() {
  const { agents, isLoading, error, fetchAgents } = useA2aStore();
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch agents on mount
  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleAddDone = useCallback(() => {
    setShowAddForm(false);
    // Re-fetch to ensure consistency
    void fetchAgents();
  }, [fetchAgents]);

  return (
    <SettingsSection
      title="A2A Agents"
      icon={<NetworkIcon className="size-4" />}
      headerAction={
        !showAddForm ? (
          <Button size="xs" variant="outline" onClick={() => setShowAddForm(true)}>
            <PlusIcon className="size-3.5" />
            Add Agent
          </Button>
        ) : undefined
      }
    >
      <SettingsRow>
        {/* Add agent form (inline, toggled) */}
        {showAddForm && <AddAgentForm onDone={handleAddDone} />}

        {/* Loading state */}
        {isLoading && agents.length === 0 && (
          <div className="flex items-center gap-2 py-2">
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading agents...</span>
          </div>
        )}

        {/* Error state */}
        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* Empty state */}
        {!isLoading && !error && agents.length === 0 && !showAddForm && (
          <p className="text-xs text-muted-foreground">
            No A2A agents registered. Add a remote agent to get started.
          </p>
        )}

        {/* Agent list */}
        {agents.length > 0 && (
          <div className="space-y-2">
            {agents.map((agent) => (
              <AgentCardRow key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}

// ── Exported Panel ──────────────────────────────────────────────────────────

export function A2aAgentsPanel() {
  return (
    <SettingsPageContainer>
      {/* Page header — same pattern as McpAndPluginsPanel */}
      <div className="flex items-center gap-2">
        <NetworkIcon className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">A2A Agents</h1>
      </div>

      <AgentsSection />
    </SettingsPageContainer>
  );
}
