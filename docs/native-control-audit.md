# Native editor audit

26 November 2026 · Source review, portable tests, TypeScript and Expo exports. No phone/emulator runtime interaction was available. No browser, API/server, or sharing-capability action was performed during this final audit.

## Implemented controls

- Dancer selection/name/add/remove and numeric formation positions; adjacent approved-route locks prevent endpoint changes. Loaded offstage flags are preserved, but an offstage editing workflow is deliberately omitted.
- Incoming-transition context; source waypoint insertion, numeric position/time editing, removal, route lock/unlock, deterministic suggestions, and straight/smooth interpolation. Stage rendering uses `getPathSamples`, matching shared playback and model checks; source anchors remain the editable controls.
- Formation arrival/transition timing and section title/boundary edits. Sections retain contiguous absolute musical time, and grouping edits do not retime formations, saved routes or audio.
- Reference-cone selection/add/label/position/remove, with striped cone SVGs. Cones are visual references, not collision obstacles.
- Dark timeline with purple selection, zoom, section loops, formation selection, quarter-beat ruler seeking and offset/duration-aware waveform placement. Seeking uses page-space ruler coordinates rather than a touched child label's local coordinates.
- Explicit revision notes/acknowledgments, newer-revision notice, local recovery export, serialized save-before-publish, and warning review tied to the exact reviewed snapshot. Names attached to reader capabilities remain unverified.

## Final source finding and fix

A debounced save could previously start during a slow, explicitly requested discard/reload of the same project. Because the project/server/token matched, a late response could then update the newly loaded document's version/save status using the discarded draft's response.

`flushSave` now refuses work while a project/connection load or publication is active, checks the same guard before each queued write, and verifies the load-generation number before accepting either a successful or failed save response. The save barrier also returns failure if a transition began while it was waiting. The existing portable scope test now covers a same-project/same-credential response from an earlier generation; no hook/device interaction is implied by that helper test.

## Audio and landscape follow-up

The installed Expo iOS implementation defaults seek tolerances to infinity. Native playback now explicitly requests zero tolerances, serializes overlapping native seek promises, and suppresses obsolete seek completion/error callbacks. Counts freeze and re-anchor while music loads or seeks. Loop comparisons tolerate small clock-rounding differences, and stale end-of-file status cannot terminate a newly sought position.

Before any initial, post-preroll, or loop-start seek, the audio-start guard checks the known native duration (or saved duration while loading). At or beyond a known music end, it pauses without issuing a clamping native seek, preserves the selected count, and prompts **Music off** to continue count-only. It does not silently jump the choreography back to the track end. Negative audio time remains intentional silent preroll. The playback effect also follows routine-length changes. The source uses the same tested guard; this is not a claim of a device playback run.

Timing Apply seeks to the newly edited arrival. A full formation picker provides access when short timeline clips are too closely spaced to tap reliably. Nested inspector selectors keep keyboard taps, iOS scroll views adjust keyboard insets, and ruler measurement callbacks use the latest gesture coordinate and reject obsolete measurements. Physical touch/keyboard behavior still needs device verification. Audio import remains a laptop/web workflow; native consumes the resulting authenticated audio asset.

## Observed verification after the fix

| Check                              | Result                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test tests/native.test.ts` | 14/14 pass: editing/locks/source anchors/timing/section/ruler/scope/save barrier, exact native seek commands, rapid replacement/cancellation, loop/EOF behavior and pre-seek EOF guard. |
| Native TypeScript                  | `npm run typecheck --prefix apps/mobile` passes.                                                                                                                                        |
| Android Expo/Hermes export         | Pass: 740 modules, about 1.9 MB; `dist/mobile-android`, bundle hash prefix `45843fea`.                                                                                                  |
| iOS Expo/Hermes export             | Pass: 741 modules, about 1.9 MB; `dist/mobile-ios`, bundle hash prefix `ebb9f503`.                                                                                                      |

These are JavaScript/Hermes exports, not installed/signed APKs or iOS applications. Remaining hardware checks include actual touch/scroll and keyboard behavior, safe areas, orientation refusal/portrait restoration, authenticated native audio loading/buffering/seeking/loops, count synchronization, and interruption handling. The canonical sampled motion model and consent-free synthetic fixtures do not establish human movement safety.
