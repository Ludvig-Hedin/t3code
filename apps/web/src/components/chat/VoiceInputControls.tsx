import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { getTranscriptionErrorMessage, transcribeAudio } from "~/lib/transcription";
import { CheckIcon, LoaderCircleIcon, MicIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

export interface VoiceInputControlsProps {
  disabled: boolean;
  autoSendVoiceTranscripts: boolean;
  onTranscriptReady: (text: string) => void | Promise<void>;
  onAutoSendRequested: () => void | Promise<void>;
}

type VoiceInputMode = "idle" | "recording" | "transcribing";

const DISCARD_CONFIRMATION_MS = 5_000;
const WAVE_BAR_COUNT = 12;
const WAVE_BAR_IDS = Array.from({ length: WAVE_BAR_COUNT }, (_, index) => `wave-bar-${index}`);
const IDLE_WAVEFORM = Array.from({ length: WAVE_BAR_COUNT }, (_, index) =>
  index % 3 === 0 ? 0.3 : 0.18,
);

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export const VoiceInputControls = memo(function VoiceInputControls({
  disabled,
  autoSendVoiceTranscripts,
  onTranscriptReady,
  onAutoSendRequested,
}: VoiceInputControlsProps) {
  const [mode, setMode] = useState<VoiceInputMode>("idle");
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waveform, setWaveform] = useState<number[]>(IDLE_WAVEFORM);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognitionShouldRestartRef = useRef(false);
  const speechTranscriptRef = useRef("");
  const latestSpeechInterimRef = useRef("");

  const resetWaveform = useEffectEvent(() => {
    setWaveform(IDLE_WAVEFORM);
  });

  const stopWaveformLoop = useEffectEvent(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    resetWaveform();
  });

  const stopSpeechRecognition = useEffectEvent(() => {
    speechRecognitionShouldRestartRef.current = false;
    if (!speechRecognitionRef.current) return;
    speechRecognitionRef.current.stop();
    speechRecognitionRef.current = null;
  });

  const releaseMediaResources = useEffectEvent(async () => {
    stopWaveformLoop();
    stopSpeechRecognition();
    analyserRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // Ignore close races during fast stop/unmount transitions.
      }
      audioContextRef.current = null;
    }
  });

  const startWaveformLoop = useEffectEvent(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const sampleBuffer = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser) return;

      currentAnalyser.getByteFrequencyData(sampleBuffer);
      const average = sampleBuffer.reduce((sum, value) => sum + value, 0) / sampleBuffer.length;
      const intensity = Math.min(1, average / 96);
      const nextWave = Array.from({ length: WAVE_BAR_COUNT }, (_, index) => {
        const distanceFromCenter = Math.abs(index - (WAVE_BAR_COUNT - 1) / 2);
        const falloff = 1 - distanceFromCenter / ((WAVE_BAR_COUNT - 1) / 2 + 1);
        const jitter = 0.08 + ((index % 2 === 0 ? 1 : 0.65) * intensity) / 1.2;
        return Math.max(0.16, Math.min(1, jitter + falloff * intensity));
      });

      setWaveform(nextWave);
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  });

  const startSpeechRecognition = useEffectEvent(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    speechRecognitionShouldRestartRef.current = true;

    recognition.onresult = (event) => {
      let finalTranscript = speechTranscriptRef.current;
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      speechTranscriptRef.current = finalTranscript;
      latestSpeechInterimRef.current = interimTranscript;
    };

    recognition.addEventListener("error", () => {
      // Keep fallback best-effort only; the primary server path still handles the
      // transcription when available.
    });

    recognition.onend = () => {
      if (!speechRecognitionShouldRestartRef.current) return;
      try {
        recognition.start();
      } catch {
        speechRecognitionShouldRestartRef.current = false;
      }
    };

    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      speechRecognitionShouldRestartRef.current = false;
      speechRecognitionRef.current = null;
    }
  });

  const readRecordedDurationMs = useCallback(() => {
    if (recordingStartedAtRef.current === null) return 0;
    return performance.now() - recordingStartedAtRef.current;
  }, []);

  const stopRecording = useEffectEvent(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      await releaseMediaResources();
      return null;
    }

    const stoppedBlob = await new Promise<Blob | null>((resolve) => {
      const resolveBlob = () => {
        const blob = chunksRef.current.length
          ? new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
          : null;
        resolve(blob);
      };

      if (recorder.state === "inactive") {
        resolveBlob();
        return;
      }

      const handleStop = () => resolveBlob();
      recorder.addEventListener("stop", handleStop, { once: true });
      recorder.stop();
    });

    await releaseMediaResources();
    return stoppedBlob;
  });

  const handleTranscriptionSuccess = useEffectEvent(async (text: string) => {
    const normalized = text.trim();
    if (!normalized) {
      setErrorMessage("Couldn’t transcribe audio. Try again.");
      setMode("idle");
      return;
    }

    await onTranscriptReady(normalized);
    setMode("idle");

    if (autoSendVoiceTranscripts) {
      await onAutoSendRequested();
    }
  });

  const beginRecording = useCallback(async () => {
    if (disabled || mode !== "idle") return;

    setErrorMessage(null);
    speechTranscriptRef.current = "";
    latestSpeechInterimRef.current = "";
    chunksRef.current = [];

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(mediaStream);
      const audioContext = new AudioContext();
      const mediaSource = audioContext.createMediaStreamSource(mediaStream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 128;
      mediaSource.connect(analyser);

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      mediaStreamRef.current = mediaStream;
      mediaRecorderRef.current = mediaRecorder;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      recordingStartedAtRef.current = performance.now();

      mediaRecorder.start();
      startWaveformLoop();
      startSpeechRecognition();
      setMode("recording");
    } catch (error) {
      await releaseMediaResources();
      setErrorMessage(
        error instanceof Error && error.message ? error.message : "Microphone access was denied.",
      );
      setMode("idle");
    }
  }, [disabled, mode]);

  const discardRecording = useCallback(async () => {
    await stopRecording();
    chunksRef.current = [];
    recordingStartedAtRef.current = null;
    setMode("idle");
  }, []);

  const cancelRecording = useCallback(async () => {
    if (readRecordedDurationMs() < DISCARD_CONFIRMATION_MS) {
      await discardRecording();
      return;
    }
    setShowDiscardConfirm(true);
  }, [discardRecording, readRecordedDurationMs]);

  const saveRecording = useCallback(async () => {
    if (mode !== "recording") return;

    setErrorMessage(null);
    setMode("transcribing");

    try {
      const audioBlob = await stopRecording();
      recordingStartedAtRef.current = null;

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error("No audio was recorded.");
      }

      try {
        const result = await transcribeAudio(audioBlob);
        await handleTranscriptionSuccess(result.text);
      } catch (error) {
        const fallbackTranscript =
          `${speechTranscriptRef.current} ${latestSpeechInterimRef.current}`.trim();
        if (fallbackTranscript) {
          console.warn("Voice transcription failed; using browser speech fallback.", error);
          await handleTranscriptionSuccess(fallbackTranscript);
          return;
        }

        throw error;
      }
    } catch (error) {
      setErrorMessage(getTranscriptionErrorMessage(error));
      setMode("idle");
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      void releaseMediaResources();
    };
  }, []);

  const dots = useMemo(() => [0, 1, 2], []);
  const isBusy = disabled || mode === "transcribing";

  return (
    <>
      <div className="relative flex shrink-0 items-center">
        {mode === "idle" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full text-muted-foreground/70 hover:text-foreground/80"
            aria-label="Start voice recording"
            disabled={isBusy}
            onClick={() => void beginRecording()}
          >
            <MicIcon className="size-4" />
          </Button>
        ) : (
          <div
            data-testid="voice-recording-pill"
            className="flex h-9 items-center gap-2 rounded-full bg-foreground px-2.5 text-background sm:h-8"
          >
            <div className="flex h-4 items-center gap-0.5">
              {WAVE_BAR_IDS.map((barId, index) => {
                const height = waveform[index] ?? IDLE_WAVEFORM[index] ?? 0.18;
                return (
                  <span
                    key={barId}
                    className="w-0.5 rounded-full bg-background/90 transition-[height,opacity] duration-100"
                    style={{
                      height: `${Math.max(4, Math.round(height * 14))}px`,
                      opacity: 0.4 + height * 0.6,
                    }}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              {mode === "transcribing" ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                dots.map((dot) => (
                  <span
                    key={dot}
                    className="size-1 rounded-full bg-background/75 animate-pulse"
                    style={{ animationDelay: `${dot * 160}ms` }}
                  />
                ))
              )}
            </div>

            {mode === "recording" ? (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full border-none text-background hover:bg-background/14 hover:text-background"
                  aria-label="Cancel recording"
                  onClick={() => void cancelRecording()}
                >
                  <XIcon className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="rounded-full border-none text-background hover:bg-background/14 hover:text-background"
                  aria-label="Save recording"
                  onClick={() => void saveRecording()}
                >
                  <CheckIcon className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>
        )}

        {errorMessage ? (
          <div
            className={cn(
              "-bottom-8 absolute right-0 max-w-xs whitespace-normal rounded-md bg-background px-2 py-1 text-destructive text-xs shadow-sm",
            )}
          >
            {errorMessage}
          </div>
        ) : null}
      </div>

      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogPopup className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this recording?</AlertDialogTitle>
            <AlertDialogDescription>You’ve recorded more than 5 seconds.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter variant="bare">
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              Keep recording
            </AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" size="sm" />}
              onClick={() => void discardRecording()}
            >
              Discard
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
});
