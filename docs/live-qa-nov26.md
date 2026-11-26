# Live QA — 26 November 2026

Completed in the user-authorized follow-up chat using CUA and the connected Chrome extension at `http://127.0.0.1:3001/`. The prior chat's saved denial did not recur. Production assets were rebuilt and reloaded; final JS asset: `index-BoPGZXtz.js`. Desktop used the browser's normal viewport. Mobile-web viewports: 390 × 844, 820 × 1180, 844 × 390, 932 × 430; short-height check: 844 × 300. These are browser viewport checks, not native hardware tests.

Edits were confined to **Rehearsal sandbox** and the newly created **Nov26 QA audio and editing** project. The original Synthetic rehearsal demo was not edited. QA projects and imported assets remain saved locally. No publication, reader-link creation or sharing changes were performed.

## Selected-time editing

The final web behavior needs no Edit formation switch or manual key-creation step. Pause at any count and drag a dancer or type X/Y. The first edit atomically creates a timed route anchor during travel, or a formation key during a hold. New hold keys visibly snap to quarter beats and use up to eight beats of available travel. Existing keys update in place. One drag is one Undo step; numeric field focus/blur groups typing. Actual approved-route locks still refuse affected edits, with an explanation. Missing keys do not appear locked.

| Check | Result and observed evidence |
| --- | --- |
| Unkeyed hold drag, save, Undo/Redo, reload | **Passed.** At beat 4.25, Maya moved to X −3.5 / Y 2.5. New formation travel was 4.25 beats. One Undo removed both key and move; Redo and reload restored them at the same count. |
| Unkeyed travel drag and reload | **Passed.** At beat 10.25, Maya moved to X −2 / Y 3; an interior timed anchor was created, Smooth remained selected, and reload retained those coordinates at beat 10.25. |
| Numeric edit without a key | **Passed.** Snap-off hold seeking followed by X input created a valid quarter-beat key at 6.5 with 2.25-beat travel and successful save. At 932 × 430 Tools, numeric X −2.75 at travel beat 8.25 created an anchor and survived reload. At 844 × 390, numeric editing at beat 24 created an eight-beat hold transition and saved. |
| Mobile-web direct drag | **Passed.** At 932 × 430 and unkeyed beat 8.5, direct Maya drag produced X −2 / Y 3. Switching to sandbox, back to QA, reloading, and seeking beat 8.5 retained X −2 / Y 3. Final-build numeric edit/Undo also restored that saved position. |
| Approved locks | **Passed.** Locking the route disabled numeric edits at both an existing anchor and an unkeyed travel count. Mode/waypoint controls disabled. Attempted arrival retime refused with “Unlock this formation’s approved routes before changing its timing.” Explicit unlock restored editing. |
| Other dancers, timing, paths and sections | **Automated.** Nine new helper regressions cover selected endpoint repair, exact travel-anchor time, fractional hold snapping, available-gap duration, locks, unchanged other saved routes and evaluated positions, offstage metadata, no-op and invalid-input rejection. This is broader than the visually observed single-dancer walkthrough. |

A first live implementation exposed movement with zero transition time after a hold-key edit; the server visibly rejected that draft. Undo restored the saved draft. The final automatic edit helper gives movement real available travel; the final hold/travel cases above saved and reloaded successfully. No failed draft was counted as a successful save.

## Audio

Fixture: local synthetic `artifacts/generated-count-test.wav`, eight seconds. QA project: 120 BPM / 128 beats. No user recording was used.

