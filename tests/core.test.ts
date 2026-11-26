import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDemoDocument,
  ensurePaths,
  evaluateDocument,
  evaluatePath,
  closestApproach,
  analyzeDocument,
  suggestTransition,
  validateDocument,
  formatCount,
  beatToSeconds,
  secondsToBeat,
  getSectionAt,
  getActiveFormation,
} from "../packages/core/src/index.ts";
import type { ProjectDocument, TimedPath } from "../packages/core/src/index.ts";

function crossing(): ProjectDocument {
  const d = createDemoDocument("crossing");
  d.dancers = d.dancers.slice(0, 2);
  d.cones = [];
  d.stage = { width: 12, depth: 8 };
  d.totalBeats = 16;
  d.sections = [
    { id: "s", title: "Study", startBeat: 0, endBeat: 16, color: "#fff" },
  ];
  d.formations = [
    {
      id: "a",
      title: "A",
      beat: 0,
      transitionBeats: 0,
      positions: { d1: { x: -2, y: 4 }, d2: { x: 2, y: 4 } },
    },
    {
      id: "b",
      title: "B",
      beat: 8,
      transitionBeats: 8,
      positions: { d1: { x: 2, y: 4 }, d2: { x: -2, y: 4 } },
    },
  ];
  d.paths = {};
  return ensurePaths(d);
}
test("demo is bounded, structurally valid, synthetic and complete", () => {
  const d = createDemoDocument();
  assert.deepEqual(validateDocument(d), []);
  assert.equal(d.dancers.length, 12);
  assert.equal(d.formations.length, 6);
  assert.match(d.title, /Synthetic/);
  assert.equal(d.stage.width, 12);
  assert.equal(d.stage.depth, 8);
  assert.equal(
    analyzeDocument(d).filter((w) => w.type === "boundary").length,
    0,
  );
  assert.ok(
    analyzeDocument(d).length <= 4,
    "seeded demo should present a manageable review list",
  );
  assert.deepEqual(createDemoDocument(), d);
});
test("timeline has holds, transition arrival and identity-preserving repeat/reverse evaluation", () => {
  const d = crossing();
  d.formations[1].transitionBeats = 4;
  const before = JSON.stringify(d),
    samples = Array.from({ length: 65 }, (_, i) => evaluateDocument(d, i / 4));
  assert.deepEqual(samples[8], d.formations[0].positions);
  assert.deepEqual(evaluateDocument(d, 6).d1, { x: 0, y: 4 });
  assert.deepEqual(evaluateDocument(d, 8), d.formations[1].positions);
  for (let i = 64; i >= 0; i--)
    assert.deepEqual(evaluateDocument(d, i / 4), samples[i]);
  assert.equal(JSON.stringify(d), before);
});
test("conversion excludes audio offset, global counts and section boundaries remain stable", () => {
  const d = createDemoDocument();
  d.offsetSeconds = 7;
  assert.equal(beatToSeconds(d, 48), 24);
  assert.equal(secondsToBeat(d, 24), 48);
  assert.equal(formatCount(48), "7·1");
  assert.equal(formatCount(7.75), "1·8.75");
  assert.equal(getSectionAt(d, 31.75).title, "Intro");
  assert.equal(getSectionAt(d, 32).title, "Verse");
  assert.equal(getSectionAt(d, 80).title, "Chorus");
  assert.equal(getSectionAt(d, 128).title, "Chorus");
  assert.equal(getActiveFormation(d, 39).id, "f2");
  for (const beat of [0, 0.25, 12.5, 48, 128])
    assert.equal(secondsToBeat(d, beatToSeconds(d, beat)), beat);
});
test("continuous closest approach detects a crossing between sampled frames", () => {
  const a: TimedPath = {
    locked: false,
    points: [
      { t: 0, x: -10, y: 4 },
      { t: 1, x: 10, y: 4 },
    ],
  };
  const b: TimedPath = {
    locked: false,
    points: [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 0, y: 9 },
    ],
  };
  const approach = closestApproach(a, b);
  assert.ok(approach.distance < 0.5);
  assert.ok(approach.t > 0.45 && approach.t < 0.55);
});
test("geometric crossing at different times is distinct from simultaneous crossing", () => {
  const horizontal: TimedPath = {
    locked: false,
    points: [
      { t: 0, x: -2, y: 4 },
      { t: 0.4, x: 2, y: 4 },
      { t: 1, x: 2, y: 4 },
    ],
  };
  const vertical: TimedPath = {
    locked: false,
    points: [
      { t: 0, x: 0, y: 2 },
      { t: 0.6, x: 0, y: 2 },
      { t: 1, x: 0, y: 6 },
    ],
  };
  assert.ok(closestApproach(horizontal, vertical).distance > 1);
  const d = crossing();
  assert.ok(analyzeDocument(d).some((w) => w.type === "clearance"));
});
test("suggestion is deterministic, improves crossing and never changes timing/endpoints", () => {
  const d = crossing(),
    snapshot = JSON.stringify(d),
    a = suggestTransition(d, "b"),
    b = suggestTransition(d, "b");
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(d), snapshot);
  assert.deepEqual(a.formations, d.formations);
  assert.deepEqual(validateDocument(a), []);
  assert.ok(
    closestApproach(a.paths.b.d1, a.paths.b.d2).distance >
      closestApproach(d.paths.b.d1, d.paths.b.d2).distance,
  );
  assert.deepEqual(evaluateDocument(a, 0), d.formations[0].positions);
  assert.deepEqual(evaluateDocument(a, 8), d.formations[1].positions);
});
test("locked routes survive suggestion and stale endpoints require explicit unlocking", () => {
  let d = crossing();
  d.paths.b.d1.locked = true;
  const locked = structuredClone(d.paths.b.d1);
  d = suggestTransition(d, "b");
  assert.deepEqual(d.paths.b.d1, locked);
  d.formations[1].positions.d1.x = 3;
  d = ensurePaths(d);
  assert.deepEqual(d.paths.b.d1, locked);
  assert.ok(validateDocument(d).some((e) => e.includes("stale endpoints")));
  assert.ok(
    analyzeDocument(d).some((w) => w.type === "path" && w.severity === "error"),
  );
  d.paths.b.d1.locked = false;
  d = ensurePaths(d);
  assert.deepEqual(validateDocument(d), []);
  assert.equal(d.paths.b.d1.points.at(-1)?.x, 3);
});
test("ensurePaths only fills missing paths and synchronizes unlocked endpoints", () => {
  const d = crossing();
  d.paths.b.d1.points.splice(1, 0, { x: 0, y: 6, t: 0.4 });
  d.formations[1].positions.d1.x = 3;
  const out = ensurePaths(d);
  assert.deepEqual(out.paths.b.d1.points[1], { x: 0, y: 6, t: 0.4 });
  assert.equal(out.paths.b.d1.points.at(-1)?.x, 3);
  assert.equal(d.paths.b.d1.points.at(-1)?.x, 2);
});
test("boundary errors and speed advisories are separate from structural validation", () => {
  let d = crossing();
  d.formations[1].transitionBeats = 0.25;
  assert.deepEqual(validateDocument(d), []);
  assert.ok(
    analyzeDocument(d).some(
      (w) => w.type === "speed" && w.severity === "warning",
    ),
  );
  d.formations[1].positions.d1.x = 7;
  d = ensurePaths(d);
  assert.deepEqual(validateDocument(d), []);
  assert.ok(
    analyzeDocument(d).some(
      (w) => w.type === "boundary" && w.severity === "error",
    ),
  );
  d.formations[1].positions.d1.offstage = true;
  assert.ok(
    !analyzeDocument(d).some(
      (w) => w.type === "boundary" && w.dancerIds.includes("d1"),
    ),
  );
});
test("validator rejects malformed, oversized, missing, nonfinite and impossible timing data", () => {
  for (const mutation of [
    (d: any) => (d.dancers = [null]),
    (d: any) => (d.formations[1].beat = 0.1),
    (d: any) => (d.formations[1].transitionBeats = 20),
    (d: any) => (d.paths.b.d1.points[1].t = 0),
    (d: any) => (d.formations[0].positions.d1.x = Infinity),
    (d: any) =>
      (d.paths.b.d1.points = Array.from({ length: 65 }, (_, i) => ({
        t: i / 64,
        x: 0,
        y: 4,
      }))),
    (d: any) => delete d.paths.b.d1,
    (d: any) => (d.sections[0].endBeat = 12),
    (d: any) => (d.formations[1].transitionBeats = 0),
    (d: any) => (d.dancers[0].id = "__proto__"),
  ]) {
    const d = crossing();
    mutation(d);
    assert.ok(validateDocument(d).length > 0);
  }
  assert.ok(validateDocument(null as any).length);
  assert.ok(validateDocument({} as any).length);
});
test("path evaluation respects saved time parameterization rather than arc length", () => {
  const p: TimedPath = {
    locked: true,
    points: [
      { t: 0, x: 0, y: 0 },
      { t: 0.75, x: 0, y: 0 },
      { t: 1, x: 4, y: 0 },
    ],
  };
  assert.deepEqual(evaluatePath(p, 0.5), { x: 0, y: 0 });
  assert.deepEqual(evaluatePath(p, 0.875), { x: 2, y: 0 });
});
test("suggestion changes only the requested transition and preserves downstream snapshots", () => {
  const d = createDemoDocument(),
    before = structuredClone(d);
  d.paths.f6.d1.points[1].y += 0.1;
  const out = suggestTransition(d, "f3");
  assert.deepEqual(out.formations, before.formations);
  for (const id of ["f2", "f4", "f5", "f6"])
    assert.deepEqual(out.paths[id], d.paths[id]);
  assert.deepEqual(out.sections, d.sections);
  assert.deepEqual(out.dancers, d.dancers);
});
test("prototype-sensitive keys are rejected without mutation or global prototype changes", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const d = crossing();
    d.dancers[0].id = key;
    const snapshot = JSON.stringify(d),
      prototype = Object.getOwnPropertyNames(Object.prototype);
    assert.ok(validateDocument(d).some((e) => e.includes("ids must")));
    assert.equal(JSON.stringify(d), snapshot);
    assert.deepEqual(Object.getOwnPropertyNames(Object.prototype), prototype);
    const extra = crossing();
    extra.paths = JSON.parse(`{"${key}": {"polluted":true}}`);
    assert.ok(validateDocument(extra).length > 0);
    assert.equal(({} as any).polluted, undefined);
  }
});
test("shared core runs without structuredClone or newer array-at globals on native runtimes", () => {
  const savedClone = globalThis.structuredClone,
    savedAt = Array.prototype.at;
  try {
    globalThis.structuredClone = undefined as any;
    Array.prototype.at = undefined as any;
    const d = createDemoDocument("portable"),
      snapshot = JSON.stringify(d);
    const normalized = ensurePaths(d),
      suggested = suggestTransition(normalized, "f3");
    assert.deepEqual(validateDocument(suggested), []);
    assert.deepEqual(
      evaluateDocument(suggested, 128),
      d.formations[5].positions,
    );
    assert.equal(getActiveFormation(suggested, 128).id, "f6");
    assert.equal(getSectionAt(suggested, 128).title, "Chorus");
    assert.ok(analyzeDocument(suggested).length <= 4);
    assert.equal(JSON.stringify(d), snapshot);
  } finally {
    globalThis.structuredClone = savedClone;
    Array.prototype.at = savedAt;
  }
});
test("saved synthetic JSONL covers known geometry continuously and reproduces exactly", async () => {
  const text = readFileSync(
    new URL("../datasets/synthetic-transitions.jsonl", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(text) <= 200_000);
  const records = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(records.length, 35);
  assert.deepEqual(
    [...new Set(records.map((r) => r.dancerCount))],
    [2, 4, 8, 12, 24],
  );
  const { generateDataset } = await import("../scripts/generate-dataset.mjs");
  assert.deepEqual(records, generateDataset());
  for (const record of records) {
    const d = record.document as ProjectDocument,
      expected = record.expectation;
    assert.equal(record.source, "synthetic-geometric-fixture");
    assert.deepEqual(validateDocument(d), [], record.caseId);
    const near = closestApproach(d.paths.end.d1, d.paths.end.d2),
      warnings = analyzeDocument(d);
    assert.equal(
      near.distance < 0.64 - 1e-7,
      expected.clearance,
      record.caseId,
    );
    assert.equal(
      near.distance,
      record.referenceMetrics.firstPairMinimumDistance,
    );
    assert.equal(near.t, record.referenceMetrics.firstPairTime);
    assert.equal(
      warnings.some((w) => w.type === "boundary"),
      expected.boundary,
      record.caseId,
    );
    assert.equal(
      warnings.some((w) => w.type === "clearance"),
      expected.clearance,
      record.caseId,
    );
    if (record.kind === "swap" || record.kind === "simultaneous-crossing") {
      assert.equal(near.distance, 0);
      assert.equal(near.t, 0.5);
    }
    if (expected.lockedDancerIds.length) {
      const suggested = suggestTransition(d, "end");
      for (const id of expected.lockedDancerIds)
        assert.deepEqual(suggested.paths.end[id], d.paths.end[id]);
    }
    if (
      record.kind === "boundary-endpoint" ||
      record.kind === "coincident-endpoints"
    ) {
      const suggested = suggestTransition(d, "end");
      assert.deepEqual(suggested.formations, d.formations);
      assert.ok(
        analyzeDocument(suggested).some(
          (w) => w.type === (expected.boundary ? "boundary" : "clearance"),
        ),
      );
    }
  }
});
