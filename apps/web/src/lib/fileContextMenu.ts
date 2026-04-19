/**
 * fileContextMenu — builds and dispatches the right-click menu used by the
 * Files panel tree and search results.
 *
 * Routes through `api.contextMenu.show()` which already transparently
 * switches between Electron's `desktopBridge.showContextMenu` and the DOM
 * fallback defined in `contextMenuFallback.ts`, so callers don't have to
 * detect the runtime themselves.
 */
import { EDITORS, type EditorId } from "@t3tools/contracts";

import { isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { toastManager } from "~/components/ui/toast";

export interface ShowFileContextMenuInput {
  cwd: string;
  relativePath: string;
  availableEditors: ReadonlyArray<EditorId>;
  position: { x: number; y: number };
  /** Optional: user clicked "Open" — e.g. re-select the tree row. */
  onOpen?: () => void;
  /** Optional: user picked a different editor than the current preferred one. */
  onEditorUsed?: (editor: EditorId) => void;
}

type MenuItemId =
  | "open"
  | "view-in-finder"
  | "copy-path"
  | "copy-relative-path"
  | `open-in-editor:${EditorId}`;

/**
 * Joins cwd + relativePath into an absolute filesystem path. Uses '/'
 * universally so Electron's shell APIs work consistently across platforms —
 * both Finder and the editor launchers accept forward slashes on macOS/Linux
 * and Windows resolves them transparently.
 */
export function toAbsolutePath(cwd: string, relativePath: string): string {
  if (relativePath === "") return cwd;
  const trimmedCwd = cwd.replace(/\/+$/u, "");
  const trimmedPath = relativePath.replace(/^\/+/u, "");
  return `${trimmedCwd}/${trimmedPath}`;
}

function platformFileManagerLabel(platform: string): string {
  if (isMacPlatform(platform)) return "Reveal in Finder";
  if (isWindowsPlatform(platform)) return "Reveal in Explorer";
  return "Reveal in Files";
}

export async function showFileContextMenu(input: ShowFileContextMenuInput): Promise<void> {
  const api = readNativeApi();
  if (!api) return;
  const absolutePath = toAbsolutePath(input.cwd, input.relativePath);

  const hasDesktopBridge =
    typeof window !== "undefined" && window.desktopBridge !== undefined;

  // Build the per-editor "View in <IDE>" items dynamically from the server's
  // `availableEditors` list so only installed IDEs show up. The `file-manager`
  // editor is duplicative with "View in Finder" so we skip it here.
  const editorItems = EDITORS.filter(
    (editor) =>
      editor.id !== "file-manager" && input.availableEditors.includes(editor.id),
  ).map((editor) => ({
    id: `open-in-editor:${editor.id}` as MenuItemId,
    label: `View in ${editor.label}`,
  }));

  const items: ReadonlyArray<{
    id: MenuItemId;
    label: string;
    icon?: "copy" | "folder" | "pencil";
    disabled?: boolean;
  }> = [
    { id: "open", label: "Open" },
    ...(hasDesktopBridge
      ? [
          {
            id: "view-in-finder" as MenuItemId,
            label: platformFileManagerLabel(navigator.platform),
            icon: "folder" as const,
          },
        ]
      : []),
    ...editorItems,
    { id: "copy-path", label: "Copy path", icon: "copy" },
    { id: "copy-relative-path", label: "Copy relative path", icon: "copy" },
  ];

  const clicked = await api.contextMenu.show(items, input.position);
  if (!clicked) return;

  if (clicked === "open") {
    input.onOpen?.();
    return;
  }
  if (clicked === "view-in-finder") {
    try {
      await api.shell.openInFinder(absolutePath);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to reveal file",
        description: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (clicked === "copy-path") {
    void copyText(absolutePath, "Copied absolute path");
    return;
  }
  if (clicked === "copy-relative-path") {
    void copyText(input.relativePath, "Copied relative path");
    return;
  }
  if (clicked.startsWith("open-in-editor:")) {
    const editor = clicked.slice("open-in-editor:".length) as EditorId;
    try {
      await api.shell.openInEditor(absolutePath, editor);
      input.onEditorUsed?.(editor);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Failed to open in editor",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function copyText(text: string, successTitle: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toastManager.add({ type: "success", title: successTitle, description: text });
  } catch (error) {
    toastManager.add({
      type: "error",
      title: "Copy failed",
      description: error instanceof Error ? error.message : String(error),
    });
  }
}
