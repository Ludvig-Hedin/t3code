import { EDITORS, EditorId, type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo } from "react";
import { isOpenFavoriteEditorShortcut, shortcutLabelForCommand } from "../../keybindings";
import { usePreferredEditor } from "../../editorPreferences";
import { EDITOR_ICONS } from "../../editorIcons";
import { ChevronDownIcon, FolderClosedIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Group, GroupSeparator } from "../ui/group";
import { Menu, MenuItem, MenuPopup, MenuShortcut, MenuTrigger } from "../ui/menu";
import { type Icon } from "../Icons";
import { isMacPlatform, isWindowsPlatform } from "~/lib/utils";
import { readNativeApi } from "~/nativeApi";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * resolveOptions — builds the ordered list of editor choices shown in the picker,
 * filtered to only those actually detected on the user's machine.
 *
 * Labels for the file-manager entry are platform-specific (Finder / Explorer / Files).
 * All other labels come from the shared EDITORS contract so they stay in sync.
 */
const resolveOptions = (platform: string, availableEditors: ReadonlyArray<EditorId>) => {
  return EDITORS.flatMap(
    (editor): ReadonlyArray<{ label: string; Icon: Icon; value: EditorId }> => {
      if (!availableEditors.includes(editor.id)) return [];
      const icon = EDITOR_ICONS[editor.id];
      if (!icon) return [];

      // File manager gets a platform-specific display name
      if (editor.id === "file-manager") {
        return [
          {
            label: isMacPlatform(platform)
              ? "Finder"
              : isWindowsPlatform(platform)
                ? "Explorer"
                : "Files",
            Icon: FolderClosedIcon as unknown as Icon,
            value: editor.id,
          },
        ];
      }

      return [{ label: editor.label, Icon: icon, value: editor.id }];
    },
  );
};

export const OpenInPicker = memo(function OpenInPicker({
  keybindings,
  availableEditors,
  openInCwd,
}: {
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  openInCwd: string | null;
}) {
  const [preferredEditor, setPreferredEditor] = usePreferredEditor(availableEditors);
  const options = useMemo(
    () => resolveOptions(navigator.platform, availableEditors),
    [availableEditors],
  );
  const primaryOption = options.find(({ value }) => value === preferredEditor) ?? null;

  const openInEditor = useCallback(
    (editorId: EditorId | null) => {
      const api = readNativeApi();
      if (!api || !openInCwd) return;
      const editor = editorId ?? preferredEditor;
      if (!editor) return;
      void api.shell.openInEditor(openInCwd, editor);
      setPreferredEditor(editor);
    },
    [preferredEditor, openInCwd, setPreferredEditor],
  );

  const openFavoriteEditorShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "editor.openFavorite"),
    [keybindings],
  );

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const api = readNativeApi();
      if (!isOpenFavoriteEditorShortcut(e, keybindings)) return;
      if (!api || !openInCwd) return;
      if (!preferredEditor) return;

      e.preventDefault();
      void api.shell.openInEditor(openInCwd, preferredEditor);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preferredEditor, keybindings, openInCwd]);

  return (
    <Group aria-label="Subscription actions">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="xs"
              variant="outline"
              disabled={!preferredEditor || !openInCwd}
              onClick={() => openInEditor(preferredEditor)}
            >
              {primaryOption?.Icon && (
                <primaryOption.Icon aria-hidden="true" className="size-3.5" />
              )}
              <span className="sr-only @3xl/header-actions:not-sr-only @3xl/header-actions:ml-0.5">
                Open
              </span>
            </Button>
          }
        />
        <TooltipPopup side="bottom">
          {preferredEditor ? "Open current project in your preferred editor" : "No editor selected"}
        </TooltipPopup>
      </Tooltip>
      <GroupSeparator className="hidden @3xl/header-actions:block" />
      <Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={<Button aria-label="Editor options" size="icon-xs" variant="outline" />}
              >
                <ChevronDownIcon aria-hidden="true" className="size-4" />
              </MenuTrigger>
            }
          />
          <TooltipPopup side="bottom">Editor options</TooltipPopup>
        </Tooltip>
        <MenuPopup align="end">
          {options.length === 0 && <MenuItem disabled>No installed editors found</MenuItem>}
          {options.map(({ label, Icon, value }) => (
            <MenuItem key={value} onClick={() => openInEditor(value)}>
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {label}
              {value === preferredEditor && openFavoriteEditorShortcutLabel && (
                <MenuShortcut>{openFavoriteEditorShortcutLabel}</MenuShortcut>
              )}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </Group>
  );
});
