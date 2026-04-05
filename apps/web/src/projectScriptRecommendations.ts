import type { ProjectScript, ProjectScriptIcon } from "@t3tools/contracts";

export interface RecommendedProjectScript {
  key: string;
  name: string;
  command: string;
  icon: ProjectScriptIcon;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function titleCase(input: string): string {
  const normalized = input
    .trim()
    .replace(/[-_/.:]+/g, " ")
    .replace(/\s+/g, " ");
  if (normalized.length === 0) return input;
  return normalized
    .split(" ")
    .map((part) => {
      if (part.length === 0) return part;
      return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function inferProjectScriptIcon(key: string, command: string): ProjectScriptIcon {
  const haystack = `${key} ${command}`.toLowerCase();
  if (
    haystack.includes("test") ||
    haystack.includes("vitest") ||
    haystack.includes("jest") ||
    haystack.includes("spec")
  ) {
    return "test";
  }
  if (
    haystack.includes("lint") ||
    haystack.includes("check") ||
    haystack.includes("format") ||
    haystack.includes("typecheck")
  ) {
    return "lint";
  }
  if (haystack.includes("build") || haystack.includes("bundle") || haystack.includes("compile")) {
    return "build";
  }
  if (haystack.includes("debug") || haystack.includes("inspect")) {
    return "debug";
  }
  if (
    haystack.includes("setup") ||
    haystack.includes("prepare") ||
    haystack.includes("bootstrap") ||
    haystack.includes("install")
  ) {
    return "configure";
  }
  return "play";
}

function normalizeCommand(command: string): string {
  return normalizeWhitespace(command).toLowerCase();
}

function normalizeScriptName(name: string): string {
  return normalizeWhitespace(name).toLowerCase();
}

export function buildPackageJsonScriptRecommendations(input: {
  packageJsonText: string | null;
  existingScripts: readonly ProjectScript[];
}): RecommendedProjectScript[] {
  if (!input.packageJsonText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.packageJsonText);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [];
  }

  const scripts = (parsed as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }

  const existingScriptIds = new Set(
    input.existingScripts.map((script) => normalizeScriptName(script.id)),
  );
  const existingScriptNames = new Set(
    input.existingScripts.map((script) => normalizeScriptName(script.name)),
  );
  const existingCommands = new Set(
    input.existingScripts.map((script) => normalizeCommand(script.command)),
  );

  return Object.entries(scripts)
    .map(([key, value]) => {
      if (typeof value !== "string") return null;
      const trimmedKey = key.trim();
      const trimmedCommand = normalizeWhitespace(value);
      if (trimmedKey.length === 0 || trimmedCommand.length === 0) {
        return null;
      }

      const recommendation: RecommendedProjectScript = {
        key: trimmedKey,
        name: titleCase(trimmedKey),
        command: trimmedCommand,
        icon: inferProjectScriptIcon(trimmedKey, trimmedCommand),
      };

      if (
        existingScriptIds.has(normalizeScriptName(recommendation.key)) ||
        existingScriptNames.has(normalizeScriptName(recommendation.name)) ||
        existingCommands.has(normalizeCommand(recommendation.command))
      ) {
        return null;
      }

      return recommendation;
    })
    .filter((entry): entry is RecommendedProjectScript => entry !== null)
    .toSorted((left, right) => {
      const leftPriority = inferProjectScriptIcon(left.key, left.command);
      const rightPriority = inferProjectScriptIcon(right.key, right.command);
      if (leftPriority !== rightPriority) {
        const order = ["test", "lint", "build", "configure", "debug", "play"] as const;
        return order.indexOf(leftPriority) - order.indexOf(rightPriority);
      }
      return left.name.localeCompare(right.name);
    });
}
