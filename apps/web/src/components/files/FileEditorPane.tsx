/**
 * FileEditorPane — CodeMirror 6 editor for the Files panel.
 *
 * Responsibilities:
 *  - Load file contents via `projects.readFile`, skeleton while pending.
 *  - Render CodeMirror with a language extension picked from the file path.
 *  - Track dirty state against the last-saved snapshot; persist it through
 *    the shared `useFilesPanelStore` so it survives panel toggles.
 *  - Save on `Cmd/Ctrl+S` or a toolbar button via `projects.writeFile`.
 *  - Theme follows `useTheme()` (light / dark GitHub) so it matches the app.
 *
 * CodeMirror is loaded lazily so the ~200 KB payload only hits users who open
 * the editor — the tree view doesn't need it.
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { languages as defaultLanguageData } from "@codemirror/language-data";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  LanguageDescription,
  StreamLanguage,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import type { EditorId, ProjectReadFileResult } from "@t3tools/contracts";
import { EDITORS } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  EyeIcon,
  FolderClosedIcon,
  PencilLineIcon,
  SaveIcon,
  XIcon,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ensureNativeApi, readNativeApi } from "~/nativeApi";
import { usePreferredEditor } from "~/editorPreferences";
import { EDITOR_ICONS } from "~/editorIcons";
import { useFilesPanelStore } from "~/filesPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { useServerAvailableEditors } from "~/rpc/serverState";
import { isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import type { Icon } from "../Icons";

const ChatMarkdown = lazy(() => import("../ChatMarkdown"));

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown", "mdown", "mkd"]);

function isMarkdownPath(path: string): boolean {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return false;
  return MARKDOWN_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Last path segment of the workspace root ("…/my-project" → "my-project").
 * Falls back to "/" for edge cases so the breadcrumb never renders empty.
 */
function cwdLabel(cwd: string): string {
  const cleaned = cwd.replace(/\/+$/, "");
  const idx = cleaned.lastIndexOf("/");
  return idx === -1 ? cleaned || "/" : cleaned.slice(idx + 1) || "/";
}

export interface FileEditorPaneProps {
  cwd: string;
  relativePath: string;
  /** If provided, renders a × button in the toolbar that calls this. */
  onClose?: () => void;
}

interface LoadedFile {
  readFile: ProjectReadFileResult;
  savedContents: string;
  isBinary: boolean;
}

/**
 * Client-side binary sniff: any NUL byte is a strong binary signal. Keeps the
 * contract simple (server returns a plain string) while still letting the UI
 * short-circuit rendering when a file isn't safe to drop into CodeMirror.
 */
function looksBinary(contents: string): boolean {
  return contents.includes("\u0000");
}

const MONO_FONT =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

// Prec.highest so this font theme beats any color theme (github-dark/light) that
// comes later in the extensions array and might otherwise clobber font properties.
const FILE_EDITOR_FONT_THEME = Prec.highest(
  EditorView.theme({
    "&": { fontSize: "11px", fontFamily: MONO_FONT },
    ".cm-scroller": { fontFamily: MONO_FONT, fontSize: "11px", lineHeight: "1.5" },
    ".cm-content": { fontFamily: MONO_FONT, fontSize: "11px", lineHeight: "1.5", padding: "4px 0 80px" },
    ".cm-gutters": {
      fontFamily: MONO_FONT,
      fontSize: "10px",
      lineHeight: "1.5",
      borderRight: "none",
      background: "transparent",
    },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 4px", minWidth: "28px" },
    ".cm-foldGutter .cm-gutterElement": { width: "12px", padding: "0 2px" },
  }),
);

const baseExtensionsSingleton = buildBaseExtensions();

function buildBaseExtensions() {
  return [
    FILE_EDITOR_FONT_THEME,
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    indentUnit.of("  "),
    EditorView.lineWrapping,
  ];
}

