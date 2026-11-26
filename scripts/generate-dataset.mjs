import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  ensurePaths,
  closestApproach,
  analyzeDocument,
  validateDocument,
} from "../packages/core/src/index.ts";

// All examples are generated coordinates, never observed performer trajectories.
export const GENERATOR_VERSION = "1.0.0";
export const SEED = 20261123;
const counts = [2, 4, 8, 12, 24];
const kinds = [
  "swap",
  "simultaneous-crossing",
  "different-time-crossing",
  "wait-then-cross",
  "locked-detour",
  "boundary-endpoint",
  "coincident-endpoints",
];
const point = (x, y) => ({ x, y });
const path = (points, locked = false) => ({
  locked,
  points: points.map(([t, x, y]) => ({ t, x, y })),
});

export function generateDataset() {
  const records = [];
  for (const count of counts)
    for (const kind of kinds) {
      const dancers = Array.from({ length: count }, (_, i) => ({
        id: `d${i + 1}`,
        name: `Synthetic ${i + 1}`,
        color: "#55d6be",
        radius: 0.32,
      }));
      const start = { d1: point(-2, 4), d2: point(2, 4) },
        end = { d1: point(2, 4), d2: point(-2, 4) };
      for (let i = 2; i < count; i++)
        start[`d${i + 1}`] = end[`d${i + 1}`] = point(
          -5 + ((i - 2) % 6) * 2,
          8 + Math.floor((i - 2) / 6) * 2,
        );
      if (
        [
          "simultaneous-crossing",
          "different-time-crossing",
          "wait-then-cross",
        ].includes(kind)
      ) {
        start.d2 = point(0, 2);
        end.d2 = point(0, 6);
      }
      if (kind === "boundary-endpoint") end.d1 = point(7, 4);
      if (kind === "coincident-endpoints") end.d1 = end.d2 = point(0, 4);
      let document = ensurePaths({
        id: `synthetic-${count}-${kind}`,
        title: `Synthetic ${count}: ${kind}`,
        bpm: 120,
        offsetSeconds: 0,
        totalBeats: 16,
        stage: {
          width: 12,
          depth: Math.max(12, 10 + Math.ceil((count - 2) / 6) * 2),
        },
        dancers,
        cones: [],
        sections: [
          {
            id: "study",
            title: "Synthetic study",
            startBeat: 0,
            endBeat: 16,
            color: "#55d6be",
          },
        ],
        formations: [
          {
            id: "start",
            title: "Start",
            beat: 0,
            transitionBeats: 0,
            positions: start,
          },
          {
            id: "end",
            title: "End",
            beat: 8,
            transitionBeats: 8,
            positions: end,
          },
        ],
        paths: {},
      });
      if (kind === "different-time-crossing") {
        document.paths.end.d1 = path([
          [0, -2, 4],
          [0.4, 2, 4],
          [1, 2, 4],
        ]);
        document.paths.end.d2 = path([
          [0, 0, 2],
          [0.6, 0, 2],
          [1, 0, 6],
        ]);
      }
      if (kind === "wait-then-cross") {
        document.paths.end.d1 = path([
          [0, -2, 4],
          [0.55, -2, 4],
          [1, 2, 4],
        ]);
        document.paths.end.d2 = path([
          [0, 0, 2],
          [0.4, 0, 6],
          [1, 0, 6],
        ]);
      }
      if (kind === "locked-detour")
        document.paths.end.d1 = path(
          [
            [0, -2, 4],
            [0.5, 0, 6],
            [1, 2, 4],
          ],
          true,
        );
      const clearance = [
        "swap",
        "simultaneous-crossing",
        "boundary-endpoint",
        "coincident-endpoints",
      ].includes(kind);
      const expectation = {
        clearance,
        boundary: kind === "boundary-endpoint",
        structuralErrors: 0,
        lockedDancerIds: kind === "locked-detour" ? ["d1"] : [],
        explanation: {
          swap: "Opposing direct segments coincide at t=.5.",
          "simultaneous-crossing":
            "Orthogonal segments reach the intersection together at t=.5.",
          "different-time-crossing":
            "The horizontal crossing finishes before the vertical crossing starts.",
          "wait-then-cross":
            "The vertical crossing finishes while the horizontal dancer waits.",
          "locked-detour":
            "A fixed elevated waypoint separates the opposing routes.",
          "boundary-endpoint":
            "The destination is outside x=6; suggestions cannot change that endpoint.",
          "coincident-endpoints":
            "Both dancers share the destination; route changes cannot separate their endpoints.",
        }[kind],
      };
      const near = closestApproach(
          document.paths.end.d1,
          document.paths.end.d2,
        ),
        warnings = analyzeDocument(document);
      if (
        validateDocument(document).length ||
        warnings.some((w) => w.type === "clearance") !== clearance ||
        warnings.some((w) => w.type === "boundary") !== expectation.boundary
      )
        throw new Error(`Synthetic expectation mismatch: ${count}/${kind}`);
      records.push({
        dataset: "danceform-synthetic-transitions",
        generatorVersion: GENERATOR_VERSION,
        seed: SEED,
        source: "synthetic-geometric-fixture",
        caseId: `${count}-${kind}`,
        kind,
        dancerCount: count,
        expectation,
        referenceMetrics: {
          firstPairMinimumDistance: near.distance,
          firstPairTime: near.t,
        },
        document,
      });
    }
  return records;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const target = new URL("../datasets/", import.meta.url);
  await mkdir(target, { recursive: true });
  const records = generateDataset(),
    jsonl = records.map((record) => JSON.stringify(record)).join("\n") + "\n";
  if (Buffer.byteLength(jsonl) > 200_000)
    throw new Error("Synthetic dataset exceeds the 200KB limit");
  await writeFile(new URL("synthetic-transitions.jsonl", target), jsonl);
  console.log(
    `Generated ${records.length} synthetic cases (${Buffer.byteLength(jsonl)} bytes), version ${GENERATOR_VERSION}, seed ${SEED}.`,
  );
}
