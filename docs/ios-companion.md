# Bird Code Companion

This repo now includes a native iPhone-first companion app under `apps/mobile`.

## What it does

- Pairs with a desktop Bird Code session through the server's mobile relay routes.
- Reuses the same orchestration read model and shared contracts as the desktop and web apps.
- Mirrors the desktop visual language with a card-based, chat-first SwiftUI shell.
- Supports pairing, session refresh, prompt submission, diff review, approval responses, and device management.
- Uses a QR-first pairing flow so you can scan the desktop tab or paste a pairing code without hunting for auth tokens.
- The desktop pairing code carries the hidden auth context automatically, so the phone does not ask you to type a token.
- The desktop pairing QR should resolve to a reachable LAN address, not `localhost`.

## Architecture

- The desktop/server process stays authoritative for code execution, terminal work, git operations, and provider sessions.
- The mobile app is a companion surface only; it never becomes a second execution environment.
- Shared mobile thread summaries live in `packages/shared/src/orchestrationMobile.ts`.
- Mobile-specific HTTP handlers live in `apps/server/src/mobile.ts`.

## Local setup

1. Generate the Xcode project:

   ```bash
   cd apps/mobile
   xcodegen generate
   ```

2. Open `apps/mobile/BirdCode.xcodeproj` in Xcode.

3. Run the desktop/server app first so the mobile app has a session to pair with.

## Pairing flow

- Open the desktop app and go to the `Mobile` settings tab to show a QR code.
- Once a phone pairs, the desktop tab now shows the paired device list so you can confirm the connection immediately.
- On iPhone, open Bird Code, tap `Settings`, then use the `Pair` tab to scan the QR or paste the pairing code.
- The `Advanced` tab keeps manual connection fields available if you need them, but they are no longer part of the default flow.
- If you manually type a server URL, only then do you need the `Advanced` fields.
- The pairing code is now a shareable payload, not a raw `localhost` URL, so Bird Code can reconnect without a manual token entry step.
- The desktop settings panel is scrollable and the QR card is intentionally compact so the pairing controls stay usable on smaller screens.
- The Bird Code logo is loaded from the bundled artwork derived from `assets/new/logo-dark.svg`.
- The app icon now comes from `apps/mobile/Resources/Assets.xcassets/AppIcon.appiconset`.
- If iOS still shows an old icon after reinstalling, delete Bird Code from the device or simulator once and install it again to clear the cached icon.

## Status

- Pairing, snapshot sync, prompt dispatch, diff retrieval, and device revocation are implemented.
- Push notifications and background refresh are not implemented yet.
- The app currently uses a SwiftUI shell that intentionally mirrors the desktop app's layout and tone.
