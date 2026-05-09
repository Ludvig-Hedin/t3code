/**
 * connectionStatusStore — reactive WebSocket connection state for the UI.
 *
 * The transport layer (wsRpcClient.ts) owns the actual heartbeat and reload
 * logic. This store is a thin presentation layer so banners/indicators can
 * react without any of that logic leaking into components.
 *
 *   "online"        — heartbeat healthy, normal operation
 *   "reconnecting"  — transport just declared dead; we show a banner
 *                     before reloading the page so users know what happened
 */
import { create } from "zustand";

export type ConnectionStatus = "online" | "reconnecting";

interface ConnectionStatusState {
  status: ConnectionStatus;
  reason: string | null;
  setStatus: (status: ConnectionStatus, reason?: string | null) => void;
}

export const useConnectionStatusStore = create<ConnectionStatusState>((set) => ({
  status: "online",
  reason: null,
  setStatus: (status, reason = null) => set({ status, reason }),
}));

/**
 * Imperative setter for non-React call sites (the ws transport layer).
 * Avoids forcing those modules to import the React-scoped hook.
 */
export function setConnectionStatus(status: ConnectionStatus, reason: string | null = null): void {
  useConnectionStatusStore.getState().setStatus(status, reason);
}
