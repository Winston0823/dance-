import {
  evaluateDocument,
  type Position,
  type ProjectDocument,
  type TimedPath,
} from "../../../packages/core/src/index.ts";

const EPS = 1e-7;
const same = (a: Position, b: Position) =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
export type PositionEditAvailability = {
  canEdit: boolean;
  locked: boolean;
  kind: "formation" | "anchor" | "travel" | "hold" | "invalid";
  beat: number;
  requiresKey: boolean;
  error?: string;
};
type Resolved = PositionEditAvailability & {
  formationIndex?: number;
  anchorIndex?: number;
};
const denied = (
  beat: number,
  error: string,
  locked = false,
  kind: PositionEditAvailability["kind"] = "invalid",
): Resolved => ({
  canEdit: false,
  locked,
  kind,
  beat,
  requiresKey: false,
  error,
});

/** O(formations + this dancer's anchors), with no clone or trajectory sampling. */
function resolve(
  doc: ProjectDocument,
  beat: number,
  dancerId: string,
  quantized = false,
): Resolved {
  const dancer = doc.dancers.find((d) => d.id === dancerId);
  if (
    !dancer ||
    !Number.isFinite(beat) ||
    beat < 0 ||
    beat > doc.totalBeats ||
    !doc.formations.length
  )
    return denied(beat, "Choose a dancer and a count inside this routine.");
  if (
    !Number.isFinite(dancer.radius) ||
    dancer.radius <= 0 ||
    !Number.isFinite(doc.stage.width) ||
    !Number.isFinite(doc.stage.depth) ||
    doc.stage.width < dancer.radius * 2 ||
    doc.stage.depth < dancer.radius * 2
  )
    return denied(beat, "The stage must have room for this dancer.");
  const at = doc.formations.findIndex((f) => Math.abs(f.beat - beat) < EPS);
  if (at >= 0) {
    const f = doc.formations[at],
      next = doc.formations[at + 1];
    if (
      doc.paths[f.id]?.[dancerId]?.locked ||
      (next && doc.paths[next.id]?.[dancerId]?.locked)
    )
      return denied(
        f.beat,
        "Unlock this dancer’s incoming and outgoing approved routes before changing this position.",
        true,
        "formation",
      );
    return {
      canEdit: true,
      locked: false,
      kind: "formation",
      beat: f.beat,
      requiresKey: false,
      formationIndex: at,
    };
  }
  const nextIndex = doc.formations.findIndex((f) => f.beat > beat);
  const next = doc.formations[nextIndex];
  if (next && beat > next.beat - next.transitionBeats) {
    const route = doc.paths[next.id]?.[dancerId];
    if (!route || route.points.length < 2)
      return denied(beat, "This transition needs a valid saved route.");
    if (route.locked)
      return denied(
        beat,
        "Unlock this dancer’s approved route before changing this count.",
        true,
        "travel",
      );
    const start = next.beat - next.transitionBeats;
    const anchor = route.points.findIndex(
      (p, i) =>
        i > 0 &&
        i < route.points.length - 1 &&
        Math.abs(start + p.t * next.transitionBeats - beat) < EPS,
    );
    if (anchor > 0)
      return {
        canEdit: true,
        locked: false,
        kind: "anchor",
        beat,
        requiresKey: false,
        formationIndex: nextIndex,
        anchorIndex: anchor,
      };
    if (route.points.length >= 64)
      return denied(
        beat,
        "Remove a waypoint before adding another position to this route.",
        false,
        "travel",
      );
    return {
      canEdit: true,
      locked: false,
      kind: "travel",
      beat,
      requiresKey: true,
      formationIndex: nextIndex,
    };
  }
  // Formation timing is quarter-beat based. Re-resolve after snapping so a near
  // arrival reuses that key instead of creating a duplicate or invalid span.
  const snapped = Math.round(beat * 4) / 4;
  if (!quantized && snapped !== beat)
    return resolve(doc, snapped, dancerId, true);
  if (next && doc.paths[next.id]?.[dancerId]?.locked)
    return denied(
      snapped,
      "Unlock this dancer’s next approved route before adding a position here.",
      true,
      "hold",
    );
  if (doc.formations.length >= 500 || Object.keys(doc.paths).length >= 500)
    return denied(
      snapped,
      "This routine has reached its formation limit.",
      false,
      "hold",
    );
  return {
    canEdit: true,
    locked: false,
    kind: "hold",
    beat: snapped,
    requiresKey: true,
    formationIndex: nextIndex < 0 ? doc.formations.length : nextIndex,
  };
}

/** Missing keys are editable; `locked` means an actual approved route lock. */
export function getPositionEditAvailability(
  doc: ProjectDocument,
  beat: number,
  dancerId: string,
): PositionEditAvailability {
  const {
    formationIndex: _formationIndex,
    anchorIndex: _anchorIndex,
    ...status
  } = resolve(doc, beat, dancerId);
  return status;
}

