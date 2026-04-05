/**
 * Tiny global store for the search modal open/close state.
 * Extracted so both Sidebar.tsx and SidebarCollapsedControls can share it
 * without prop drilling.
 */
import { create } from "zustand";

interface SearchModalState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSearchModalStore = create<SearchModalState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
