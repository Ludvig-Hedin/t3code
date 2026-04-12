import { useComposerDraftStore } from "./apps/web/src/composerDraftStore";
import { ThreadId } from "@t3tools/contracts";

const threadId = ThreadId.makeUnsafe("thread-1");

// Set initial
useComposerDraftStore.getState().setModelSelection(threadId, {
  provider: "codex",
  model: "gpt-5.4",
});

let draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
console.log("initial activeProvider:", draft?.activeProvider);
console.log("initial selection:", draft?.modelSelectionByProvider.codex);

// Update to manifest
useComposerDraftStore.getState().setModelSelection(threadId, {
  provider: "manifest",
  model: "auto",
});

draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
console.log("new activeProvider:", draft?.activeProvider);
console.log("new selection:", draft?.modelSelectionByProvider.manifest);
