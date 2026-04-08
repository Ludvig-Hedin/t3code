# Voice Transcription Button — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

---

## Overview

Add a voice-to-text transcription button to the chat composer, placed between the context-window meter and the send button. The user taps the mic, speaks, taps stop, and the transcribed text is pasted into the prompt input. First-time flow is zero-friction: a setup dialog guides the user through choosing a provider in < 30 seconds.

### Privacy, consent, and compliance

- **Disclosure:** Voice audio is sent to the configured provider (cloud) or processed locally, depending on the selected mode. Before first use, the setup dialog must show a short **privacy notice** explaining what is recorded, where it is sent, and retention implications.
- **Consent:** When the mic button opens the setup dialog (`provider === "none"`), require **explicit opt-in** (checkboxes) for OpenAI and OpenRouter: user acknowledges third-party processing and links to the provider’s **data retention / subprocessors** documentation. For **Local model**, state clearly that audio stays on the user’s machine when using a local endpoint.
- **PII:** Include a toggle or acknowledgment that the user should not dictate passwords or highly sensitive PII; link to provider policies where relevant.
- **GDPR / CCPA:** Document lawful basis (consent for optional cloud transcription), right to withdraw (clear settings + stop sending audio), and that users may request deletion per provider dashboards where applicable.
- **Retention / deletion:** Spec: cloud providers follow their API retention; the app must not log raw audio blobs server-side. Document a default “no long-term storage in Bird Code” policy for transcription payloads.

---

## User-Facing Flow

### Happy path (configured)

1. User clicks muted-mic button (idle state).
2. Browser requests microphone permission (first time only).
3. Button turns red-pulsing square (recording state) — tooltip: "Stop recording".
4. User clicks stop.
5. Button shows spinner (transcribing state) — tooltip: "Transcribing…".
6. Transcribed text is appended to the prompt; editor refocused; button returns to muted-mic (idle).

### First-time / unconfigured path

1. User clicks mic button (provider = `"none"`).
2. Setup dialog opens immediately — no dead ends.
3. User picks one of three options (cards with radio selection):
   - **Local model (recommended)** — shows install guide for `faster-whisper-server` (one `pip install` + one command); user pastes local URL (default `http://localhost:10300`); "Test connection" button.
   - **OpenAI API** — paste API key; **"Test connection"** button (see `VoiceSetupDialog` below).
   - **OpenRouter API** — paste API key; **"Test connection"** button.
4. User clicks "Save & start recording" → dialog closes, recording begins immediately.

### Error states

- Mic permission denied → toast: "Microphone access denied. Check browser permissions."
- API error (4xx/5xx) → toast with message; button resets to idle.
- Network error → toast: "Transcription failed. Check your connection/endpoint."
- Recording too short (< 0.3 s) → silently reset without API call.
- **Rate limiting / quota exhaustion** → toast with provider-specific hint (“Quota exceeded — check billing or try later”); `TranscribeButton` returns to idle; setup dialog may link to provider status.
- **Provider consent or policy denial** (e.g. account cannot use audio API) → toast + inline error in `VoiceSetupDialog`; mic stays disabled until user fixes configuration.

---

## Button States

| State          | Icon          | Visual                                |
| -------------- | ------------- | ------------------------------------- |
| `idle`         | `MicOffIcon`  | Ghost/muted opacity-50                |
| `recording`    | Square (stop) | Red background, subtle pulse ring     |
| `transcribing` | Spinner SVG   | Muted                                 |
| `error`        | `MicOffIcon`  | Brief red tint, auto-resets after 2 s |

---

## Architecture

### Recommended: server-proxied transcription (default)

**Storing raw API keys in `ClientSettings` / localStorage is an XSS risk** (any script on the page can exfiltrate keys). Prefer:

