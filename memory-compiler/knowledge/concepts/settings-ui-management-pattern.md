---
title: "Settings UI Management Pattern for External Integrations"
aliases: [settings-panel, integration-management, ui-management]
tags: [ui, configuration, user-experience]
sources:
  - "daily/2026-04-09.md"
created: 2026-04-09
updated: 2026-04-09
---

# Settings UI Management Pattern for External Integrations

External integrations (like A2A agents) are best managed through a dedicated Settings panel that provides discover, register, and remove operations. This pattern centralizes integration management in one UI location, making it discoverable and easy to manage. The panel typically includes discovery results, a list of registered agents, and actions to add/remove integrations.

## Key Points

- **Centralized management** - All integrations live in one Settings panel
- **Discover operation** - Query available agents/services and display results
- **Register operation** - Add discovered agents to the local configuration
- **Remove operation** - Delete managed agents
- **Transactional UI** - Operations provide feedback (loading, success, error states)
- **Persistence** - Registered agents stored in configuration/database for session persistence

## Details

### Settings Panel Layout

A typical integration settings panel includes:

**Discovery Section**

- Input field for discovering agents (e.g., enter remote agent URL)
- "Discover" button that queries the discovery endpoint
- List of available agents with details (name, description, methods)

**Registered Section**

- List of currently registered agents
- For each: name, status (connected/disconnected), button to remove
- Optional: test/verify connection button

**Actions**

- Register: Add selected agent from discovery results
- Remove: Delete a registered agent
- Refresh: Re-query discovery endpoint

### Example Flow

1. User opens Settings → A2A Agents
2. User enters remote agent URL and clicks "Discover"
3. Panel queries `/a2a/agents` on that URL
4. Results displayed: list of available agents
5. User clicks "Register" on desired agent
6. Agent added to local configuration
7. Next session, registered agents are available in the UI

### Implementation Pattern

```typescript
// React component structure
function A2aSettingsPanel() {
  const [discoveredAgents, setDiscoveredAgents] = useState([]);
  const [registeredAgents, setRegisteredAgents] = useState([]);

  async function handleDiscover(url: string) {
    const response = await fetch(`${url}/a2a/agents`);
    const { agents } = await response.json();
    setDiscoveredAgents(agents);
  }

  async function handleRegister(agent: AgentCard) {
    await api.registerAgent(agent);
    setRegisteredAgents([...registeredAgents, agent]);
  }

  async function handleRemove(agentId: string) {
    await api.unregisterAgent(agentId);
    setRegisteredAgents(registeredAgents.filter((a) => a.id !== agentId));
  }
}
```

### UX Considerations

- **Loading states** - Show spinners while discovering/registering
- **Error handling** - Display clear messages if discovery or registration fails
- **Validation** - Validate URLs before querying; catch network errors gracefully
- **Feedback** - Toast notifications for success/failure
- **List pagination** - If many agents, paginate results

## Related Concepts

- [[concepts/agent-discovery-endpoints]] - Discovery results populate this UI
- [[concepts/http-endpoint-authentication-patterns]] - Auth tokens configured in settings
- [[concepts/provider-adapter-shape-pattern]] - Registered agents become providers in the adapter registry

## Sources

- [[daily/2026-04-09]] - "Web UI includes Settings panel for managing A2A agents with discover/register/remove capabilities"
