---
title: "Project Overview Dashboard with Groups, Todos, and Markdown Notes"
aliases: [project-dashboard, thread-organization, project-notes]
tags: [ui-pattern, state-management, persistence, project-management]
sources:
  - "daily/2026-04-23.md"
  - "daily/2026-04-24.md"
created: 2026-04-23
updated: 2026-04-24
---

# Project Overview Dashboard with Groups, Todos, and Markdown Notes

A project overview dashboard provides a landing page for project-level navigation, showing all threads organized into groups with status badges, a todo list for tracking tasks, and markdown notes for documentation. The pattern uses client-side localStorage persistence via Zustand stores, sidebar navigation split between project name (navigate to overview) and chevron (expand/collapse threads), and Base UI components for consistent styling.

## Key Points

- **Three-section layout** — ProjectSummaryBanner (metadata + open-in-editor), ThreadsSection (groups + ungrouped threads), TodosSection (add/toggle/delete), NotesSection (sidebar + preview/edit)
- **Dual-purpose sidebar navigation** — Click project name → navigate to `/_chat/projects/:id`, click chevron → expand/collapse threads inline
- **localStorage persistence** — Zustand store with debounced writes (500ms) following `filesPanelStore.ts` pattern
- **Thread status badges** — Reuse `resolveThreadStatusPill` from `Sidebar.logic.ts` for consistent active/idle/needs-approval display
- **Markdown preview rendering** — Use existing `ChatMarkdown` component for notes preview with app-consistent styles

## Details

### Store Architecture

The project overview store manages three data types:

**Types** (`projectOverviewStore.ts`):

```typescript
type ProjectGroupId = string & { readonly __brand: "ProjectGroupId" };
type ProjectTodoId = string & { readonly __brand: "ProjectTodoId" };
type ProjectNoteId = string & { readonly __brand: "ProjectNoteId" };

interface ProjectGroup {
  id: ProjectGroupId;
  name: string;
  threadIds: ThreadId[];
  order: number;
}

interface ProjectTodo {
  id: ProjectTodoId;
  text: string;
  completed: boolean;
  /** ISO string — survives `persist` + `createJSONStorage` round-trips; convert to `Date` at use sites if needed. */
  createdAt: string;
}

interface ProjectNote {
  id: ProjectNoteId;
  title: string;
  content: string; // Markdown
  /** ISO string — same persistence rationale as `ProjectTodo.createdAt`. */
  lastModified: string;
  /** Optional linked file on disk (e.g. when the note mirrors a .md file). */
  file?: string;
}

interface ProjectOverviewState {
  // Keyed by ProjectId
  groupsByProject: Record<string, ProjectGroup[]>;
  todosByProject: Record<string, ProjectTodo[]>;
  notesByProject: Record<string, ProjectNote[]>;
}
```

**Store implementation:**

