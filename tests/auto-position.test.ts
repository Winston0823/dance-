import test from "node:test";
import assert from "node:assert/strict";
import {
  ensurePaths,
  evaluateDocument,
  validateDocument,
  type ProjectDocument,
} from "../packages/core/src/index.ts";
import {
  getPositionEditAvailability,
  movePositionAtTime,
} from "../apps/web/src/auto-position.ts";

function fixture(): ProjectDocument {
  return ensurePaths({
    id: "auto-test",
    title: "Auto position test",
    bpm: 120,
    offsetSeconds: 0,
    totalBeats: 64,
    stage: { width: 12, depth: 8 },
    dancers: [
      { id: "a", name: "A", color: "#aabbcc", radius: 0.25 },
      { id: "b", name: "B", color: "#ccbbaa", radius: 0.25 },
    ],
    cones: [],
    sections: [
      {
        id: "section",
        title: "Study",
        startBeat: 0,
        endBeat: 64,
        color: "#abcdef",
      },
    ],
    formations: [
      {
        id: "f0",
        title: "Start",
        beat: 0,
        transitionBeats: 0,
        positions: { a: { x: -2, y: 1 }, b: { x: 2, y: 1 } },
      },
      {
        id: "f1",
        title: "Second",
        beat: 24,
        transitionBeats: 8,
        positions: { a: { x: -1, y: 4 }, b: { x: 1, y: 4 } },
      },
      {
        id: "f2",
        title: "Third",
        beat: 48,
        transitionBeats: 8,
        positions: { a: { x: -3, y: 5 }, b: { x: 3, y: 5 } },
      },
    ],
    paths: {},
  });
}
const otherRoutes = (doc: ProjectDocument) =>
  Object.fromEntries(
    Object.entries(doc.paths).map(([id, paths]) => [id, paths.b]),
  );
const valid = (doc: ProjectDocument) =>
  assert.deepEqual(validateDocument(doc), []);

test("existing arrivals move atomically, repair only selected adjacent endpoints and preserve offstage metadata", () => {
  const doc = fixture();
  doc.formations[1].positions.a.offstage = true;
  const old = JSON.stringify(doc),
    others = structuredClone(otherRoutes(doc));
  const result = movePositionAtTime(doc, 24, "a", { x: -2.5, y: 3 }, "unused");
  assert.equal(result.beat, 24);
  assert.equal(result.error, undefined);
  valid(result.document);
  assert.equal(result.document.formations.length, 3);
  assert.deepEqual(result.document.formations[1].positions.a, {
    x: -2.5,
    y: 3,
    offstage: true,
  });
  assert.equal(result.document.paths.f1.a.points.at(-1)!.x, -2.5);
  assert.equal(result.document.paths.f2.a.points[0].x, -2.5);
  assert.deepEqual(otherRoutes(result.document), others);
  assert.equal(JSON.stringify(doc), old); // the complete previous model is the one Undo snapshot
});

test("missing travel keys insert only the selected timed anchor, preserving smooth mode and all endpoints", () => {
  const doc = fixture();
  doc.paths.f1.a.interpolation = "smooth";
  doc.paths.f1.b.locked = true;
  const endpoints = [
    structuredClone(doc.paths.f1.a.points[0]),
    structuredClone(doc.paths.f1.a.points.at(-1)),
  ];
  const other = JSON.stringify(otherRoutes(doc)),
    before = JSON.stringify(doc);
  const result = movePositionAtTime(
    doc,
    19.3,
    "a",
    { x: -0.5, y: 2.2 },
    "unused",
  );
  assert.equal(result.beat, 19.3);
  assert.equal(result.error, undefined);
  valid(result.document);
  const path = result.document.paths.f1.a;
  assert.equal(path.interpolation, "smooth");
  assert.equal(path.points.length, 3);
  assert.equal(path.points[1].t, (19.3 - 24 + 8) / 8);
  assert.deepEqual(evaluateDocument(result.document, 19.3).a, {
    x: -0.5,
    y: 2.2,
  });
  assert.deepEqual([path.points[0], path.points.at(-1)], endpoints);
  assert.equal(JSON.stringify(otherRoutes(result.document)), other);
  assert.equal(JSON.stringify(doc), before);
});

