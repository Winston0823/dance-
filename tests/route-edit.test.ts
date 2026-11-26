import test from "node:test";
import assert from "node:assert/strict";
import { ensurePaths, validateDocument } from "../packages/core/src/index.ts";
import type {
  ProjectDocument,
  TimedPoint,
} from "../packages/core/src/index.ts";
import {
  insertRouteWaypoint,
  moveRouteWaypoint,
} from "../packages/core/src/route-edit.ts";

function fixture(): ProjectDocument {
  return ensurePaths({
    id: "route-study",
    title: "Synthetic route edit",
    bpm: 120,
    offsetSeconds: 0,
    totalBeats: 24,
    stage: { width: 10, depth: 8 },
    cones: [],
    dancers: [
      { id: "a", name: "A", color: "#fff", radius: 0.4 },
      { id: "b", name: "B", color: "#aaa", radius: 0.3 },
    ],
    sections: [
      { id: "all", title: "Study", startBeat: 0, endBeat: 24, color: "#fff" },
    ],
    formations: [
      {
        id: "start",
        title: "Start",
        beat: 0,
        transitionBeats: 0,
        positions: { a: { x: -2, y: 2 }, b: { x: -2, y: 6 } },
      },
      {
        id: "end",
        title: "End",
        beat: 8,
        transitionBeats: 8,
        positions: { a: { x: 2, y: 2 }, b: { x: 2, y: 6 } },
      },
      {
        id: "later",
        title: "Later",
        beat: 16,
        transitionBeats: 8,
        positions: { a: { x: -2, y: 2 }, b: { x: -2, y: 6 } },
      },
    ],
    paths: {},
  });
}

test("bend insertion uses projection time and pointer coordinates, preserving other data", () => {
  const doc = fixture(),
    before = JSON.stringify(doc);
  const inserted = insertRouteWaypoint(doc, "end", "a", { x: -1, y: 4 })!;
  assert.equal(inserted.index, 0);
  assert.deepEqual(inserted.document.paths.end.a.points[1], {
    x: -1,
    y: 4,
    t: 0.25,
  });
  assert.deepEqual(validateDocument(inserted.document), []);
  assert.deepEqual(inserted.document.formations, doc.formations);
  assert.deepEqual(inserted.document.paths.end.b, doc.paths.end.b);
  assert.deepEqual(inserted.document.paths.later, doc.paths.later);
  assert.deepEqual(
    inserted.document.paths.end.a.points[0],
    doc.paths.end.a.points[0],
  );
  assert.deepEqual(
    inserted.document.paths.end.a.points[2],
    doc.paths.end.a.points[1],
  );
  assert.equal(JSON.stringify(doc), before);
});

test("repeated drag moves the same interior node without appending or changing times", () => {
  const initial = insertRouteWaypoint(fixture(), "end", "a", { x: 0, y: 4 })!;
  const snapshot = JSON.stringify(initial.document);
  let doc = initial.document;
  for (let step = 0; step < 40; step++)
    doc = moveRouteWaypoint(doc, "end", "a", initial.index, {
      x: step / 20,
      y: 3,
    });
  assert.equal(doc.paths.end.a.points.length, 3);
  assert.deepEqual(
    doc.paths.end.a.points.map((p) => p.t),
    [0, 0.5, 1],
  );
  assert.deepEqual(doc.paths.end.a.points[1], { x: 1.95, y: 3, t: 0.5 });
  assert.deepEqual(doc.paths.end.b, initial.document.paths.end.b);
  assert.deepEqual(doc.paths.later, initial.document.paths.later);
  assert.deepEqual(doc.formations, initial.document.formations);
  assert.equal(JSON.stringify(initial.document), snapshot);
});

test("nearest nonzero segment determines time and interior index despite wait segments", () => {
  const doc = fixture();
  doc.paths.end.a.points = [
    { t: 0, x: -2, y: 2 },
    { t: 0.3, x: -2, y: 2 },
    { t: 0.6, x: 0, y: 2 },
    { t: 1, x: 2, y: 2 },
  ];
  const inserted = insertRouteWaypoint(doc, "end", "a", { x: -1, y: 3 })!;
  assert.equal(inserted.index, 1);
  assert.ok(Math.abs(inserted.document.paths.end.a.points[2].t - 0.45) < 1e-10);
  const remaining = inserted.document.paths.end.a.points.filter(
    (_, index) => index !== inserted.index + 1,
  );
  assert.deepEqual(remaining, doc.paths.end.a.points);
  const moved = moveRouteWaypoint(
    inserted.document,
    "end",
    "a",
    inserted.index,
    { x: -1.5, y: 4 },
  );
  assert.equal(moved.paths.end.a.points[2].x, -1.5);
  assert.deepEqual(moved.paths.end.a.points[1], doc.paths.end.a.points[1]);
});

