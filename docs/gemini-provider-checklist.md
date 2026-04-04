# Gemini CLI Provider Checklist

Source of truth for adding Gemini CLI as a first-class provider in T3 Code.

## Execution Order

- [x] 1. Extend shared provider contracts to include `gemini`
  - Update `packages/contracts/src/orchestration.ts` so `ProviderKind` includes `gemini`.
  - Add a `GeminiModelSelection` schema and include it in `ModelSelection`.
  - Update any provider defaults that are currently hardcoded to `codex` or `claudeAgent` only.
  - Acceptance criteria: the shared contracts compile and decode `gemini` model selections without falling back to legacy behavior.

- [x] 2. Add Gemini model metadata and defaults
  - Update `packages/contracts/src/model.ts` with Gemini defaults and provider-specific model option types.
  - Define the default text-generation model for Gemini if the provider should participate in git assistance.
  - Add Gemini slug normalization rules only if the CLI exposes stable aliases we want to support.
  - Current Gemini model coverage now includes the 2.5 family plus the 3 / 3.1 preview families exposed by the installed CLI.
  - Acceptance criteria: Gemini model selection can be normalized and round-tripped like Codex and Claude.

- [x] 3. Add Gemini settings to server configuration
  - Update `packages/contracts/src/settings.ts` to add `providers.gemini`.
  - Decide the minimum configuration surface:
    - `enabled`
    - `binaryPath`
    - optional auth or env configuration if the runtime needs it
    - optional custom models if supported
  - Update `apps/server/src/serverSettings.ts` provider ordering and fallback logic.
  - Acceptance criteria: server settings load, save, migrate, and default Gemini without breaking existing settings files.

- [x] 4. Wire Gemini into provider discovery and registry layers
  - Update `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts` to include the Gemini adapter.
  - Update `apps/server/src/provider/Services/ProviderRegistry.ts` and `apps/server/src/provider/Services/ProviderService.ts` if provider-specific metadata or capabilities need to expand.
  - Update any provider capability resolution paths that assume only Codex and Claude exist.
  - Acceptance criteria: the server can discover Gemini as an installed/available provider and expose it through the existing provider snapshot path.

- [x] 5. Implement `GeminiAdapter`
  - Create a new adapter layer, likely `apps/server/src/provider/Layers/GeminiAdapter.ts`.
  - Implement the `ProviderAdapterShape` contract:
    - `startSession`
    - `sendTurn`
    - `interruptTurn`
    - `respondToRequest`
    - `respondToUserInput`
    - `stopSession`
    - `listSessions`
    - `hasSession`
    - `readThread`
    - `rollbackThread`
    - `stopAll`
    - `streamEvents`
  - Decide whether the adapter is interactive-first, headless-first, or hybrid.
  - Map Gemini CLI events into canonical provider runtime events so the rest of the app stays provider-agnostic.
  - Acceptance criteria: a Gemini session can be started, a turn can be sent, and the runtime emits canonical events into orchestration.

- [ ] 6. Decide and implement Gemini CLI process model
  - Verify whether Gemini CLI should run as:
    - a persistent interactive process per session
    - a fresh process per turn
    - a hybrid with interactive sessions and headless fallbacks
  - Define how the adapter will capture:
    - assistant text deltas
    - tool invocations
    - approval requests
    - user-input requests
    - session completion
  - Current MVP status: the adapter uses a fresh process per turn and keeps lightweight in-memory session history, Gemini model selection now preserves arbitrary manual slugs, and the picker shows the runtime fallback model when Gemini routes elsewhere. Tool/approval/user-input loops are still not mapped to Gemini-native interactivity.
  - Acceptance criteria: the chosen process model supports restart, interruption, and crash recovery without losing thread ownership.

- [ ] 7. Integrate Gemini authentication and launch configuration
  - Support the CLI auth path(s) Gemini expects, based on the official docs:
    - Google login
    - API key env vars
    - Vertex AI env vars if needed
  - Ensure the server can launch Gemini with the correct binary and environment.
  - Add clear failure messages for missing binary, missing auth, and unsupported config.
  - Current MVP status: the provider probes `gemini` on PATH and uses the active process environment, but it does not yet expose a dedicated auth-mode setting surface.
  - Acceptance criteria: startup failures are actionable and do not silently degrade into wrong-provider behavior.

- [x] 8. Add Gemini support to the web provider UI
  - Update `apps/web/src/session-logic.ts` so Gemini is a real selectable provider when enabled.
  - Update `apps/web/src/components/chat/ProviderModelPicker.tsx` and `apps/web/src/components/chat/composerProviderRegistry.tsx` to remove the `Coming soon` placeholder state for Gemini.
  - Update any provider icons, labels, and defaults required by the UI.
  - Acceptance criteria: Gemini appears in the picker, can be selected, and the composer renders provider-specific controls correctly.

- [x] 9. Update text-generation routing where Gemini should participate
  - Review `apps/server/src/git/Layers/RoutingTextGeneration.ts`.
  - Decide whether Gemini should be eligible for:
    - commit message generation
    - branch naming
    - PR content generation
    - thread title generation
  - Add a Gemini text-generation layer only if the CLI supports the needed non-interactive workflow reliably.
  - Acceptance criteria: git-assist features either support Gemini intentionally or continue to route elsewhere by design.

- [x] 10. Add observability and provider labeling for Gemini
  - Update `apps/server/src/observability/Attributes.ts` and any related provider labeling code.
  - Ensure traces, metrics, and provider snapshots label Gemini consistently.
  - Confirm provider runtime logs remain attributable by thread and session.
  - Acceptance criteria: Gemini activity is visible in traces, metrics, and provider event logs with the correct provider name.

- [x] 11. Add tests for the Gemini provider path
  - Add contract tests for `ProviderKind`, model selection, and settings decoding.
  - Add adapter tests for session lifecycle, interruption, and error handling.
  - Add UI tests for provider selection and Gemini availability states.
  - Add a regression test for Gemini preview model selection so the picker resolves the selected slug instead of snapping back to the current model.
  - Add a regression test for runtime-model visibility so the picker shows when Gemini has fallen back to a different slug.
  - Add regression tests for any fallback behavior introduced in server settings.
  - Acceptance criteria: the new provider path is covered by unit tests and the existing test suite still passes.

- [x] 12. Document runtime requirements and manual setup
  - Update repo docs with Gemini installation/auth expectations.
  - Document whether Gemini needs:
    - a specific binary name
    - env vars
    - trusted-folder config
    - sandbox / approval defaults
  - Record any limitations compared with Codex and Claude.
  - Acceptance criteria: a new contributor can enable Gemini from the docs without reading source code.

## Notes

- Tick items in order unless a later item is discovered to be a prerequisite.
- If a Gemini CLI behavior is ambiguous, prefer checking the official CLI docs and the adapter contract before implementing.
- Keep this file updated as implementation lands so progress stays visible.
