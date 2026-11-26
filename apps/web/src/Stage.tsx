import { useEffect, useRef, useState } from "react";
import { Crosshair, Minus, Plus, Scan } from "lucide-react";
import { UI_PALETTE } from "../../../packages/core/src/palette.ts";
export type Point = { x: number; y: number };
export type StageDancer = {
  id: string;
  name: string;
  color?: string;
  position: Point;
  locked?: boolean;
  positionUnavailable?: boolean;
  routeLocked?: boolean;
  path?: Point[];
  waypoints?: Point[];
  radius?: number;
};
type Props = {
  width: number;
  height: number;
  dancers: StageDancer[];
  cones: { id: string; name?: string; x: number; y: number }[];
  selected: string | null;
  editing: boolean;
  onSelect: (id: string) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  onConeMove?: (id: string, p: Point) => void;
  onMove: (id: string, p: Point) => void;
  onWaypoint?: (id: string, index: number, p: Point) => void;
  onRouteInsert?: (id: string, p: Point) => number | null;
  onRouteLocked?: () => void;
  snap: boolean;
  showPaths: boolean;
  practice: boolean;
};
export default function Stage(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const drag = useRef<{
    id: string;
    waypoint?: number;
    cone?: boolean;
    pan?: Point;
    start?: Point;
    clientStart?: Point;
    route?: boolean;
    started?: boolean;
    unit?: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 700, height: 300 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const pad = 0.55;
  const view = {
    x: -pad + pan.x,
    y: -pad + pan.y,
    w: (p.width + pad * 2) / zoom,
    h: (p.height + pad * 2) / zoom,
  };
  const unit = Math.max(1, Math.min(size.width / view.w, size.height / view.h));
  const marker = Math.max(0.23, 9 / unit);
  const labelSize = Math.max(0.25, 11 / unit);
  const point = (e: { clientX: number; clientY: number }) => {
    const s = ref.current!;
    const pt = s.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const q = pt.matrixTransform(s.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y };
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const q = point(e);
    if (drag.current.pan) {
      setPan({
        x:
          drag.current.pan.x -
          (e.clientX - drag.current.clientStart!.x) / drag.current.unit!,
        y:
          drag.current.pan.y -
          (e.clientY - drag.current.clientStart!.y) / drag.current.unit!,
      });
      return;
    }
    const margin =
      !drag.current.cone &&
      !drag.current.route &&
      drag.current.waypoint === undefined
        ? (p.dancers.find((d) => d.id === drag.current!.id)?.radius ?? 0.25)
        : 0;
    const v = {
      x: Math.max(
        margin,
        Math.min(p.width - margin, p.snap ? Math.round(q.x * 2) / 2 : q.x),
      ),
      y: Math.max(
        margin,
        Math.min(p.height - margin, p.snap ? Math.round(q.y * 2) / 2 : q.y),
      ),
    };
    if (drag.current.route) {
      const from = drag.current.clientStart!;
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4) return;
      p.onEditStart?.();
      drag.current.started = true;
      const index = p.onRouteInsert?.(drag.current.id, v);
      if (index === undefined || index === null) {
        p.onEditEnd?.();
        drag.current = null;
        return;
      }
      drag.current.waypoint = index;
      drag.current.route = false;
    }
    if (drag.current.cone) p.onConeMove?.(drag.current.id, v);
    else if (drag.current.waypoint !== undefined)
      p.onWaypoint?.(drag.current.id, drag.current.waypoint, v);
    else p.onMove(drag.current.id, v);
  };
  const finishDrag = () => {
    if (
      drag.current &&
      !drag.current.pan &&
      (!drag.current.route || drag.current.started)
    )
      p.onEditEnd?.();
    drag.current = null;
  };
  const zoomTo = (next: number) => {
    const value = Math.max(0.7, Math.min(3, next));
    const center = { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    setPan({
      x: center.x - (p.width + pad * 2) / value / 2 + pad,
      y: center.y - (p.height + pad * 2) / value / 2 + pad,
    });
    setZoom(value);
  };
  const nudge = (
    e: React.KeyboardEvent,
    base: Point,
    margin = 0,
  ): Point | null => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key))
      return null;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 1 : p.snap ? 0.5 : 0.1;
    return {
      x: Math.max(
        margin,
        Math.min(
          p.width - margin,
          base.x +
            (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0),
        ),
      ),
      y: Math.max(
        margin,
        Math.min(
          p.height - margin,
          base.y +
            (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0),
        ),
      ),
    };
  };
  return (
    <section className="stage-shell" aria-label="Formation stage">
      <div className="stage-topline">
        <span>
          <i className="live-dot" />
          {p.practice
            ? "Practice view"
            : p.editing
              ? "Editing selected count"
              : "Stage preview"}
        </span>
        <span>
          {p.width} × {p.height} m <b>·</b> {p.dancers.length} dancers
        </span>
      </div>
      <svg
        data-testid="stage"
        ref={ref}
        className={"stage " + (p.editing ? "editing" : "")}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        role="group"
        aria-label="Stage plan. Audience at bottom."
        onPointerMove={move}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && e.button === 0) {
            drag.current = {
              id: "",
              pan,
              clientStart: { x: e.clientX, y: e.clientY },
              unit,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
      >
        <defs>
          <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path
              d="M 1 0 L 0 0 0 1"
              fill="none"
              stroke={UI_PALETTE.grid}
              strokeWidth=".018"
            />
          </pattern>
          <filter id="dotshadow">
            <feDropShadow
              dx="0"
              dy=".04"
              stdDeviation=".05"
              floodOpacity=".12"
            />
          </filter>
        </defs>
        <rect
          pointerEvents="none"
          x="0"
          y="0"
          width={p.width}
          height={p.height}
          rx=".08"
          fill={UI_PALETTE.stage}
          stroke={UI_PALETTE.line}
          strokeWidth=".025"
        />
        <rect
          pointerEvents="none"
          width={p.width}
          height={p.height}
          fill="url(#grid)"
        />
        <path
          pointerEvents="none"
          d={`M ${p.width / 2} 0 V ${p.height}`}
          stroke={UI_PALETTE.grid}
          strokeDasharray=".08 .12"
          strokeWidth=".018"
        />
        <text
          x={p.width / 2}
          y="-.22"
          textAnchor="middle"
          className="stage-caption"
          style={{ fontSize: Math.max(0.18, 10 / unit) }}
        >
          UPSTAGE
        </text>
        <text
          x={p.width / 2}
          y={p.height + 0.44}
          textAnchor="middle"
          className="stage-caption"
        >
          AUDIENCE / FRONT
        </text>
        {Array.from({ length: Math.floor(p.width) + 1 }, (_, i) => (
          <text
            key={i}
            x={i}
            y={p.height + 0.2}
            textAnchor="middle"
            className="meter"
            style={{ fontSize: Math.max(0.14, 9 / unit) }}
          >
            {i}
          </text>
        ))}
        {p.cones.map((c) => (
          <g
            key={c.id}
            transform={`translate(${c.x},${c.y})`}
            data-testid={"stage-cone-" + c.id}
            role="button"
            tabIndex={0}
            aria-label={`${c.name || "Reference cone"}, ${p.practice ? "rehearsal marker" : "drag or use arrow keys to move"}`}
            style={{ cursor: !p.practice ? "move" : "default" }}
            onKeyDown={(e) => {
              if (p.practice) return;
              const at = nudge(e, c);
              if (at) {
                p.onEditStart?.();
                p.onConeMove?.(c.id, at);
                p.onEditEnd?.();
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (p.practice || e.button !== 0) return;
              p.onEditStart?.();
              drag.current = { id: c.id, cone: true };
              ref.current!.setPointerCapture(e.pointerId);
            }}
          >
            <rect
              x={-Math.max(0.35, 18 / unit)}
              y={-Math.max(0.35, 18 / unit)}
              width={Math.max(0.7, 36 / unit)}
              height={Math.max(0.7, 36 / unit)}
              fill="transparent"
            />
            <g
              transform={`scale(${Math.max(1, 18 / unit / 0.46)})`}
              pointerEvents="none"
            >
              <path
                d="M -.16 .15 L -.055 -.2 Q 0 -.27 .055 -.2 L .16 .15 Z"
                fill="#f59e0b"
                stroke="#b45309"
                strokeWidth=".018"
              />
              <path
                d="M -.078 -.13 L .078 -.13 L .097 -.07 L -.097 -.07 Z M -.122 .015 L .122 .015 L .14 .075 L -.14 .075 Z"
                fill="white"
              />
              <rect
                x="-.23"
                y=".14"
                width=".46"
                height=".09"
                rx=".035"
                fill={UI_PALETTE.primary}
              />
            </g>
            <title>{c.name || "Reference cone"}</title>
          </g>
        ))}
        {p.dancers
          .filter((d) => d.path && (p.showPaths || d.id === p.selected))
          .map((d) => (
            <g key={d.id}>
              <polyline
                pointerEvents="none"
                points={d.path!.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke={
                  d.id === p.selected
                    ? UI_PALETTE.primary
                    : d.color || UI_PALETTE.muted
                }
                opacity={d.id === p.selected ? 1 : 0.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={Math.max(
                  0.035,
                  (d.id === p.selected ? 3 : 2) / unit,
                )}
                strokeDasharray={d.routeLocked ? ".12 .1" : undefined}
              />
              <polyline
                data-testid={"route-line-" + d.id}
                points={d.path!.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(0.5, 20 / unit)}
                pointerEvents="stroke"
                role="button"
                tabIndex={0}
                aria-label={`${d.name} route${d.routeLocked ? ", locked" : ", drag to bend or double-click to add waypoint"}`}
                style={{
                  cursor: p.practice
                    ? "pointer"
                    : d.routeLocked
                      ? "not-allowed"
                      : "grab",
                  touchAction: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    p.onSelect(d.id);
                  }
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  p.onSelect(d.id);
                  if (p.practice) return;
                  if (d.routeLocked) {
                    p.onRouteLocked?.();
                    return;
                  }
                  drag.current = {
                    id: d.id,
                    route: true,
                    clientStart: { x: e.clientX, y: e.clientY },
                  };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  p.onSelect(d.id);
                  if (p.practice) return;
                  if (d.routeLocked) {
                    p.onRouteLocked?.();
                    return;
                  }
                  p.onEditStart?.();
                  p.onRouteInsert?.(d.id, point(e));
                  p.onEditEnd?.();
                }}
              >
                <title>
                  {p.practice
                    ? `${d.name}'s saved route`
                    : d.routeLocked
                      ? "Approved route locked — unlock in the inspector to edit"
                      : "Drag this line to bend the route. Double-click to add a waypoint."}
                </title>
              </polyline>
              {d.path!.length > 1 && (
                <circle
                  pointerEvents="none"
                  cx={d.path![d.path!.length - 1].x}
                  cy={d.path![d.path!.length - 1].y}
                  r={Math.max(0.09, 4 / unit)}
                  fill="white"
                  stroke={
                    d.id === p.selected
                      ? UI_PALETTE.primary
                      : d.color || UI_PALETTE.muted
                  }
                  strokeWidth={2 / unit}
                />
              )}
              {d.id === p.selected &&
                (d.waypoints ?? d.path)!.slice(1, -1).map((q, i) => (
                  <circle
                    key={i}
                    data-testid={`route-waypoint-${d.id}-${i}`}
                    cx={q.x}
                    cy={q.y}
                    r={Math.max(0.12, 7 / unit)}
                    fill="white"
                    stroke={UI_PALETTE.primary}
                    strokeWidth={2.5 / unit}
                    role="button"
                    tabIndex={0}
                    aria-label={`${d.name} waypoint ${i + 1}`}
                    onKeyDown={(e) => {
                      if (p.practice) return;
                      const at = nudge(e, q);
                      if (!at) return;
                      if (d.routeLocked) {
                        p.onRouteLocked?.();
                        return;
                      }
                      p.onEditStart?.();
                      p.onWaypoint?.(d.id, i, at);
                      p.onEditEnd?.();
                    }}
                    style={{
                      cursor:
                        !p.practice && !d.routeLocked ? "move" : "default",
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (p.practice) return;
                      if (d.routeLocked) {
                        p.onRouteLocked?.();
                        return;
                      }
                      p.onEditStart?.();
                      drag.current = { id: d.id, waypoint: i };
                      ref.current!.setPointerCapture(e.pointerId);
                    }}
                  />
                ))}
            </g>
          ))}
        {p.dancers.map((d) => {
          const active = d.id === p.selected;
          return (
            <g
              key={d.id}
              transform={`translate(${d.position.x},${d.position.y})`}
              data-testid={"stage-dancer-" + d.id}
              role="button"
              tabIndex={0}
              aria-label={`${d.name}, ${d.position.x.toFixed(1)} by ${d.position.y.toFixed(1)} meters${d.locked ? ", locked" : ""}`}
              onKeyDown={(e) => {
                if (e.key === "Enter") p.onSelect(d.id);
                if (!p.editing || p.practice || d.positionUnavailable) return;
                const at = nudge(e, d.position, d.radius ?? 0.25);
                if (!at) return;
                if (d.locked) {
                  p.onRouteLocked?.();
                  return;
                }
                p.onEditStart?.();
                p.onMove(d.id, at);
                p.onEditEnd?.();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                p.onSelect(d.id);
                if (p.editing && !d.locked && !d.positionUnavailable) {
                  p.onEditStart?.();
                  drag.current = { id: d.id };
                  ref.current!.setPointerCapture(e.pointerId);
                }
              }}
              className="dancer"
            >
              <circle
                r={active ? marker * 1.15 : marker}
                fill={active ? UI_PALETTE.primary : d.color || "#d946ef"}
                stroke={active ? "#fff" : "#ffffff"}
                strokeWidth={active ? 0.065 : 0.025}
                filter="url(#dotshadow)"
              />
              {active && (
                <circle
                  r={marker * 1.5}
                  fill="none"
                  stroke={UI_PALETTE.primary}
                  strokeWidth=".023"
                />
              )}
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(0.2, 11 / unit)}
                fontWeight="650"
                fill={active ? "white" : UI_PALETTE.ink}
              >
                {d.name.slice(0, 1)}
              </text>
              <text
                y={marker + labelSize + 0.06}
                style={{ fontSize: labelSize, strokeWidth: 3 / unit }}
                textAnchor="middle"
                className={"dancer-label " + (active ? "active" : "")}
              >
                {d.name}
                {d.locked ? " · locked" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="stage-footer">
        <span>
          <Crosshair size={13} />{" "}
          {p.editing
            ? "Drag dancers at any paused count · positions save automatically"
            : p.practice
              ? "Select a dancer to follow their route"
              : "Click a route to select · drag to bend · double-click to add a waypoint"}
        </span>
        <div className="zoom-tools">
          <button aria-label="Zoom out" onClick={() => zoomTo(zoom - 0.2)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoomTo(zoom + 0.2)}>
            <Plus size={15} />
          </button>
          <button
            aria-label="Fit stage"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Scan size={15} />
          </button>
        </div>
      </div>
    </section>
  );
}
