# DanceForm visual concepts

23 November 2026. These are the original generated design previews, not screenshots. A working local prototype now exists in apps/web, apps/server, and apps/mobile; see the root README for current behavior. DanceForm is a working product name. The portrait-stage sketches were superseded by the requested landscape-only editor/viewer. No model has been trained on recorded dancers and no public deployment is claimed.

## Current direction — 24 November

The implemented direction now combines a light purple stage workspace with Tempo’s dark timeline, bright purple actions, vivid dancer colors, and rounded controls. Rehearsal markers and the app identity use traffic cones. The [cone identity studies](cone-identity-studies.png) explore motion, formation and wayfinding marks; their [exact generation prompt](cone-identity-prompt.txt) is preserved. These are identity studies, not screenshots or final production logos. The app currently uses code-native cone icons and striped stage markers.

Smooth/Straight is an explicit route choice. Source waypoints remain editable, and the same canonical curve samples drive stage drawing, playback and conflict review. Mobile navigation is portrait; both editing and viewing the stage require landscape. The web inspector is available in a landscape Tools drawer, and the separate React Native client has its own lighter editing controls.

## Three directions

1. **Studio** — warm white, pale sage stage, forest teal controls. Recommended starting point: quiet enough for dense formations, approachable on a phone, and a strong selected-dancer accent without making every dancer compete for attention.
2. **Tempo** — cool white, lavender selection, dark timeline. Stronger production-editor character; the dark timeline separates time editing from the stage. Keep contrast comfortable and reserve violet for active controls.
3. **Rehearsal** — warm ivory, navy type, coral accents. The warmest direction, with prominent personal cues and notes. Coral must remain selective so warnings and selection do not look identical.

All three show the same product architecture: dominant measured stage, contextual dancer/path inspector, full multitrack timeline, and companion mobile practice screen. Generated names, rulers, placements, and text illustrate hierarchy; implementation must use real project data and tested time conversions. The twelve-dancer example is a design fixture, not movement research.

## Root design decisions

- Make the stage and timeline the workspace. Avoid a dashboard of disconnected cards, analytics, decorative waveforms, and chat panels.
- On a laptop, use a compact header, a collapsible roster/formation rail, one contextual inspector, and a resizable bottom timeline. On narrower screens, put the inspector in a sheet so the stage retains useful space.
- On mobile, default to Practice, with Notes and explicit Edit modes. Preserve other dancers and stage landmarks around the selected dancer. Editing is available, including numeric position/waypoint adjustments, without overloading the viewing state.
- A screen should immediately answer: which dancer, which count, what is changing, and whether this is a draft or a published revision. Do not bury these in menus.
- Keep one accent for selection/action; use muted secondary dancer colors only when useful. Selection, locks, and warnings also need outlines/icons/text. Use rounded corners and spacious controls without making all content a pill.
- Label audience orientation and retain it consistently across stage, mobile, spot cards, and exports. If mirroring is offered, label the mode persistently rather than silently swapping stage left/right.

## Timeline contract

The musical tick is the source of truth, not animation frames. Align music waveform, formation holds, transition spans, path vertices, comments, and warnings on one ruler. The implementation must derive waveforms from uploaded audio and show a count-only empty state otherwise.

Seek on the ruler; select clips in lanes; retime using distinct handles. Never overload a tap with both seeking and destructive retiming. Keep the current count/time visible while zooming or panning. Provide beat snap, an editable loop, speed, previous/next formation, keyboard stepping, and numeric timing alternatives. Mobile has a compact view of the same data with touch-sized handles and an expandable detail view.

Scrubbing evaluates the saved path directly at the requested tick. Forward/backward, playback speed, loops, reloads, and mobile views all use the same evaluator. A solver suggestion is a separate explicit edit; playback never invokes it. A rejected suggestion cannot change accepted geometry.

## Backend pilot and release scope

See [backend-pilot.md](../backend-pilot.md) for the proposed managed Postgres/Auth/storage architecture, deterministic planner, permissions, immutable revisions, and concurrency model. See [mvp-acceptance.md](../mvp-acceptance.md) for the end-to-end checks required before calling the app shippable. These specifications are proposed work, not passed checks.

First vertical slice: create roster and stage, author two formations, suggest/edit/save a timed transition, scrub it consistently, publish, and open the exact saved plan as a dancer on a phone. Then complete audio, count-linked notes, revision acknowledgments, and recovery/permission checks. Use an explicitly synthetic benchmark initially; real movement calibration is a separate evidenced milestone.

## Generation record

Generated using the built-in `image_gen` tool. The full, exact prompt set is in [image-prompts.json](image-prompts.json). Previews are saved alongside this file as `01-studio.png`, `02-tempo.png`, and `03-rehearsal.png`. They are reference material for implementation, not UI assets to embed in the app.