| Check | Result and observed evidence |
| --- | --- |
| Real chooser → browser decoder → upload → waveform | **Passed.** Supported chooser `setFiles` selected the actual WAV; filename appeared, native HTML audio duration was 8 seconds, readyState reached 4, and a nonempty decoded waveform appeared. |
| Save/reload and replacement | **Passed.** Filename/waveform and eight-second playable asset survived reload and project switching. Valid replacement completed and saved. |
| Invalid replacement | **Passed.** Actual text fixture `artifacts/invalid-audio-qa.wav` produced “Music could not be imported: Unable to decode audio data.” Existing eight-second asset and choreography remained available. |
| Remove music / Undo | **Passed.** Remove music exposed Add music and allowed count-only Play/Pause. Undo restored the real asset and waveform. |
| Offset placement | **Passed.** At the measured desktop scale, waveform width stayed 253.375 px (16 beats): offset 0 left 0; −2 seconds left +63.3438 px (beats 4–20); +2 seconds left −63.3438 px (beats −4–12). Positive offset was read back as 2 after reload. Negative offset remained saved through project switching. |
| Pointer/keyboard seek | **Passed.** Waveform-point click sought beat 8; empty lane click sought beat 44. Home then Shift+Right sought beat 8; Enter retained beat 8 rather than jumping to zero. Timeline keyboard seeks agreed with stage position fields. |
| Playback / short-track end | **Passed for browser state.** Play advanced media time; after the eight-second clip ended, counts continued (observed beat 31.5 with media ended at 8 seconds). Back-seeking reset media time and resumed its appropriate playback/preroll state. |
| Offset loops / speeds | **Passed for browser state.** +2-second offset loop 8–20 crossed clip EOF and restarted; −2-second loop 0–8 included paused media at time zero during preroll; −2-second loop 20–28 continued counts with media paused at EOF. 0.5×, 0.75× and 1× were exercised with seeking/loop playback; active music reported the selected playback rate. Play from the routine end restarted near zero. |
| Chooser cancellation | **Not completed.** The chooser API rejects an empty file list (“fileChooser.setFiles requires at least one file”); it exposes no cancel method. This is a chooser-automation limitation, not an application import failure. No manual cancellation was performed. |
| Cancel import | **Not completed live.** The fixture imported before the control was reachable. Abort/stale-import regressions pass; these do not establish live cancellation. |
| Speaker output, drift, hardware routing | **Not verified.** Media state/clock observations do not establish human-audible quality, acoustic alignment, Bluetooth, interruptions or background behavior. |

Captured console entries included Grammarly extension stylesheet failures and one asynchronous message-channel closure; no clean-console claim is made. No source was changed to suppress third-party extension messages.

## Mobile-web layout and timeline

| Check | Result and observed evidence |
| --- | --- |
| Phone/tablet portrait | **Passed.** Home, Notes and Projects reachable at 390 × 844 and 820 × 1180. Stage entry showed the rotate gate. Home spot card showed dancer, count, coordinates, next formation and neighbor distances. |
| Anchored note | **Passed.** “Nov26 QA: verify selected-count autosave at beat 16.” saved under Nov26 QA at beat 16 and remained after reload. |
| Landscape Tools, both sizes | **Passed.** 844 × 390 and 932 × 430 used mobile Tools; document scrollWidth equaled viewport width. Opening focused Close tools; Escape restored focus to Tools. Numeric edits and route controls were reachable by drawer scrolling. |
| Expanded drawer clearance | **Passed.** At 844 × 390 drawer bottom/timeline top were both 210 px; at 932 × 430 both were 250 px. More exposed zoom/fit/pan/music while transport remained reachable. Current browser screenshots were captured inline during this run; no screenshot files were exported. |
| Smooth/Straight and locks | **Passed.** Added and numerically moved a bend, switched modes, observed saved route controls/curve, locked controls, explicitly unlocked, then switched back to Smooth. |
| Whole-strip timing gestures | **Passed at 932 × 430.** Wide V body drag moved arrival 16 → 19.75; one Undo restored 16. Transition body drag changed travel 8 → 5 with arrival 16; one Undo restored 8. These exact gestures were not repeated at 844 × 390. |
| Loop handles and section focus | **Passed at 932 × 430.** In handle 0 → 4, out handle 32 → 40.25; numeric fields agreed. Intro focused beat zero and set loop 0–32. |
| Zoom, pan and Fit | **Passed.** Zoom exposed Pan timeline. Pointer panning changed scroll position. A stale controlled pan value was fixed by updating state in its change handler; final-build keyboard Right changed pan by a quarter beat and moved the timeline. Fit returned zoom 1 and pan zero. |
| Short-height edge | **Inspected, partial.** At 844 × 300 the drawer retained a 96-pixel scroll region above the expanded timeline. Full touch/keyboard reachability at that height was not exhaustively walked. |
| Full device/combination matrix | **Pending.** Not every speed/offset/loop/viewport combination, mobile OS keyboard, touch gesture or audio failure/retry race was fault-injected. No physical phone was available. |

## Final executable validation

- **72/72 focused tests passed:** existing 63 plus nine `auto-position` regressions.
- `npm.cmd run build` passed (final JS `index-BoPGZXtz.js`).
- `npm.cmd --prefix apps/mobile run typecheck` passed. No native code changed in this live follow-up; prior Android/iOS Hermes export evidence remains historical.
- Unrelated API/share suites were not rerun. No installed/signed native app, live multiuser coediting or deployment is claimed.
