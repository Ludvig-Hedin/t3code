# iOS Companion

This repo now includes a native iPhone-first companion app under `apps/mobile`.

## What it does

- Pairs with a desktop T3 Code session through the server's mobile relay routes.
- Reuses the same orchestration read model and shared contracts as the desktop and web apps.
- Mirrors the desktop visual language with a card-based, chat-first SwiftUI shell.
- Supports pairing, session refresh, prompt submission, diff review, approval responses, and device management.

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

2. Open `apps/mobile/T3Mobile.xcodeproj` in Xcode.

3. Run the desktop/server app first so the mobile app has a session to pair with.

## Status

- Pairing, snapshot sync, prompt dispatch, diff retrieval, and device revocation are implemented.
- Push notifications and background refresh are not implemented yet.
- The app currently uses a SwiftUI shell that intentionally mirrors the desktop app's layout and tone.
