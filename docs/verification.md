# Prototype verification

## Live follow-up and any-count autosave — 26 November 2026

The authorized follow-up chat opened Chrome successfully. Real synthetic WAV import/reload, mobile-web Tools, and direct dragging/numeric editing at previously unkeyed paused counts were observed. The final web editor creates the appropriate key automatically in one undoable autosave edit; true approved locks remain enforced. **72 focused tests pass**, the production web build passes, and native TypeScript passes. See [the live QA results](live-qa-nov26.md) for exact observed values, recovered failures, viewport coverage and pending chooser cancellation/speaker/device checks. Earlier saved-denial notes below describe the prior chat, not this successful follow-up.

## Audio and mobile follow-up — 26 November 2026

**63/63 focused tests pass**, along with the production web build and native TypeScript. Fresh Android and iOS Hermes exports pass (740/741 modules, about 1.9 MB each). These are source/helper tests and bundles; no completed browser import, audible playback or physical-phone walkthrough is claimed.

```powershell
node --test tests/core.test.ts tests/route-edit.test.ts tests/curves.test.ts tests/timeline-edit.test.ts tests/native.test.ts tests/audio-placement.test.ts tests/audio-import.test.ts
npm.cmd run build
npm.cmd --prefix apps/mobile run typecheck
npm.cmd --prefix apps/mobile run export:android
npm.cmd --prefix apps/mobile run export:ios
```

Concrete fixes in this pass:

- The production web import pipeline validates the file and measured duration, closes the decoder even after failure, measures stereo channels, and preserves the prior asset on a failed import. Abort and project/import-generation checks discard cancelled or superseded work. MIME fallback covers missing picker MIME types while the existing server still checks extension, MIME and bytes. A complete tiny PCM WAV passed that production file-inspection function in an offline test; no HTTP or browser decoder was used for that check.
- The web player derives its source from the current project/asset identity so music replacement cannot reuse the old URL with new metadata. Loading/error/retry states, cancellation, an undoable Remove music action, and metadata synchronization are implemented. Obsolete play-promise failures cannot stop a newer seek or playback session. Audio offset editing accepts negative values without persisting incomplete/invalid input.
- Mobile-web landscape CSS includes 932 × 430 phones. The Tools drawer clears both compact and expanded timelines, expanded zoom controls are reachable, and short windows can scroll. Tools opening/closing moves/restores keyboard focus. Portrait phone/tablet gates pause playback and close the drawer; timeline capture loss closes edit transactions.
- Native seeks now use zero iOS tolerance and a serial seek queue, preventing old seeks from resuming obsolete playback. Counts wait for player readiness, timeline measurement responses cannot overwrite a newer seek, keyboard taps remain actionable, and formation timing Apply previews the new arrival. Starting at or after known music EOF preserves the selected count and prompts Music off for count-only practice. See [native-control-audit.md](native-control-audit.md).

The requested live walkthrough was attempted, but the browser rejected access **before loading the app** because this chat has a saved denial for `http://127.0.0.1:3001`. No alternate browser, host/port, indirect page inspection or permission-file change was used. The [official help article](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app) documents that saved denials may persist in a chat and recommends trying the site in a new chat. The local production server was started on port 3001 for that authorized follow-up.

The exact remaining import/replace/cancel/persistence, offset/audio playback, portrait/landscape Tools, timeline and physical-device checks are in [audio-mobile-live-checklist.md](audio-mobile-live-checklist.md). Final layout changes remain source-reviewed; automated tests do not replace real browser codec, touch, orientation or audio-device checks. No sharing capability was created or API integration server run performed during this follow-up.

## Current control and smooth-motion pass — 24 November 2026

The current editor uses saved Smooth/Straight route modes. Smooth routes pass through timed source anchors; adaptive canonical samples are shared by drawing, playback, seeking, speed/boundary review, and continuous closest-approach checks. Wait spans stay stationary and approved routes remain unchanged until unlocked. The dark timeline and cone identity are implemented in code; the generated [cone identity board](design/cone-identity-studies.png) is a design reference.

The focused command below passed **45/45 tests**, covering core motion, route editing, curves, timeline constraints, portable native editing/async helpers, and audio duration/offset placement:

```powershell
node --test tests/core.test.ts tests/route-edit.test.ts tests/curves.test.ts tests/timeline-edit.test.ts tests/native.test.ts tests/audio-placement.test.ts
npm.cmd run build
npm.cmd --prefix apps/mobile run typecheck
```

