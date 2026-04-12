/**
 * ollamaClient.ts - Lightweight Ollama HTTP client for the terminal AI command bar.
 *
 * Makes direct fetch calls to the local Ollama API from the frontend.
 * No server-side RPC changes needed — Ollama exposes CORS-friendly HTTP endpoints.
 *
 * Used by TerminalCommandBar to generate terminal commands from natural language.
 *
 * @module ollamaClient
 */

import { getServerConfig } from "~/rpc/serverState";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";
const MODEL_CACHE_TTL_MS = 60_000;

// System prompt instructs the model to output ONLY a raw terminal command.
const SYSTEM_PROMPT =
  "You are a terminal command generator. Given a natural language description, output ONLY the terminal command. No explanations, no markdown formatting, no code fences, no backticks, no extra text. Just the raw command.";

// ── Model cache ─────────────────────────────────────────────────────────────

interface ModelCache {
  model: string;
  expiresAt: number;
}

let cachedModel: ModelCache | null = null;

// ── Ollama /api/tags response shape ─────────────────────────────────────────

interface OllamaTagsResponse {
  models: Array<{
    name: string;
    size: number;
    modified_at: string;
  }>;
}

// ── Ollama /v1/chat/completions response shape ──────────────────────────────

interface OllamaChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read the Ollama base URL from the synced server config.
 * Falls back to the default localhost URL if config is unavailable.
 */
export function getOllamaBaseUrl(): string {
  const config = getServerConfig();
  const raw = config?.settings?.providers?.ollama?.baseUrl;
  const baseUrl = typeof raw === "string" ? raw.trim() : "";
  return baseUrl.length > 0 ? baseUrl.replace(/\/$/, "") : DEFAULT_OLLAMA_BASE_URL;
}

/**
 * Resolve the smallest available Ollama model by fetching /api/tags.
 * Results are cached for 60 seconds to avoid repeated API calls.
 * Falls back to DEFAULT_MODEL on any error.
 */
export async function resolveOllamaModel(baseUrl: string): Promise<string> {
  // Return cached model if still valid
  if (cachedModel && Date.now() < cachedModel.expiresAt) {
    return cachedModel.model;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_000);

    const response = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return DEFAULT_MODEL;
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const models = data.models ?? [];

    if (models.length === 0) {
      return DEFAULT_MODEL;
    }

    // Sort by size ascending to pick the smallest (cheapest) model
    const sorted = models.toSorted((a, b) => a.size - b.size);
    const model = sorted[0]?.name ?? DEFAULT_MODEL;

    // Cache the result
    cachedModel = { model, expiresAt: Date.now() + MODEL_CACHE_TTL_MS };
    return model;
  } catch {
    // Network error, timeout, or Ollama not running — use fallback
    return DEFAULT_MODEL;
  }
}

/**
 * Generate a terminal command from a natural language prompt using Ollama.
 *
 * Uses the OpenAI-compatible /v1/chat/completions endpoint (non-streaming)
 * for simplicity — command generation is typically fast for small models.
 */
export async function generateTerminalCommand(
  baseUrl: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      stream: false,
    }),
    // RequestInit.signal is AbortSignal | null — convert undefined to null to satisfy
    // exactOptionalPropertyTypes strictness.
    signal: signal ?? null,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Ollama returned ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.choices?.[0]?.message?.content ?? "";

  return cleanCommandResponse(content);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Strip accidental markdown code fences and extra whitespace from the AI response.
 * Models sometimes wrap commands in ```bash ... ``` despite instructions not to.
 */
function cleanCommandResponse(raw: string): string {
  let cleaned = raw.trim();

  // Remove opening code fence (e.g. ```bash, ```sh, ```)
  cleaned = cleaned.replace(/^```[\w]*\n?/, "");
  // Remove closing code fence
  cleaned = cleaned.replace(/\n?```$/, "");

  return cleaned.trim();
}