export function FileEditorPane({ cwd, relativePath, onClose }: FileEditorPaneProps) {
  const { resolvedTheme } = useTheme();
  const setDirty = useFilesPanelStore((s) => s.setDirty);
  const clearDirty = useFilesPanelStore((s) => s.clearDirty);
  const dirtyContents = useFilesPanelStore((s) => s.dirtyByPath[relativePath]);
  const hasDirtyBuffer = dirtyContents !== undefined;

  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Markdown view mode — default to "rendered" for .md files, "source" otherwise.
  // Stored per-(cwd,path) via remount key so switching tabs resets to the default.
  const isMarkdown = useMemo(() => isMarkdownPath(relativePath), [relativePath]);
  const [markdownMode, setMarkdownMode] = useState<"rendered" | "source">(() =>
    isMarkdown ? "rendered" : "source",
  );
  useEffect(() => {
    setMarkdownMode(isMarkdown ? "rendered" : "source");
  }, [isMarkdown, cwd, relativePath]);

  const availableEditors = useServerAvailableEditors();
  const [preferredEditor, setPreferredEditor] = usePreferredEditor(availableEditors);

  const handleOpenInEditor = useCallback(
    async (editorId: EditorId | null) => {
      const api = readNativeApi();
      if (!api) return;
      const editor = editorId ?? preferredEditor;
      if (!editor) {
        toastManager.add({
          type: "error",
          title: "No editor available",
          description: "No supported editor was detected on your machine.",
        });
        return;
      }
      // Server side expects an absolute path.
      const absolutePath = relativePath.startsWith("/")
        ? relativePath
        : `${cwd.replace(/\/+$/, "")}/${relativePath}`;
      try {
        await api.shell.openInEditor(absolutePath, editor);
        setPreferredEditor(editor);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Couldn't open in editor",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [cwd, relativePath, preferredEditor, setPreferredEditor],
  );

  const fileQuery = useQuery({
    queryKey: ["projects", "read-file", cwd, relativePath],
    queryFn: async () => {
      const api = ensureNativeApi();
      const result = await api.projects.readFile({ cwd, relativePath });
      if (!result) {
        throw new Error("File not found.");
      }
      return result;
    },
    // Don't refetch on window focus — a silent reload could clobber unsaved
    // edits. The user can re-select the file to refresh.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  // Sync the initial load into local state so the editor has a source of truth
  // for "saved" contents that stays stable even if the query refetches. The
  // `key={cwd::relativePath}` on <CodeMirrorEditor> below guarantees the view
  // remounts when the file changes, so we don't need to guard against stale
  // data here — React Query already keys the query by [cwd, relativePath].
  useEffect(() => {
    if (!fileQuery.data) return;
    const rawContents = fileQuery.data.contents ?? "";
    const isBinary = looksBinary(rawContents);
    const savedContents = isBinary ? "" : rawContents;
    setLoaded({ readFile: fileQuery.data, savedContents, isBinary });
  }, [fileQuery.data]);

  const handleSave = useCallback(async () => {
    if (!loaded) return;
    if (loaded.isBinary) return;
    const next = dirtyContents ?? loaded.savedContents;
    if (next === loaded.savedContents) {
      // Nothing to save. Still clear dirty flag just in case.
      clearDirty(relativePath);
      return;
    }
    setIsSaving(true);
    try {
      const api = ensureNativeApi();
      await api.projects.writeFile({ cwd, relativePath, contents: next });
      const latestAfterSave = useFilesPanelStore.getState().dirtyByPath[relativePath];
      const latestAfterSaveUsed = latestAfterSave === undefined ? next : latestAfterSave;
      setLoaded({
        readFile: loaded.readFile,
        savedContents: next,
        isBinary: false,
      });
      if (latestAfterSaveUsed === next) {
        clearDirty(relativePath);
      }
      toastManager.add({ type: "success", title: `Saved ${relativePath}` });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Save failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  }, [loaded, dirtyContents, cwd, relativePath, clearDirty]);

  // Keep a ref to the current save handler so the CodeMirror keymap closure
  // (created once per mount) always calls the latest version.
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  if (fileQuery.isPending) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
        Loading file…
      </div>
    );
  }
  if (fileQuery.isError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-xs text-destructive">
        <span>Failed to load file.</span>
        <span className="max-w-xs truncate text-[10px] text-muted-foreground">
          {fileQuery.error instanceof Error ? fileQuery.error.message : String(fileQuery.error)}
        </span>
      </div>
    );
  }
  if (!loaded) {
    return null;
  }

  if (loaded.isBinary) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
        Binary file — preview is not supported.
      </div>
    );
  }

  const dirty = hasDirtyBuffer && dirtyContents !== loaded.savedContents;
  const currentContents = dirtyContents ?? loaded.savedContents;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileEditorBreadcrumbs cwd={cwd} relativePath={relativePath} dirty={dirty} />
      <FileEditorToolbar
        dirty={dirty}
        saving={isSaving}
        isMarkdown={isMarkdown}
        markdownMode={markdownMode}
        onToggleMarkdownMode={() =>
          setMarkdownMode((mode) => (mode === "rendered" ? "source" : "rendered"))
        }
        onSave={handleSave}
        availableEditors={availableEditors}
        preferredEditor={preferredEditor}
        onOpenInEditor={handleOpenInEditor}
        {...(onClose ? { onClose } : {})}
      />
      {isMarkdown && markdownMode === "rendered" ? (
        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <Suspense
            fallback={<div className="text-xs text-muted-foreground/70">Rendering markdown…</div>}
          >
            <ChatMarkdown text={currentContents} cwd={cwd} allowHtml />
          </Suspense>
        </div>
      ) : (
        <CodeMirrorEditor
          key={`${cwd}::${relativePath}`}
          initialContents={loaded.savedContents}
          currentContents={currentContents}
          filePath={relativePath}
          theme={resolvedTheme}
          // Selection is stashed in the store by content-search hits; consume
          // it on mount so opening a hit jumps the cursor + scrolls it into
          // view. Safe to call during render since the store setter only fires
          // when a selection is pending.
          onReady={(view) => {
            const selection = useFilesPanelStore.getState().consumePendingSelection();
            if (!selection) return;
            applyEditorSelection(view, selection);
          }}
          onChange={(value) => {
            if (value === loaded.savedContents) {
              clearDirty(relativePath);
              return;
            }
            setDirty(relativePath, value);
          }}
          onSave={() => {
            void handleSaveRef.current();
          }}
        />
      )}
    </div>
  );
}

