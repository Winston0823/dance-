# Remaining live audio and mobile-web checks

## Follow-up result — 26 November 2026

The authorized follow-up chat opened Chrome successfully. Real synthetic WAV import/reload, mobile-web Tools, and direct dragging/numeric editing at previously unkeyed paused counts were observed. The final web editor creates the appropriate key automatically in one undoable autosave edit; true approved locks remain enforced. **72 focused tests pass**, the production web build passes, and native TypeScript passes. See [the live QA results](live-qa-nov26.md) for exact observed values, recovered failures, viewport coverage and pending chooser cancellation/speaker/device checks. Earlier saved-denial notes below describe the prior chat, not this successful follow-up.

Prepared 26 November 2026. **This pass is source review, successful web/native builds, and 63 passing focused tests—not a completed browser or phone run.** The saved local-origin browser denial persists in this chat. Continue in a new chat as advised by the [official help guidance](https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app), with the user’s browser access; do not retry or bypass the denial here. A physical phone is unavailable, so viewport checks must be labeled mobile-web emulation, not device validation.

Use the existing **Rehearsal sandbox**, or create a clearly named **Nov26 QA** project through the app. Record the selected project before editing. Do not modify the original synthetic demonstration project, its roster, formations or saved routes. This checklist does not authorize or require publishing, creating reader capabilities, visiting practice links, or changing share access.

## Prepare and record the baseline

1. Start the current production build using the repository instructions; open the local app in the new chat’s authorized browser. Record the build, browser, viewport and project name.
2. Confirm the project is an editor draft. Wait for **All changes saved** before switching projects or reloading. If a conflict or failed save appears, preserve the local work and resolve it explicitly; never treat it as a successful save.
3. Use the existing synthetic eight-second fixture at `artifacts/generated-count-test.wav`. Regenerate it if necessary with:

   ```powershell
   node scripts/generate-test-audio.mjs
   ```

   This produces local count clicks, not a rehearsal recording. Set the QA project to **120 BPM**, **128 total beats**, **audio offset 0**. Keep total duration longer than the clip so empty timeline space can be checked.

4. Record the original audio asset/name, offset and project settings if the sandbox already contains music. For invalid-input testing, prepare an ordinary text file named `invalid-audio-qa.wav` in the QA artifacts folder; it must not overwrite any existing fixture.

## Import, replace, failure and persistence

1. Choose **Add music**, use the real file chooser, and select `generated-count-test.wav`. If automation cannot operate the chooser, use the browser’s supported manual handoff and ask the user to select the file. A chooser-automation failure is not evidence that import failed; do not bypass a denied action.
2. Expect the filename, a waveform derived from decoded audio, and a successful save. Record any visible import error. The full clip is eight seconds, or **16 beats at 120 BPM**. Its waveform extent must finish at beat 16 rather than stretch across all 128 beats. Individual audible peaks can finish before the clip boundary because the fixture contains silence between clicks.
3. Wait for save, reload, and confirm the asset name, measured duration, waveform extent, BPM and offset survive. A real waveform and playback must remain available after reload.
4. Open **Replace music**, then cancel the chooser. Confirm the existing music, document and save state remain unchanged.
5. Choose the deliberately invalid WAV. Expect a clear decoder/import error with no fake waveform or successful-save claim. Existing music and choreography must remain intact; count-only controls must still work.
6. Replace with the valid fixture again. Confirm successful save/reload and no playback from the old asset during replacement. If testing a different valid recording, record its measured duration and the expected end beat rather than assuming eight seconds.
7. During a pending import, use **Cancel import** if it stays pending long enough. Confirm it does not replace the saved asset or later surface an obsolete error. If decoding is too fast to operate this control, record it as not attempted; do not claim the helper's abort tests are a UI walkthrough.
8. In Settings, **Remove music** and confirm count-only playback. Undo should restore the original audio metadata and reload the real asset. Reapply the fixture for subsequent checks. While music is loading, Play should explain that state; a failed media fetch/playback should show Retry music or a clear playback error.

## Waveform placement and seeking

The model is `audio timestamp = beat × 60 / BPM + offsetSeconds`. At 120 BPM, the eight-second clip always spans 16 beats; changing offset moves it rather than changing its width.

| Audio offset | Expected clip position     | Check                                                                                            |
| ------------ | -------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 seconds    | Start beat 0; end beat 16  | Full recording, then empty lane through beat 128.                                                |
| +2 seconds   | Start beat −4; end beat 12 | The first two seconds are clipped before the plan. At choreography beat 0, audio is at second 2. |
| −2 seconds   | Start beat 4; end beat 20  | Four beats of silent preroll. Audio second 0 begins at beat 4.                                   |

For each offset, save/reload, then:

