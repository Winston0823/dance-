# DanceForm

A working choreography-planning prototype with a React laptop editor, a real persistent Node/SQLite backend, and an Expo React Native companion app. The visual style is intentionally ready for another design pass.

## Run the web prototype

Requires **Node.js 24 or later**. Run these commands in this folder:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Open **http://127.0.0.1:3001**. On the local computer, development mode signs you into the owner workspace automatically. The initial project is clearly labeled synthetic; it uses twelve fictional dancers. Your actual edits are stored in `.data/danceform.sqlite`, with immutable uploaded audio files in `.data/media`. Restarting or rebuilding does not reset your projects. Back up the whole `.data` folder while the server is stopped.

For hot-reloading development instead, run `npm.cmd run dev` and open http://127.0.0.1:5173. This starts the same backend on port 3001 plus Vite on port 5173.

## What works

- Named roster, measured 2D stage, reference cones, zoom/pan, grid snap, and undo/redo. Pause at any count and drag a dancer or type X/Y; the web editor automatically creates or updates the appropriate position key and autosaves it. Approved-route locks remain enforced.
- A continuous timeline organized into **titled choreography sections** spanning all tracks. Sections contain multiple formations and transitions; their boundaries do not reset musical time or silently retime choreography.
- Precise seeking/scrubbing, zoom, section focus/loop, loop handles, formation timing controls, transition durations, playback speed, and musical eight-count labels.
- Saved, editable smooth or straight paths with timed waypoints, approved-route locks, deterministic transition suggestions, and time-aware clearance/speed/boundary review. Drawing, playback, scrubbing, and conflict checks use the same sampled route geometry.
- Route lines are direct editing targets: click to select, drag to bend, or double-click to insert a timed waypoint. Formation strips drag to retime; transition strips drag to resize travel. Each gesture is one undo step. The opening formation shows its next transition rather than an empty incoming route.
- Real audio import, decoding and derived waveform, music/count alignment through an offset, and count-only rehearsal when no music is attached. Audio is private to its project and published revision.
- Cancellable audio import with stereo peak measurement, failed/superseded import protection, loading/retry feedback, and undoable music removal. Import pipeline tests use decoder/upload adapters; live browser import and playback-state evidence is recorded separately from pending speaker/device checks.
- SQLite autosave, stale-version conflict detection, web recovery copies, immutable published revisions, actual read-only practice links, and link revocation.
- Count-linked rehearsal notes, personal dancer focus and neighbor distances, explicit revision acknowledgments, and notices when a newer published revision is available.
- Mobile web portrait navigation with personal spot cards and a landscape gate for the editor/viewer. The landscape Tools drawer exposes the editor inspector, alongside a separate native app described below.
- A dark timeline, purple actions, vivid dancer colors, and draggable, keyboard-accessible rehearsal cones.

The laptop editor is the complete authoring surface. Native mobile editing includes roster changes, numeric dancer positioning, timed route waypoints, smooth/straight paths, locks, suggestions, formation and section timing, cones, undo, publication, and notes. Audio import remains on the laptop.

## Native mobile (React Native + Expo)

```powershell
cd apps/mobile
npm.cmd ci
npm.cmd start
```

Use a compatible Expo Go client or an Expo development build. The native app requests **portrait for home/projects/notes**, **landscape for both stage editing and viewing**, and restores portrait when leaving. A viewport-based rotate prompt keeps stage tools out of portrait when the OS declines an orientation request. State lives above these screens, so turning the device does not reset the playhead or edits.

The connection screen accepts either your server address plus owner password, or a published rehearsal link. The app uses the same backend, project model, count conversion, saved paths and evaluator as the web app. Credentials are stored with Expo SecureStore.

For a physical phone on your local network, stop the loopback server and start it with a password:

```powershell
$env:HOST = "0.0.0.0"
$env:OWNER_PASSWORD = "choose-a-long-private-password"
npm.cmd start
```

Enter `http://YOUR_COMPUTER_LAN_IP:3001` on the phone; both devices must be on the same network. Allow the local firewall connection if required. `localhost` on a physical phone points to the phone, not your laptop. Android emulator's default address is `http://10.0.2.2:3001`; iOS simulator defaults to `http://localhost:3001`. A link copied from a laptop using 127.0.0.1 must use the LAN address before another device can reach it. Never expose a passwordless development server; the entry point refuses non-loopback binding without an owner password. Use HTTPS for an internet deployment. Cleartext local-network transport is enabled for this development prototype.

