# Bird Code iOS Companion

## Summary

Build a native iPhone-first companion app that pairs with the desktop Bird Code session over the internet. The phone is for chat, review, approvals, and command submission. The desktop app stays the machine that actually runs code, terminals, git, and provider sessions.

## Why this fits the repo

- The app is already split into a server and a client, with shared protocol contracts.
- The desktop/web stack already has a transport boundary, which is the right seam to reuse.
- The current desktop-only `desktopBridge.getWsUrl()` path is not enough for a phone, so the mobile path needs its own bootstrap and auth flow.

## Architecture

- Add a new `apps/mobile` SwiftUI app.
- Add a public relay and pairing layer so the iPhone can reach the desktop session from anywhere.
- Keep `apps/server` as the orchestration authority on the desktop machine.
- Reuse `packages/contracts` for all shared command and event shapes.
- Move any pure session formatting or projection helpers into `packages/shared` so web and mobile render the same state.
- Do not turn the phone into a second execution environment. All real execution stays on the desktop.

## Product shape

- Pairing screen with QR code and short code.
- Thread list and active session status.
- Chat composer for prompts.
- Diff review and approval actions.
- Turn timeline, errors, and provider activity.
- Read-only branch and file context for the active thread.
- Push notifications and background refresh can come later.

## Backend and protocol changes

- Add a pairing flow with short-lived pairing codes.
- Issue a device token after pairing and store it in Keychain on iOS.
- Add a relay connection model:
  - desktop connects outbound to the relay
  - mobile connects to the relay over HTTPS/WSS
  - relay forwards authenticated command and event traffic
- Extend shared contracts for:
  - paired device metadata
  - relay presence and connection state
  - command acknowledgment and delivery state
  - thread subscription snapshots
- Split Electron-specific assumptions away from the transport layer so the same event model works on web, desktop, and mobile.

## iOS app implementation

- Use SwiftUI, not React Native, for the first release.
- Build the screens in this order:
  - pairing and login
  - thread inbox
  - thread detail with messages and activity
  - diff and approval review
  - settings and device management
- Drive the app from a single store fed by shared protocol events.
- Keep the composer and review actions minimal. Mobile text entry is fine for prompts, but not a good place to build a full editor.

## Rollout plan

1. Pairing and relay skeleton.
2. Read-only sync for threads, status, and events.
3. Prompt submission from the phone.
4. Approval actions and diff review.
5. Optional terminal and file actions, only if the first four feel solid.
6. Push notifications after relay reliability is proven.

## Tests and acceptance criteria

- Unit tests for pairing token expiry, relay auth, and event delivery state.
- Integration test with a mock relay and one desktop session.
- iPhone UI tests for:
  - cold start pairing
  - reconnect after app kill
  - sending a prompt
  - seeing the desktop session update
  - approving a proposed action
- Acceptance is not “the screen loads.” Acceptance is:
  - the phone can reconnect after app restart
  - the desktop stays authoritative
  - state matches across desktop and mobile
  - stale device tokens are rejected cleanly
  - a user can start a coding turn on the phone and watch it complete on the desktop

## Assumptions

- Companion-first, not a full mobile IDE.
- Internet relay, not LAN-only pairing.
- Desktop remains the execution host.
- Native SwiftUI on iOS first.
- Push notifications are phase 2, not MVP.

## Implementation status

- `apps/mobile` now exists as a native SwiftUI companion app generated with XcodeGen.
- The server exposes mobile relay endpoints for pairing, snapshots, dispatch, diffs, and device management.
- Shared mobile thread summaries live in `packages/shared/src/orchestrationMobile.ts`.
- The SwiftUI shell mirrors the desktop brand with the same neutral surfaces, blue accent, and chat-first layout language.
- Verified with `xcodebuild` for the mobile app and `bun run test --filter=@t3tools/shared`.
- Repo-wide `bun typecheck` still fails in unrelated pre-existing server/test Effect typing issues outside this feature.
