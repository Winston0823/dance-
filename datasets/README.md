# Synthetic transition fixtures

`synthetic-transitions.jsonl` contains 35 generated geometric examples: seven cases at 2, 4, 8, 12, and 24 dancers. These are synthetic coordinates and timing patterns, not observed performers or a trained model dataset. Names are synthetic labels. No physical safety assessment or ML training result is implied.

Regenerate with Node 24 from the repository root:

```sh
node scripts/generate-dataset.mjs
```

Generator version: `1.0.0`. Dataset seed/identity: `20261123`. The current generator is exhaustive and uses no randomness; the seed records the fixture family for reproducibility. Output order and contents are deterministic, with no timestamps. The script checks geometric expectations and enforces a 200,000 byte output cap.

Each line contains the generator metadata, case kind, dancer count, known expectations, first-pair continuous minimum-distance reference metrics, and a complete `ProjectDocument` with real saved timed path points. Coordinates are meters, radius is 0.32 m, and arrival is beat 8 after an eight-beat transition at 120 BPM. Extra dancers hold separate positions away from the first pair.

| Case                      | Geometric expectation                                                                |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `swap`                    | Opposing direct paths intersect at the same time.                                    |
| `simultaneous-crossing`   | Orthogonal paths cross simultaneously.                                               |
| `different-time-crossing` | Paths cross in space at different times, without circle overlap.                     |
| `wait-then-cross`         | One dancer waits until the other has passed.                                         |
| `locked-detour`           | A locked waypoint route separates an opposing pair.                                  |
| `boundary-endpoint`       | A destination lies beyond the stage; changing the route cannot fix the endpoint.     |
| `coincident-endpoints`    | Shared destinations force endpoint overlap; changing the route cannot separate them. |

Boundary and coincident-endpoint fixtures are structurally valid documents with explicit geometric problems. Clearance is a review advisory; a boundary crossing blocks publication. Neither metric accounts for performer ability, acceleration, orientation, body shape, or environmental uncertainty.

The core tests read this saved JSONL, validate every document, evaluate piecewise linear paths continuously, check known outcomes and locked-route invariants, and compare the saved fixture contents with the reproducible generator. The tests do not infer safety from passing metrics.
