/**
 * KeybindingsPanel — settings UI for viewing and editing keyboard shortcuts.
 *
 * Replaces the previous "edit ~/.t3code/userdata/keybindings.json by hand"
 * workflow (per UX audit). Wraps the existing live-reloading file under the
 * hood — `nativeApi.server.upsertKeybinding()` writes to the same JSON the
 * server watches, so no schema change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardIcon } from "lucide-react";
import {
  type KeybindingCommand,
  type KeybindingShortcut,
  STATIC_KEYBINDING_COMMANDS,
  THREAD_JUMP_KEYBINDING_COMMANDS,
} from "@t3tools/contracts";

import { SettingsPageContainer, SettingsRow, SettingsSection } from "./SettingsLayout";
import { Button } from "../ui/button";
import { useServerKeybindings, useServerKeybindingsConfigPath } from "../../rpc/serverState";
import { formatShortcutLabel, shortcutLabelForCommand } from "../../keybindings";
import { readNativeApi } from "../../nativeApi";
import { toastManager } from "../ui/toast";
import { cn } from "../../lib/utils";

// ── Static command catalog ────────────────────────────────────────────────────
//
// Group the catalog into sections that mirror how a user thinks about them.
// Script-run commands (`script.<id>.run`) are dynamic and intentionally not
// listed here — they're managed from the project's Scripts UI.

interface CommandMeta {
  command: KeybindingCommand;
  label: string;
  description?: string;
}

const COMMAND_SECTIONS: ReadonlyArray<{
  title: string;
  commands: ReadonlyArray<CommandMeta>;
}> = [
  {
    title: "Chat",
    commands: [
      { command: "chat.new", label: "New thread" },
      {
        command: "chat.newLocal",
        label: "New thread (local environment)",
        description: "Bypasses worktree creation",
      },
      { command: "thread.previous", label: "Previous thread" },
      { command: "thread.next", label: "Next thread" },
      ...THREAD_JUMP_KEYBINDING_COMMANDS.map((command, i) => ({
        command,
        label: `Jump to thread ${i + 1}`,
      })),
    ],
  },
  {
    title: "Editor & files",
    commands: [
      { command: "editor.openFavorite", label: "Open in favorite editor" },
      { command: "diff.toggle", label: "Toggle diff panel" },
    ],
  },
  {
    title: "Terminal",
    commands: [
      { command: "terminal.toggle", label: "Toggle terminal drawer" },
      {
        command: "terminal.split",
        label: "Split terminal",
        description: "Only when terminal focused",
      },
      {
        command: "terminal.new",
        label: "New terminal",
        description: "Only when terminal focused",
      },
      {
        command: "terminal.close",
        label: "Close terminal",
        description: "Only when terminal focused",
      },
    ],
  },
  {
    title: "Navigation",
    commands: [
      { command: "navigate.automations", label: "Open Automations" },
      { command: "navigate.skills", label: "Open Skills" },
      { command: "navigate.plugins", label: "Open Plugins" },
    ],
  },
];

// Sanity check: every static command must be represented somewhere above.
// Failing this would silently hide a command from the editor — better to know
// at module load.
{
  const cataloged = new Set(
    COMMAND_SECTIONS.flatMap((s) => s.commands.map((c) => c.command as string)),
  );
  for (const cmd of STATIC_KEYBINDING_COMMANDS) {
    if (!cataloged.has(cmd)) {
      console.warn(`KeybindingsPanel: command "${cmd}" is not in COMMAND_SECTIONS`);
    }
  }
}

// ── Keystroke capture ─────────────────────────────────────────────────────────

const MODIFIER_ONLY_KEYS = new Set(["Meta", "Control", "Shift", "Alt", "Hyper"]);

interface CapturedKeystroke {
  key: string; // 'mod+shift+d' style
  display: string; // user-facing label
}

function shortcutLabelFromCapture(input: string): string {
  // Reuse formatShortcutLabel by parsing the captured "mod+x" string back to
  // a KeybindingShortcut via a synthetic round-trip would couple us to server
  // parser internals. Cheaper: render the captured tokens directly.
  return input
    .split("+")
    .map((tok) => {
      const t = tok.toLowerCase();
      if (t === "mod") return navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
      if (t === "cmd" || t === "meta") return "⌘";
      if (t === "ctrl" || t === "control") return "Ctrl";
      if (t === "alt" || t === "option") return "⌥";
      if (t === "shift") return "⇧";
      if (t === "space") return "Space";
      if (t === "escape" || t === "esc") return "Esc";
      return t.length === 1 ? t.toUpperCase() : t.charAt(0).toUpperCase() + t.slice(1);
    })
    .join("+")
    .replace(/⌘\+/g, "⌘")
    .replace(/⇧\+/g, "⇧")
    .replace(/⌥\+/g, "⌥");
}

function captureFromEvent(event: KeyboardEvent): CapturedKeystroke | null {
  if (MODIFIER_ONLY_KEYS.has(event.key)) return null;

  const tokens: string[] = [];
  const isMac = navigator.platform.toLowerCase().includes("mac");

  // Use 'mod' so the rule reads naturally cross-platform.
  if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) {
    tokens.push("mod");
  } else {
    if (event.metaKey) tokens.push("cmd");
    if (event.ctrlKey) tokens.push("ctrl");
  }
  if (event.altKey) tokens.push("alt");
  if (event.shiftKey) tokens.push("shift");

  let key = event.key.toLowerCase();
  if (key === " ") key = "space";
  if (key === "escape") key = "escape";
  // Collapse modifier-only repeats (already filtered above) just in case.
  if (MODIFIER_ONLY_KEYS.has(event.key)) return null;

  tokens.push(key);
  const joined = tokens.join("+");
  return { key: joined, display: shortcutLabelFromCapture(joined) };
}

interface CaptureBoxProps {
  initialDisplay?: string | undefined;
  onCapture: (capture: CapturedKeystroke) => void;
  onCancel: () => void;
}

function CaptureBox({ initialDisplay, onCapture, onCancel }: CaptureBoxProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      const cap = captureFromEvent(e.nativeEvent);
      if (!cap) {
        setPreview(null);
        return;
      }
      setPreview(cap.display);
      onCapture(cap);
    },
    [onCancel, onCapture],
  );

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="textbox"
      aria-label="Press a key combination"
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex min-w-[140px] items-center justify-center rounded-md border-2 border-dashed border-primary/60",
        "bg-primary/5 px-3 py-1 text-xs font-medium text-primary outline-none",
        "ring-2 ring-primary/30",
      )}
    >
      {preview ?? initialDisplay ?? "Press a key…"}
    </div>
  );
}

// ── Single-row editor ─────────────────────────────────────────────────────────

interface CommandRowProps {
  meta: CommandMeta;
  ownBindings: number;
  conflicts: ReadonlyMap<string, ReadonlyArray<KeybindingCommand>>;
  resolvedKeybindings: ReturnType<typeof useServerKeybindings>;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (capture: CapturedKeystroke) => Promise<void>;
}

function CommandRow({
  meta,
  ownBindings,
  conflicts,
  resolvedKeybindings,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
}: CommandRowProps) {
  const currentLabel = useMemo(
    () => shortcutLabelForCommand(resolvedKeybindings, meta.command),
    [meta.command, resolvedKeybindings],
  );
  const [pendingCapture, setPendingCapture] = useState<CapturedKeystroke | null>(null);
  const [busy, setBusy] = useState(false);

  const conflictWith = useMemo(() => {
    if (!pendingCapture) return [];
    const others = conflicts.get(pendingCapture.key) ?? [];
    return others.filter((cmd) => cmd !== meta.command);
  }, [conflicts, meta.command, pendingCapture]);

  const handleSave = async () => {
    if (!pendingCapture) return;
    setBusy(true);
    try {
      await onSave(pendingCapture);
      setPendingCapture(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-border px-4 py-3 first:border-t-0 sm:px-5">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{meta.label}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground/70">
          {meta.command}
          {meta.description && (
            <span className="ml-2 font-sans text-muted-foreground">{meta.description}</span>
          )}
        </div>
        {ownBindings > 1 && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {ownBindings} bindings configured
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <CaptureBox
              initialDisplay={pendingCapture?.display ?? currentLabel ?? undefined}
              onCapture={setPendingCapture}
              onCancel={() => {
                setPendingCapture(null);
                onCancelEdit();
              }}
            />
            <Button size="sm" onClick={() => void handleSave()} disabled={!pendingCapture || busy}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPendingCapture(null);
                onCancelEdit();
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {currentLabel ? (
              <kbd className="rounded-md border bg-muted px-2 py-0.5 font-mono text-xs text-foreground/90">
                {currentLabel}
              </kbd>
            ) : (
              <span className="text-xs text-muted-foreground/70">unbound</span>
            )}
            <Button size="sm" variant="outline" onClick={onStartEdit}>
              Edit
            </Button>
          </>
        )}
      </div>

      {isEditing && conflictWith.length > 0 && (
        <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/8 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
          Already used by {conflictWith.map((c) => `"${c}"`).join(", ")} — saving here will shadow
          it.
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

function shortcutToCanonicalKey(shortcut: KeybindingShortcut): string {
  const parts: string[] = [];
  if (shortcut.modKey) parts.push("mod");
  if (shortcut.metaKey) parts.push("cmd");
  if (shortcut.ctrlKey) parts.push("ctrl");
  if (shortcut.altKey) parts.push("alt");
  if (shortcut.shiftKey) parts.push("shift");
  parts.push(shortcut.key);
  return parts.join("+");
}

export function KeybindingsPanel() {
  const resolved = useServerKeybindings();
  const configPath = useServerKeybindingsConfigPath();
  const [editing, setEditing] = useState<KeybindingCommand | null>(null);

  // Build a map: canonical-key-string → list of commands using that combo.
  // Drives the "already in use" warning when capturing a new shortcut.
  const conflicts = useMemo(() => {
    const map = new Map<string, KeybindingCommand[]>();
    for (const rule of resolved) {
      const key = shortcutToCanonicalKey(rule.shortcut);
      const list = map.get(key);
      if (list) list.push(rule.command);
      else map.set(key, [rule.command]);
    }
    return map as ReadonlyMap<string, ReadonlyArray<KeybindingCommand>>;
  }, [resolved]);

  const bindingCounts = useMemo(() => {
    const counts = new Map<KeybindingCommand, number>();
    for (const rule of resolved) {
      counts.set(rule.command, (counts.get(rule.command) ?? 0) + 1);
    }
    return counts;
  }, [resolved]);

  const onSave = useCallback(async (command: KeybindingCommand, capture: CapturedKeystroke) => {
    const api = readNativeApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Unable to save shortcut",
        description: "Native API unavailable.",
      });
      return;
    }
    try {
      await api.server.upsertKeybinding({ key: capture.key, command });
      toastManager.add({
        type: "success",
        title: "Shortcut updated",
        description: `${command} → ${capture.display}`,
      });
      setEditing(null);
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to save shortcut",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
      throw err;
    }
  }, []);

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Keyboard shortcuts"
        icon={<KeyboardIcon className="size-3.5" />}
        headerAction={
          <span className="text-[11px] text-muted-foreground/70">
            Live-edits {configPath ? "config file" : "in memory"}
          </span>
        }
      >
        <SettingsRow>
          <p className="text-xs text-muted-foreground">
            Click <span className="font-medium text-foreground">Edit</span> on any command, then
            press the keys you want bound. <kbd className="rounded border px-1 py-0.5">Esc</kbd>{" "}
            cancels.
            {configPath && (
              <span className="ml-1 font-mono text-[10px] text-muted-foreground/60">
                {configPath}
              </span>
            )}
          </p>
        </SettingsRow>
      </SettingsSection>

      {COMMAND_SECTIONS.map((section) => (
        <SettingsSection key={section.title} title={section.title}>
          {section.commands.map((meta) => (
            <CommandRow
              key={meta.command}
              meta={meta}
              ownBindings={bindingCounts.get(meta.command) ?? 0}
              conflicts={conflicts}
              resolvedKeybindings={resolved}
              isEditing={editing === meta.command}
              onStartEdit={() => setEditing(meta.command)}
              onCancelEdit={() => setEditing(null)}
              onSave={(capture) => onSave(meta.command, capture)}
            />
          ))}
        </SettingsSection>
      ))}

      <p className="text-center text-[11px] text-muted-foreground/70">
        {formatShortcutLabel({
          key: "mod",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        })}{" "}
        is the platform meta key (⌘ on macOS, Ctrl elsewhere).
      </p>
    </SettingsPageContainer>
  );
}
