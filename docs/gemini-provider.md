# Gemini Provider

Gemini CLI support is wired into T3 Code as a first-class provider.

## Current behavior

- Provider kind: `gemini`
- Default model: `gemini-2.5-pro`
- Published built-in models:
  - `gemini-2.5-pro`
  - `gemini-2.5-flash-lite`
  - `gemini-2.5-flash`
  - `gemini-3-pro-preview`
  - `gemini-3.1-pro-preview`
  - `gemini-3-flash-preview`
- The picker now accepts a custom Gemini model slug directly, so you can mirror Gemini CLI's manual model selection flow without waiting for the server to predeclare every possible slug.
- If Gemini CLI routes or falls back at runtime, the picker shows the active runtime model next to the requested model so the difference stays visible.
- Git text-generation fallback: `gemini` currently routes to the Codex text-generation layer until a Gemini-specific git generation flow is added.
- Session model: the adapter uses a fresh Gemini CLI process per turn and keeps lightweight session history in memory.
- Runtime event stream: Gemini emits the same canonical provider events used by the rest of the app.

## Setup

- Install the Gemini CLI binary and make sure `gemini` is on `PATH`, or point `providers.gemini.binaryPath` at the binary.
- Authentication is delegated to the CLI's own supported auth paths:
  - Google login
  - `GEMINI_API_KEY`
  - Vertex AI env vars, if you use that runtime
- If you run T3 Code inside a trusted folder, remember the Gemini CLI can ignore project settings and `.env` files there. Set the needed env vars explicitly in your shell or launch environment.

## Limitations

- Approval requests and structured user-input loops are not yet mapped into Gemini-specific interactive flows.
- Tool invocation capture is not yet implemented.
- The adapter currently favors correctness and provider wiring over deep Gemini protocol fidelity.
- Manual model selection is now available through a picker dialog, but Gemini CLI's own fallback/routing semantics still mean the runtime model can differ from the selected model.

## Related files

- `apps/server/src/provider/Layers/GeminiAdapter.ts`
- `apps/server/src/provider/Layers/GeminiProvider.ts`
- `packages/contracts/src/model.ts`
- `packages/contracts/src/settings.ts`
