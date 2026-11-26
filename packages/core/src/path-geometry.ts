import type { TimedPath, TimedPoint } from './index.ts';

const cache = new WeakMap<TimedPath, TimedPoint[]>();
const equal = (a: TimedPoint, b: TimedPoint) => a.x === b.x && a.y === b.y;
const midpoint = (a: TimedPoint, b: TimedPoint): TimedPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: (a.t + b.t) / 2 });

/**
 * Canonical motion/render geometry. Legacy paths remain exactly linear. Smooth
 * paths use time-aware cubic Hermite tangents, with zero velocity at endpoints
 * and either edge of a stationary wait. Cubics are subdivided until their Bezier
 * controls differ from the corresponding timed chord controls by <= 1 cm, or
 * five subdivisions (32 chords/anchor interval). At the cap the approximation
 * can exceed 1 cm; the returned polyline IS the motion model checked and played.
 * Maximum: 2017 samples for 64 anchors. Treat paths and returned arrays immutable;
 * a new path reference invalidates the WeakMap cache automatically.
 */
export function getPathSamples(path: TimedPath): TimedPoint[] {
  if (path.interpolation !== 'smooth') return path.points;
  const cached = cache.get(path);
  if (cached) return cached;
  const points = path.points;
  if (points.length < 2 || points.length > 64) return points;
  const output: TimedPoint[] = [{ ...points[0] }];
  function tangent(index: number, dt: number) {
    if (index === 0 || index === points.length - 1 || equal(points[index - 1], points[index]) || equal(points[index], points[index + 1])) return { x: 0, y: 0 };
    const before = points[index - 1], after = points[index + 1];
    const ratio = dt / (after.t - before.t);
    return { x: (after.x - before.x) * ratio, y: (after.y - before.y) * ratio };
  }
  function split(a: TimedPoint, b: TimedPoint, c: TimedPoint, d: TimedPoint, depth: number) {
    const deviation = Math.max(Math.hypot(b.x - (2 * a.x + d.x) / 3, b.y - (2 * a.y + d.y) / 3), Math.hypot(c.x - (a.x + 2 * d.x) / 3, c.y - (a.y + 2 * d.y) / 3));
    const midTime=a.t+(d.t-a.t)/2;
    if (depth === 5 || deviation <= .01 || !(midTime>a.t&&midTime<d.t)) { output.push({ x: d.x, y: d.y, t: d.t }); return; }
    const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d), abc = midpoint(ab, bc), bcd = midpoint(bc, cd), mid = midpoint(abc, bcd);
    mid.t=midTime;
    split(a, ab, abc, mid, depth + 1); split(mid, bcd, cd, d, depth + 1);
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], d = points[i], dt = d.t - a.t;
    if (equal(a, d)) { output.push({ ...d }); continue; }
    const start = tangent(i - 1, dt), end = tangent(i, dt);
    split(a, { x: a.x + start.x / 3, y: a.y + start.y / 3, t: a.t + dt / 3 }, { x: d.x - end.x / 3, y: d.y - end.y / 3, t: d.t - dt / 3 }, d, 0);
  }
  cache.set(path, output);
  return output;
}
