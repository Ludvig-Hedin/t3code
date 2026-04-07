# Changelog

## [2026-04-07] [Feature] Drag-to-reorder auto-switch, Pin to sidebar/project, Filter & Organize sidebar

### Feature 1 — Drag-to-reorder auto-switch

- `handleProjectDragEnd` now auto-captures rendered order and switches `sidebarProjectSortOrder` to `"manual"` on first drag, regardless of current setting.
- `handleProjectDragStart` early-return guard removed — drag now always starts.
- Project list always rendered via `DndContext` + `SortableProjectItem` (no more conditional split).
- Project header drag handle props always applied (not gated on `isManualProjectSorting`).
- `setProjectOrder(ids)` action added to `uiStateStore`.
- New projects in `syncProjects` now **prepend** (unshift) instead of append — most recently added project appears at top.
- Files: `apps/web/src/uiStateStore.ts`, `apps/web/src/components/Sidebar.tsx`

### Feature 2 — Pin to sidebar / Pin to project

- New `pinnedToSidebarThreadIds` and `pinnedToProjectThreadIds` arrays added to `UiState` — persisted in localStorage.
- New actions: `pinToSidebar`, `unpinFromSidebar`, `pinToProject`, `unpinFromProject`.
- Thread context menu has two new conditional items: pin/unpin from sidebar, pin/unpin from project.
- "Pinned" section rendered above the project list in `by_project` mode — each entry shows a `PinIcon` and the project name as a tooltip on hover.
- Pinned-to-project threads float to the top of their project's thread list.
- Files: `apps/web/src/uiStateStore.ts`, `apps/web/src/components/Sidebar.tsx`, `apps/web/src/uiStateStore.test.ts`

### Feature 3 — Filter & Organize button

- New `SlidersHorizontalIcon` button added **left** of the sort button in the sidebar header.
- Opens a `Popover` with two sections:
  - **Organize by**: By Project (default), Chronological, By Provider, By Date — radio-style selection.
  - **Filter**: Projects checklist, Providers checklist, Date buckets checklist (Today/This week/This month/Older), Activity buckets (Has activity / No activity).
- An active-filter dot badge appears on the button when any filter is enabled.
- Non-"by_project" modes render flat or grouped thread lists (`SidebarOrganizedView`).
- Groups show max 10 threads with "View more" / "Show less" expand controls.
- `SidebarOrganizeMode` and `SidebarFilterState` types defined at module level.
- Files: `apps/web/src/components/Sidebar.tsx`
