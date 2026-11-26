import {
  ensurePaths,
  type ProjectDocument,
} from "../../../packages/core/src/index.ts";

export type TimelineEdit = { document: ProjectDocument; error?: string };
const quarter = (value: number) => Math.round(value * 4) / 4;
const locked = (doc: ProjectDocument, id: string) =>
  Object.values(doc.paths[id] || {}).some((path) => path.locked);

/** Keep the musical ordering and saved geometry intact when moving an arrival. */
export function retimeFormation(
  doc: ProjectDocument,
  id: string,
  value: number,
): TimelineEdit {
  const index = doc.formations.findIndex((f) => f.id === id);
  if (index <= 0 || !Number.isFinite(value)) return { document: doc };
  const formation = doc.formations[index],
    previous = doc.formations[index - 1],
    next = doc.formations[index + 1];
  const beat = Math.max(
    previous.beat + 0.25,
    Math.min(next ? next.beat - 0.25 : doc.totalBeats, quarter(value)),
  );
  if (beat === formation.beat) return { document: doc };
  if (locked(doc, id))
    return {
      document: doc,
      error:
        "Unlock this formation’s approved routes before changing its timing.",
    };
  if (next && next.transitionBeats > next.beat - beat && locked(doc, next.id))
    return {
      document: doc,
      error:
        "Moving this count would shorten a locked next transition. Unlock its routes first.",
    };
  const result = structuredClone(doc);
  result.formations[index].beat = beat;
  result.formations[index].transitionBeats = Math.min(
    formation.transitionBeats,
    beat - previous.beat,
  );
  if (next)
    result.formations[index + 1].transitionBeats = Math.min(
      next.transitionBeats,
      next.beat - beat,
    );
  return { document: ensurePaths(result) };
}

/** A transition arrives at its formation; resizing moves only its start. */
export function resizeTransition(
  doc: ProjectDocument,
  id: string,
  value: number,
): TimelineEdit {
  const index = doc.formations.findIndex((f) => f.id === id);
  if (index <= 0 || !Number.isFinite(value)) return { document: doc };
  const formation = doc.formations[index],
    previous = doc.formations[index - 1];
  const moving = doc.dancers.some((d) => {
    const a = previous.positions[d.id],
      b = formation.positions[d.id];
    return a && b && (a.x !== b.x || a.y !== b.y);
  });
  const duration = Math.max(
    moving ? 0.25 : 0,
    Math.min(formation.beat - previous.beat, quarter(value)),
  );
  if (duration === formation.transitionBeats) return { document: doc };
  if (locked(doc, id))
    return {
      document: doc,
      error:
        "Unlock this formation’s approved routes before resizing its transition.",
    };
  const result = structuredClone(doc);
  result.formations[index].transitionBeats = duration;
  return { document: result };
}
