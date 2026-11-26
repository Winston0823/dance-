import {
  ensurePaths,
  validateDocument,
  type ProjectDocument,
  type TimedPath,
} from "../../../packages/core/src/index.ts";

export function numeric(value: string, label: string): number {
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error(`${label} must be a number.`);
  return Number(value);
}
export function checked(document: ProjectDocument): ProjectDocument {
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.slice(0, 3).join("\n"));
  return document;
}
export function editablePath(
  document: ProjectDocument,
  formationId: string,
  dancerId: string,
): TimedPath {
  const path = document.paths[formationId]?.[dancerId];
  if (!path) throw new Error("Choose a formation with an incoming transition.");
  if (path.locked)
    throw new Error("Unlock this route before editing its shape or waypoints.");
  return path;
}
export function changePosition(
  document: ProjectDocument,
  formationId: string,
  dancerId: string,
  x: number,
  y: number,
  offstage?: boolean,
) {
  const index = document.formations.findIndex((f) => f.id === formationId);
  if (index < 0 || !document.dancers.some((d) => d.id === dancerId))
    throw new Error("Select a dancer and formation.");
  const incoming = document.paths[formationId]?.[dancerId];
  const outgoing =
    document.paths[document.formations[index + 1]?.id]?.[dancerId];
  if (incoming?.locked || outgoing?.locked)
    throw new Error(
      "Unlock the incoming and outgoing routes before moving this position.",
    );
  const old = document.formations[index].positions[dancerId];
  document.formations[index].positions[dancerId] = {
    x,
    y,
    ...((offstage ?? old.offstage) ? { offstage: true } : {}),
  };
  return checked(ensurePaths(document));
}
export function changeWaypoint(
  document: ProjectDocument,
  formationId: string,
  dancerId: string,
  index: number,
  x: number,
  y: number,
  t: number,
) {
  const path = editablePath(document, formationId, dancerId);
  if (index <= 0 || index >= path.points.length - 1)
    throw new Error(
      "Route endpoints follow formation positions; choose an interior waypoint.",
    );
  if (
    !Number.isFinite(t) ||
    t <= path.points[index - 1].t ||
    t >= path.points[index + 1].t
  )
    throw new Error("Waypoint time must be strictly between its neighbors.");
  path.points[index] = { x, y, t };
  return checked(document);
}
export function addWaypoint(
  document: ProjectDocument,
  formationId: string,
  dancerId: string,
  afterIndex?: number,
) {
  const path = editablePath(document, formationId, dancerId);
  if (path.points.length >= 64)
    throw new Error("This route already has the maximum 64 anchors.");
  let interval = afterIndex ?? 0;
  if (afterIndex === undefined) {
    for (let i = 1; i < path.points.length - 1; i++)
      if (
        path.points[i + 1].t - path.points[i].t >
        path.points[interval + 1].t - path.points[interval].t
      )
        interval = i;
  }
  interval = Math.max(0, Math.min(path.points.length - 2, interval));
  const a = path.points[interval],
    b = path.points[interval + 1];
  path.points.splice(interval + 1, 0, {
    t: (a.t + b.t) / 2,
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  return checked(document);
}
export function removeWaypoint(
  document: ProjectDocument,
  formationId: string,
  dancerId: string,
  index: number,
) {
  const path = editablePath(document, formationId, dancerId);
  if (index <= 0 || index >= path.points.length - 1)
    throw new Error("Formation endpoints cannot be removed.");
  path.points.splice(index, 1);
  return checked(document);
}
export function changeTiming(
  document: ProjectDocument,
  formationId: string,
  arrival: number,
  duration: number,
) {
  const f = document.formations.find((f) => f.id === formationId);
  if (!f) throw new Error("Select a formation.");
  if (
    Object.values(document.paths[formationId] ?? {}).some((p) => p.locked) &&
    (arrival !== f.beat || duration !== f.transitionBeats)
  )
    throw new Error(
      "Unlock this formation’s incoming routes before changing their timing.",
    );
  f.beat = arrival;
  f.transitionBeats = duration;
  return checked(document);
}
export function changeSection(
  document: ProjectDocument,
  sectionId: string,
  title: string,
  start: number,
  end: number,
) {
  const index = document.sections.findIndex((s) => s.id === sectionId);
  const section = document.sections[index];
  if (!section || !title.trim() || title.length > 120)
    throw new Error("Select a section and use a title of 1–120 characters.");
  if (index === 0 && start !== 0)
    throw new Error("The first section must start at global beat zero.");
  if (index === document.sections.length - 1 && end !== document.totalBeats)
    throw new Error("The last section must end at the routine end.");
  if (index > 0) document.sections[index - 1].endBeat = start;
  if (index < document.sections.length - 1)
    document.sections[index + 1].startBeat = end;
  section.title = title.trim();
  section.startBeat = start;
  section.endBeat = end;
  return checked(document);
}
export function rulerBeat(
  pageX: number,
  rulerPageX: number,
  pixelsPerBeat: number,
  totalBeats: number,
) {
  return Math.max(
    0,
    Math.min(
      totalBeats,
      Math.round(((pageX - rulerPageX) / pixelsPerBeat) * 4) / 4,
    ),
  );
}

/** Scope both asynchronous response identity and its connection credentials. */
export function sameScope(
  a: { server: string; token: string } | null,
  b: { server: string; token: string } | null,
  id: string,
  currentId?: string,
  expectedGeneration?: number,
  currentGeneration?: number,
) {
  return (
    !!a &&
    !!b &&
    a.server === b.server &&
    a.token === b.token &&
    id === currentId &&
    (expectedGeneration === undefined ||
      expectedGeneration === currentGeneration)
  );
}

/** One writer at a time; callers wait until edits made during a request are also saved. */
export async function drainSave(
  state: { current: Promise<boolean> | null },
  isClean: () => boolean,
  write: () => Promise<boolean>,
): Promise<boolean> {
  if (state.current) {
    if (!(await state.current)) return false;
    return drainSave(state, isClean, write);
  }
  if (isClean()) return true;
  const task = write();
  state.current = task;
  let succeeded = false;
  try {
    succeeded = await task;
  } finally {
    if (state.current === task) state.current = null;
  }
  return succeeded ? drainSave(state, isClean, write) : false;
}
