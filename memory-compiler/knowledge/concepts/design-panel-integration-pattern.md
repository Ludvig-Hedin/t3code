---
title: "Design Panel Integration Pattern for Visual Editing"
aliases: [design-panel, visual-editor-integration, onlook-integration]
tags: [architecture, ui, design-tools, full-stack]
sources:
  - "daily/2026-04-23.md"
created: 2026-04-23
updated: 2026-04-23
---

# Design Panel Integration Pattern for Visual Editing

Integrating visual editing capabilities into a development environment requires coordinated implementation across server detection, client UI, runtime bridge, and persistence. The Design panel implementation follows a phased approach: Phase 1 establishes basic plumbing (RPC discovery, toggle UI), Phase 2 builds the runtime bridge (OID stamper/resolver), and Phase 3 delivers full visual editing (inspector, live updates, structural operations). The pattern reuses existing preview infrastructure while adding design-specific capabilities.

## Key Points

- **Reuse preview detection** - Align with `scanProjectEntries` to ensure design app IDs match preview URLs, preventing blank iframe issues
- **Runtime bridge protocol** - Babel transform injects OIDs during dev build; postMessage bridge exposes tree + editing operations
- **Phased implementation** - Phase 1 (plumbing + gating), Phase 2 (OID infrastructure), Phase 3 (inspector + live edits), Phase 4+ (layers, AI context)
- **Auto-start preview sessions** - Design panel selection triggers `preview.start` RPC to ensure dev server is running before iframe loads
- **Onlook-inspired UX** - Canvas-hero layout with compact toolbar, URL bar for navigation, collapsible Layers sidebar, Inspector bottom drawer

## Details

### Phase 1: Plumbing and Gating

The initial phase establishes basic infrastructure:

**Server-side contracts** (`packages/contracts/src/design.ts`):

```typescript
export const DesignAppEntrySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  path: Schema.String,
  hasReact: Schema.Boolean,
});

export const DiscoverDesignAppsResponseSchema = Schema.Struct({
  apps: Schema.Array(DesignAppEntrySchema),
});
```

**RPC handler** (`apps/server/src/design/`):

```typescript
class DesignService extends Effect.Service<DesignService>()("DesignService", {
  scoped: Effect.gen(function* () {
    return {
      discoverDesignApps: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const preview = yield* PreviewServerManager;
          const entries = yield* preview.scanProjectEntries(projectId);

          // Filter: runnable browser apps with React
          const designApps = entries.filter((e) => e.type === "browser" && e.hasReact);

          return { apps: designApps };
        }),
    };
  }),
}) {}
```

**Client store** (`apps/web/src/designPanelStore.ts`):

```typescript
interface DesignPanelStore {
  isOpen: boolean;
  selectedAppId: string | null;
  toggle: () => void;
  selectApp: (appId: string) => void;
}

export const useDesignPanelStore = create<DesignPanelStore>()(
  persist(
    (set) => ({
      isOpen: false,
      selectedAppId: null,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      selectApp: (appId) => set({ selectedAppId: appId }),
    }),
    { name: "t3code:design-panel:v1" },
  ),
);
```

**UI integration** (`apps/web/src/components/ChatHeader.tsx`):

```tsx
const { data: designApps } = useQuery({
  queryKey: ["design.discoverDesignApps", activeProject?.id],
  queryFn: () => rpc.call("design.discoverDesignApps", { projectId }),
  enabled: !!activeProject,
});

const designAvailable = (designApps?.apps.length ?? 0) > 0;

<ToggleButton
  icon={<LayoutGrid className="h-4 w-4" />}
  label="Design"
  isActive={isDesignOpen}
  onClick={toggleDesign}
  disabled={!designAvailable}
/>;
```

### Phase 2: OID Infrastructure

The second phase implements the Object ID (OID) system for element tracking:

**Babel transform** (`apps/server/src/design/OidStamper.ts`):

```typescript
export function babelPluginOidStamper(): PluginObj {
  return {
    visitor: {
      JSXOpeningElement(path) {
        const { node } = path;
        const oid = generateOid(); // uuid-based

        node.attributes.push(t.jsxAttribute(t.jsxIdentifier("data-oid"), t.stringLiteral(oid)));
      },
    },
  };
}
```

**Runtime resolver** (`apps/server/src/design/designRuntime.ts`):

```typescript
export function resolveOidToSourceLocation(
  oid: string,
  projectRoot: string,
): { file: string; line: number; column: number } | null {
  const sourcemap = loadSourcemap(projectRoot);
  const entry = sourcemap.oids[oid];

  if (!entry) return null;

  return {
    file: entry.file,
    line: entry.line,
    column: entry.column,
  };
}
```

**Bridge initialization** (`apps/web/src/design/bridge.ts`):

```typescript
function iframeOriginFromSrc(src: string): string {
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return window.location.origin;
  }
}

export function initDesignBridge(iframe: HTMLIFrameElement) {
  const expectedOrigin = iframeOriginFromSrc(iframe.src);

  const handler = (event: MessageEvent) => {
    if (event.origin !== expectedOrigin) return;
    if (event.source !== iframe.contentWindow) return;
    if (event.data.type === "design:tree") {
      const tree = event.data.payload;
      updateComponentTree(tree);
    }
  };

  window.addEventListener("message", handler);

  iframe.contentWindow?.postMessage({ type: "design:getTree" }, expectedOrigin);

  return () => window.removeEventListener("message", handler);
}
```

