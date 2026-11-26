/** Audio timestamp = choreography beat * 60 / bpm + offsetSeconds. */
export function getAudioBeatRange(
  durationSeconds: number,
  offsetSeconds: number,
  bpm: number,
): { startBeat: number; durationBeats: number } | null {
  if (
    ![durationSeconds, offsetSeconds, bpm].every(Number.isFinite) ||
    durationSeconds <= 0 ||
    bpm <= 0
  )
    return null;
  return {
    startBeat: (-offsetSeconds * bpm) / 60,
    durationBeats: (durationSeconds * bpm) / 60,
  };
}