test("existing interior anchor edits do not append another key or change its saved time", () => {
  const doc = fixture();
  doc.paths.f1.a.points.splice(1, 0, {
    x: -1.4,
    y: 2.7,
    t: 0.5,
    offstage: true,
  });
  doc.paths.f1.a.interpolation = "smooth";
  const result = movePositionAtTime(doc, 20, "a", { x: -0.8, y: 2 }, "unused");
  valid(result.document);
  assert.equal(result.document.paths.f1.a.points.length, 3);
  assert.deepEqual(result.document.paths.f1.a.points[1], {
    x: -0.8,
    y: 2,
    t: 0.5,
    offstage: true,
  });
  assert.equal(result.document.paths.f1.a.interpolation, "smooth");
});

test("fractional hold edit snaps the visible beat and seeds everyone, with available-gap travel rather than a quarter-beat teleport", () => {
  const doc = fixture();
  doc.formations[0].positions.a.offstage = true;
  doc.paths.f1.b.locked = true;
  const oldOther = JSON.stringify(otherRoutes(doc)),
    old = JSON.stringify(doc);
  const result = movePositionAtTime(
    doc,
    9.13,
    "a",
    { x: -3, y: 2 },
    "new-hold",
  );
  valid(result.document);
  assert.equal(result.beat, 9.25);
  assert.equal(result.error, undefined);
  const key = result.document.formations[1];
  assert.equal(key.id, "new-hold");
  assert.equal(key.transitionBeats, 8);
  assert.deepEqual(key.positions.a, { x: -3, y: 2, offstage: true });
  assert.deepEqual(key.positions.b, doc.formations[0].positions.b);
  for (const [id, paths] of Object.entries(doc.paths))
    assert.deepEqual(result.document.paths[id].b, paths.b);
  assert.equal(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(result.document.paths)
          .filter(([id]) => id !== "new-hold")
          .map(([id, paths]) => [id, paths.b]),
      ),
    ),
    oldOther,
  );
  assert.equal(result.document.paths.f1.a.points[0].x, -3);
  assert.equal(
    result.document.formations.find((f) => f.id === "f1")!.transitionBeats,
    8,
  );
  assert.equal(JSON.stringify(doc), old);
});

test("short holds use the whole available gap and snapping onto an arrival reuses it", () => {
  const doc = fixture();
  const short = movePositionAtTime(doc, 2.1, "a", { x: -3, y: 2 }, "short");
  valid(short.document);
  assert.equal(short.beat, 2);
  assert.equal(short.document.formations[1].transitionBeats, 2);
  const arrival = movePositionAtTime(
    doc,
    0.1,
    "a",
    { x: -3, y: 2 },
    "not-needed",
  );
  valid(arrival.document);
  assert.equal(arrival.beat, 0);
  assert.equal(arrival.document.formations.length, 3);
});

test("selected locks block adjacent arrival edits and missing keys, but unrelated approved locks remain byte-identical", () => {
  const doc = fixture();
  doc.paths.f1.a.locked = true;
  for (const beat of [0, 8, 20, 24]) {
    const result = movePositionAtTime(
      doc,
      beat,
      "a",
      { x: -3, y: 2 },
      "blocked",
    );
    assert.equal(result.document, doc);
    assert.match(result.error!, /Unlock/);
    assert.equal(getPositionEditAvailability(doc, beat, "a").locked, true);
  }
  doc.paths.f1.a.locked = false;
  doc.paths.f2.b.locked = true;
  doc.paths.f1.b.locked = true;
  const result = movePositionAtTime(doc, 8, "a", { x: -3, y: 2 }, "allowed");
  valid(result.document);
  assert.deepEqual(result.document.paths.f1.b, doc.paths.f1.b);
  assert.deepEqual(result.document.paths.f2.b, doc.paths.f2.b);
  const status = getPositionEditAvailability(doc, 8, "a");
  assert.equal(status.canEdit, true);
  assert.equal(status.locked, false);
  assert.equal(status.requiresKey, true);
});

