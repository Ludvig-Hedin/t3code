# TODO

## Recently completed

- [x] Empty chat state shows a centered `Create project` button that launches the project picker and starts the first thread
- [x] Ollama provider: pull/quit models from UI, local HTTP+SSE adapter, model picker
- [x] OpenCode provider: `opencode app-server` subprocess + HTTP+SSE adapter
- [x] Gemini provider: rate-limited managed server provider
- [x] Remote Access: Cloudflare Named Tunnel bundled in Electron (`TunnelManager`)
- [x] Keep Awake: `powerSaveBlocker` + `caffeinate` via `KeepAwakeManager` in desktop app
- [x] Onboarding: 5-step onboarding sheet (`OnboardingSheet`) mounted at app root
- [x] Import conversations: provider import scan + execute HTTP routes + setup guide button
- [x] Setup guide moved to General settings tab
- [x] iOS companion app (`apps/mobile`) with QR-first pairing, thread list, chat, diff review, approvals, device management
- [x] Preview panel: tabbed side panel with live web preview and mobile webview relay
- [x] Automations manager and Gemini rate limits
- [x] Keybindings: configurable via `~/.t3/keybindings.json`, `chat.newLocal` command added
- [x] Appearance/theme customization: CSS variable injection via settings
- [x] TraitsPicker: brain icon + tooltip on trigger button, improved layout
- [x] ChatHeader panel toggles: text labels + improved tooltips
- [x] Permissions/mode descriptions + approval detail + plan banner in agent UI

## Small things

- [ ] Submitting new messages should scroll to bottom
- [ ] Only show last 10 threads for a given project
- [ ] Thread archiving
- [ ] New projects should go on top
- [ ] Projects should be sorted by latest thread update
- [ ] Auto-scroll to latest activity when a new turn starts

## Bigger things

- [ ] Queueing messages (send while agent is running; queue for next turn)
- [ ] Push notifications for iOS companion (phase 2 after relay reliability proven)
- [ ] Background refresh for iOS companion
- [ ] Internet relay for iOS companion (currently LAN-only via direct or Cloudflare tunnel)
- [ ] Per-project model/provider defaults
- [ ] Thread search
- [ ] Bulk thread management (archive, delete multiple)

## Known issues / tech debt

- [ ] `bun typecheck` has pre-existing Effect typing issues in `apps/server` that need resolution
- [ ] Mobile pairing QR should refuse to generate from `localhost` origin (already guarded on desktop, verify web path)
- [ ] Automations are still browser-session-bound for scheduling; they will not run while the laptop is asleep or the lid is closed unless scheduling moves to a background service.