test("projection ties choose earlier segment, and endpoint projections stay strictly interior", () => {
  const doc = fixture();
  doc.paths.end.a.points = [
    { t: 0, x: -2, y: 2 },
    { t: 0.4, x: 0, y: 2 },
    { t: 1, x: 0, y: 4 },
  ];
  const tied = insertRouteWaypoint(doc, "end", "a", { x: 0, y: 2 })!;
  assert.equal(tied.index, 0);
  assert.ok(Math.abs(tied.document.paths.end.a.points[1].t - 0.36) < 1e-10);
  const early = insertRouteWaypoint(fixture(), "end", "a", { x: -100, y: 3 })!;
  const late = insertRouteWaypoint(fixture(), "end", "a", { x: 100, y: 3 })!;
  assert.equal(early.document.paths.end.a.points[1].t, 0.1);
  assert.equal(late.document.paths.end.a.points[1].t, 0.9);
});

test("edits clamp coordinates to stage inset for the selected dancer without moving endpoints", () => {
  const doc = fixture(),
    inserted = insertRouteWaypoint(doc, "end", "a", { x: 100, y: -100 })!;
  assert.deepEqual(inserted.document.paths.end.a.points[1], {
    t: 0.9,
    x: 4.6,
    y: 0.4,
  });
  const moved = moveRouteWaypoint(inserted.document, "end", "a", 0, {
    x: -100,
    y: 100,
  });
  assert.deepEqual(moved.paths.end.a.points[1], { t: 0.9, x: -4.6, y: 7.6 });
  assert.deepEqual(moved.paths.end.a.points[0], doc.paths.end.a.points[0]);
  assert.deepEqual(moved.paths.end.a.points[2], doc.paths.end.a.points[1]);
});

test("locked, missing, nonfinite, and invalid-index operations leave documents unchanged", () => {
  const doc = insertRouteWaypoint(fixture(), "end", "a", {
    x: 0,
    y: 3,
  })!.document;
  for (const index of [-1, 0.5, 1, Infinity, NaN])
    assert.equal(
      moveRouteWaypoint(doc, "end", "a", index, { x: 0, y: 4 }),
      doc,
    );
  for (const point of [
    { x: NaN, y: 3 },
    { x: 0, y: Infinity },
  ]) {
    assert.equal(insertRouteWaypoint(doc, "end", "a", point), null);
    assert.equal(moveRouteWaypoint(doc, "end", "a", 0, point), doc);
  }
  for (const [toId, dancer] of [
    ["missing", "a"],
    ["start", "a"],
    ["end", "missing"],
  ]) {
    assert.equal(insertRouteWaypoint(doc, toId, dancer, { x: 0, y: 4 }), null);
    assert.equal(moveRouteWaypoint(doc, toId, dancer, 0, { x: 0, y: 4 }), doc);
  }
  doc.paths.end.a.locked = true;
  const snapshot = JSON.stringify(doc);
  assert.equal(insertRouteWaypoint(doc, "end", "a", { x: 0, y: 4 }), null);
  assert.equal(moveRouteWaypoint(doc, "end", "a", 0, { x: 0, y: 4 }), doc);
  assert.equal(JSON.stringify(doc), snapshot);
});

test("stationary, malformed, full, and floating-point exhausted routes cannot acquire invalid times", () => {
  const doc = fixture();
  doc.paths.end.a.points = [
    { t: 0, x: 0, y: 2 },
    { t: 1, x: 0, y: 2 },
  ];
  assert.equal(insertRouteWaypoint(doc, "end", "a", { x: 0, y: 4 }), null);
  doc.paths.end.a.points = [
    { t: 0, x: -2, y: 2 },
    { t: 0, x: 2, y: 2 },
  ];
  assert.equal(insertRouteWaypoint(doc, "end", "a", { x: 0, y: 4 }), null);
  doc.paths.end.a.points = Array.from({ length: 64 }, (_, i): TimedPoint => ({
    t: i / 63,
    x: -2 + (4 * i) / 63,
    y: 2,
  }));
  assert.equal(insertRouteWaypoint(doc, "end", "a", { x: 0, y: 4 }), null);
  doc.paths.end.a.points = [
    { t: 0, x: -2, y: 2 },
    { t: 1 - Number.EPSILON / 2, x: 0, y: 2 },
    { t: 1, x: 2, y: 2 },
  ];
  assert.equal(insertRouteWaypoint(doc, "end", "a", { x: 1, y: 2 }), null);
});

test("route editing uses JSON-only cloning on portable runtimes", () => {
  const doc = fixture(),
    saved = globalThis.structuredClone;
  try {
    globalThis.structuredClone = undefined as any;
    const inserted = insertRouteWaypoint(doc, "end", "a", { x: 0, y: 4 })!;
    assert.deepEqual(
      validateDocument(
        moveRouteWaypoint(inserted.document, "end", "a", inserted.index, {
          x: 1,
          y: 3,
        }),
      ),
      [],
    );
  } finally {
    globalThis.structuredClone = saved;
  }
});