The web production build and native typecheck passed. Final Android and iOS Hermes exports passed after the native editing updates. These are JavaScript bundles, not signed or installed phone apps. No API/server tests were rerun during this pass; the API results below are historical backend-handoff evidence.

Observed in the browser before access was declined: new project/title/settings edits (stage dimensions, BPM, duration); section split/remove; cone add/rename/numeric and keyboard movement/remove/Undo; in-app dancer addition with Enter and removal Cancel/confirm/Undo/Redo; saved waypoint controls, Smooth mode with 29 canonical samples and one interior anchor, lock/unlock; count-only Play/Pause; and a saved note at beat 12. Previous whole-formation/transition drag and persistence checks remain recorded below. Source review also fixed stale project-load, note, publish, acknowledgment and revision-poll responses; these final asynchronous guard changes have build evidence, not fault-injected browser coverage. The final source pass also positions the web waveform at its real musical offset and duration, clipping its visual extent without changing the full-track seek target. Three pure placement tests cover positive/negative offsets, short/long audio, noninteger tempo and invalid metadata. Waveform keyboard activation no longer treats a coordinate-free click as beat zero; arrow/Home/End keys provide explicit seeking. These UI changes have source/test/build evidence only.

Local smooth-planner fixture benchmark: 12 dancers median 13.37 ms / maximum 19.42 ms; 24 dancers median 49.31 ms / maximum 58.54 ms. These narrow host measurements are not device or production guarantees. Legacy synthetic dataset routes remain reproducible without silently changing their interpolation.

Remaining manual checks:

- Browser audio import through the chooser, decoder and speaker. File-chooser automation failed twice; this does not establish an application import failure. A synthetic eight-second test WAV is available at `artifacts/generated-count-test.wav`.
- Final mobile-web portrait navigation and landscape Tools drawer. Earlier viewport checks below predate the newest drawer and spot cards; the final changes have source/build evidence only. The browser gate denied reacquiring the local origin and no workaround was attempted.
- Full fit/pan/loop-handle edge cases, formation duplicate/delete walkthrough, failure recovery, and keyboard/focus combinations beyond the observed controls. See [the control audit](web-control-audit.md).
- Native device orientation, safe areas, touch/keyboard, audio buffering, seeking, interruptions and Bluetooth behavior; signed release builds and hosting remain pending.
- Reader-link browser QA remains blocked by the earlier automatic approval review. No capability creation was retried.

See [Christy’s prototype comparison](prototype-comparison.md) for implemented, necessary and deferred features. The screenshots below show the earlier purple build; no current dark-timeline screenshot was captured after browser access was declined.

## Historical checks — 23 November 2026

## Formation-line and purple-theme update

The formation-strip body and transition-strip body now support direct dragging, with quarter-beat constraints and preserved approved-route locks. Stage route lines have selectable, draggable hit areas and double-click waypoint insertion; first-formation routes fall back to the next transition. Shared gesture transactions and ref-backed autosave prevent stale saves and record one undo snapshot per gesture. The web and native themes now use purple accents with vivid dancer colors.

Observed browser checks against the rebuilt app on port3001:

- Dragged the Two lines formation body from beat40 to43.75; inspector and timeline agreed. One Undo restored beat40.
- Dragged its transition body from8 to6 beats while arrival stayed at40. One Undo restored8.
- Dragged Dancer4's Chorus arc route in preview mode: exactly one bend was inserted; its coordinates and model warnings updated. Reload preserved the edited route exactly. Removed the test bend to restore the original route.
- Double-clicked that route: exactly one waypoint was inserted. One Undo restored the complete original point list. Fixed pointer capture so double-click remains targeted at the route rather than its parent SVG.
- Focused core/route/timeline suite:26/26 tests passed. Web production build and native typecheck passed; Android and iOS Hermes exports passed after the palette update. No sharing-capability action was retried and no backend behavior was changed in this update.

Screenshot: artifacts/purple-editor.jpg (actual rebuilt app, not an imagegen concept).

23 November 2026 · Local Windows / Node 24.12.0. This records observed checks, not a production or device certification.

## Passed

