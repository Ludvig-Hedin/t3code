/**
 * TerminalCommandBar - Floating AI command input bar for the terminal.
 *
 * Appears at the bottom of the terminal viewport when the user presses Cmd+K.
 * Takes a natural language description and generates a terminal command via Ollama.
 * The generated command is written to the terminal without executing — the user
 * reviews and presses Enter manually.
 *
 * @module TerminalCommandBar
 */

import { Sparkles, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Spinner } from "~/components/ui/spinner";
import { generateTerminalCommand, getOllamaBaseUrl, resolveOllamaModel } from "~/lib/ollamaClient";

interface TerminalCommandBarProps {
  onClose: () => void;
  onCommandGenerated: (command: string) => void;
}

export function TerminalCommandBar({ onClose, onCommandGenerated }: TerminalCommandBarProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-focus the input when the bar mounts
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Cleanup: abort any in-flight request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0 || loading) return;

    setLoading(true);
    setError(null);

    // Create an AbortController so Escape can cancel the in-flight request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const baseUrl = getOllamaBaseUrl();
      const model = await resolveOllamaModel(baseUrl);
      const command = await generateTerminalCommand(baseUrl, model, trimmed, controller.signal);

      // Don't act on aborted requests
      if (controller.signal.aborted) return;

      if (command.length === 0) {
        setError("No command generated. Try rephrasing your request.");
        return;
      }

      onCommandGenerated(command);
      onClose();
    } catch (err) {
      // Don't show errors for intentional aborts (Escape key)
      if (err instanceof Error && err.name === "AbortError") return;

      const message =
        err instanceof Error && err.message.includes("fetch")
          ? `Could not connect to Ollama. Make sure it is running.`
          : err instanceof Error
            ? err.message
            : "Failed to generate command.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, onCommandGenerated, onClose]);

  const handleClose = useCallback(() => {
    // Abort any in-flight request before closing
    abortControllerRef.current?.abort();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleClose, handleSubmit],
  );

  // Prevent terminal from receiving keyboard events while the command bar is open
  const stopPropagation = useCallback((event: React.MouseEvent | React.FocusEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <div
      className="absolute inset-x-2 bottom-2 z-30 flex flex-col gap-1"
      onMouseDown={stopPropagation}
    >
      {error ? (
        <p id="terminal-command-bar-error" className="px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
        <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />

        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Describe a command..."
          disabled={loading}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
          autoComplete="off"
          spellCheck={false}
          aria-label="Describe a terminal command"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "terminal-command-bar-error" : undefined}
        />

        {loading ? (
          <Spinner className="size-3.5 text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={prompt.trim().length === 0}
            className="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            aria-label="Generate command"
          >
            Send
          </button>
        )}

        <button
          type="button"
          onClick={handleClose}
          className="inline-flex shrink-0 items-center rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Close command bar"
        >
          <XIcon className="size-3" />
        </button>

        <kbd className="hidden shrink-0 rounded border border-border/60 bg-muted/50 px-1 py-0.5 text-[10px] leading-none text-muted-foreground sm:inline-block">
          Esc
        </kbd>
      </div>
    </div>
  );
}
