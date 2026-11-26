# DanceForm MVP acceptance

## Product promise

A choreographer can place a named cast on a measured stage, refine the routes between formations against counts and music, and publish an unambiguous revision for dancers to practice. Laptop is the primary detailed editor. Mobile supports useful editing, but prioritizes finding your position, understanding neighbors and routes, and communicating rehearsal changes.

The saved choreography is authoritative: forward, backward, preview, reload, and published playback evaluate the same stored paths at the same time. Warnings describe potential issues for rehearsal review; they do not certify safety. No claim of learned choreography generation or data-trained AI belongs in this MVP.

## Minimum surface and hierarchy

**Desktop:** compact header with project/revision, save state, undo/redo, and Publish/Share. A narrow left rail switches between named roster and formation list. The stage is the dominant continuous workspace, with meters, front/audience orientation, optional grid, and labeled cones. A contextual inspector shows only the selected dancer, cone, waypoint, or transition. The bottom timeline owns counts, formations, transitions, playhead, real audio waveform, transport, speed, and loop range. Put less frequent setup in a drawer; avoid simultaneous open panels that crush the stage.

**Mobile:** stage first, compact revision/save indicator and transport, then a count scrubber large enough for touch. A bottom sheet exposes Find me, selected dancer details, neighbors, notes, and edit tools. Stage viewing and scrubbing must work without entering edit mode. Explicit edit mode reduces accidental drags. Cast/stage settings are secondary screens. Publishing requires the same meaningful revision review as desktop.

**Visual direction:** restrained rounded controls, warm or neutral canvas, clear typography, one functional accent, and generous stage space. Distinguish selected, moving, locked, and warning states with shape/text as well as color. A formation editor must read as a stage and time sequence, not an analytics dashboard.

## Required behavior

- Persistent named roster with stable dancer IDs, optional initials/color, reorder, rename, add, remove, and a clear explanation before removal affects formations. Never substitute anonymous dots for a roster.
- Stage dimensions in meters, visible orientation, draggable named cones, zoom/pan, fit stage, coordinate readout, and optional grid snap. Stored positions remain in stage coordinates when the viewport changes.
- Formations have names and explicit count/time anchors. Transitions have duration, persisted dancer paths and draggable waypoints. Locks prevent accidental path/position edits and have an accessible unlock action. Undo/redo covers placement, routes, timing, and notes.
- A deterministic path evaluator drives every preview. Scrubbing backward does not reverse a simulation or generate a fresh route. Endpoints agree exactly with adjacent formations; unresolved path/timing changes cannot be silently hidden.
- A bounded deterministic pathing algorithm suggests editable transition routes under declared duration, travel-speed, stage-boundary, and clearance constraints. Identical inputs and settings produce identical suggestions. Preserve locked approved routes, evaluate conflicts at the same time rather than treating every geometric crossing as a collision, and flag infeasible constraints with the dancers/counts involved. Suggestions require explicit acceptance into saved paths; playback never reroutes dancers.
- Count display supports beats grouped into eights, a declared starting count, and tempo/timing mapping. Music is optional. Show a waveform only after decoding actual imported audio; otherwise show an honest empty/error state and usable count-only editing. State supported file types and handle MIME/decoder failure without losing work.
- Transport includes play/pause, current count/time, previous/next formation, adjustable playback speed, and an editable loop range. Changing speed preserves choreography time and path geometry. Audio and stage use one time source, including after seeking and looping.
- Useful review warnings identify dancers and count windows for close approaches, stage-boundary crossings, or abrupt travel. Explain the threshold and link to the relevant moment. Allow dismissal with a note. Do not imply all risks are detected.
- Dancer practice has Find me, persistent personal selection, highlighted route, stage orientation, and neighboring names at the selected count. Keep other dancers visible enough to understand relationships. Notes anchor to a count or range and optionally a dancer/formation.
- Draft edits remain distinct from the published revision. Publish presents a concrete change summary; only an authorized editor can publish. Dancer viewers see the current published revision, a clear update indicator, and an explicit acknowledgment for that revision. Acknowledgment is not implied by opening the page.
- Sharing must work end to end: a copyable actual link resolves to the correct project/revision and access level. Explain whether access is restricted or link-based before granting it. Provide revoke/access management appropriate to that model; never present a decorative Share button.

## Timeline and input contract

The same horizontal ruler aligns counts, formations, transition spans, notes, and waveform. A visible playhead and numeric count/time remain readable at every zoom. Zoom centers on the playhead or pointer; pan never edits timing. Formation markers select on click/tap; moving or trimming them requires a distinct handle/gesture with a preview of the resulting count and transition duration. Snap to counts is explicit and temporarily bypassable. Avoid a single gesture meaning seek, select, and retime.

