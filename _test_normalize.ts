import { normalizeModelSlug } from "@t3tools/shared/model";

function normalizeProviderKind(value: unknown): any {
  return value === "codex" ||
    value === "claudeAgent" ||
    value === "gemini" ||
    value === "opencode" ||
    value === "ollama" ||
    value === "manifest" ||
    value === "a2a"
    ? value
    : null;
}

function normalizeModelSelection(value: unknown): any {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const provider = normalizeProviderKind(candidate?.provider);
  if (provider === null) {
    return null;
  }
  const rawModel = candidate?.model;
  if (typeof rawModel !== "string") {
    return null;
  }
  const model = normalizeModelSlug(rawModel, provider);
  if (!model) {
    return null;
  }
  return { provider, model };
}

console.log("TEST:", normalizeModelSelection({ provider: "manifest", model: "auto" }));