1. **Backend-proxied endpoint (recommended):** The browser POSTs `multipart/form-data` audio to **`POST /api/.../transcribe`** (or equivalent) on the Bird Code server; the server attaches the provider key from **server-side secrets** and forwards to OpenAI/OpenRouter. `useVoiceTranscription.ts` uses **no client-held provider secret** in this mode.
2. **Optional dev-only path:** If a key must exist in the client (not recommended), document it as **high risk** and store only an **encrypted blob** (Web Crypto + user passphrase), never plaintext — see Settings schema notes below.

`TranscribeButton.tsx` and `ChatView.tsx` wire the hook to whichever base URL the settings select (proxy vs legacy). Tests and docs must describe the **proxied** flow as the supported production pattern.

### New files

| File                                                | Role                                   |
| --------------------------------------------------- | -------------------------------------- |
| `apps/web/src/hooks/useVoiceTranscription.ts`       | State machine, MediaRecorder, API POST |
| `apps/web/src/components/chat/TranscribeButton.tsx` | Button + tooltip, consumes the hook    |
| `apps/web/src/components/chat/VoiceSetupDialog.tsx` | First-run setup + reconfigure dialog   |

### Modified files

| File                                                  | Change                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/contracts/src/settings.ts`                  | Add `voiceTranscription` to `ClientSettingsSchema`                                    |
| `apps/web/src/components/ChatView.tsx`                | Mount `<TranscribeButton>` in right-side actions div                                  |
| `apps/web/src/components/settings/SettingsPanels.tsx` | Add "Voice" settings row; recommend proxied mode; warn if storing secrets client-side |

---

## Settings Schema Addition

```ts
// packages/contracts/src/settings.ts — inside ClientSettingsSchema
// SECURITY: `apiKey` is sensitive. Prefer server-proxied transcription so this stays empty.
// If present, it is still plaintext in localStorage — rotation, least-privilege keys, and XSS
// mitigation are operator responsibilities; prefer vaulted server-side secrets in production.
voiceTranscription: Schema.Struct({
  provider: Schema.Literals(["none", "openai", "openrouter", "local"]).pipe(
    Schema.withDecodingDefault(() => "none" as const),
  ),
  /** @deprecated for production — use server proxy; plaintext localStorage is XSS-exposed */
  apiKey: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  useServerProxy: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  localEndpoint: Schema.String.pipe(Schema.withDecodingDefault(() => "http://localhost:10300")),
}).pipe(Schema.withDecodingDefault(() => ({}))),
```

Use `Schema.Redacted` / branded **Secret** types in code when the codebase adds them; until then, **comments + `useServerProxy` default true** document intent. No migration needed (default decoding handles missing keys).

---

## `useVoiceTranscription` Hook API

```ts
type TranscriptionState = "idle" | "recording" | "transcribing" | "error";

interface UseVoiceTranscriptionResult {
  state: TranscriptionState;
  isConfigured: boolean; // provider !== "none"
  toggle: () => Promise<void>; // idle→recording, recording→transcribing→idle
}
```

Internally:

- `MediaRecorder` collects chunks into a `Blob` on stop.
- Sends `multipart/form-data` with `file` (blob) + `model` to the configured endpoint (app origin when using server proxy).
- **OpenAI:** `POST https://api.openai.com/v1/audio/transcriptions` model=`whisper-1`
- **OpenRouter:** `POST https://openrouter.ai/api/v1/audio/transcriptions` model=`openai/whisper-1`
- **Local:** `POST {localEndpoint}/v1/audio/transcriptions` model=`whisper-1` (OpenAI-compatible; works with `faster-whisper-server`, `whisper.cpp` server)

Returns `{ text: string }` in all cases (OpenAI-compatible response shape).

### Technical constraints (`useVoiceTranscription`, `UseVoiceTranscriptionResult`, `toggle`, `MediaRecorder`)

- **Browser support:** Chrome/Edge/Firefox typically record **WebM/Opus** (`audio/webm;codecs=opus`). Safari often requires **`audio/mp4`** or `audio/mp4;codecs=mp4a.40.2` — probe `MediaRecorder.isTypeSupported` and pick the first supported MIME.
- **Primary MIME:** prefer `audio/webm;codecs=opus`; **fallback:** `audio/mp4`.
- **Maximum duration:** cap recording at **5 minutes**; on hit, stop `MediaRecorder` automatically, finalize blob, and show a non-blocking toast so users are not surprised.
- **Cleanup:** In `useEffect` cleanup and on unmount/navigation, **stop** the `MediaRecorder`, **stop** all `MediaStream` tracks from `getUserMedia`, and clear chunk buffers so recorders and microphones are never leaked across sessions.

