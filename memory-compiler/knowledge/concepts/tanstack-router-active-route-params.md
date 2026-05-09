---
title: "TanStack Router Active Route Parameter Matching"
aliases: [active-route-state, route-params-sidebar, active-project-highlighting]
tags: [tanstack-router, react, ui-pattern, navigation]
sources:
  - "daily/2026-04-24.md"
created: 2026-04-24
updated: 2026-04-24
---

# TanStack Router Active Route Parameter Matching

When implementing active state highlighting in sidebar navigation (e.g., showing which project is currently selected), route parameters from TanStack Router provide the authoritative source of truth. The pattern uses `useParams` from `@tanstack/react-router` (not `Route.useParams` from a specific file route) so shared components like sidebars can read params outside a `createFileRoute` module. Match the param (e.g., `projectId`) against rendered items to apply active styling so state stays synchronized with the URL.

## Key Points

- **Route params as source of truth** - Use `useParams()` from `@tanstack/react-router` for shared components, or `Route.useParams()` only inside the matching route file
- **Consistent active styling** - Apply the same background/text styles as other active elements (e.g., thread rows use `bg-accent/85`)
- **Type safety** - TanStack Router provides typed route params matching your route definitions
- **Works across navigation types** - Handles direct URL entry, browser back/forward, and programmatic navigation
- **Complements other active states** - Can coexist with expanded/collapsed state, selection state, and hover states

## Details

### Implementation Pattern

```tsx
// In a sidebar component that renders project navigation
import { useNavigate, useParams } from "@tanstack/react-router";

function ProjectSidebar() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams({ strict: false });

  const projects = useProjectStore((s) => s.projects);

  return (
    <div>
      {projects.map((project) => {
        const isActive = project.id === routeProjectId;

        return (
          <SidebarMenuButton
            key={project.id}
            className={isActive ? "bg-accent/85" : ""}
            onClick={() =>
              navigate({
                to: "/_chat/projects/$projectId",
                params: { projectId: project.id },
              })
            }
          >
            {project.name}
          </SidebarMenuButton>
        );
      })}
    </div>
  );
}
```

### Route Definition

The route file defines the parameter structure:

```tsx
// apps/web/src/routes/_chat.projects.$projectId.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_chat/projects/$projectId")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams(); // Type-safe access
  return <ProjectOverviewPage projectId={projectId} />;
}
```

### Active State Consistency

The active styling should match other active elements in the UI for consistency:

```tsx
// Example: Thread rows use bg-accent/85
<div className={isActiveThread ? 'bg-accent/85' : ''}>
  {thread.title}
</div>

// Project rows should use the same style
<div className={isActiveProject ? 'bg-accent/85' : ''}>
  {project.name}
</div>
```

This creates visual coherence — users see the same visual treatment for "current item" across threads, projects, and other navigation elements.

### Why Not Component State?

Using local component state for active highlighting breaks in several scenarios:

**Problem: State goes stale after URL changes**

```tsx
// ❌ BROKEN: State doesn't update when URL changes
const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

<button onClick={() => {
  navigate({ to: '/projects/$projectId', params: { projectId: 'abc' } });
  setActiveProjectId('abc'); // Works for programmatic nav...
}}>
```

But what happens when:

- User clicks browser back button?
- User directly edits the URL?
- Navigation happens from elsewhere in the app?

The `activeProjectId` state becomes stale and doesn't reflect the actual URL.

**Solution: Route params always reflect URL**

```tsx
// ✅ CORRECT: Route params automatically update on any navigation
const { projectId } = Route.useParams();
const isActive = project.id === projectId;
```

Route params update automatically when the URL changes, regardless of how navigation occurred.

### Handling Missing Params

Some routes may not have the parameter defined:

```tsx
const { projectId } = Route.useParams();
// projectId may be undefined if on a different route

const isActive = projectId ? project.id === projectId : false;
```

Or use optional chaining in the comparison:

```tsx
const isActive = project.id === routeParams?.projectId;
```

## Related Concepts

- [[concepts/project-overview-dashboard-pattern]] — The project overview page that uses this pattern
- [[concepts/zustand-selector-reference-stability]] — Store access patterns that complement route param matching
- [[concepts/pending-selection-store-coordination]] — Another pattern for coordinating UI state across components

## Sources

- [[daily/2026-04-24]] — "User requested active background on selected project in sidebar (matching thread active state). Used `routeProjectId` from route params to match active project in sidebar. Applied same `bg-accent/85` active state as thread rows."
