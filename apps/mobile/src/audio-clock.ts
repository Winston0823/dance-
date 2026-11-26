export interface NativeAudioPort {
  seekTo(
    seconds: number,
    toleranceBefore?: number,
    toleranceAfter?: number,
  ): Promise<void>;
  setPlaybackRate(rate: number): void;
  play(): void;
  pause(): void;
}

/** Serialize native seeks: an uncancellable old seek must finish before a new one. */
export class NativeSeekController {
  private epoch = 0;
  private disposed = false;
  private queue: Promise<void> = Promise.resolve();
  private player: NativeAudioPort;
  private onError: (error: unknown) => void;
  phase: "idle" | "seeking" | "audio" = "idle";
  constructor(player: NativeAudioPort, onError: (error: unknown) => void) {
    this.player = player;
    this.onError = onError;
  }
  start(seconds: number, rate: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const epoch = ++this.epoch;
    this.phase = "seeking";
    this.player.pause();
    const task = this.queue
      .then(async () => {
        if (this.disposed || epoch !== this.epoch) return;
        this.player.setPlaybackRate(rate);
        // AVPlayer otherwise defaults to infinite seek tolerance on iOS.
        await this.player.seekTo(Math.max(0, seconds), 0, 0);
        if (this.disposed || epoch !== this.epoch) return;
        this.player.play();
        this.phase = "audio";
      })
      .catch((error) => {
        if (this.disposed || epoch !== this.epoch) return;
        this.phase = "idle";
        this.onError(error);
      });
    this.queue = task;
    return task;
  }
  pause() {
    this.epoch++;
    this.phase = "idle";
    this.player.pause();
  }
  dispose() {
    this.disposed = true;
    this.pause();
  }
}

export function playbackBoundary(
  beat: number,
  total: number,
  loop: [number, number] | null,
) {
  if (loop && beat >= loop[1] - 1e-7)
    return { beat: loop[0], looped: true, ended: false };
  if (beat >= total - 1e-7) return { beat: total, looped: false, ended: true };
  return { beat: Math.max(0, beat), looped: false, ended: false };
}

export function audioHasEnded(
  currentTime: number,
  duration: number,
  status: { didJustFinish: boolean; currentTime: number },
) {
  // A previously finished status can remain visible for one render after seeking.
  return (
    (duration > 0 && currentTime >= duration) ||
    (status.didJustFinish && Math.abs(status.currentTime - currentTime) < 1e-3)
  );
}

/** Check before issuing a native seek, which may otherwise clamp back to EOF. */
export function audioStartBoundary(
  seconds: number,
  knownDuration: number,
): "preroll" | "ready" | "past-end" {
  if (seconds < 0) return "preroll";
  if (
    Number.isFinite(knownDuration) &&
    knownDuration > 0 &&
    seconds >= knownDuration
  )
    return "past-end";
  return "ready";
}
