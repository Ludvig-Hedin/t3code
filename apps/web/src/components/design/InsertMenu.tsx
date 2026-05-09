/**
 * InsertMenu — palette for inserting new JSX elements relative to the
 * currently-selected element.
 */
import { useState } from "react";

import { cn, isMacPlatform } from "~/lib/utils";

import type { DesignInsertPosition } from "@t3tools/contracts";

import { Button } from "../ui/button";

const TAGS = [
  { tag: "div", hint: "container" },
  { tag: "span", hint: "inline" },
  { tag: "button", hint: "" },
  { tag: "p", hint: "paragraph" },
  { tag: "h1", hint: "" },
  { tag: "h2", hint: "" },
  { tag: "h3", hint: "" },
  { tag: "ul", hint: "list" },
  { tag: "li", hint: "list item" },
  { tag: "img", hint: "image" },
  { tag: "a", hint: "link" },
] as const;
type Tag = (typeof TAGS)[number]["tag"];

const POSITIONS: {
  readonly value: DesignInsertPosition;
  readonly label: string;
  readonly help: string;
}[] = [
  { value: "inside", label: "Inside", help: "as a child of the selected element" },
  { value: "before", label: "Before", help: "as a preceding sibling" },
  { value: "after", label: "After", help: "as a following sibling" },
];

export interface InsertMenuProps {
  readonly disabled: boolean;
  readonly onInsert: (tag: Tag, position: DesignInsertPosition) => void;
}

export function InsertMenu({ disabled, onInsert }: InsertMenuProps) {
  const [position, setPosition] = useState<DesignInsertPosition>("inside");
  const current = POSITIONS.find((p) => p.value === position) ?? POSITIONS[0]!;
  const showMacGlyphs = typeof navigator !== "undefined" && isMacPlatform(navigator.platform);

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Insert element
        </label>
        <div
          className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5"
          role="radiogroup"
          aria-label="Insert position"
        >
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={position === p.value}
              onClick={() => setPosition(p.value)}
              title={p.help}
              className={cn(
                "rounded-sm px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                position === p.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground/70 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {TAGS.map(({ tag, hint }) => (
          <Tag
            key={tag}
            tag={tag}
            hint={hint}
            disabled={disabled}
            position={position}
            onInsert={onInsert}
          />
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground/60">
        Inserts {current.help}. Tip: hold{" "}
        {showMacGlyphs ? (
          <>
            <kbd>⇧</kbd> for after, <kbd>⌥</kbd> for before
          </>
        ) : (
          <>
            <kbd className="rounded border border-border/60 px-0.5">Shift</kbd> for after,{" "}
            <kbd className="rounded border border-border/60 px-0.5">Alt</kbd> for before
          </>
        )}
        .
      </span>
    </div>
  );
}

interface TagProps {
  readonly tag: Tag;
  readonly hint: string;
  readonly disabled: boolean;
  readonly position: DesignInsertPosition;
  readonly onInsert: (tag: Tag, position: DesignInsertPosition) => void;
}

function Tag({ tag, hint, disabled, position, onInsert }: TagProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      title={hint ? `${tag} — ${hint}` : tag}
      className="h-7 px-2 font-mono text-[11px]"
      onClick={(e) => {
        // Keyboard modifiers still override the selected position for power users.
        const pos: DesignInsertPosition = e.shiftKey ? "after" : e.altKey ? "before" : position;
        onInsert(tag, pos);
      }}
    >
      {tag}
    </Button>
  );
}
