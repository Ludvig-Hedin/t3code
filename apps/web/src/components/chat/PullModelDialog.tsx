import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { cn } from "~/lib/utils";

// Curated list of popular Ollama models for quick selection
const CURATED_MODELS = [
  { slug: "llama3.2", label: "Llama 3.2", description: "Meta • 3B • Fast" },
  { slug: "llama3.2:1b", label: "Llama 3.2 1B", description: "Meta • 1B • Lightest" },
  { slug: "llama3.3", label: "Llama 3.3", description: "Meta • 70B • Powerful" },
  { slug: "qwen2.5-coder", label: "Qwen 2.5 Coder", description: "Alibaba • 7B • Code" },
  { slug: "qwen2.5-coder:32b", label: "Qwen 2.5 Coder 32B", description: "Alibaba • 32B • Code" },
  { slug: "mistral", label: "Mistral", description: "Mistral AI • 7B" },
  { slug: "gemma3", label: "Gemma 3", description: "Google • 4B" },
  { slug: "gemma3:27b", label: "Gemma 3 27B", description: "Google • 27B" },
  { slug: "phi4", label: "Phi-4", description: "Microsoft • 14B" },
  { slug: "deepseek-r1", label: "DeepSeek R1", description: "DeepSeek • 7B" },
  { slug: "codellama", label: "Code Llama", description: "Meta • 7B • Code" },
] as const;

interface PullModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPull: (model: string) => Promise<{ success: boolean; error?: string }>;
}

export function PullModelDialog({ open, onOpenChange, onPull }: PullModelDialogProps) {
  const [modelValue, setModelValue] = useState("");
  const [isPulling, setIsPulling] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handlePull = async () => {
    const model = modelValue.trim();
    if (!model) return;
    setIsPulling(true);
    setResultMessage(null);
    try {
      const result = await onPull(model);
      if (result.success) {
        setResultMessage({ ok: true, text: `Successfully pulled '${model}'.` });
        setModelValue("");
      } else {
        setResultMessage({ ok: false, text: result.error ?? "Pull failed." });
      }
    } finally {
      setIsPulling(false);
    }
  };

  // Prevent closing while a pull is in progress to avoid orphaned async operations
  const handleClose = () => {
    if (isPulling) return;
    setModelValue("");
    setResultMessage(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pull Ollama model</DialogTitle>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Model name</label>
            {/* Wrap in form so Enter key triggers pull */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handlePull();
              }}
            >
              <Input
                autoFocus
                disabled={isPulling}
                value={modelValue}
                onChange={(e) => {
                  setModelValue(e.target.value);
                  setResultMessage(null);
                }}
                placeholder="llama3.2, qwen2.5-coder:7b, ..."
                aria-label="Model name"
              />
            </form>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Popular models
            </p>
            <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
              {CURATED_MODELS.map((m) => (
                <button
                  key={m.slug}
                  type="button"
                  disabled={isPulling}
                  onClick={() => {
                    setModelValue(m.slug);
                    setResultMessage(null);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    "hover:bg-muted/60 focus:outline-none focus:bg-muted/60",
                    modelValue === m.slug && "bg-muted font-medium",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  <span className="block">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.description}</span>
                </button>
              ))}
            </div>
          </div>
          {resultMessage && (
            <p
              className={cn(
                "text-sm",
                resultMessage.ok ? "text-green-600 dark:text-green-400" : "text-destructive",
              )}
            >
              {resultMessage.text}
            </p>
          )}
        </DialogPanel>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isPulling}>
            {resultMessage?.ok ? "Close" : "Cancel"}
          </Button>
          <Button onClick={() => void handlePull()} disabled={isPulling || !modelValue.trim()}>
            {isPulling ? "Pulling…" : "Pull"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
