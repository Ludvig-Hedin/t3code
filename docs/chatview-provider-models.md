# ChatView Provider Model Normalization

## What changed

- `apps/web/src/components/ChatView.tsx` now normalizes provider model lists through `getProviderModelsByProvider(...)`.
- `apps/web/src/components/chat/ProviderModelPicker.tsx` now reads model options with a safe fallback for missing providers.
- `apps/web/src/providerModels.ts` exposes a small helper for safe record access.

## Why

- The desktop app crashed when a provider option existed in the UI but its model list was missing at runtime.
- The new helpers keep `map(...)` calls on defined arrays and prevent the `Cannot read properties of undefined (reading 'map')` failure.

## Validation

- Added a regression test in `apps/web/src/providerModels.test.ts`.
- The intended follow-up checks are `bun fmt`, `bun lint`, `bun typecheck`, and `bun run test`.