function FileEditorBreadcrumbs({
  cwd,
  relativePath,
  dirty,
}: {
  cwd: string;
  relativePath: string;
  dirty: boolean;
}) {
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  const rootLabel = cwdLabel(cwd);
  return (
    <div className="flex min-h-[26px] shrink-0 items-center gap-1 truncate border-b border-border/40 bg-background px-3 text-[11px] text-muted-foreground">
      <span className="shrink-0 text-muted-foreground/70">{rootLabel}</span>
      {segments.map((segment, idx) => {
        const isLast = idx === segments.length - 1;
        return (
          <span key={`${segment}-${idx}`} className="flex min-w-0 items-center gap-1">
            <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/40" aria-hidden />
            <span
              className={
                isLast
                  ? "truncate font-medium text-foreground/90"
                  : "truncate text-muted-foreground/70"
              }
            >
              {isLast && dirty ? "● " : ""}
              {segment}
            </span>
          </span>
        );
      })}
    </div>
  );
}

interface EditorPickerOption {
  value: EditorId;
  label: string;
  Icon: Icon;
}

/**
 * Build the list of editor choices for the split-button dropdown, filtered to
 * editors actually detected on the user's machine. Mirrors the header's
 * OpenInPicker so Files-panel behaviour matches the rest of the app.
 */
function resolveEditorOptions(
  platform: string,
  availableEditors: ReadonlyArray<EditorId>,
): ReadonlyArray<EditorPickerOption> {
  return EDITORS.flatMap((editor): ReadonlyArray<EditorPickerOption> => {
    if (!availableEditors.includes(editor.id)) return [];
    const icon = EDITOR_ICONS[editor.id];
    if (!icon) return [];
    if (editor.id === "file-manager") {
      return [
        {
          value: editor.id,
          label: isMacPlatform(platform)
            ? "Finder"
            : isWindowsPlatform(platform)
              ? "Explorer"
              : "Files",
          Icon: FolderClosedIcon as unknown as Icon,
        },
      ];
    }
    return [{ value: editor.id, label: editor.label, Icon: icon }];
  });
}

