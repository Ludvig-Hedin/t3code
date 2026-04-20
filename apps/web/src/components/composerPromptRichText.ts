export type ComposerPromptLineKind = "paragraph" | "bullet" | "number";

export interface ComposerPromptLine {
  content: string;
  kind: ComposerPromptLineKind;
}

export function normalizeComposerPromptText(prompt: string): string {
  return prompt.replace(/\r\n/g, "\n");
}

export function parseComposerPromptLine(line: string): ComposerPromptLine {
  const normalized = line.replace(/\r$/, "");
  const unorderedMatch = /^\s*([-*])\s(.*)$/.exec(normalized);
  if (unorderedMatch) {
    return {
      content: unorderedMatch[2] ?? "",
      kind: "bullet",
    };
  }

  const orderedMatch = /^\s*(\d+)\.\s(.*)$/.exec(normalized);
  if (orderedMatch) {
    return {
      content: orderedMatch[2] ?? "",
      kind: "number",
    };
  }

  return {
    content: normalized,
    kind: "paragraph",
  };
}

export function isComposerListShortcutPrefix(lineText: string): "bullet" | "number" | null {
  const trimmed = lineText.trimStart();
  if (/^[-*]$/.test(trimmed)) {
    return "bullet";
  }
  if (/^\d+\.$/.test(trimmed)) {
    return "number";
  }
  return null;
}