| Check                                  | Observed result                                                                                                                                                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web TypeScript + production Vite build | Pass. Final application JS about291KB (about91KB gzip); CSS about36KB.                                                                                                                                                                                                                                |
| Shared motion/timing/data tests        | 15/15 pass on final source. Covers continuous relative motion, time-aware crossings, bounds, locks, stable identities, repeat/reverse evaluation, malformed input, deterministic suggestions, native portability and exact synthetic-dataset regeneration.                                            |
| API integration tests                  | 11/11 pass at backend handoff. Tests use isolated temporary databases/servers. Covers restart persistence, compare-and-swap saves, immutable revisions, scope/revocation, notes/acknowledgments, private/range audio, upload validation, Host/CSRF/static-path defenses and external-binding refusal. |
| Native TypeScript                      | Pass for Expo/React Native source and shared core.                                                                                                                                                                                                                                                    |
| Android JavaScript/Hermes export       | Pass,735 modules, about1.8MB bytecode. This is a bundle, not an installed/signed APK.                                                                                                                                                                                                                 |
| iOS JavaScript/Hermes export           | Pass,736 modules, about1.8MB bytecode. This is a bundle, not a signed iOS application.                                                                                                                                                                                                                |
| Dependency audits                      | Root and native npm audits reported zero known vulnerabilities after upgrading the native build-tool minimatch dependency. Native SVG and safe-area versions match Expo's compatibility manifest.                                                                                                     |
| Production static server               | Built app loaded successfully from http://127.0.0.1:3001 with no browser console errors.                                                                                                                                                                                                              |

## Actual browser interaction checks

- Changed a dancer's numeric X coordinate, allowed autosave, reloaded, and observed the changed coordinate persisted. Restored the original coordinate afterward.
- Added two waypoints to one route. They received distinct normalized times (25% and50%), with numeric X/Y controls. Locked the route and observed add/edit/remove waypoint controls disabled. The resulting locked example remains in the local synthetic demonstration project.
- Sought to a transition midpoint, sought elsewhere, then returned to that same midpoint. All12 rendered dancer transform attributes matched exactly.
- Published synthetic demo revision1 through the explicit advisory-review dialog and observed the successful published revision state. Published snapshots are separate from subsequent draft edits.
- Checked mobile-web portrait navigation at390×844, entered the stage, and observed the rotate-to-landscape gate.
- Checked landscape at844×390. The final stage SVG had206px height and the page had no horizontal overflow. Its timeline starts compact and can expand for detail. Restored the browser's default viewport afterward.
- Verified the production-built app, rather than only the Vite development page, and saved its actual desktop screenshot. Mobile screenshots here are of the mobile-web companion layout, not of the React Native app running on a phone.

## Sharing check awaiting approval

Automatic approval review rejected clicking **Get practice link** on the local synthetic demo because generating a reader capability grants access to that plan. No workaround was attempted. An approval request is pending specifically for creating that local demo reader link; it would not be sent to anyone. The sharing API had already passed isolated backend integration tests before this browser action was rejected, but a real practice-link browser navigation is **not verified**.

## Deliberate limits / next checks

- No physical phone/emulator was available for native runtime interaction. Confirm orientation transitions, safe areas, touch/keyboard editing, audio seeks/interruptions/headphone disconnection and cross-device publication on actual iOS/Android hardware.
- Audio decoding/upload/range/ownership logic is implemented and backend tested. The full browser file-picker→audio-decoder→speaker loop was not manually exercised in this session; test with your rehearsal tracks on the target browsers.
- Formation timing handles, section split/remove, and loop handles compile and are present, but were not each exhaustively dragged through all browser edge cases. Use the broader scenarios in mvp-acceptance.md for the next rehearsal pilot.
- Docker configuration is provided but not executed. No internet hosting, HTTPS provisioning, app-store submission or production multi-tenant account system is complete.
- Motion behavior is evaluated using an explicitly synthetic35-case corpus. No observed dance dataset has been downloaded/trained on, and no claim of human biomechanical feasibility or safety is made.
- Offline mobile edits/coediting, push notifications, historical snapshot browsing and verified individual dancer read receipts are outside this prototype.

## Captured previews

- `artifacts/desktop-editor.jpg` — actual production web app at its default browser viewport.
- `artifacts/mobile-landscape.jpg` — actual landscape mobile-web stage layout.
- `docs/design/01-studio.png`, `02-tempo.png`, `03-rehearsal.png` — original generated imagegen concepts, preserved with exact prompts. They are reference boards, not screenshots or implementation evidence.

Local suggestion benchmark from core development:12 dancers median3.34ms / maximum4.11ms;24 dancers median11.70ms / maximum15.00ms over8 runs on this host. These are narrow fixture measurements, not a group-size or production-performance guarantee. See backend-pilot.md for separately measured local API timings.
