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
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
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
import type { ProjectReadFileResult } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import { SaveIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ensureNativeApi } from "~/nativeApi";
import { useFilesPanelStore } from "~/filesPanelStore";
import { useTheme } from "~/hooks/useTheme";
import { toastManager } from "../ui/toast";

export interface FileEditorPaneProps {
  cwd: string;
  relativePath: string;
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

const baseExtensionsSingleton = buildBaseExtensions();

function buildBaseExtensions() {
  return [
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

export function FileEditorPane({ cwd, relativePath }: FileEditorPaneProps) {
  const { resolvedTheme } = useTheme();
  const setDirty = useFilesPanelStore((s) => s.setDirty);
  const clearDirty = useFilesPanelStore((s) => s.clearDirty);
  const dirtyContents = useFilesPanelStore((s) => s.dirtyByPath[relativePath]);
  const hasDirtyBuffer = dirtyContents !== undefined;

  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
      setLoaded({ readFile: loaded.readFile, savedContents: next, isBinary: false });
      clearDirty(relativePath);
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
          {fileQuery.error instanceof Error
            ? fileQuery.error.message
            : String(fileQuery.error)}
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FileEditorToolbar
        relativePath={relativePath}
        dirty={hasDirtyBuffer && dirtyContents !== loaded.savedContents}
        saving={isSaving}
        onSave={handleSave}
      />
      <CodeMirrorEditor
        key={`${cwd}::${relativePath}`}
        initialContents={loaded.savedContents}
        currentContents={dirtyContents ?? loaded.savedContents}
        filePath={relativePath}
        theme={resolvedTheme}
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
    </div>
  );
}

function FileEditorToolbar(props: {
  relativePath: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void | Promise<void>;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 bg-card/40 px-3 py-1.5 text-xs">
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
        {props.dirty ? "● " : ""}
        {props.relativePath}
      </span>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-[11px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!props.dirty || props.saving}
        onClick={() => void props.onSave()}
      >
        <SaveIcon className="size-3.5" />
        {props.saving ? "Saving…" : "Save"}
      </button>
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
}

function CodeMirrorEditor({
  initialContents,
  currentContents,
  filePath,
  theme,
  onChange,
  onSave,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment()).current;
  const languageCompartment = useRef(new Compartment()).current;

  // Remember the latest callbacks without forcing the view to re-mount.
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

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
  // dirty buffer was cleared externally after a save), sync the view without
  // losing selection.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const docText = view.state.doc.toString();
    if (docText === currentContents) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: currentContents },
    });
  }, [currentContents]);

  return <div ref={containerRef} className="min-h-0 flex-1 overflow-auto" />;
}

// Pick a CodeMirror language extension based on the file extension. Uses the
// `language-data` registry so new languages require no code changes here.
async function resolveLanguageExtension(filePath: string) {
  const description = LanguageDescription.matchFilename(defaultLanguageData, filePath);
  if (!description) return null;
  try {
    const lang = await description.load();
    return lang;
  } catch {
    return null;
  }
}
