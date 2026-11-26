import type { Position, ProjectDocument, TimedPath } from "./index.ts";
import { getPathSamples } from './path-geometry.ts';

const finitePoint = (point: Position): boolean =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.y);

function editableRoute(
  doc: ProjectDocument,
  toId: string,
  dancerId: string,
): TimedPath | null {
  const group = doc.paths?.[toId];
  if (!group || !Object.prototype.hasOwnProperty.call(group, dancerId))
    return null;
  const route = group[dancerId];
  if (
    !route ||
    route.locked ||
    !Array.isArray(route.points) ||
    route.points.length < 2 ||
    route.points.length > 64
  )
    return null;
  if (
    !doc.formations.some(
      (formation, index) => index > 0 && formation.id === toId,
    )
  )
    return null;
  let previousTime = -1;
  for (const point of route.points) {
    if (
      !finitePoint(point) ||
      !Number.isFinite(point.t) ||
      point.t <= previousTime ||
      point.t < 0 ||
      point.t > 1
    )
      return null;
    previousTime = point.t;
  }
  return route.points[0].t === 0 &&
    route.points[route.points.length - 1].t === 1
    ? route
    : null;
}

function boundedPoint(
  doc: ProjectDocument,
  dancerId: string,
  point: Position,
): Position | null {
  if (!finitePoint(point)) return null;
  const dancer = doc.dancers.find((item) => item.id === dancerId);
  if (!dancer || !Number.isFinite(dancer.radius) || dancer.radius < 0)
    return null;
  const { width, depth } = doc.stage,
    radius = dancer.radius;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(depth) ||
    width <= 0 ||
    depth <= 0 ||
    width < radius * 2 ||
    depth < radius * 2
  )
    return null;
  return {
    x: Math.max(-width / 2 + radius, Math.min(width / 2 - radius, point.x)),
    y: Math.max(radius, Math.min(depth - radius, point.y)),
  };
}

/**
 * Insert one bend on the closest nonstationary segment. Equal-distance ties choose
 * the earlier segment. Time follows its geometric projection, kept within 10–90%
 * of that segment's existing time interval; the bend itself follows the pointer.
 * The returned index counts interior waypoints, excluding the route's start point.
 */
export function insertRouteWaypoint(
  doc: ProjectDocument,
  toId: string,
  dancerId: string,
  point: Position,
): { document: ProjectDocument; index: number } | null {
  const route = editableRoute(doc, toId, dancerId),
    bounded = boundedPoint(doc, dancerId, point);
  if (!route || !bounded || route.points.length >= 64) return null;
  const samples=getPathSamples(route);
  let segmentIndex = -1,
    fraction = 0,
    bestDistance = Infinity;
  for (let index = 0; index < samples.length - 1; index++) {
    const a = samples[index],
      b = samples[index + 1];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      lengthSquared = dx * dx + dy * dy;
    // Stationary waits have no geometric direction from which to infer a bend time.
    if (lengthSquared === 0) continue;
    const projected = Math.max(
      0,
      Math.min(
        1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
      ),
    );
    const distance =
      (point.x - a.x - projected * dx) ** 2 +
      (point.y - a.y - projected * dy) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      segmentIndex = index;
      fraction = projected;
    }
  }
  if (segmentIndex < 0) return null;
  const projectedTime=samples[segmentIndex].t+(samples[segmentIndex+1].t-samples[segmentIndex].t)*fraction;
  const anchorIndex=route.points.findIndex((p,index)=>index<route.points.length-1&&projectedTime>=p.t&&projectedTime<=route.points[index+1].t);
  if(anchorIndex<0)return null;
  const a = route.points[anchorIndex], b = route.points[anchorIndex + 1];
  const t = Math.max(a.t+(b.t-a.t)*.1,Math.min(a.t+(b.t-a.t)*.9,projectedTime));
  if (!(t > a.t && t < b.t)) return null;
  const document: ProjectDocument = JSON.parse(JSON.stringify(doc));
  document.paths[toId][dancerId].points.splice(anchorIndex + 1, 0, {
    ...bounded,
    t,
  });
  return { document, index: anchorIndex };
}

/** Move an existing interior bend, preserving its saved time and all other data. */
export function moveRouteWaypoint(
  doc: ProjectDocument,
  toId: string,
  dancerId: string,
  interiorIndex: number,
  point: Position,
): ProjectDocument {
  const route = editableRoute(doc, toId, dancerId),
    bounded = boundedPoint(doc, dancerId, point);
  if (
    !route ||
    !bounded ||
    !Number.isInteger(interiorIndex) ||
    interiorIndex < 0 ||
    interiorIndex >= route.points.length - 2
  )
    return doc;
  const document: ProjectDocument = JSON.parse(JSON.stringify(doc));
  Object.assign(
    document.paths[toId][dancerId].points[interiorIndex + 1],
    bounded,
  );
  return document;
}
