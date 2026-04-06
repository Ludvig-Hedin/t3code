/**
 * editorIcons — shared mapping from EditorId to icon component.
 *
 * Used by both the header OpenInPicker and the Settings "Default open destination"
 * selector so both surfaces always show the same logo for a given editor.
 *
 * The FolderClosedIcon from lucide-react is intentionally included here even though
 * it lives outside Icons.tsx — it is structurally compatible with the Icon type.
 */
import type { EditorId } from "@t3tools/contracts";
import { FolderClosedIcon } from "lucide-react";
import type { Icon } from "./components/Icons";
import {
  AntigravityIcon,
  CursorIcon,
  IntelliJIdeaIcon,
  TraeIcon,
  VisualStudioCode,
  WindsurfIcon,
  XcodeIcon,
  Zed,
} from "./components/Icons";

export const EDITOR_ICONS: Partial<Record<EditorId, Icon>> = {
  cursor: CursorIcon,
  trae: TraeIcon,
  // VS Code family all share the same logo
  vscode: VisualStudioCode,
  "vscode-insiders": VisualStudioCode,
  vscodium: VisualStudioCode,
  zed: Zed,
  antigravity: AntigravityIcon,
  windsurf: WindsurfIcon,
  xcode: XcodeIcon,
  idea: IntelliJIdeaIcon,
  // file-manager maps to the OS folder icon (Finder / Explorer / Files)
  "file-manager": FolderClosedIcon as unknown as Icon,
};
