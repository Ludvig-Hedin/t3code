---
title: "Electron Context Menu Icon Limitation and React Overlay Workaround"
aliases:
  [electron-context-menu-icons, native-menu-icons, react-context-menu-overlay, virtual-anchor]
tags: [electron, ui-pattern, context-menus, desktop]
sources:
  - "daily/2026-04-20.md"
created: 2026-04-20
updated: 2026-04-20
---

# Electron Context Menu Icon Limitation and React Overlay Workaround

Native Electron context menus (invoked via `api.contextMenu.show()`) do not support icons in a cross-platform way. When icons are required in right-click menus, the solution is to replace the native OS menu with a custom React overlay using a component system like Base UI's `Menu`/`MenuPopup`. A virtual anchor element positioned at the cursor coordinates preserves the native "right-click feel" while enabling full Lucide icon support. The async Promise contract of the original API is preserved so calling code requires minimal changes.

## Key Points

- **Native Electron menus have no practical icon support** — `api.contextMenu.show()` and Electron's underlying `Menu.buildFromTemplate` support icons only via `nativeImage` objects, which cannot be passed across the IPC bridge as SVG or React components
- **React overlay at cursor position** — a virtual anchor element at `{x: event.clientX, y: event.clientY}` positions the popup precisely at right-click coordinates
- **Same async Promise contract** — `showContextMenu(items, position)` returns a Promise, so all three handler sites (thread, project, multi-select) needed only minimal refactoring
- **Base UI `Menu`/`MenuPopup`** — provides keyboard navigation, focus management, and portal rendering without custom implementation
- **Destructive actions use separators** — `Trash2Icon` / delete is placed last with a visual separator before it

## Details

### Why Native Menus Lack Icons

Electron's `Menu.buildFromTemplate` accepts an `icon` property, but:

- On macOS: icons must be `nativeImage` objects (not SVG or React components)
- On Windows/Linux: icon support is limited or absent
- In an IPC-based bridge (`preload.ts` → `api.contextMenu.show()`), passing `nativeImage` objects across the IPC boundary requires serialization that is impractical for a web-icon workflow

React-rendered menus side-step this entirely: they render in the renderer process where CSS, SVGs, and React component icons work natively.

### Implementation Pattern

```typescript
/** Menu row for the React overlay context menu (native `Menu` templates stay icon-free). */
interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  separator?: "before" | "after";
}

// Shared state for the overlay
interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  resolve: ((value: string | null) => void) | null;
}

// Drop-in replacement for api.contextMenu.show()
function showContextMenu(
  items: ContextMenuItem[],
  position: { x: number; y: number }
): Promise<string | null> {
  return new Promise((resolve) => {
    setContextMenuState({ isOpen: true, position, items, resolve });
  });
}

// Caller — nearly unchanged from native API:
async function handleRightClick(event: React.MouseEvent) {
  event.preventDefault();
  const action = await showContextMenu(
    [
      { id: 'rename', label: 'Rename', icon: <PencilIcon className="h-4 w-4" /> },
      { id: 'archive', label: 'Archive', icon: <ArchiveIcon className="h-4 w-4" /> },
      { id: 'delete', label: 'Delete', icon: <Trash2Icon className="h-4 w-4" />, separator: 'before' },
    ],
    { x: event.clientX, y: event.clientY }
  );
  if (action === 'delete') { /* ... */ }
}
```

### Virtual Anchor Element

Base UI's `Menu` requires an anchor element to position relative to. A virtual element at cursor coordinates replaces a real DOM node:

```typescript
const virtualAnchor = useMemo(() => ({
  getBoundingClientRect: () => DOMRect.fromRect({
    x: position.x,
    y: position.y,
    width: 0,
    height: 0,
  }),
}), [position.x, position.y]);

return (
  <Menu.Root open={isOpen} onOpenChange={handleClose}>
    <Menu.Positioner anchor={virtualAnchor}>
      <MenuPopup items={items} onSelect={handleSelect} />
    </Menu.Positioner>
  </Menu.Root>
);
```

The zero-size bounding rect makes the popup appear exactly at the cursor without offsetting.

### Icon Conventions

The icon set follows the app's Lucide icon vocabulary:

| Action                | Icon                     | Notes                                 |
| --------------------- | ------------------------ | ------------------------------------- |
| Rename                | `PencilIcon`             |                                       |
| Mark unread           | `MailIcon`               |                                       |
| Pin / Unpin           | `PinIcon` / `PinOffIcon` | Toggles                               |
| Archive               | `ArchiveIcon`            |                                       |
| Copy                  | `CopyIcon`               |                                       |
| Duplicate             | `HashIcon`               |                                       |
| Open in code editor   | `CodeIcon`               |                                       |
| Open folder in Finder | `FolderOpenIcon`         |                                       |
| Delete                | `Trash2Icon`             | Separator before, destructive styling |

Destructive actions appear last after a separator, following standard macOS/Windows UX conventions.

## Related Concepts

- [[concepts/lazy-file-tree-rpc-expansion]] — The files panel that uses these context menus for file/directory operations
- [[concepts/settings-ui-management-pattern]] — Another case of building custom React UI where native OS affordances are insufficient
- [[concepts/tool-call-display-humanization]] — Similar principle: custom React rendering provides more visual control than native or default UI elements

## Sources

- [[daily/2026-04-20.md]] — "Native `api.contextMenu.show()` doesn't support icons, so the approach was to replace it with a React-based UI overlay using the existing `Menu`/`MenuPopup` (Base UI) component system"
- [[daily/2026-04-20.md]] — "A virtual anchor element positions the popup at cursor coordinates to preserve right-click feel"
- [[daily/2026-04-20.md]] — "A `showContextMenu(items, position)` Promise-based helper maintained the same async contract as the native API, so action-handling logic stayed unchanged"
- [[daily/2026-04-20.md]] — "Icons chosen: PencilIcon (rename), MailIcon (mark unread), PinIcon/PinOffIcon, ArchiveIcon, CopyIcon, HashIcon, CodeIcon, FolderOpenIcon, Trash2Icon (with separator before delete)"
