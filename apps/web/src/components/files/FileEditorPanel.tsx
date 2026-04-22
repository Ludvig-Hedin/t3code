/**
 * FileEditorPanel — hosts the tab bar + active file editor.
 *
 * Rendered inside the FileEditorInlineSidebar in `_chat.$threadId.tsx`.
 * Layout (top → bottom):
 *   - FileTabs       — horizontally-scrollable open-files tab strip
 *   - FileEditorPane — breadcrumbs, toolbar, and the editor/preview body
 *
 * Panel state (cwd / active path / open tabs) all live in the files-panel
 * store, so the route only mounts/unmounts this panel.
 */
import { useFilesPanelStore } from "~/filesPanelStore";
import { FileEditorPane } from "./FileEditorPane";
import { FileTabs } from "./FileTabs";

export default function FileEditorPanel() {
  const cwd = useFilesPanelStore((s) => s.activeCwd);
  const relativePath = useFilesPanelStore((s) => s.activeRelativePath);

  if (!cwd) return null;

  return (
    <div className="flex h-full flex-col bg-background">
      <FileTabs />
      {relativePath ? (
        <FileEditorPane cwd={cwd} relativePath={relativePath} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-muted-foreground/70">
          Select a file to open.
        </div>
      )}
    </div>
  );
}
