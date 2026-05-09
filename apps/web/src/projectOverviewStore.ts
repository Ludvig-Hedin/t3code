/**
 * projectOverviewStore — client-side state for the Project Overview page.
 *
 * Owns per-project user-curated data that the Bird Code server does not
 * persist:
 *   - thread groups (user-defined labels + optional thread membership)
 *   - project todos (simple checklist)
 *   - project notes (markdown documents with inline preview)
 *
 * Persisted via debounced localStorage under `t3code:project-overview:v1`.
 * Session-only slices (open note, dirty note buffers) are kept out of the
 * persisted payload so tabs reopen clean.
 */
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";

const PERSISTED_STATE_KEY = "t3code:project-overview:v1";

export type ProjectGroupId = string & { __projectGroupId: true };
export type ProjectTodoId = string & { __projectTodoId: true };
export type ProjectNoteId = string & { __projectNoteId: true };

export interface ProjectThreadGroup {
  id: ProjectGroupId;
  name: string;
  threadIds: ThreadId[];
  createdAt: string;
}

export interface ProjectTodo {
  id: ProjectTodoId;
  text: string;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface ProjectNote {
  id: ProjectNoteId;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOverviewBucket {
  groups: ProjectThreadGroup[];
  todos: ProjectTodo[];
  notes: ProjectNote[];
  activeNoteId: ProjectNoteId | null;
}

export interface ProjectOverviewState {
  byProjectId: Record<string, ProjectOverviewBucket>;

  addGroup: (projectId: ProjectId, name: string) => ProjectGroupId | null;
  renameGroup: (projectId: ProjectId, groupId: ProjectGroupId, name: string) => void;
  deleteGroup: (projectId: ProjectId, groupId: ProjectGroupId) => void;
  setThreadGroup: (
    projectId: ProjectId,
    threadId: ThreadId,
    groupId: ProjectGroupId | null,
  ) => void;

  addTodo: (projectId: ProjectId, text: string) => ProjectTodoId | null;
  toggleTodo: (projectId: ProjectId, todoId: ProjectTodoId) => void;
  editTodo: (projectId: ProjectId, todoId: ProjectTodoId, text: string) => void;
  deleteTodo: (projectId: ProjectId, todoId: ProjectTodoId) => void;
  clearCompletedTodos: (projectId: ProjectId) => void;

  addNote: (projectId: ProjectId, name: string) => ProjectNoteId;
  renameNote: (projectId: ProjectId, noteId: ProjectNoteId, name: string) => void;
  updateNoteContent: (projectId: ProjectId, noteId: ProjectNoteId, content: string) => void;
  deleteNote: (projectId: ProjectId, noteId: ProjectNoteId) => void;
  setActiveNote: (projectId: ProjectId, noteId: ProjectNoteId | null) => void;
}

interface PersistedProjectOverviewBucket {
  groups?: ProjectThreadGroup[];
  todos?: ProjectTodo[];
  notes?: ProjectNote[];
}

interface PersistedProjectOverviewState {
  byProjectId?: Record<string, PersistedProjectOverviewBucket>;
}

const EMPTY_BUCKET: ProjectOverviewBucket = Object.freeze({
  groups: [],
  todos: [],
  notes: [],
  activeNoteId: null,
}) as ProjectOverviewBucket;

function randomId<T extends string>(prefix: string): T {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" && "crypto" in globalThis
      ? (globalThis as unknown as { crypto?: Crypto }).crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `${prefix}_${cryptoObj.randomUUID()}` as T;
  }
  const rand = Math.random().toString(36).slice(2, 10);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${rand}` as T;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeThreadIds(ids: unknown): ThreadId[] {
  if (!Array.isArray(ids)) return [];
  const out: ThreadId[] = [];
  const seen = new Set<string>();
  for (const entry of ids) {
    if (typeof entry !== "string" || entry.length === 0 || seen.has(entry)) continue;
    seen.add(entry);
    out.push(ThreadId.makeUnsafe(entry));
  }
  return out;
}

function sanitizeGroups(groups: unknown): ProjectThreadGroup[] {
  if (!Array.isArray(groups)) return [];
  const out: ProjectThreadGroup[] = [];
  for (const entry of groups) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<ProjectThreadGroup>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    out.push({
      id: raw.id as ProjectGroupId,
      name: raw.name,
      threadIds: sanitizeThreadIds(raw.threadIds),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
    });
  }
  return out;
}

function sanitizeTodos(todos: unknown): ProjectTodo[] {
  if (!Array.isArray(todos)) return [];
  const out: ProjectTodo[] = [];
  for (const entry of todos) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<ProjectTodo>;
    if (typeof raw.id !== "string" || typeof raw.text !== "string") continue;
    out.push({
      id: raw.id as ProjectTodoId,
      text: raw.text,
      done: raw.done === true,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : nowIso(),
      completedAt: typeof raw.completedAt === "string" ? raw.completedAt : null,
    });
  }
  return out;
}

function sanitizeNotes(notes: unknown): ProjectNote[] {
  if (!Array.isArray(notes)) return [];
  const out: ProjectNote[] = [];
  for (const entry of notes) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<ProjectNote>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string") continue;
    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : nowIso();
    out.push({
      id: raw.id as ProjectNoteId,
      name: raw.name,
      content: typeof raw.content === "string" ? raw.content : "",
      createdAt,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    });
  }
  return out;
}

function readPersistedState(): Pick<ProjectOverviewState, "byProjectId"> {
  if (typeof window === "undefined") return { byProjectId: {} };
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) return { byProjectId: {} };
    const parsed = JSON.parse(raw) as PersistedProjectOverviewState;
    const byProjectId: Record<string, ProjectOverviewBucket> = {};
    for (const [projectId, bucket] of Object.entries(parsed.byProjectId ?? {})) {
      if (!projectId || !bucket) continue;
      byProjectId[projectId] = {
        groups: sanitizeGroups(bucket.groups),
        todos: sanitizeTodos(bucket.todos),
        notes: sanitizeNotes(bucket.notes),
        activeNoteId: null,
      };
    }
    return { byProjectId };
  } catch {
    return { byProjectId: {} };
  }
}

function persistState(state: ProjectOverviewState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: PersistedProjectOverviewState = {
      byProjectId: Object.fromEntries(
        Object.entries(state.byProjectId).map(([projectId, bucket]) => [
          projectId,
          {
            groups: bucket.groups,
            todos: bucket.todos,
            notes: bucket.notes,
          } satisfies PersistedProjectOverviewBucket,
        ]),
      ),
    };
    window.localStorage.setItem(PERSISTED_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota errors — they should not break overview UX.
  }
}

const debouncedPersist = new Debouncer(persistState, { wait: 400 });

function ensureBucket(
  byProjectId: Record<string, ProjectOverviewBucket>,
  projectId: ProjectId,
): ProjectOverviewBucket {
  return byProjectId[projectId] ?? EMPTY_BUCKET;
}

function writeBucket(
  byProjectId: Record<string, ProjectOverviewBucket>,
  projectId: ProjectId,
  patch: Partial<ProjectOverviewBucket>,
): Record<string, ProjectOverviewBucket> {
  const previous = ensureBucket(byProjectId, projectId);
  return {
    ...byProjectId,
    [projectId]: {
      ...previous,
      ...patch,
    },
  };
}

function removeThreadIdFromGroups(
  groups: ProjectThreadGroup[],
  threadId: ThreadId,
): ProjectThreadGroup[] {
  let changed = false;
  const next = groups.map((group) => {
    if (!group.threadIds.includes(threadId)) return group;
    changed = true;
    return {
      ...group,
      threadIds: group.threadIds.filter((id) => id !== threadId),
    };
  });
  return changed ? next : groups;
}

export const useProjectOverviewStore = create<ProjectOverviewState>((set, get) => ({
  ...readPersistedState(),

  addGroup: (projectId, name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return null;
    const id = randomId<ProjectGroupId>("grp");
    set((state) => ({
      byProjectId: writeBucket(state.byProjectId, projectId, {
        groups: [
          ...ensureBucket(state.byProjectId, projectId).groups,
          { id, name: trimmed, threadIds: [], createdAt: nowIso() },
        ],
      }),
    }));
    debouncedPersist.maybeExecute(get());
    return id;
  },

  renameGroup: (projectId, groupId, name) => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.groups.map((group) =>
        group.id === groupId ? { ...group, name: trimmed } : group,
      );
      return { byProjectId: writeBucket(state.byProjectId, projectId, { groups: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  deleteGroup: (projectId, groupId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.groups.filter((group) => group.id !== groupId);
      return { byProjectId: writeBucket(state.byProjectId, projectId, { groups: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  setThreadGroup: (projectId, threadId, groupId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const removed = removeThreadIdFromGroups(bucket.groups, threadId);
      const next =
        groupId === null
          ? removed
          : removed.map((group) =>
              group.id === groupId
                ? { ...group, threadIds: [threadId, ...group.threadIds] }
                : group,
            );
      return { byProjectId: writeBucket(state.byProjectId, projectId, { groups: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  addTodo: (projectId, text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return null;
    const id = randomId<ProjectTodoId>("todo");
    set((state) => ({
      byProjectId: writeBucket(state.byProjectId, projectId, {
        todos: [
          { id, text: trimmed, done: false, createdAt: nowIso(), completedAt: null },
          ...ensureBucket(state.byProjectId, projectId).todos,
        ],
      }),
    }));
    debouncedPersist.maybeExecute(get());
    return id;
  },

  toggleTodo: (projectId, todoId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        const done = !todo.done;
        return {
          ...todo,
          done,
          completedAt: done ? nowIso() : null,
        };
      });
      return { byProjectId: writeBucket(state.byProjectId, projectId, { todos: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  editTodo: (projectId, todoId, text) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.todos.map((todo) =>
        todo.id === todoId ? { ...todo, text: trimmed } : todo,
      );
      return { byProjectId: writeBucket(state.byProjectId, projectId, { todos: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  deleteTodo: (projectId, todoId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.todos.filter((todo) => todo.id !== todoId);
      return { byProjectId: writeBucket(state.byProjectId, projectId, { todos: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  clearCompletedTodos: (projectId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.todos.filter((todo) => !todo.done);
      if (next.length === bucket.todos.length) return { byProjectId: state.byProjectId };
      return { byProjectId: writeBucket(state.byProjectId, projectId, { todos: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  addNote: (projectId, name) => {
    const trimmed = name.trim().length === 0 ? "Untitled" : name.trim();
    const id = randomId<ProjectNoteId>("note");
    const createdAt = nowIso();
    set((state) => ({
      byProjectId: writeBucket(state.byProjectId, projectId, {
        notes: [
          {
            id,
            name: trimmed,
            content: "",
            createdAt,
            updatedAt: createdAt,
          },
          ...ensureBucket(state.byProjectId, projectId).notes,
        ],
        activeNoteId: id,
      }),
    }));
    debouncedPersist.maybeExecute(get());
    return id;
  },

  renameNote: (projectId, noteId, name) => {
    const trimmed = name.trim().length === 0 ? "Untitled" : name.trim();
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.notes.map((note) =>
        note.id === noteId ? { ...note, name: trimmed, updatedAt: nowIso() } : note,
      );
      return { byProjectId: writeBucket(state.byProjectId, projectId, { notes: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  updateNoteContent: (projectId, noteId, content) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.notes.map((note) =>
        note.id === noteId ? { ...note, content, updatedAt: nowIso() } : note,
      );
      return { byProjectId: writeBucket(state.byProjectId, projectId, { notes: next }) };
    });
    debouncedPersist.maybeExecute(get());
  },

  deleteNote: (projectId, noteId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      const next = bucket.notes.filter((note) => note.id !== noteId);
      const activeNoteId = bucket.activeNoteId === noteId ? null : bucket.activeNoteId;
      return {
        byProjectId: writeBucket(state.byProjectId, projectId, {
          notes: next,
          activeNoteId,
        }),
      };
    });
    debouncedPersist.maybeExecute(get());
  },

  setActiveNote: (projectId, noteId) => {
    set((state) => {
      const bucket = ensureBucket(state.byProjectId, projectId);
      if (bucket.activeNoteId === noteId) return { byProjectId: state.byProjectId };
      return {
        byProjectId: writeBucket(state.byProjectId, projectId, { activeNoteId: noteId }),
      };
    });
    // activeNoteId is intentionally session-only — skip persisting.
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    debouncedPersist.flush();
  });
}

export function selectProjectBucket(projectId: ProjectId) {
  return (state: ProjectOverviewState): ProjectOverviewBucket =>
    state.byProjectId[projectId] ?? EMPTY_BUCKET;
}
