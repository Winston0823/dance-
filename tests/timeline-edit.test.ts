import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemoDocument,
  validateDocument,
} from "../packages/core/src/index.ts";
import {
  retimeFormation,
  resizeTransition,
} from "../apps/web/src/timeline-edit.ts";

test("arrival edits quantize, clamp both neighboring spans and retain saved path geometry", () => {
  const doc = createDemoDocument();
  const f = doc.formations[1],
    next = doc.formations[2];
  const moved = retimeFormation(doc, f.id, next.beat - 0.11).document;
  assert.equal(moved.formations[1].beat, next.beat - 0.25);
  assert.equal(moved.formations[2].transitionBeats, 0.25);
  assert.deepEqual(moved.paths, doc.paths);
  assert.deepEqual(validateDocument(moved), []);
  assert.equal(doc.formations[1].beat, f.beat);
  assert.equal(retimeFormation(doc, f.id, f.beat + 0.1).document, doc);
  assert.equal(retimeFormation(doc, doc.formations[0].id, 8).document, doc);
});

test("approved routes block retiming and shortening adjacent locked transitions", () => {
  const doc = createDemoDocument();
  const f = doc.formations[1],
    next = doc.formations[2],
    dancer = doc.dancers[0].id;
  doc.paths[f.id][dancer].locked = true;
  assert.match(retimeFormation(doc, f.id, 4).error!, /Unlock/);
  assert.equal(resizeTransition(doc, f.id, 2).document, doc);
  doc.paths[f.id][dancer].locked = false;
  doc.paths[next.id][dancer].locked = true;
  assert.match(retimeFormation(doc, f.id, next.beat - 1).error!, /locked next/);
});

test("transition resize keeps arrival and geometry, disallows moving in zero time", () => {
  const doc = createDemoDocument(),
    f = doc.formations[1];
  const result = resizeTransition(doc, f.id, 2.13).document;
  assert.equal(result.formations[1].transitionBeats, 2.25);
  assert.equal(result.formations[1].beat, f.beat);
  assert.deepEqual(result.paths, doc.paths);
  assert.deepEqual(validateDocument(result), []);
  assert.equal(
    resizeTransition(doc, f.id, 0).document.formations[1].transitionBeats,
    0.25,
  );
});
