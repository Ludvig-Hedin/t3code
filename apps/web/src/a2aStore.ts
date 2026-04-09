// apps/web/src/a2aStore.ts
/**
 * Client-side Zustand store for A2A (Agent-to-Agent) protocol state.
 *
 * Manages the list of registered agent cards, A2A tasks, and provides
 * actions that call the backend via the shared WS RPC client.
 */
import type { A2aAgentCard, A2aAgentCardId, A2aTask, A2aTaskId } from "@t3tools/contracts";
import { create } from "zustand";

import { getWsRpcClient } from "./wsRpcClient";

// ── Stable empty-array constants ────────────────────────────────────────
// Zustand selectors must return the same reference when empty to avoid
// infinite re-render loops (Object.is comparison). See previewStore.ts.
const EMPTY_AGENTS: A2aAgentCard[] = [];
const EMPTY_TASKS: A2aTask[] = [];

// ── State & Store ───────────────────────────────────────────────────────

interface A2aState {
  agents: A2aAgentCard[];
  tasks: A2aTask[];
  isLoading: boolean;
  error: string | null;
}

interface A2aStore extends A2aState {
  /** Fetch all registered agent cards from the server. */
  fetchAgents: () => Promise<void>;
  /** Register a new remote agent by URL (with optional friendly name). */
  registerAgent: (url: string, name?: string) => Promise<A2aAgentCard>;
  /** Remove a registered agent by its card ID. */
  removeAgent: (id: A2aAgentCardId) => Promise<void>;
  /** Discover (probe) an agent at a URL without persisting it. */
  discoverAgent: (url: string) => Promise<A2aAgentCard>;
  /** Fetch all A2A tasks. */
  fetchTasks: () => Promise<void>;
  /** Send a text message to an agent, creating or continuing a task. */
  sendMessage: (agentCardId: A2aAgentCardId, message: string) => Promise<A2aTask>;
  /** Cancel an in-progress task. */
  cancelTask: (taskId: A2aTaskId) => Promise<void>;
}

export const useA2aStore = create<A2aStore>((set, get) => ({
  agents: [],
  tasks: [],
  isLoading: false,
  error: null,

  fetchAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      const rpc = getWsRpcClient();
      const agents = await rpc.a2a.listAgents();
      set({ agents: [...agents], isLoading: false });
    } catch (err) {
      set({ error: formatError(err), isLoading: false });
    }
  },

  registerAgent: async (url, name) => {
    set({ isLoading: true, error: null });
    try {
      const rpc = getWsRpcClient();
      const card = await rpc.a2a.registerAgent({ url, name });
      // Append to existing agents list
      set((state) => ({
        agents: [...state.agents, card],
        isLoading: false,
      }));
      return card;
    } catch (err) {
      set({ error: formatError(err), isLoading: false });
      throw err;
    }
  },

  removeAgent: async (id) => {
    set({ error: null });
    try {
      const rpc = getWsRpcClient();
      await rpc.a2a.removeAgent({ agentCardId: id });
      // Remove from local state
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== id),
      }));
    } catch (err) {
      set({ error: formatError(err) });
      throw err;
    }
  },

  discoverAgent: async (url) => {
    set({ isLoading: true, error: null });
    try {
      const rpc = getWsRpcClient();
      const card = await rpc.a2a.discoverAgent({ url });
      set({ isLoading: false });
      return card;
    } catch (err) {
      set({ error: formatError(err), isLoading: false });
      throw err;
    }
  },

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const rpc = getWsRpcClient();
      const tasks = await rpc.a2a.listTasks();
      set({ tasks: [...tasks], isLoading: false });
    } catch (err) {
      set({ error: formatError(err), isLoading: false });
    }
  },

  sendMessage: async (agentCardId, message) => {
    set({ error: null });
    try {
      const rpc = getWsRpcClient();
      const result = await rpc.a2a.sendMessage({
        agentCardId,
        message: {
          role: "user",
          parts: [{ type: "text", text: message }],
        },
      });
      // Add or update the task in local state
      set((state) => {
        const idx = state.tasks.findIndex((t) => t.id === result.task.id);
        if (idx >= 0) {
          const next = [...state.tasks];
          next[idx] = result.task;
          return { tasks: next };
        }
        return { tasks: [...state.tasks, result.task] };
      });
      return result.task;
    } catch (err) {
      set({ error: formatError(err) });
      throw err;
    }
  },

  cancelTask: async (taskId) => {
    set({ error: null });
    try {
      const rpc = getWsRpcClient();
      const updated = await rpc.a2a.cancelTask({ taskId });
      // Update in local state
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === taskId ? updated : t)),
      }));
    } catch (err) {
      set({ error: formatError(err) });
      throw err;
    }
  },
}));

// ── Convenience selectors ───────────────────────────────────────────────

/** Returns the agents list, or stable EMPTY_AGENTS when none exist. */
export const selectAgents = (state: A2aStore): A2aAgentCard[] =>
  state.agents.length > 0 ? state.agents : EMPTY_AGENTS;

/** Returns the tasks list, or stable EMPTY_TASKS when none exist. */
export const selectTasks = (state: A2aStore): A2aTask[] =>
  state.tasks.length > 0 ? state.tasks : EMPTY_TASKS;

// ── Helpers ─────────────────────────────────────────────────────────────

function formatError(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return String(err);
}
