import { useEffect, useId, useRef, useState } from "react";
import { getAudioBeatRange } from "./audio-placement.ts";
import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  Repeat2,
  Plus,
  Minus,
  Music2,
  Scan,
} from "lucide-react";
export type TimelineFormation = {
  id: string;
  name: string;
  count: number;
  transitionBeats?: number;
};
type Props = {
  count: number;
  total: number;
  playing: boolean;
  speed: number;
  bpm: number;
  formations: TimelineFormation[];
  sections: { id: string; name: string; start: number; end: number }[];
  selected: string;
  onSelect: (id: string) => void;
  onSeek: (n: number) => void;
  onPlay: () => void;
  onSpeed: (n: number) => void;
  onAdd: () => void;
  zoom: number;
  onZoom: (n: number) => void;
  loop: boolean;
  onLoop: () => void;
  loopStart: number;
  loopEnd: number;
  onLoopRange: (a: number, b: number) => void;
  waveform: number[];
  audioDuration: number;
  audioOffsetSeconds: number;
  onAudio: () => void;
  audioName?: string;
  practice: boolean;
  onTiming: (id: string, n: number) => void;
  onTransition: (id: string, duration: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  notes: { id: string; beat: number; label: string }[];
  warnings: { id: string; beat: number; label: string }[];
};
export default function Timeline(p: Props) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(650);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([e]) =>
      setViewport(e.contentRect.width),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const px = (viewport / p.total) * p.zoom;
  const audioRange = getAudioBeatRange(
    p.audioDuration,
    p.audioOffsetSeconds,
    p.bpm,
  );
  const [scrollBeat, setScrollBeat] = useState(0);
  const previousZoom = useRef(p.zoom);
  useEffect(() => {
    if (previousZoom.current !== p.zoom && ref.current) {
      ref.current.scrollLeft = Math.max(0, p.count * px - viewport * 0.4);
      previousZoom.current = p.zoom;
    }
  }, [p.zoom, px, p.count, viewport]);
  useEffect(() => {
    if (!p.playing || !ref.current) return;
    const x = p.count * px;
    const el = ref.current;
    if (x < el.scrollLeft + 12 || x > el.scrollLeft + el.clientWidth - 35)
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.2);
  }, [p.count, p.playing, px]);
  const suppressClick = useRef(false);
  const drag = useRef<{
    kind: "timing" | "transition" | "loopStart" | "loopEnd";
    id?: string;
    startX: number;
    startScroll: number;
    startValue: number;
    arrival: number;
    moved: boolean;
  } | null>(null);
  const dragStart = (
    e: React.PointerEvent,
    kind: "timing" | "transition" | "loopStart" | "loopEnd",
    id?: string,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const f = p.formations.find((f) => f.id === id);
    drag.current = {
      kind,
      id,
      startX: e.clientX,
      startScroll: ref.current?.scrollLeft || 0,
      startValue:
        kind === "transition"
          ? f!.count - (f!.transitionBeats || 0)
          : f?.count || 0,
      arrival: f?.count || 0,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const delta = e.clientX - d.startX + ref.current.scrollLeft - d.startScroll;
    if (!d.moved) {
      if (Math.abs(delta) < 4) return;
      d.moved = true;
      if (d.kind === "timing" || d.kind === "transition") p.onEditStart();
    }
    if (d.kind === "timing") p.onTiming(d.id!, d.startValue + delta / px);
    else if (d.kind === "transition")
      p.onTransition(d.id!, d.arrival - (d.startValue + delta / px));
    else {
      const box = ref.current.getBoundingClientRect();
      const at = Math.max(
        0,
        Math.min(
          p.total,
          Math.round(
            ((e.clientX - box.left + ref.current.scrollLeft) / px) * 4,
          ) / 4,
        ),
      );
      if (d.kind === "loopStart")
        p.onLoopRange(Math.min(at, p.loopEnd - 0.25), p.loopEnd);
      else p.onLoopRange(p.loopStart, Math.max(at, p.loopStart + 0.25));
    }
  };
  const dragEnd = () => {
    const d = drag.current;
    if (!d) return;
    if (d.moved) {
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (d.kind === "timing" || d.kind === "transition") p.onEditEnd();
    }
    drag.current = null;
  };
  const clickFormation = (id: string, count: number) => {
    if (suppressClick.current) return;
    p.onSelect(id);
    p.onSeek(count);
  };
  const timingKeys = (
    e: React.KeyboardEvent,
    id: string,
    value: number,
    transition = false,
  ) => {
    if (p.practice || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const next =
      value + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 8 : 0.25);
    if (transition) p.onTransition(id, next);
    else p.onTiming(id, next);
  };
  const seek = (e: React.PointerEvent) => {
    const box = e.currentTarget.getBoundingClientRect();
    p.onSeek(Math.max(0, Math.min(p.total, (e.clientX - box.left) / px)));
  };
  return (
    <section
      className={"timeline" + (expanded ? " expanded" : "")}
      aria-label="Choreography timeline"
    >
      <div className="transport">
        <div className="transport-controls">
          <button
            title="Previous formation"
            aria-label="Previous formation"
            onClick={() =>
              p.onSeek(
                [...p.formations].reverse().find((f) => f.count < p.count - 0.1)
                  ?.count || 0,
              )
            }
          >
            <ChevronFirst size={17} />
          </button>
          <button
            className="play-button"
            aria-label={p.playing ? "Pause" : "Play"}
            onClick={p.onPlay}
          >
            {p.playing ? (
              <Pause size={18} />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </button>
          <button
            title="Next formation"
            aria-label="Next formation"
            onClick={() =>
              p.onSeek(
                p.formations.find((f) => f.count > p.count + 0.1)?.count ||
                  p.total,
              )
            }
          >
            <ChevronLast size={17} />
          </button>
          <div className="count-readout">
            <strong>
              {Math.floor(p.count / 8) + 1}
              <span> : </span>
              {Math.floor(p.count % 8) + 1}
            </strong>
            <small>
              {((p.count * 60) / p.bpm).toFixed(1)}s{" "}
              <span>/ {Math.round((p.total * 60) / p.bpm)}s</span>
            </small>
          </div>
          <select
            aria-label="Playback speed"
            value={p.speed}
            onChange={(e) => p.onSpeed(+e.target.value)}
          >
            {[0.5, 0.75, 1].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <button
            className={p.loop ? "active" : ""}
            aria-label="Toggle loop"
            aria-pressed={p.loop}
            onClick={p.onLoop}
          >
            <Repeat2 size={17} />
          </button>
          <label className="loop-input">
            Loop{" "}
            <input
              aria-label="Loop start count"
              type="number"
              min="0"
              step=".25"
              max={p.loopEnd - 0.25}
              value={p.loopStart}
              onChange={(e) => p.onLoopRange(+e.target.value, p.loopEnd)}
            />
            –
            <input
              aria-label="Loop end count"
              type="number"
              step=".25"
              min={p.loopStart + 0.25}
              max={p.total}
              value={p.loopEnd}
              onChange={(e) => p.onLoopRange(p.loopStart, +e.target.value)}
            />
          </label>
        </div>
        <div className="timeline-actions">
          <button
            className="mobile-timeline-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Less" : "More"}
          </button>
          <span>{p.bpm} BPM</span>
          <button
            aria-label="Zoom timeline out"
            onClick={() => p.onZoom(Math.max(0.5, p.zoom - 0.25))}
          >
            <Minus size={14} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min=".5"
            max="3"
            step=".25"
            value={p.zoom}
            onChange={(e) => p.onZoom(+e.target.value)}
          />
          <button
            aria-label="Zoom timeline in"
            onClick={() => p.onZoom(Math.min(3, p.zoom + 0.25))}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="Fit entire timeline"
            title="Fit entire timeline"
            onClick={() => {
              p.onZoom(1);
              setScrollBeat(0);
              if (ref.current) ref.current.scrollLeft = 0;
            }}
          >
            <Scan size={14} />
          </button>
          {p.zoom > 1 && (
            <input
              className="timeline-pan"
              aria-label="Pan timeline"
              type="range"
              min="0"
              max={Math.max(0, p.total - viewport / px)}
              step=".25"
              value={scrollBeat}
              onChange={(e) => {
                const beat = +e.target.value;
                setScrollBeat(beat);
                if (ref.current) ref.current.scrollLeft = beat * px;
              }}
            />
          )}
          {!p.practice && (
            <button
              aria-label={p.audioName ? "Replace music" : "Add music"}
              title={p.audioName ? "Replace music" : "Add music"}
              onClick={p.onAudio}
            >
              <Music2 size={15} />
            </button>
          )}
          {!p.practice && (
            <button className="text-button" onClick={p.onAdd}>
              <Plus size={14} /> Formation
            </button>
          )}
        </div>
      </div>
      <div className="timeline-body" id={detailsId}>
        <div className="lane-labels">
          <div>COUNTS</div>
          <div>SECTIONS</div>
          <div>FORMATIONS</div>
          <div>TRANSITIONS</div>
          <button
            onClick={p.onAudio}
            disabled={p.practice}
            aria-label={p.audioName ? "Replace music" : "Add music"}
          >
            <Music2 size={13} /> MUSIC
          </button>
        </div>
        <div
          className="timeline-scroll"
          ref={ref}
          onScroll={(e) => setScrollBeat(e.currentTarget.scrollLeft / px)}
        >
          <div
            className="tracks"
            onPointerMove={dragMove}
            onPointerUp={dragEnd}
            onPointerCancel={dragEnd}
            onLostPointerCapture={dragEnd}
            style={{
              width: Math.max(p.total * px, viewport),
              backgroundSize: `${px * 8}px 100%`,
            }}
          >
            {p.sections.map((s, i) => (
              <div
                key={s.id}
                className={"full-section-region region-" + (i % 3)}
                style={{ left: s.start * px, width: (s.end - s.start) * px }}
              />
            ))}
            <div
              data-testid="timeline-ruler"
              role="slider"
              tabIndex={0}
              aria-label="Current choreography beat"
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-valuenow={Math.round(p.count * 4) / 4}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  p.onSeek(
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? p.total
                        : Math.max(
                            0,
                            Math.min(
                              p.total,
                              p.count +
                                (e.key === "ArrowRight" ? 1 : -1) *
                                  (e.shiftKey ? 8 : 0.25),
                            ),
                          ),
                  );
                }
              }}
              className="ruler"
              onPointerDown={(e) => {
                seek(e);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) seek(e);
              }}
            >
              {Array.from({ length: Math.ceil(p.total / 8) + 1 }, (_, i) => (
                <span key={i} style={{ left: i * 8 * px }}>
                  {i * 8 + 1}
                  <small>{i + 1} × 8</small>
                </span>
              ))}
            </div>
            <div className="sections-track">
              {p.sections.map((s, i) => (
                <button
                  data-testid={"section-header-" + s.id}
                  onClick={() => {
                    p.onSeek(s.start);
                    p.onLoopRange(s.start, s.end);
                    if (!p.loop) p.onLoop();
                  }}
                  title={"Focus and loop " + s.name}
                  className={"section-region section-" + (i % 3)}
                  style={{ left: s.start * px, width: (s.end - s.start) * px }}
                  key={s.id}
                >
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <div className="formations-track">
              {p.formations.map((f, i) => (
                <div key={f.id}>
                  <button
                    data-testid={"formation-strip-" + f.id}
                    aria-label={
                      f.name +
                      ", arrival beat " +
                      f.count +
                      (i > 0 && !p.practice
                        ? ". Drag to retime, or use arrow keys."
                        : "")
                    }
                    title={
                      f.name +
                      (i > 0 && !p.practice
                        ? " · Drag to retime · arrows quarter beat"
                        : "")
                    }
                    onPointerDown={(e) => {
                      if (!p.practice && i > 0) dragStart(e, "timing", f.id);
                    }}
                    onKeyDown={(e) => timingKeys(e, f.id, f.count)}
                    className={
                      "formation-clip " +
                      (f.id === p.selected ? "selected" : "")
                    }
                    key={f.id}
                    style={{
                      left:
                        i === p.formations.length - 1 && f.count === p.total
                          ? Math.max(0, f.count * px - 45)
                          : f.count * px,
                      cursor: !p.practice && i > 0 ? "grab" : "pointer",
                      touchAction: "none",
                      width: Math.max(
                        45,
                        Math.min(
                          112,
                          ((p.formations[i + 1]?.count ?? p.total) - f.count) *
                            px -
                            8,
                        ),
                      ),
                    }}
                    onClick={() => clickFormation(f.id, f.count)}
                  >
                    <i />
                    {f.name}
                  </button>
                  {!p.practice && i > 0 && (
                    <button
                      data-testid={"formation-timing-" + f.id}
                      className="formation-timing-handle"
                      style={{ left: f.count * px }}
                      aria-label={"Move " + f.name + " timing"}
                      title={"Drag to move " + f.name + " timing"}
                      onPointerDown={(e) => dragStart(e, "timing", f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          e.stopPropagation();
                          p.onTiming(
                            f.id,
                            f.count +
                              (e.key === "ArrowRight" ? 1 : -1) *
                                (e.shiftKey ? 8 : 0.25),
                          );
                        }
                      }}
                    >
                      ⋮
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="transition-track">
              {p.formations.slice(1).map((f) => {
                const duration = f.transitionBeats ?? 0;
                return (
                  <div key={f.id}>
                    <button
                      data-testid={"transition-strip-" + f.id}
                      aria-label={
                        f.name +
                        " transition, " +
                        duration +
                        " beats. Drag to resize travel, or use arrow keys."
                      }
                      title={
                        "Drag to resize " +
                        f.name +
                        " travel; arrival remains at beat " +
                        f.count
                      }
                      style={{
                        left: (f.count - duration) * px + 3,
                        width: Math.max(12, duration * px - 6),
                        cursor: p.practice ? "pointer" : "ew-resize",
                        touchAction: "none",
                      }}
                      onPointerDown={(e) => {
                        if (!p.practice) dragStart(e, "transition", f.id);
                      }}
                      onKeyDown={(e) => timingKeys(e, f.id, duration, true)}
                      onClick={() => {
                        if (!suppressClick.current) {
                          p.onSelect(f.id);
                          p.onSeek(f.count - duration / 2);
                        }
                      }}
                    >
                      <span>↗</span> {duration} counts
                    </button>
                    {!p.practice && (
                      <button
                        data-testid={"transition-resize-" + f.id}
                        className="formation-timing-handle"
                        style={{ left: (f.count - duration) * px }}
                        aria-label={"Resize " + f.name + " transition"}
                        title="Drag travel start; arrows resize a quarter beat"
                        onPointerDown={(e) => dragStart(e, "transition", f.id)}
                        onKeyDown={(e) => timingKeys(e, f.id, duration, true)}
                      >
                        ⋮
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              className={
                "audio-track " + (p.waveform.length ? "has-audio" : "")
              }
              disabled={p.practice && !p.waveform.length}
              onClick={(e) => {
                if (p.waveform.length) {
                  if (e.detail === 0) return;
                  const box = e.currentTarget.getBoundingClientRect();
                  p.onSeek(
                    Math.max(0, Math.min(p.total, (e.clientX - box.left) / px)),
                  );
                } else if (!p.practice) p.onAudio();
              }}
              onKeyDown={(e) => {
                if (
                  p.waveform.length &&
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  p.onSeek(
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? p.total
                        : Math.max(
                            0,
                            Math.min(
                              p.total,
                              p.count +
                                (e.key === "ArrowRight" ? 1 : -1) *
                                  (e.shiftKey ? 8 : 0.25),
                            ),
                          ),
                  );
                }
              }}
              aria-label={
                p.waveform.length
                  ? "Music waveform. Click to seek or use Left and Right arrows."
                  : p.practice
                    ? "Count-only choreography"
                    : "Add music"
              }
            >
              {p.waveform.length ? (
                <>
                  {audioRange && (
                    <svg
                      aria-hidden="true"
                      data-testid="music-waveform"
                      style={{
                        left: audioRange.startBeat * px,
                        width: audioRange.durationBeats * px,
                      }}
                      viewBox={`0 0 ${p.waveform.length} 34`}
                      preserveAspectRatio="none"
                    >
                      {p.waveform.map((n, i) => (
                        <line
                          key={i}
                          x1={i}
                          x2={i}
                          y1={17 - n * 15}
                          y2={17 + n * 15}
                          stroke="currentColor"
                          strokeWidth=".6"
                        />
                      ))}
                    </svg>
                  )}
                  <span>{p.audioName}</span>
                </>
              ) : (
                <span>
                  <Music2 size={13} />{" "}
                  {p.practice ? "Counts only" : "Add music"}{" "}
                  <small>or rehearse with counts</small>
                </span>
              )}
            </button>
            {p.loop && (
              <div
                className="loop-shade"
                style={{
                  left: p.loopStart * px,
                  width: (p.loopEnd - p.loopStart) * px,
                }}
              />
            )}
            {(["loopStart", "loopEnd"] as const).map((kind) => (
              <button
                key={kind}
                className={"loop-handle " + kind}
                style={{
                  left: (kind === "loopStart" ? p.loopStart : p.loopEnd) * px,
                }}
                aria-label={
                  kind === "loopStart" ? "Loop in point" : "Loop out point"
                }
                title={kind === "loopStart" ? "Drag loop in" : "Drag loop out"}
                onPointerDown={(e) => dragStart(e, kind)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    const amount = (e.key === "ArrowRight" ? 1 : -1) * 0.25;
                    if (kind === "loopStart")
                      p.onLoopRange(
                        Math.max(
                          0,
                          Math.min(p.loopEnd - 0.25, p.loopStart + amount),
                        ),
                        p.loopEnd,
                      );
                    else
                      p.onLoopRange(
                        p.loopStart,
                        Math.min(
                          p.total,
                          Math.max(p.loopStart + 0.25, p.loopEnd + amount),
                        ),
                      );
                  }
                }}
              >
                <span>{kind === "loopStart" ? "[" : "]"}</span>
              </button>
            ))}
            {p.notes.map((n) => (
              <button
                className="beat-note-marker"
                key={n.id}
                style={{ left: n.beat * px }}
                title={n.label}
                aria-label={"Note: " + n.label}
                onClick={() => p.onSeek(n.beat)}
              >
                ●
              </button>
            ))}
            {p.warnings.map((w) => (
              <button
                className="beat-warning-marker"
                key={w.id}
                style={{ left: w.beat * px }}
                title={w.label}
                aria-label={"Route warning: " + w.label}
                onClick={() => p.onSeek(w.beat)}
              >
                ◆
              </button>
            ))}
            <div className="timeline-playhead" style={{ left: p.count * px }}>
              <i />
              <span />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
