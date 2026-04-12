import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

const { onTranscriptReadySpy, onAutoSendRequestedSpy, transcribeAudioSpy } = vi.hoisted(() => ({
  onTranscriptReadySpy: vi.fn<(text: string) => Promise<void>>(() => Promise.resolve()),
  onAutoSendRequestedSpy: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  transcribeAudioSpy: vi.fn<(audioBlob: Blob) => Promise<unknown>>(),
}));

vi.mock("~/lib/transcription", () => ({
  transcribeAudio: (audioBlob: Blob) => transcribeAudioSpy(audioBlob),
  isUnavailableTranscriptionError: (error: unknown) =>
    Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "unavailable",
    ),
}));

class FakeMediaRecorder extends EventTarget {
  state: RecordingState = "inactive";
  mimeType = "audio/webm";

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    const blobEvent = new Event("dataavailable") as Event & { data: Blob };
    blobEvent.data = new Blob(["audio"], { type: this.mimeType });
    this.dispatchEvent(blobEvent);
    this.dispatchEvent(new Event("stop"));
  }
}

class FakeAnalyserNode {
  frequencyBinCount = 8;
  fftSize = 128;

  getByteFrequencyData(buffer: Uint8Array) {
    buffer.fill(72);
  }
}

class FakeAudioContext {
  createMediaStreamSource() {
    return {
      connect: () => undefined,
    };
  }

  createAnalyser() {
    return new FakeAnalyserNode() as unknown as AnalyserNode;
  }

  close() {
    return Promise.resolve();
  }
}

class FakeSpeechRecognition extends EventTarget {
  continuous = true;
  interimResults = true;
  lang = "en-US";
  onresult: ((event: Event & { resultIndex: number; results: ArrayLike<unknown> }) => void) | null =
    null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    return undefined;
  }

  stop() {
    this.onend?.();
  }

  emitResult(transcript: string) {
    const result = { isFinal: true, length: 1, 0: { transcript } };
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: result },
    } as unknown as Event & { resultIndex: number; results: ArrayLike<unknown> });
  }
}

let currentNow = 0;
let latestRecognition: FakeSpeechRecognition | null = null;

beforeEach(() => {
  currentNow = 0;
  latestRecognition = null;
  vi.spyOn(performance, "now").mockImplementation(() => currentNow);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), 16);
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    window.clearTimeout(handle);
  });

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(() =>
        Promise.resolve({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      ),
    },
  });

  const SpeechRecognition = class extends FakeSpeechRecognition {
    constructor() {
      super();
      latestRecognition = this;
    }
  };

  vi.stubGlobal("SpeechRecognition", SpeechRecognition);
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: SpeechRecognition,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onTranscriptReadySpy.mockClear();
  onAutoSendRequestedSpy.mockClear();
  transcribeAudioSpy.mockReset();
  document.body.innerHTML = "";
});

import { VoiceInputControls } from "./VoiceInputControls";

describe("VoiceInputControls", () => {
  it("uses the browser fallback transcript when transcription fails", async () => {
    transcribeAudioSpy.mockRejectedValueOnce(new Error("Local model failed to load"));

    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(
      <VoiceInputControls
        disabled={false}
        autoSendVoiceTranscripts={true}
        onTranscriptReady={onTranscriptReadySpy}
        onAutoSendRequested={onAutoSendRequestedSpy}
      />,
      { container: host },
    );

    try {
      await page.getByRole("button", { name: "Start voice recording" }).click();
      latestRecognition?.emitResult("browser fallback transcript");
      await page.getByRole("button", { name: "Save recording" }).click();

      await expect
        .poll(() => onTranscriptReadySpy.mock.calls.at(0)?.[0] ?? null)
        .toBe("browser fallback transcript");
      await expect.poll(() => onAutoSendRequestedSpy.mock.calls.length).toBe(1);
      await expect
        .element(page.getByRole("button", { name: "Start voice recording" }))
        .toBeInTheDocument();
    } finally {
      await screen.unmount();
      host.remove();
    }
  });

  it("asks for confirmation before discarding recordings longer than five seconds", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(
      <VoiceInputControls
        disabled={false}
        autoSendVoiceTranscripts={false}
        onTranscriptReady={onTranscriptReadySpy}
        onAutoSendRequested={onAutoSendRequestedSpy}
      />,
      { container: host },
    );

    try {
      await page.getByRole("button", { name: "Start voice recording" }).click();
      currentNow = 6_000;
      await page.getByRole("button", { name: "Cancel recording" }).click();

      await expect.element(page.getByText("Discard this recording?")).toBeInTheDocument();

      await page.getByRole("button", { name: "Discard" }).click();
      await expect
        .element(page.getByRole("button", { name: "Start voice recording" }))
        .toBeInTheDocument();
    } finally {
      await screen.unmount();
      host.remove();
    }
  });
});
