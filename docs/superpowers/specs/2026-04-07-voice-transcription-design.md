# Voice Transcription Button — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

---

## Overview

Add a voice-to-text transcription button to the chat composer, placed between the context-window meter and the send button. The user taps the mic, speaks, taps stop, and the transcribed text is pasted into the prompt input. First-time flow is zero-friction: a setup dialog guides the user through choosing a provider in < 30 seconds.

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
   - **OpenAI API** — paste API key; "Test key" button.
   - **OpenRouter API** — paste API key; "Test key" button.
4. User clicks "Save & start recording" → dialog closes, recording begins immediately.

### Error states

- Mic permission denied → toast: "Microphone access denied. Check browser permissions."
- API error (4xx/5xx) → toast with message; button resets to idle.
- Network error → toast: "Transcription failed. Check your connection/endpoint."
- Recording too short (< 0.3 s) → silently reset without API call.

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

### Fully client-side — no backend changes

Audio is captured via the browser's `MediaRecorder` API. The resulting `Blob` is POSTed directly from the browser to whichever transcription endpoint is configured. Credentials live in `ClientSettings` (localStorage) — consistent with existing client-settings pattern.

### New files

| File                                                | Role                                   |
| --------------------------------------------------- | -------------------------------------- |
| `apps/web/src/hooks/useVoiceTranscription.ts`       | State machine, MediaRecorder, API POST |
| `apps/web/src/components/chat/TranscribeButton.tsx` | Button + tooltip, consumes the hook    |
| `apps/web/src/components/chat/VoiceSetupDialog.tsx` | First-run setup + reconfigure dialog   |

### Modified files

| File                                                  | Change                                               |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `packages/contracts/src/settings.ts`                  | Add `voiceTranscription` to `ClientSettingsSchema`   |
| `apps/web/src/components/ChatView.tsx`                | Mount `<TranscribeButton>` in right-side actions div |
| `apps/web/src/components/settings/SettingsPanels.tsx` | Add "Voice" settings row with reconfigure button     |

---

## Settings Schema Addition

```ts
// packages/contracts/src/settings.ts — inside ClientSettingsSchema
voiceTranscription: Schema.Struct({
  provider: Schema.Literals(["none", "openai", "openrouter", "local"]).pipe(
    Schema.withDecodingDefault(() => "none" as const),
  ),
  apiKey: Schema.String.pipe(Schema.withDecodingDefault(() => "")),
  localEndpoint: Schema.String.pipe(Schema.withDecodingDefault(() => "http://localhost:10300")),
}).pipe(Schema.withDecodingDefault(() => ({}))),
```

No migration needed (default decoding handles missing keys).

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
- Sends `multipart/form-data` with `file` (blob) + `model` to the configured endpoint.
- **OpenAI:** `POST https://api.openai.com/v1/audio/transcriptions` model=`whisper-1`
- **OpenRouter:** `POST https://openrouter.ai/api/v1/audio/transcriptions` model=`openai/whisper-1`
- **Local:** `POST {localEndpoint}/v1/audio/transcriptions` model=`whisper-1` (OpenAI-compatible; works with `faster-whisper-server`, `whisper.cpp` server)

Returns `{ text: string }` in all cases (OpenAI-compatible response shape).

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
- Three provider cards with radio selection.
- "Local model (recommended)" card includes:
  - Install snippet: `pip install faster-whisper-server && faster-whisper-server`
  - Default URL pre-filled; editable.
  - "Test connection" button — hits `{url}/v1/models` and shows ✓ or error inline.
- OpenAI / OpenRouter cards: masked API key input + "Test key" button — hits transcriptions endpoint with a silent 0.1 s empty audio blob; shows ✓ or error inline.
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