function FileEditorToolbar(props: {
  dirty: boolean;
  saving: boolean;
  isMarkdown: boolean;
  markdownMode: "rendered" | "source";
  availableEditors: ReadonlyArray<EditorId>;
  preferredEditor: EditorId | null;
  onToggleMarkdownMode: () => void;
  onSave: () => void | Promise<void>;
  onOpenInEditor: (editorId: EditorId | null) => void | Promise<void>;
  onClose?: () => void;
}) {
  const options = useMemo(
    () => resolveEditorOptions(navigator.platform, props.availableEditors),
    [props.availableEditors],
  );
  const primaryOption =
    options.find((option) => option.value === props.preferredEditor) ?? options[0] ?? null;

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border/40 bg-background px-1.5">
      {props.isMarkdown && (
        <button
          type="button"
          aria-pressed={props.markdownMode === "rendered"}
          className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={props.onToggleMarkdownMode}
          title={
            props.markdownMode === "rendered" ? "Show raw markdown source" : "Show rendered preview"
          }
        >
          {props.markdownMode === "rendered" ? (
            <>
              <PencilLineIcon className="size-3.5" />
              Raw
            </>
          ) : (
            <>
              <EyeIcon className="size-3.5" />
              Preview
            </>
          )}
        </button>
      )}
      <div className="flex-1" />
      {/* Split button: primary label + chevron for dropdown — flat, no border */}
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={!primaryOption}
          className="flex items-center gap-1.5 rounded-l px-2 py-0.5 text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => void props.onOpenInEditor(primaryOption?.value ?? null)}
          title={
            primaryOption
              ? `Open this file in ${primaryOption.label}`
              : "No supported editor detected"
          }
        >
          {primaryOption ? (
            <primaryOption.Icon aria-hidden="true" className="size-3.5" />
          ) : (
            <ExternalLinkIcon className="size-3.5" />
          )}
          {primaryOption ? primaryOption.label : "Open in editor"}
        </button>
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label="Choose editor"
                disabled={options.length === 0}
                className="flex size-5 items-center justify-center rounded-r text-muted-foreground/50 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronDownIcon className="size-3" aria-hidden="true" />
              </button>
            }
          />
          <MenuPopup align="end">
            {options.length === 0 && <MenuItem disabled>No installed editors found</MenuItem>}
            {options.map(({ value, label, Icon }) => (
              <MenuItem key={value} onClick={() => void props.onOpenInEditor(value)}>
                <Icon aria-hidden="true" className="text-muted-foreground" />
                {label}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      </div>
      <div className="mx-1 h-3.5 w-px bg-border/50" />
      <button
        type="button"
        className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:opacity-30"
        disabled={!props.dirty || props.saving}
        onClick={() => void props.onSave()}
      >
        <SaveIcon className="size-3.5" />
        {props.saving ? "Saving…" : "Save"}
      </button>
      {props.onClose && (
        <button
          type="button"
          aria-label="Close editor"
          className="ml-0.5 flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-muted/60 hover:text-foreground"
          onClick={props.onClose}
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

interface CodeMirrorEditorProps {
  initialContents: string;
  currentContents: string;
  filePath: string;
  theme: "light" | "dark";
  onChange: (value: string) => void;
  onSave: () => void;
  /** Fires once the view is mounted, before the language extension loads. */
  onReady?: (view: EditorView) => void;
}

function CodeMirrorEditor({
  initialContents,
  currentContents,
  filePath,
  theme,
  onChange,
  onSave,
  onReady,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment()).current;
  const languageCompartment = useRef(new Compartment()).current;

  // Remember the latest callbacks without forcing the view to re-mount.
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Initial mount — create the EditorView once per (cwd,path) keyed remount.
  useEffect(() => {
    if (!containerRef.current) return;
    const state = EditorState.create({
      doc: initialContents,
      extensions: [
        ...baseExtensionsSingleton,
        themeCompartment.of(theme === "dark" ? githubDark : githubLight),
        languageCompartment.of([]),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              onSaveRef.current();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // Let the caller seed cursor / selection before the language extension
    // kicks in so content-search hits jump to the right line immediately.
    onReadyRef.current?.(view);

    // Load the language extension asynchronously so the initial paint isn't
    // blocked by tokenizer lookup.
    void resolveLanguageExtension(filePath).then((extension) => {
      if (!viewRef.current) return;
      viewRef.current.dispatch({
        effects: languageCompartment.reconfigure(extension ? [extension] : []),
      });
    });

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme compartment when resolvedTheme changes.
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(theme === "dark" ? githubDark : githubLight),
    });
  }, [theme, themeCompartment]);

  // If the incoming `currentContents` differs from the view's doc (e.g. the
  // dirty buffer was cleared externally after a save), replace the document
  // and restore the selection clamped to the new length (full replacement can
  // otherwise reset or invalidate the cursor).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    if (docText === currentContents) return;
    const { anchor, head } = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: currentContents },
    });
    const newLen = view.state.doc.length;
    const clamp = (pos: number) => Math.min(pos, newLen);
    view.dispatch({
      selection: { anchor: clamp(anchor), head: clamp(head) },
    });
  }, [currentContents]);

  return <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" />;
}

// Move the cursor to a 1-based (line, column) pair and scroll the target
// into the middle of the viewport. Used by content-search hits; tolerant of
// out-of-range line/column values so a stale hit never throws.
function applyEditorSelection(view: EditorView, selection: { line: number; column: number }) {
  const doc = view.state.doc;
  const safeLine = Math.max(1, Math.min(selection.line, doc.lines));
  const lineInfo = doc.line(safeLine);
  const column = Math.max(1, selection.column);
  // Column is 1-based; clamp to the line length so we don't step past the
  // newline character.
  const pos = Math.min(lineInfo.from + (column - 1), lineInfo.to);
  view.dispatch({
    selection: { anchor: pos, head: pos },
    scrollIntoView: true,
  });
  // Let the browser settle the scroll before focusing to avoid a jump flash.
  requestAnimationFrame(() => {
    view.focus();
  });
}

// Custom StreamLanguage for .env files (KEY=VALUE pairs with # comments).
// language-data has no entry for .env so we define it inline.
interface EnvState { phase: "key" | "value" }
const envLanguage = StreamLanguage.define<EnvState>({
  startState: () => ({ phase: "key" }),
  token(stream, state) {
    if (stream.sol()) state.phase = "key";
    if (state.phase === "key") {
      if (stream.match(/^#/)) { stream.skipToEnd(); return "comment"; }
      if (stream.match(/^export\b/)) return "keyword";
      if (stream.eatSpace()) return null;
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return "def";
      if (stream.eat("=")) { state.phase = "value"; return "operator"; }
    } else {
      if (
        stream.match(/^"(?:[^"\\]|\\.)*"/) ||
        stream.match(/^'(?:[^'\\]|\\.)*'/) ||
        stream.match(/^`(?:[^`\\]|\\.)*`/)
      ) return "string";
      if (!stream.eol()) { stream.skipToEnd(); return "string"; }
    }
    stream.next();
    return null;
  },
  copyState: (s) => ({ ...s }),
});

// Filenames (no extension) that map to a language-data entry name.
const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  Dockerfile: "Dockerfile",
  dockerfile: "Dockerfile",
  Makefile: "Shell",
  makefile: "Shell",
  GNUmakefile: "Shell",
  ".bashrc": "Shell",
  ".zshrc": "Shell",
  ".profile": "Shell",
  ".bash_profile": "Shell",
  ".bash_aliases": "Shell",
  ".gitconfig": "Properties files",
  ".npmrc": "Properties files",
  ".yarnrc": "Properties files",
  "nginx.conf": "Nginx",
  Procfile: "Shell",
};

// Pick a CodeMirror language extension based on the file path.
// Checks custom env/filename mappings before the language-data registry.
async function resolveLanguageExtension(filePath: string) {
  const filename = filePath.split("/").pop() ?? "";

  // .env, .env.local, .env.production, .env.example, etc.
  if (filename === ".env" || /^\.env\./.test(filename) || /^\.env$/.test(filename)) {
    return envLanguage;
  }

  // Filenames that have no extension but a known language.
  const byName = FILENAME_LANGUAGE_MAP[filename];
  if (byName) {
    const desc = defaultLanguageData.find((d) => d.name === byName);
    if (desc) {
      try { return await desc.load(); } catch { return null; }
    }
  }

  const description = LanguageDescription.matchFilename(defaultLanguageData, filePath);
  if (!description) return null;
  try {
    return await description.load();
  } catch {
    return null;
  }
}