```typescript
import { randomUUID } from "@/lib/utils";

const generateId = () => randomUUID();

export const useProjectOverviewStore = create<ProjectOverviewStore>()(
  persist(
    (set, get) => ({
      groupsByProject: {},
      todosByProject: {},
      notesByProject: {},

      // Groups
      createGroup: (projectId, name) =>
        set((s) => {
          const groups = s.groupsByProject[projectId] ?? [];
          const newGroup: ProjectGroup = {
            id: generateId(),
            name,
            threadIds: [],
            order: groups.length,
          };
          return {
            groupsByProject: {
              ...s.groupsByProject,
              [projectId]: [...groups, newGroup],
            },
          };
        }),

      assignThreadToGroup: (projectId, threadId, groupId) =>
        set((s) => {
          const groups = s.groupsByProject[projectId] ?? [];
          return {
            groupsByProject: {
              ...s.groupsByProject,
              [projectId]: groups.map((g) =>
                g.id === groupId ? { ...g, threadIds: [...g.threadIds, threadId] } : g,
              ),
            },
          };
        }),

      // Todos
      addTodo: (projectId, text) =>
        set((s) => {
          const todos = s.todosByProject[projectId] ?? [];
          const newTodo: ProjectTodo = {
            id: generateId(),
            text,
            completed: false,
            createdAt: new Date().toISOString(),
          };
          return {
            todosByProject: {
              ...s.todosByProject,
              [projectId]: [...todos, newTodo],
            },
          };
        }),

      toggleTodo: (projectId, todoId) =>
        set((s) => ({
          todosByProject: {
            ...s.todosByProject,
            [projectId]: s.todosByProject[projectId].map((t) =>
              t.id === todoId ? { ...t, completed: !t.completed } : t,
            ),
          },
        })),

      // Notes
      createNote: (projectId, title) =>
        set((s) => {
          const notes = s.notesByProject[projectId] ?? [];
          const newNote: ProjectNote = {
            id: generateId(),
            title,
            content: "",
            lastModified: new Date().toISOString(),
          };
          return {
            notesByProject: {
              ...s.notesByProject,
              [projectId]: [...notes, newNote],
            },
          };
        }),

      updateNoteContent: (projectId, noteId, content) =>
        set((s) => ({
          notesByProject: {
            ...s.notesByProject,
            [projectId]: s.notesByProject[projectId].map((n) =>
              n.id === noteId ? { ...n, content, lastModified: new Date().toISOString() } : n,
            ),
          },
        })),
    }),
    {
      name: "t3code:project-overview:v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
```

**Debounced persistence** (following `filesPanelStore.ts` pattern): debounce `setItem` via a small storage adapter instead of `onRehydrateStorage` (which runs once on rehydrate and does not intercept normal persist writes):

```typescript
import { Debouncer } from "@tanstack/react-pacer";

const debouncer = new Debouncer(500);

function createDebouncedStorage(): Storage {
  const memory = new Map<string, string>();
  return {
    get length() {
      return memory.size;
    },
    clear() {
      memory.clear();
      debouncer.schedule(() => localStorage.removeItem("t3code:project-overview:v1"));
    },
    getItem(key: string) {
      if (memory.has(key)) return memory.get(key) ?? null;
      return localStorage.getItem(key);
    },
    key(index: number) {
      return localStorage.key(index);
    },
    removeItem(key: string) {
      memory.delete(key);
      debouncer.schedule(() => localStorage.removeItem(key));
    },
    setItem(key: string, value: string) {
      memory.set(key, value);
      debouncer.schedule(() => localStorage.setItem(key, value));
    },
  };
}

// persist(..., { storage: createJSONStorage(createDebouncedStorage), ... })
```

### Component Structure

**ProjectOverviewPage** (`apps/web/src/components/ProjectOverviewPage.tsx`):

```tsx
export function ProjectOverviewPage({ projectId }: { projectId: ProjectId }) {
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  const threads = useThreadStore((s) => s.threads.filter((t) => t.projectId === projectId));
  const groups = useProjectOverviewStore((s) => s.groupsByProject[projectId] ?? []);
  const todos = useProjectOverviewStore((s) => s.todosByProject[projectId] ?? []);
  const notes = useProjectOverviewStore((s) => s.notesByProject[projectId] ?? []);
  const createGroup = useProjectOverviewStore((s) => s.createGroup);
  const assignThreadToGroup = useProjectOverviewStore((s) => s.assignThreadToGroup);
  const addTodo = useProjectOverviewStore((s) => s.addTodo);
  const toggleTodo = useProjectOverviewStore((s) => s.toggleTodo);
  const deleteTodo = useProjectOverviewStore((s) => s.deleteTodo);
  const createNote = useProjectOverviewStore((s) => s.createNote);
  const updateNoteContent = useProjectOverviewStore((s) => s.updateNoteContent);
  const deleteNote = useProjectOverviewStore((s) => s.deleteNote);

  return (
    <div className="project-overview">
      <ProjectSummaryBanner project={project} />
      <ThreadsSection
        projectId={projectId}
        threads={threads}
        groups={groups}
        onCreateGroup={createGroup}
        onAssignThread={assignThreadToGroup}
      />
      <TodosSection todos={todos} onAdd={addTodo} onToggle={toggleTodo} onDelete={deleteTodo} />
      <NotesSection
        projectId={projectId}
        notes={notes}
        onCreate={createNote}
        onUpdate={updateNoteContent}
        onDelete={deleteNote}
        projectCwd={project.cwd}
      />
    </div>
  );
}
```

