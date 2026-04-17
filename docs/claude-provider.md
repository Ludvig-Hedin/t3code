# Claude Provider

Bird Code's Claude provider now recognizes `claude-opus-4-7` as a built-in model.

## Current built-ins

- `claude-opus-4-6`
- `claude-opus-4-7`
- `claude-sonnet-4-6`
- `claude-haiku-4-5`

## Notes

- `claude-opus-4-7` exposes the same `1m` context-window option as Opus 4.6.
- The dispatcher still serializes that option as the `[1m]` suffix when building the API model ID.

## Related files

- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `packages/contracts/src/model.ts`
- `packages/shared/src/model.ts`