---

## `TranscribeButton` Component

```tsx
<TranscribeButton
  prompt={prompt}
  onTranscribed={(text) => setPrompt(/* append */)}
  onNeedsSetup={() => setVoiceSetupOpen(true)}
/>
```

- Renders only when `!pendingAction && !isRunning` (hidden during agent turns / pending inputs).
- Positioned: after `<ContextWindowMeter>`, before `<ComposerPrimaryActions>`.

---

## `VoiceSetupDialog` Component

- Modal dialog (uses existing `Dialog` UI component).
- Props: `open`, `onOpenChange`, `onConfigured: () => void` (called after save → triggers recording start).
- **Security copy:** Show a prominent warning that **storing API keys in the browser (localStorage) is vulnerable to XSS**; default UI path should be **“Use backend proxy (recommended)”** with `useServerProxy: true`. If advanced users opt into local key storage, require acknowledgment and point to encrypted-blob + passphrase option from the Architecture section.
- Three provider cards with radio selection.
- "Local model (recommended)" card includes:
  - Install snippet: `pip install faster-whisper-server && faster-whisper-server`
  - Default URL pre-filled; editable.
  - "Test connection" button — hits `{url}/v1/models` and shows ✓ or error inline.
- OpenAI / OpenRouter cards: masked API key input + **"Test connection"** button — prefer POSTing a **minimal valid audio sample** (short WAV/WebM clip embedded as `ArrayBuffer` or base64 in the client bundle) to the transcriptions endpoint so a success implies the audio pipeline works. If implementation only checks reachability, label the result **"Connection OK"** (not "Transcription OK") and show a **warning**: passing does not guarantee real-world transcription quality or model access.
- Footer: "Save & start recording" (primary) + "Cancel".

---

## Placement in ChatView

```tsx
{/* Right side: send / stop button */}
<div ref={composerFooterActionsRef} data-chat-composer-actions="right" ...>
  {activeContextWindow ? <ContextWindowMeter ... /> : null}
  {/* NEW */}
  {!pendingAction && !isRunning && (
    <TranscribeButton
      prompt={prompt}
      onTranscribed={(text) => setPrompt(prompt ? `${prompt} ${text}` : text)}
      onNeedsSetup={() => setVoiceSetupOpen(true)}
      scheduleComposerFocus={scheduleComposerFocus}
    />
  )}
  {isPreparingWorktree ? <span ...>Preparing worktree...</span> : null}
  <ComposerPrimaryActions ... />
</div>

{/* Dialog (rendered at same level as other dialogs in ChatView) */}
<VoiceSetupDialog
  open={voiceSetupOpen}
  onOpenChange={setVoiceSetupOpen}
  onConfigured={() => { setVoiceSetupOpen(false); void transcribeButton.startRecording(); }}
/>
```

`voiceSetupOpen` is local `useState` in `ChatView`.  
`transcribeButton.startRecording()` is exposed via a `useRef` on `TranscribeButton`.

---

## Settings Panel Integration

Add a "Voice transcription" row in the General/Preferences section of `SettingsPanels.tsx`:

- Shows current provider name.
- "Configure" button opens `VoiceSetupDialog`.

---

## Testing Notes

- `useVoiceTranscription` is pure logic; can be unit-tested with mocked `MediaRecorder` and `fetch`.
- `TranscribeButton` snapshot tests for each state.
- `VoiceSetupDialog` — test that provider card selection updates form fields.

---

## Out of Scope

- In-app model download / management (too complex; direct users to `faster-whisper-server` docs instead).
- Streaming transcription (interim results while speaking).
- Language selection (Whisper auto-detects).
