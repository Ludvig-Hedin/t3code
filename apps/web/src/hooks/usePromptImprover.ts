import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getWsRpcClient } from "../wsRpcClient";
import type { ChatMessage } from "../types";

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARS = 12_000;

function trimThreadMessages(
  messages: ReadonlyArray<Pick<ChatMessage, "role" | "text">>,
  prompt: string,
): Array<{ role: string; text: string }> {
  const promptText = prompt.trim();
  const collected: Array<{ role: string; text: string }> = [];
  let totalChars = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const text = message.text.trim();
    if (!text) {
      continue;
    }
    if (message.role === "user" && text === promptText) {
      continue;
    }

    const nextChars = totalChars + text.length;
    if (collected.length >= MAX_CONTEXT_MESSAGES || nextChars > MAX_CONTEXT_CHARS) {
      break;
    }

    collected.push({ role: message.role, text });
    totalChars = nextChars;
  }

  return collected.reverse();
}

export function usePromptImprover(input: {
  prompt: string;
  threadMessages: ReadonlyArray<Pick<ChatMessage, "role" | "text">>;
  onPromptChange: (nextPrompt: string) => void;
}) {
  const { prompt, threadMessages, onPromptChange } = input;
  const [versions, setVersions] = useState<string[]>(() => [prompt]);
  const [versionIndex, setVersionIndex] = useState(0);
  const [isImproving, setIsImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const managedPromptRef = useRef<string | null>(null);

  const trimmedThreadMessages = useMemo(
    () => trimThreadMessages(threadMessages, prompt),
    [threadMessages, prompt],
  );

  const applyManagedPrompt = useCallback(
    (nextPrompt: string) => {
      managedPromptRef.current = nextPrompt;
      onPromptChange(nextPrompt);
    },
    [onPromptChange],
  );

  useEffect(() => {
    if (managedPromptRef.current === prompt) {
      managedPromptRef.current = null;
      return;
    }

    setVersions([prompt]);
    setVersionIndex(0);
    setError(null);
  }, [prompt]);

  const improvePrompt = useCallback(async () => {
    const currentPrompt = prompt.trim();
    if (!currentPrompt || isImproving) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsImproving(true);
    setError(null);

    try {
      const result = await getWsRpcClient().prompts.improve({
        prompt: currentPrompt,
        threadMessages: trimmedThreadMessages,
      });
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (result.kind === "too_vague") {
        setError(result.message);
        return;
      }

      let nextVersions: string[] = [];
      setVersions((previous) => {
        const baseVersions =
          previous[versionIndex] === prompt ? previous.slice(0, versionIndex + 1) : [prompt];
        nextVersions =
          baseVersions[baseVersions.length - 1] === result.improvedPrompt
            ? baseVersions
            : [...baseVersions, result.improvedPrompt];
        return nextVersions;
      });

      const nextIndex = Math.max(0, nextVersions.length - 1);
      setVersionIndex(nextIndex);
      applyManagedPrompt(nextVersions[nextIndex] ?? result.improvedPrompt);
    } catch (cause) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setError(cause instanceof Error ? cause.message : "Failed to improve the prompt.");
    } finally {
      if (requestIdRef.current === requestId) {
        setIsImproving(false);
      }
    }
  }, [applyManagedPrompt, isImproving, prompt, trimmedThreadMessages, versionIndex]);

  const cancelImprovement = useCallback(() => {
    requestIdRef.current += 1;
    setIsImproving(false);
  }, []);

  const showPreviousVersion = useCallback(() => {
    if (versionIndex <= 0) {
      return;
    }
    const nextIndex = versionIndex - 1;
    setVersionIndex(nextIndex);
    setError(null);
    applyManagedPrompt(versions[nextIndex] ?? versions[0] ?? prompt);
  }, [applyManagedPrompt, prompt, versionIndex, versions]);

  const showNextVersion = useCallback(() => {
    if (versionIndex >= versions.length - 1) {
      return;
    }
    const nextIndex = versionIndex + 1;
    setVersionIndex(nextIndex);
    setError(null);
    applyManagedPrompt(versions[nextIndex] ?? versions[versions.length - 1] ?? prompt);
  }, [applyManagedPrompt, prompt, versionIndex, versions]);

  return {
    canImprove: prompt.trim().length > 0 && !isImproving,
    canShowPreviousVersion: versionIndex > 0,
    canShowNextVersion: versionIndex < versions.length - 1,
    cancelImprovement,
    error,
    improvePrompt,
    isImproving,
    showNextVersion,
    showPreviousVersion,
    versionLabel: versions.length > 1 ? `${versionIndex + 1}/${versions.length}` : null,
  };
}
