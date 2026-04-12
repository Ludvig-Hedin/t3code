export function appendVoiceTranscript(existingPrompt: string, transcript: string): string {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) return existingPrompt;
  return existingPrompt.trim().length > 0
    ? `${existingPrompt.trimEnd()} ${trimmedTranscript}`
    : trimmedTranscript;
}