## Planning algorithm and dataset

This is an implemented **deterministic geometric planner**, not a model trained on recorded dancers. It preserves dancer identities, formation endpoints, timing and locked paths. It compares candidate direct, timed-wait and detour routes in straight and smooth modes, then reports remaining conflicts rather than claiming every transition is feasible. Smooth routes use timed cubic tangents through editable anchors; stationary waits remain stationary. The same saved path is evaluated for forward/backward scrubbing, loops and device playback. Playback never asks the planner for a new route.

Continuous closest-approach checks consider relative motion over every overlapping segment of the canonical route polyline, including crossings that occur between animation frames. Curves use adaptive sampling with a one-centimeter target and a bounded subdivision budget; the sampled route is the actual movement model. Dancers are approximated as discs; model limits do not capture articulated choreography, acceleration, individual skill, or actual rehearsal behavior. A reviewed clearance/speed advisory can be published explicitly; structural errors and unintended boundary crossings block publication.

[The synthetic dataset](datasets/README.md) contains 35 reproducible, labeled transition cases across 2, 4, 8, 12 and 24 dancers, with actual saved route coordinates. It is explicitly synthetic and suitable for software evaluation, not evidence of human movement. Generate it with `npm.cmd run dataset:generate`. The research candidates AIOZ-GDANCE and AIST++ have not been downloaded, redistributed or used for training. A later recorded-rehearsal study can calibrate the planner against consented observations.

## Validation

```powershell
npm.cmd test
npm.cmd run build
npm.cmd --prefix apps/mobile run typecheck
npm.cmd --prefix apps/mobile run export:android
npm.cmd --prefix apps/mobile run export:ios
```

Core tests cover exact repeat/reverse playback, smooth-curve geometry and waits, timed crossings, endpoints, locks, deterministic suggestions, bounds, malformed inputs, time conversion, native-runtime portability and dataset regeneration. Timeline/native helper tests cover timing constraints, locked edits, and serialized async work. API tests cover persistence/restart, concurrent saves, frozen publication, capability permissions/revocation, comments/acknowledgments, real media/ranges/ownership, invalid uploads, CSRF, Host headers and external-binding refusal. See [live QA results](docs/live-qa-nov26.md), [verification notes](docs/verification.md) for measured results and actual browser checks, the [web control audit](docs/web-control-audit.md) and [native audit](docs/native-control-audit.md) for remaining manual checks, and [the prototype comparison](docs/prototype-comparison.md) for scope decisions.

## Prototype boundaries and deployment

This is a real local single-owner prototype, **not a deployed multi-tenant service**. Practice links are reader capabilities: anyone holding one can view the latest published plan, post under an explicitly unverified display name, and acknowledge. Acknowledgment is not proof that a particular roster member has read the plan. Production would need individual accounts/roles, stronger session management, HTTPS, rate limiting, backups/restore operations and operational monitoring. No simultaneous live coediting, push notifications, offline edit synchronization, or historical-revision viewer is implemented. Older-revision notes remain labeled and do not silently seek into a newer plan.

The native app has been type-checked and bundled; actual phone orientation, audio interruption/Bluetooth behavior, touch interaction and installable iOS/Android release builds still need device validation. No App Store/Play Store deployment is claimed.

For a container host, the included Dockerfile builds the web app and runs the same Node backend. Supply `OWNER_PASSWORD`, mount persistent storage at `/data`, and put HTTPS in front. `APP_ORIGIN` can declare the exact trusted web origin. The container configuration is supplied but has not been run here.

```powershell
docker build -t danceform .
docker run --rm -p 3001:3001 -e OWNER_PASSWORD -v danceform-data:/data danceform
```

## Source map

| Location                | Purpose                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | React + TypeScript laptop/mobile-web editor                                                                               |
| `apps/mobile`           | Expo + React Native companion                                                                                             |
| `apps/server`           | Node HTTP API, SQLite, auth, revisions and audio                                                                          |
| `packages/core`         | Portable project types, timing, deterministic routes and validation                                                       |
| `datasets`              | Explicitly synthetic benchmark corpus                                                                                     |
| `docs/backend-pilot.md` | Longer-term hosted backend design, distinct from this implementation                                                      |
| `docs/design`           | Original imagegen previews and exact prompts; mobile portrait-stage sketches were superseded by the landscape requirement |

The initial visual previews were generated with the built-in image_gen tool. They are design references; the app UI is implemented in code and does not embed screenshot mockups.
