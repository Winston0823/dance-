import type { AudioAsset } from "../../../packages/core/src/index.ts";

export interface AudioImportFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface DecodedAudio {
  duration: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioContextAdapter {
  decodeAudioData(data: ArrayBuffer): Promise<DecodedAudio>;
  close(): Promise<void> | void;
}

export interface AudioImportOptions<T extends AudioImportFile> {
  createAudioContext?: () => AudioContextAdapter;
  uploadFile: (file: T, signal?: AbortSignal) => Promise<AudioAsset>;
  /** The caller owns its monotonically increasing import sequence. */
  isCurrent?: () => boolean;
  signal?: AbortSignal;
}

export type AudioImportResult =
  { status: "imported"; asset: AudioAsset } | { status: "ignored" };

export const MAX_AUDIO_IMPORT_BYTES = 30 * 1024 * 1024;
export const AUDIO_PEAK_BINS = 700;

/** Filename fallback only supplies a transport hint; the server still verifies bytes. */
export function getAudioUploadMime(file: {
  name: string;
  type?: string;
}): string {
  const type = (file.type ?? "").split(";")[0].trim().toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (type === "video/mp4" && (extension === "m4a" || extension === "mp4"))
    return "audio/mp4";
  if (type && type !== "application/octet-stream") return type;
  const byExtension: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/opus",
  };
  return extension &&
    Object.prototype.hasOwnProperty.call(byExtension, extension)
    ? byExtension[extension]
    : "application/octet-stream";
}

/**
 * Decode and measure locally before uploading the original file. Ignored results
 * must not replace the current track. Aborting cannot cancel an in-flight browser
 * decode; the sequence/signal checks discard its result when it completes.
 */
export async function importAudioFile<T extends AudioImportFile>(
  file: T,
  options: AudioImportOptions<T>,
): Promise<AudioImportResult> {
  const obsolete = () =>
    !!options.signal?.aborted || options.isCurrent?.() === false;
  const ignored = (): AudioImportResult => ({ status: "ignored" });
  if (obsolete()) return ignored();
  if (
    !file ||
    typeof file.name !== "string" ||
    !file.name.trim() ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MAX_AUDIO_IMPORT_BYTES ||
    typeof file.arrayBuffer !== "function"
  ) {
    throw new Error("Choose a nonempty audio file no larger than 30 MB.");
  }
  try {
    const bytes = await file.arrayBuffer();
    if (obsolete()) return ignored();
    if (
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength === 0 ||
      bytes.byteLength !== file.size
    )
      throw new Error("The audio file could not be read completely.");
    const context = (
      options.createAudioContext ??
      (() => {
        if (typeof globalThis.AudioContext !== "function")
          throw new Error(
            "Audio decoding is unavailable. Open DanceForm in a browser that supports Web Audio.",
          );
        return new globalThis.AudioContext();
      })
    )();
    let duration: number, peaks: number[];
    try {
      if (obsolete()) return ignored();
      const decoded = await context.decodeAudioData(bytes);
      if (obsolete()) return ignored();
      if (
        !decoded ||
        !Number.isFinite(decoded.duration) ||
        decoded.duration <= 0 ||
        decoded.duration > 86400 ||
        !Number.isInteger(decoded.numberOfChannels) ||
        decoded.numberOfChannels < 1 ||
        decoded.numberOfChannels > 32
      )
        throw new Error("The decoded audio has invalid duration or channels.");
      duration = decoded.duration;
      peaks = new Array<number>(AUDIO_PEAK_BINS).fill(0);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        if (obsolete()) return ignored();
        const samples = decoded.getChannelData(channel);
        if (!(samples instanceof Float32Array) || samples.length === 0)
          throw new Error("The decoded audio has invalid channel data.");
        // Each bin includes every sample overlapping its time interval. Short
        // clips repeat their relevant sample instead of producing empty bins.
        for (let bin = 0; bin < AUDIO_PEAK_BINS; bin++) {
          const start = Math.floor((bin * samples.length) / AUDIO_PEAK_BINS);
          const end = Math.min(
            samples.length,
            Math.ceil(((bin + 1) * samples.length) / AUDIO_PEAK_BINS),
          );
          for (let index = start; index < end; index++) {
            const amplitude = Math.abs(samples[index]);
            if (!Number.isFinite(amplitude))
              throw new Error("The decoded audio contains nonfinite samples.");
            // Waveform peaks are normalized full-scale magnitudes, not loudness.
            peaks[bin] = Math.max(peaks[bin], Math.min(1, amplitude));
          }
        }
      }
    } finally {
      // Cleanup failure must not replace a successful decode or its actual error.
      try {
        await context.close();
      } catch {
        /* Best-effort resource cleanup. */
      }
    }
    if (obsolete()) return ignored();
    const asset = await options.uploadFile(file, options.signal);
    if (obsolete()) return ignored();
    return { status: "imported", asset: { ...asset, duration, peaks } };
  } catch (error) {
    if (obsolete()) return ignored();
    throw error;
  }
}