1. Verify the clip’s location and extent against counts and timeline zoom. Its extent must be unchanged by Fit or zoom.
2. Click a waveform point and an empty part of its full lane. Both must seek the corresponding musical beat; neither should select a different audio asset or open the chooser when music is already present.
3. Focus the waveform with the keyboard. Enter/Space must not interpret a coordinate-free activation as beat 0. Left/Right should step a quarter beat; Shift should step eight; Home/End should seek plan boundaries. Confirm the playhead, count and stage agree.

## Playback, offset, speed and looping

1. At offset 0, Play/Pause, seek while paused, seek while playing, and return to the same count. Dancer positions must match the saved routes each time. Audio and count must agree.
2. Play beyond beat 16. The plan must continue with counts after the short clip ends, rather than stop early or restart the track unexpectedly. Back-seek into the clip and confirm music resumes at the correct timestamp.
3. At offset −2, play from beat 0: hear no music before beat 4. While playing, seek back into beats 0–3 and confirm genuine preroll, without jumping directly to beat 4.
4. At offset −2, loop **0–8** to cover preroll and audio, then **20–28** to loop entirely after the clip. Confirm stable count/position looping and no stale or unwanted audio.
5. At offset +2, loop **8–20** across the clip’s beat-12 end. Music should play only where the clip exists; each loop restart should map to the correct audio timestamp.
6. Check **0.5×, 0.75× and 1×**, including a seek and loop at each speed. The saved route geometry and musical positions must not change with playback speed. Pause at the plan end, then press Play and confirm restart behavior.
7. Record audio stalls, autoplay errors, console errors and audible drift honestly. Emulated checks do not cover hardware routing, Bluetooth, interruptions or background behavior on iOS/Android.

## Portrait mobile web — 390 × 844 and tablet portrait

1. Confirm Home, Notes and Projects are reachable without page overflow. Check the QA project’s dancer spot card: selected name, current count, coordinates, next formation/count and nearby center-to-center distances.
2. Add a clearly labeled QA rehearsal note at a chosen count. Confirm its saved body and count, then reload. Do not silently map an earlier published-revision note onto the current draft.
3. Enter the stage. Expect the rotate-to-landscape gate rather than a cramped editor. Return Home using its action; confirm playback stops as intended. Repeat navigation and the gate at an 820-pixel-wide portrait tablet viewport; the desktop inspector must not appear merely because width exceeds 900 pixels.

## Landscape mobile web — 844 × 390 and 932 × 430

Repeat these steps at both viewports. The wider viewport must still receive the mobile landscape controls, not an overflowing desktop inspector. Also briefly reduce height to check that short windows can scroll to content instead of clipping it.

1. Enter the QA stage. Confirm the stage, compact timeline, Play, Tools and navigation remain visible/reachable with no horizontal page overflow.
2. Open **Tools**. Keyboard focus should move to the drawer’s close control. Select a dancer, enter formation edit mode, change a numeric position, wait for save, reload and verify it. Test Undo/Redo. Approved incoming/outgoing routes should disable position edits until explicitly unlocked.
3. Add a waypoint, edit numeric X/Y, switch Straight/Smooth, and inspect the visible curve. A two-point route may remain visually straight; add a bend before judging the shape. Lock the route and confirm add/move/remove/mode controls cannot alter it. Unlock explicitly, then Undo the QA edits if desired.
4. Close Tools with its button and with Escape. Focus should return to its trigger. Open another panel/project deliberately; a later project-load response must not steal focus back into a hidden drawer.
5. Expand the timeline using **More** while Tools is open. The drawer must end above the full expanded timeline; Play and the action row must not be covered. Close Tools and confirm the same transport stays usable.
6. In expanded mode, operate zoom buttons and the zoom slider, pan the timeline, then Fit. If the action row is narrow, scroll it horizontally and reach every action while transport/Play stays accessible. Scrub the ruler by pointer/touch and keyboard.
7. Drag a whole formation strip and its transition, confirming quarter-beat arrival/travel constraints, then Undo once per gesture. Test loop in/out handles and numeric range, section focus/loop, speed, and playback follow. Keep a saved route locked during a related timing edit to check the explanatory refusal rather than silent invalidation.
8. Check the music lane and actual waveform placement from the audio steps above. Confirm collapsed/expanded timeline changes do not change musical time or clip width relative to count spacing.
9. Return to Notes/Home, confirm the anchored note and spot card, then reenter the stage without losing saved edits. Record all observed results separately from source assumptions.

## Record the result

For every step, record **passed / failed / not attempted**, viewport/browser, project, expected versus observed result, and screenshots or exact errors where permitted. Keep manual chooser limitations, browser permission denials and unavailable physical-device checks distinct from application failures. Do not claim reader-link, sharing, signed mobile release, hardware audio, or physical-phone validation from this checklist.