### Phase 3: Visual Editing

The third phase delivers full editing capabilities:

**Inspector UI** (`apps/web/src/components/design/Inspector.tsx`):

```tsx
function Inspector({ selectedElement }) {
  const [activeTab, setActiveTab] = useState<"styles" | "layout">("styles");

  return (
    <div className="inspector-drawer">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="styles">Styles</TabsTrigger>
          <TabsTrigger value="layout">Layout</TabsTrigger>
        </TabsList>

        <TabsContent value="styles">
          <StylesEditor element={selectedElement} onEdit={(edit) => applyEdit(edit)} />
        </TabsContent>

        <TabsContent value="layout">
          <LayoutInspector element={selectedElement} />
        </TabsContent>
      </Tabs>

      <AskAIButton element={selectedElement} />
    </div>
  );
}
```

**Live style updates** (`apps/server/src/design/EditApplier.ts`):

```typescript
export function applyEdit(edit: DesignEditOp, projectRoot: string): Effect.Effect<void> {
  return Effect.gen(function* () {
    const location = yield* resolveOidToSourceLocation(edit.oid, projectRoot);

    if (edit.type === "updateClassName") {
      yield* updateClassNameInSource(location, edit.className);
      yield* triggerHotReload(projectRoot);
    }

    if (edit.type === "updateTextContent") {
      yield* updateTextContentInSource(location, edit.textContent);
      yield* triggerHotReload(projectRoot);
    }
  });
}
```

**Structural operations** (wrap, unwrap, duplicate, delete):

```typescript
export function applyStructuralEdit(
  edit: StructuralEditOp,
  projectRoot: string,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const ast = yield* parseSourceFile(edit.file);
    const node = yield* findNodeByOid(ast, edit.oid);

    switch (edit.type) {
      case "wrap":
        yield* wrapNode(ast, node, edit.wrapperTag);
        break;
      case "unwrap":
        yield* unwrapNode(ast, node);
        break;
      case "duplicate":
        yield* duplicateNode(ast, node);
        break;
      case "delete":
        yield* deleteNode(ast, node);
        break;
    }

    yield* writeSourceFile(edit.file, ast);
    yield* triggerHotReload(projectRoot);
  });
}
```

### Detection Alignment Pattern

The most critical lesson: design detection must align with preview detection to avoid ID mismatches:

**❌ Wrong (separate detection logic):**

```typescript
// Design detection catches library packages
const isReactApp = (pkg) => pkg.dependencies?.react || pkg.peerDependencies?.react;

const designApps = allPackages.filter(isReactApp);
// Returns: ["web", "email", "ui"] — includes libraries!
```

**✅ Correct (reuse preview detection):**

```typescript
// Prefer an explicit API flag when available; otherwise centralize the id heuristic.
function isStandalonePreviewId(id: string): boolean {
  return id.startsWith("preview-file") || id.includes("/preview-file");
}

// Reuse preview's scanProjectEntries
const entries = yield * preview.scanProjectEntries(projectId);

const designApps = entries.filter(
  (e) => e.type === "browser" && !isStandalonePreviewId(e.id) && e.hasReact,
);
// Returns: ["web"] — only runnable browser apps
```

This ensures design app IDs (`web`) match preview URLs (`/preview/:projectId/web/*`), preventing blank iframes.

### Auto-Start Pattern

Design panel must auto-start preview sessions:

```typescript
useEffect(() => {
  if (!selectedAppId || !previewSession) return;

  if (previewSession.status !== "running") {
    // Auto-start dev server
    rpc.call("preview.start", { projectId, appId: selectedAppId });
  }
}, [selectedAppId, previewSession]);
```

This mirrors PreviewPanel behavior: selecting an app ensures its dev server is running before the iframe loads.

## Related Concepts

- [[concepts/lazy-file-tree-rpc-expansion]] — Similar RPC-driven UI pattern with lazy loading
- [[concepts/systematic-feature-implementation-phases]] — Design follows the 8-phase implementation pattern
- [[concepts/rpc-layer-expansion-pattern]] — Adding design RPC methods follows contracts-first pattern
- [[concepts/effect-services-layers-pattern]] — DesignService follows Effect service layer structure
- [[concepts/pending-selection-store-coordination]] — Similar store-mediated coordination pattern

## Sources

- [[daily/2026-04-23]] — "Phase 1 scope: minimal toggle in ChatHeader, empty panel shell, app discovery RPC"
- [[daily/2026-04-23]] — "Align Design detection with preview detection by exporting `scanProjectEntries`... Guarantees ID alignment with `/preview/:projectId/:appId/` routes"
- [[daily/2026-04-23]] — "Auto-start dev server via `preview.start` when app selected and not running"
- [[daily/2026-04-23]] — "Complete DesignPanel UX rewrite to Onlook pattern: canvas as hero, compact toolbar with URL bar, AppSelector popover, collapsible Layers sidebar, Inspector bottom drawer"
- [[daily/2026-04-23]] — "Phase 3 implemented full end-to-end visual editing with inspector UI and live style updates"