**ThreadsSection with groups:**

```tsx
function ThreadsSection({
  projectId,
  threads,
  groups,
  onCreateGroup,
  onAssignThread,
}: {
  projectId: ProjectId;
  threads: Thread[];
  groups: ProjectGroup[];
  onCreateGroup: (projectId: ProjectId, name: string) => void;
  onAssignThread: (projectId: ProjectId, threadId: ThreadId, groupId: ProjectGroupId) => void;
}) {
  const groupedThreadIds = new Set(groups.flatMap((g) => g.threadIds));

  const ungroupedThreads = threads.filter((t) => !groupedThreadIds.has(t.id));

  return (
    <section>
      <h2>Threads</h2>
      <Button onClick={() => onCreateGroup(projectId, "New Group")}>
        <Plus /> Add Group
      </Button>

      {groups.map((group) => (
        <div key={group.id} className="thread-group">
          <h3>{group.name}</h3>
          {threads
            .filter((t) => group.threadIds.includes(t.id))
            .map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                statusPill={resolveThreadStatusPill(thread)}
              />
            ))}
        </div>
      ))}

      <div className="ungrouped-threads">
        <h3>Ungrouped</h3>
        {ungroupedThreads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            statusPill={resolveThreadStatusPill(thread)}
            actions={
              <Menu>
                <MenuButton>⋮</MenuButton>
                <MenuItems>
                  {groups.map((group) => (
                    <MenuItem
                      key={group.id}
                      onSelect={() => onAssignThread(projectId, thread.id, group.id)}
                    >
                      Move to {group.name}
                    </MenuItem>
                  ))}
                </MenuItems>
              </Menu>
            }
          />
        ))}
      </div>
    </section>
  );
}
```

**NotesSection with markdown preview:**

```tsx
function NotesSection({
  projectId,
  notes,
  onCreate,
  onUpdate,
  onDelete,
  projectCwd,
}: {
  projectId: ProjectId;
  notes: ProjectNote[];
  onCreate: (projectId: ProjectId, title: string) => void;
  onUpdate: (projectId: ProjectId, noteId: ProjectNoteId, content: string) => void;
  onDelete: (projectId: ProjectId, noteId: ProjectNoteId) => void;
  projectCwd: string;
}) {
  const [selectedNoteId, setSelectedNoteId] = useState<ProjectNoteId | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  return (
    <section className="notes-section">
      <aside className="notes-sidebar">
        <Button onClick={() => onCreate(projectId, "New Note")}>
          <Plus /> New Note
        </Button>
        {notes.map((note) => (
          <button
            key={note.id}
            className={selectedNoteId === note.id ? "active" : ""}
            onClick={() => setSelectedNoteId(note.id)}
          >
            {note.title}
          </button>
        ))}
      </aside>

      <div className="notes-main">
        {selectedNote ? (
          <>
            <div className="notes-toolbar">
              <Button onClick={() => setIsEditing(!isEditing)}>
                {isEditing ? "Preview" : "Edit"}
              </Button>
              <Button
                disabled={!selectedNote.file}
                onClick={() =>
                  selectedNote.file
                    ? openInPreferredEditor(projectCwd, selectedNote.file)
                    : undefined
                }
              >
                Open in Editor
              </Button>
            </div>

            {isEditing ? (
              <Textarea
                value={selectedNote.content}
                onChange={(e) => onUpdate(projectId, selectedNote.id, e.target.value)}
                className="notes-editor"
              />
            ) : (
              <div className="notes-preview">
                <ChatMarkdown content={selectedNote.content} />
              </div>
            )}
          </>
        ) : (
          <div className="notes-empty">Select a note or create a new one</div>
        )}
      </div>
    </section>
  );
}
```

