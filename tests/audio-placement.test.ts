import test from "node:test";
import assert from "node:assert/strict";
import { getAudioBeatRange } from "../apps/web/src/audio-placement.ts";

test("positive offset clips the audio beginning without stretching later peaks", () => {
  const range = getAudioBeatRange(10, 3, 120)!;
  assert.deepEqual(range, { startBeat: -6, durationBeats: 20 });
  // The midpoint of the real recording is audio second 5, choreography second 2.
  assert.equal(range.startBeat + range.durationBeats / 2, 4);
  assert.equal((4 * 60) / 120 + 3, 5);
});

test("negative offset leaves count-only preroll, and short audio ends before the plan", () => {
  const range = getAudioBeatRange(6, -2, 120)!;
  assert.equal(range.startBeat, 4);
  assert.equal(range.startBeat + range.durationBeats, 16);
  // A 128-beat plan must keep the remaining 112 beats empty, not enlarge the file.
  assert.equal(128 - (range.startBeat + range.durationBeats), 112);
});

test("noninteger tempo and long recordings preserve their real musical extent", () => {
  assert.deepEqual(getAudioBeatRange(120, 1, 90), {
    startBeat: -1.5,
    durationBeats: 180,
  });
  for (const args of [
    [0, 0, 120],
    [-1, 0, 120],
    [5, Infinity, 120],
    [5, 0, 0],
    [NaN, 0, 120],
  ])
    assert.equal(
      getAudioBeatRange(...(args as [number, number, number])),
      null,
    );
});
