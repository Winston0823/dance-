import test from "node:test";
import assert from "node:assert/strict";
import {
  NativeSeekController,
  playbackBoundary,
  audioHasEnded,
  audioStartBoundary,
} from "../apps/mobile/src/audio-clock.ts";
import {
  createDemoDocument,
  validateDocument,
  getPathSamples,
} from "../packages/core/src/index.ts";
import {
  numeric,
  changePosition,
  addWaypoint,
  changeWaypoint,
  removeWaypoint,
  changeTiming,
  changeSection,
  rulerBeat,
  sameScope,
  drainSave,
} from "../apps/mobile/src/editing.ts";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test("native numeric editing rejects blank/nonfinite values instead of moving a dancer to zero", () => {
  assert.throws(() => numeric("", "X"));
  assert.throws(() => numeric("   ", "X"));
  assert.throws(() => numeric("Infinity", "X"));
  assert.equal(numeric("-2.25", "X"), -2.25);
});
test("native position edits preserve loaded flags and update only unlocked route endpoints", () => {
  let doc = createDemoDocument("native-edit");
  const f = doc.formations[1],
    dancer = doc.dancers[0].id,
    next = doc.formations[2];
  doc.paths[f.id][dancer].locked = false;
  doc.paths[next.id][dancer].locked = false;
  const saved = clone(doc.paths[next.id][doc.dancers[1].id]);
  doc = changePosition(doc, f.id, dancer, 1, 3);
  assert.deepEqual(doc.paths[f.id][dancer].points.at(-1), { x: 1, y: 3, t: 1 });
  assert.deepEqual(doc.paths[next.id][dancer].points[0], { x: 1, y: 3, t: 0 });
  assert.deepEqual(doc.paths[next.id][doc.dancers[1].id], saved);
  doc.paths[next.id][dancer].locked = true;
  assert.throws(() => changePosition(clone(doc), f.id, dancer, 2, 3), /Unlock/);
  assert.deepEqual(validateDocument(doc), []);
});
test("native source waypoint operations preserve smooth mode, endpoint identity, and lock guards", () => {
  let doc = createDemoDocument("native-route");
  const f = doc.formations[1].id,
    dancer = doc.dancers[0].id;
  doc.paths[f][dancer] = {
    locked: false,
    interpolation: "smooth",
    points: [
      clone(doc.paths[f][dancer].points[0]),
      clone(doc.paths[f][dancer].points.at(-1)!),
    ],
  };
  const start = clone(doc.paths[f][dancer].points[0]),
    end = clone(doc.paths[f][dancer].points.at(-1));
  doc = addWaypoint(doc, f, dancer);
  doc = changeWaypoint(doc, f, dancer, 1, 1.2, 4.2, 0.4);
  assert.equal(doc.paths[f][dancer].interpolation, "smooth");
  assert.ok(getPathSamples(doc.paths[f][dancer]).length > 3);
  assert.deepEqual(doc.paths[f][dancer].points[0], start);
  assert.deepEqual(doc.paths[f][dancer].points.at(-1), end);
  assert.throws(
    () => changeWaypoint(clone(doc), f, dancer, 1, 0, 0, 1),
    /between/,
  );
  assert.throws(() => removeWaypoint(clone(doc), f, dancer, 0), /endpoints/);
  doc = removeWaypoint(doc, f, dancer, 1);
  assert.equal(doc.paths[f][dancer].points.length, 2);
  doc.paths[f][dancer].locked = true;
  assert.throws(() => addWaypoint(clone(doc), f, dancer), /Unlock/);
});
test("native formation timing never silently retimes locked routes or neighboring formations", () => {
  const doc = createDemoDocument("native-time"),
    f = doc.formations[1];
  for (const p of Object.values(doc.paths[f.id])) p.locked = false;
  const original = clone(doc.formations[2]);
  const changed = changeTiming(
    clone(doc),
    f.id,
    f.beat + 0.25,
    f.transitionBeats,
  );
  assert.deepEqual(changed.formations[2], original);
  assert.throws(
    () => changeTiming(clone(doc), f.id, doc.formations[2].beat + 1, 8),
    /timing/,
  );
  doc.paths[f.id][doc.dancers[0].id].locked = true;
  assert.throws(
    () => changeTiming(clone(doc), f.id, f.beat + 0.25, 8),
    /Unlock/,
  );
});
test("native ruler seeking uses page-space coordinates including a scrolled negative origin", () => {
  assert.equal(rulerBeat(120, 60, 12, 128), 5);
  assert.equal(rulerBeat(120, -240, 12, 128), 30);
  assert.equal(rulerBeat(122, 60, 12, 128), 5.25);
  assert.equal(rulerBeat(-100, 60, 12, 128), 0);
  assert.equal(rulerBeat(10000, 60, 12, 128), 128);
});
test("native section boundary edits preserve absolute formations/routes and contiguous coverage", () => {
  const doc = createDemoDocument("native-sections"),
    geometry = clone({ formations: doc.formations, paths: doc.paths });
  const changed = changeSection(doc, doc.sections[1].id, "Verse one", 36, 76);
  assert.equal(changed.sections[0].endBeat, 36);
  assert.equal(changed.sections[2].startBeat, 76);
  assert.deepEqual(
    { formations: changed.formations, paths: changed.paths },
    geometry,
  );
  assert.throws(
    () => changeSection(clone(doc), doc.sections[0].id, "Intro", 4, 20),
    /zero/,
  );
  assert.throws(
    () => changeSection(clone(doc), doc.sections[1].id, "Bad", 100, 20),
    /Sections/,
  );
});
test("native asynchronous response scope includes credentials as well as project/server", () => {
  const c = { server: "http://localhost:3001", token: "owner" };
  assert.equal(sameScope(c, { ...c }, "a", "a"), true);
  assert.equal(sameScope(c, { ...c, token: "reader" }, "a", "a"), false);
  assert.equal(sameScope(c, c, "a", "b"), false);
  assert.equal(sameScope(c, c, "a", "a", 4, 4), true);
  assert.equal(
    sameScope(c, c, "a", "a", 4, 5),
    false,
    "A same-project reload invalidates an older save response.",
  );
});
test("native save barrier serializes concurrent callers and saves edits made during an outstanding request", async () => {
  const state = { current: null as Promise<boolean> | null };
  let draft = 1,
    persisted = 0,
    writes = 0,
    active = 0,
    maxActive = 0;
  let release: () => void = () => {};
  const write = async () => {
    const snapshot = draft;
    writes++;
    active++;
    maxActive = Math.max(maxActive, active);
    if (writes === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    persisted = snapshot;
    active--;
    return true;
  };
  const first = drainSave(state, () => draft === persisted, write);
  draft = 2;
  const publishBarrier = drainSave(state, () => draft === persisted, write);
  release();
  assert.deepEqual(await Promise.all([first, publishBarrier]), [true, true]);
  assert.equal(persisted, 2);
  assert.equal(writes, 2);
  assert.equal(maxActive, 1);
  assert.equal(state.current, null);
});
test("native rejected save stops rather than automatically retrying invalid/conflicted content", async () => {
  const state = { current: null as Promise<boolean> | null };
  let writes = 0;
  assert.equal(
    await drainSave(
      state,
      () => false,
      async () => {
        writes++;
        return false;
      },
    ),
    false,
  );
  assert.equal(writes, 1);
  assert.equal(state.current, null);
});

test("native seeks request exact iOS tolerances and preserve rehearsal playback rate", async () => {
  const calls: unknown[] = [];
  const controller = new NativeSeekController(
    {
      pause() {
        calls.push("pause");
      },
      setPlaybackRate(rate) {
        calls.push(["rate", rate]);
      },
      async seekTo(...args) {
        calls.push(["seek", ...args]);
      },
      play() {
        calls.push("play");
      },
    },
    (error) => {
      throw error;
    },
  );
  await controller.start(12.25, 0.75);
  assert.deepEqual(calls, [
    "pause",
    ["rate", 0.75],
    ["seek", 12.25, 0, 0],
    "play",
  ]);
  assert.equal(controller.phase, "audio");
});
test("native rapid seek replacement waits for old native seek and never plays the obsolete target", async () => {
  let release: () => void = () => {};
  const calls: string[] = [];
  const controller = new NativeSeekController(
    {
      pause() {},
      setPlaybackRate() {},
      async seekTo(seconds) {
        calls.push("seek:" + seconds);
        if (seconds === 10)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
      },
      play() {
        calls.push("play");
      },
    },
    (error) => {
      throw error;
    },
  );
  const old = controller.start(10, 1);
  await Promise.resolve();
  const latest = controller.start(30, 1);
  assert.deepEqual(calls, ["seek:10"]);
  release();
  await Promise.all([old, latest]);
  assert.deepEqual(calls, ["seek:10", "seek:30", "play"]);
});
test("native cancelled pending seek cannot resume playback or surface an obsolete failure", async () => {
  let reject: (error: Error) => void = () => {};
  let played = 0,
    errors = 0;
  const controller = new NativeSeekController(
    {
      pause() {},
      setPlaybackRate() {},
      seekTo() {
        return new Promise<void>((_, fail) => {
          reject = fail;
        });
      },
      play() {
        played++;
      },
    },
    () => {
      errors++;
    },
  );
  const pending = controller.start(10, 1);
  await Promise.resolve();
  controller.pause();
  reject(new Error("stale seek"));
  await pending;
  assert.equal(played, 0);
  assert.equal(errors, 0);
  assert.equal(controller.phase, "idle");
});
test("native loop boundaries tolerate clock rounding and old EOF status does not end a new seek", () => {
  assert.deepEqual(playbackBoundary(32 - 1e-10, 128, [0, 32]), {
    beat: 0,
    looped: true,
    ended: false,
  });
  assert.deepEqual(playbackBoundary(128, 128, null), {
    beat: 128,
    looped: false,
    ended: true,
  });
  assert.equal(
    audioHasEnded(0, 60, { didJustFinish: true, currentTime: 60 }),
    false,
  );
  assert.equal(
    audioHasEnded(60, 60, { didJustFinish: false, currentTime: 59.9 }),
    true,
  );
  assert.equal(
    audioHasEnded(12, 0, { didJustFinish: true, currentTime: 12 }),
    true,
  );
});

test("native audio start guard distinguishes silent preroll from counts at or beyond known EOF", () => {
  assert.equal(audioStartBoundary(-4, 8), "preroll");
  assert.equal(audioStartBoundary(0, 8), "ready");
  assert.equal(audioStartBoundary(7.99, 8), "ready");
  assert.equal(audioStartBoundary(8, 8), "past-end");
  assert.equal(
    audioStartBoundary(20, 8),
    "past-end",
    "Beat 40 at 120 BPM must not seek/clamp back to an eight-second track end.",
  );
  assert.equal(
    audioStartBoundary(20, 0),
    "ready",
    "Unknown duration must wait for the native player rather than invent an EOF.",
  );
});