const stationary = (path: TimedPath) =>
  path.points.every((p) => same(p, path.points[0]));
function repairSelectedEndpoints(
  doc: ProjectDocument,
  index: number,
  dancerId: string,
): string | undefined {
  // Only the selected dancer's existing path endpoints can change. Other saved
  // paths, including approved stationary paths, stay byte-for-byte unchanged.
  for (const destination of [index, index + 1]) {
    if (destination < 1 || destination >= doc.formations.length) continue;
    const f = doc.formations[destination],
      previous = doc.formations[destination - 1];
    const path = doc.paths[f.id]?.[dancerId];
    if (!path || path.points.length < 2)
      return "This transition needs a valid saved route.";
    const a = previous.positions[dancerId],
      b = f.positions[dancerId];
    if (!a || !b)
      return "This dancer needs positions in both neighboring formations.";
    if (
      path.locked &&
      (!same(path.points[0], a) ||
        !same(path.points[path.points.length - 1], b))
    )
      return "Unlock this dancer’s approved routes before moving.";
    Object.assign(path.points[0], { x: a.x, y: a.y });
    Object.assign(path.points[path.points.length - 1], { x: b.x, y: b.y });
    if (f.transitionBeats === 0 && !stationary(path))
      f.transitionBeats = Math.min(8, f.beat - previous.beat);
  }
}

/** One atomic edit: capture old `doc` once for Undo, then persist the result. */
export function movePositionAtTime(
  doc: ProjectDocument,
  beat: number,
  dancerId: string,
  point: Position,
  newFormationId: string,
): { document: ProjectDocument; beat: number; error?: string } {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return { document: doc, beat, error: "Choose finite stage coordinates." };
  const status = resolve(doc, beat, dancerId);
  if (!status.canEdit)
    return { document: doc, beat: status.beat, error: status.error };
  const d = doc.dancers.find((d) => d.id === dancerId)!;
  const bounded = {
    x: Math.max(
      -doc.stage.width / 2 + d.radius,
      Math.min(doc.stage.width / 2 - d.radius, point.x),
    ),
    y: Math.max(d.radius, Math.min(doc.stage.depth - d.radius, point.y)),
  };
  const positions = evaluateDocument(doc, status.beat),
    current = positions[dancerId];
  if (!current)
    return {
      document: doc,
      beat: status.beat,
      error: "This dancer has no saved position at this count.",
    };
  if (same(current, bounded)) return { document: doc, beat: status.beat };
  if (
    status.kind === "hold" &&
    (!newFormationId?.trim() ||
      newFormationId.length > 200 ||
      ["__proto__", "prototype", "constructor"].includes(newFormationId) ||
      doc.formations.some((f) => f.id === newFormationId) ||
      Object.prototype.hasOwnProperty.call(doc.paths, newFormationId))
  )
    return {
      document: doc,
      beat: status.beat,
      error: "Choose a new unique formation ID.",
    };
  const result = structuredClone(doc),
    index = status.formationIndex!;
  if (status.kind === "travel" || status.kind === "anchor") {
    const target = result.formations[index],
      route = result.paths[target.id][dancerId];
    if (status.kind === "anchor")
      Object.assign(route.points[status.anchorIndex!], bounded);
    else {
      const t =
        (status.beat - target.beat + target.transitionBeats) /
        target.transitionBeats;
      if (!(t > 0 && t < 1) || route.points.some((p) => p.t === t))
        return {
          document: doc,
          beat: status.beat,
          error: "Choose a distinct count inside this transition.",
        };
      route.points.push({ ...current, ...bounded, t });
      route.points.sort((a, b) => a.t - b.t);
    }
  } else if (status.kind === "formation") {
    Object.assign(result.formations[index].positions[dancerId], bounded);
    const error = repairSelectedEndpoints(result, index, dancerId);
    if (error) return { document: doc, beat: status.beat, error };
  } else {
    const previous = result.formations[index - 1];
    if (!previous)
      return {
        document: doc,
        beat: status.beat,
        error: "The first formation must remain at count zero.",
      };
    const seeded = structuredClone(positions);
    Object.assign(seeded[dancerId], bounded);
    result.formations.splice(index, 0, {
      id: newFormationId,
      title: "Position key",
      beat: status.beat,
      transitionBeats: Math.min(8, status.beat - previous.beat),
      positions: seeded,
    });
    result.paths[newFormationId] = {};
    for (const dancer of result.dancers) {
      const a = previous.positions[dancer.id],
        b = seeded[dancer.id];
      if (!a || !b)
        return {
          document: doc,
          beat: status.beat,
          error: "Every dancer needs a position at this count.",
        };
      result.paths[newFormationId][dancer.id] = {
        locked: false,
        points: [
          { ...a, t: 0 },
          { ...b, t: 1 },
        ],
      };
    }
    const error = repairSelectedEndpoints(result, index, dancerId);
    if (error) return { document: doc, beat: status.beat, error };
  }
  return { document: result, beat: status.beat };
}