test("a no-op never creates a hold or travel key and out-of-stage input is bounded to the dancer inset", () => {
  const doc = fixture();
  for (const beat of [8, 20]) {
    const result = movePositionAtTime(
      doc,
      beat,
      "a",
      evaluateDocument(doc, beat).a,
      "unused",
    );
    assert.equal(result.document, doc);
    assert.equal(result.error, undefined);
  }
  const bounded = movePositionAtTime(
    doc,
    8,
    "a",
    { x: -900, y: 900 },
    "bounded",
  );
  valid(bounded.document);
  assert.deepEqual(bounded.document.formations[1].positions.a, {
    x: -5.75,
    y: 7.75,
  });
});

test("zero-duration stationary arrivals acquire real travel when moved, including a newly moving following hold", () => {
  const doc = fixture();
  doc.formations[1].positions = structuredClone(doc.formations[0].positions);
  doc.formations[1].transitionBeats = 0;
  const seeded = ensurePaths(doc);
  const moved = movePositionAtTime(seeded, 24, "a", { x: -3, y: 2 }, "unused");
  valid(moved.document);
  assert.equal(moved.document.formations[1].transitionBeats, 8);
  const hold = movePositionAtTime(
    seeded,
    20,
    "a",
    { x: -3, y: 2 },
    "before-stationary",
  );
  valid(hold.document);
  assert.equal(
    hold.document.formations.find((f) => f.id === "before-stationary")!
      .transitionBeats,
    8,
  );
  assert.equal(
    hold.document.formations.find((f) => f.id === "f1")!.transitionBeats,
    4,
  );
});

test("invalid coordinates, out-of-range counts, collision IDs and size limits reject without partial mutation", () => {
  const doc = fixture();
  for (const beat of [-1, 65, NaN, Infinity])
    assert.equal(
      movePositionAtTime(doc, beat, "a", { x: 0, y: 2 }, "new").document,
      doc,
    );
  for (const point of [
    { x: NaN, y: 2 },
    { x: 0, y: Infinity },
  ])
    assert.equal(movePositionAtTime(doc, 8, "a", point, "new").document, doc);
  for (const id of ["f1", "__proto__", "constructor", "", "x".repeat(201)]) {
    const result = movePositionAtTime(doc, 8, "a", { x: 0, y: 2 }, id);
    assert.equal(result.document, doc);
    assert.match(result.error!, /unique/);
  }
  assert.equal(getPositionEditAvailability(doc, 8, "unknown").canEdit, false);
  const full = fixture();
  full.paths.f1.a.points = Array.from({ length: 64 }, (_, i) => ({
    t: i / 63,
    x: -2 + i / 63,
    y: 1 + (3 * i) / 63,
  }));
  assert.equal(
    movePositionAtTime(full, 19, "a", { x: 0, y: 2 }, "new").document,
    full,
  );
  assert.match(
    movePositionAtTime(full, 19, "a", { x: 0, y: 2 }, "new").error!,
    /waypoint/,
  );
  const crowded = fixture();
  crowded.formations = Array.from({ length: 500 }, (_, i) => ({
    id: "k" + i,
    title: "Key",
    beat: i,
    transitionBeats: i ? 1 : 0,
    positions: structuredClone(doc.formations[0].positions),
  }));
  crowded.totalBeats = 500;
  crowded.sections[0].endBeat = 500;
  assert.equal(getPositionEditAvailability(crowded, 499.5, "a").canEdit, false);
});