### Sidebar Navigation Split

The sidebar must handle two distinct click targets:

**Implementation** (`apps/web/src/components/Sidebar.tsx`):

```tsx
function ProjectRow({ project }) {
  const navigate = useNavigate();
  const { toggleProject, isProjectExpanded } = useSidebarStore();

  return (
    <div className="project-row">
      {/* Outer button: navigate to overview */}
      <button
        onClick={() =>
          navigate({
            to: "/_chat/projects/$projectId",
            params: { projectId: project.id },
          })
        }
        className="project-title-button"
      >
        {project.name}
      </button>

      {/* Inner button: toggle expand/collapse */}
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent outer button click
          toggleProject(project.id);
        }}
        className="project-chevron-button"
      >
        {isProjectExpanded(project.id) ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
```

**Key insight:** Nested buttons with `event.stopPropagation()` on the inner button prevent click delegation to the outer button, preserving keyboard navigation and drag-drop behavior on the outer button.

### Routing Integration

The project overview page lives at `/_chat/projects/$projectId` to inherit sidebar layout:

**Route file** (`apps/web/src/routes/_chat.projects.$projectId.tsx`):

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { ProjectOverviewPage } from "@/components/ProjectOverviewPage";
import { ProjectId } from "@t3tools/contracts";

export const Route = createFileRoute("/_chat/projects/$projectId")({
  component: ProjectOverview,
});

function ProjectOverview() {
  const { projectId } = Route.useParams();

  return <ProjectOverviewPage projectId={ProjectId.makeUnsafe(projectId)} />;
}
```

## Related Concepts

- [[concepts/lazy-file-tree-rpc-expansion]] — Similar localStorage persistence pattern with Zustand
- [[concepts/settings-ui-management-pattern]] — Similar multi-section settings UI with CRUD operations
- [[concepts/pending-selection-store-coordination]] — Store-mediated coordination between components
- [[concepts/dynamic-wizard-step-filtering]] — Similar navigation state management with filtered arrays
- [[concepts/tool-call-display-humanization]] — Reuse of existing UI components (ChatMarkdown) for consistency

## Sources

- [[daily/2026-04-23]] — "Create `ProjectOverviewPage.tsx` (~800 lines) with sections: ProjectSummaryBanner, ThreadsSection (groups + ungrouped threads with Menu assignment), TodosSection (add/edit/toggle/delete/clear), NotesSection (sidebar + preview/edit toggle with ChatMarkdown rendering)"
- [[daily/2026-04-23]] — "Sidebar modification: Chevron button inside project row with `stopPropagation()` → calls `toggleProject(project.id)`; outer button → `navigate({ to: '/projects/$projectId' })`"
- [[daily/2026-04-23]] — "Create `projectOverviewStore.ts` with types `ProjectGroupId`, `ProjectTodoId`, `ProjectNoteId` and methods for CRUD on groups/todos/notes, persisted via debounced localStorage under `t3code:project-overview:v1`"
- [[daily/2026-04-23]] — "Use `resolveThreadStatusPill` from `Sidebar.logic.ts` returns `{ type, textColor, bgColor, label }` for consistent status badge rendering across sidebar + project overview"
- [[daily/2026-04-24]] — "User requested five new features: 1. Docs section showing relevant .md files. 2. Thread list capped at 10 with show more/less + status badges. 3. Full-screen file explorer modal. 4. Group management in sidebar with drag-to-group and bulk actions. 5. File creation capability. Implemented all five features in one comprehensive update to ProjectOverviewPage.tsx."