On touch, use at least 44 CSS-pixel targets, generous handle hit areas, a draggable scrubber, and explicit controls for precision adjustments. Allow pinch zoom/pan without moving dancers. On keyboard, Tab reaches every action with visible focus; Space toggles playback outside text inputs, arrows step the focused time/position control, Shift enables larger steps, Escape cancels a drag/mode, and conventional undo/redo works. Supply labeled numeric alternatives to all precision dragging, discoverable shortcut help, and accessible names/status messages. Preserve focused selection when panels open. Respect reduced motion; do not rely on animation to convey a revision or error.

## End-to-end acceptance scenarios

1. **First useful project:** create a named project, enter stage dimensions, add six named dancers and two cones, save a formation, reload, and find the same IDs, names, coordinates, orientation, and dimensions.
2. **Roster continuity:** rename/reorder a dancer after several formations exist; every placement and note stays attached to that dancer. Removing a dancer explains affected content and can be undone.
3. **Suggested paths and exact return trip:** request A→B routes twice with identical inputs/settings and verify identical suggestions, with a locked approved route preserved. A same-position/same-time conflict is flagged while a sufficiently separated different-time crossing is allowed; an impossible duration/clearance combination is reported as infeasible. Accept routes, edit a curved waypoint, then scrub A→B→A repeatedly and reload. Intermediate coordinates, locks, and waypoints remain exact, with no rerouting during playback.
4. **Timing edits:** move a formation boundary using a handle and then numeric input. Preview duration changes, prevent zero/negative spans, and undo/redo to recover exact prior timing and paths. Stage endpoints do not jump at the boundary.
5. **Count-only rehearsal:** without music, set tempo and starting count, loop two eights at half speed, seek during playback, and step backward. Count, playhead, and dancer positions stay consistent.
6. **Real audio and failure:** import supported real audio and see a waveform derived from it; seek and loop with synchronized stage playback. Try a mislabeled MIME, corrupt file, and unsupported decoder format: report a useful error, show no fabricated waveform, and preserve project/count editing.
7. **Spatial editing:** zoom/pan and resize the window, then move a dancer with snap and numeric coordinates. Stage-space position remains stable. Fit stage, cone reference, and front orientation remain legible on desktop and mobile.
8. **Review a route issue:** create a close approach and a boundary crossing. Each warning names participants and a count window, seeks to that moment, explains its criterion, and supports a saved dismissal note without making a safety guarantee.
9. **Mobile practice:** open a published link on a narrow touch screen, use Find me, scrub a transition, identify neighbors, and read an anchored note. No horizontal page overflow, accidental dancer movement, or hidden playhead occurs.
10. **Mobile edit and recovery:** an authorized editor enters edit mode, adds a count-anchored note and adjusts a waypoint with a numeric alternative, saves, reloads, and sees the edits in draft. Undo and cancel remain usable with touch and keyboard.
11. **Publish, permissions, acknowledgment:** a viewer cannot mutate or publish through UI or direct requests. An editor reviews and publishes a concrete draft revision. A dancer sees the update, acknowledges that revision explicitly, and a later publish requires a new acknowledgment. Shared links resolve to the intended accessible content; revoked access stops working.
12. **Conflict and persistence:** edit the same revision in two sessions. Saving the stale session cannot silently overwrite newer work: show the conflict and preserve the local changes for comparison/recovery. Simulate save/network failure and reload; distinguish saved versus unsaved content, offer recovery where supported, and never claim a failed save or publish succeeded.

## Deliberate scope cuts

Defer learned motion generation, automatic choreography creation, complex whole-show global optimization, 3D bodies, video pose tracking, lighting/costume production, ticketing, social feeds, advanced music editing, and simultaneous collaborative canvas editing. Bounded deterministic transition suggestions remain in MVP. Use explicit conflict handling for concurrent saves. Admin assistance may later summarize notes or draft reminders, but no nonfunctional AI button is required to ship. Do not replace actual persistence, permissions, publishing, or sharing with a polished mock flow.

## Visual review before shipping

- At laptop size, stage and timeline dominate; repeated cards, metrics, gradients, and decorative sidebars do not compete with rehearsal work.
- Test a dense cast at overview and zoomed scales. Markers remain distinguishable, labels do not become a cloud, selection stays obvious, and label collision handling preserves access to every name.
- Show dancer names/initials at useful sizes, with full names on selection. Verify text contrast, keyboard focus, 200% browser zoom, touch targets, and non-color state cues.
- Test long names, many formations, narrow mobile landscape/portrait, empty project, failed audio, offline save, stale revision, and loading states. No clipped controls or misleading success indicators.
- Ensure active count, playback state, selected dancer, draft/published status, and save state can each be understood at a glance without opening a card.
- Review all three concepts against these same tasks before selecting one; visual polish does not compensate for hidden paths, unreadable labels, or ambiguous revision state.
