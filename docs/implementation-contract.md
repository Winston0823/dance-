# Prototype integration contract

This is the executable prototype boundary, distinct from the longer hosted architecture proposal. Root owns package/scripts/config/native integration. Web agent owns apps/web/**; backend agent apps/server/** and tests/server.test.mjs; core agent packages/core/** and tests/core.test.ts. No agent installs dependencies. Node 24 supports running pure .ts modules without a transpiler; imports use explicit .ts suffixes. No TS enums or parameter properties.

## Domain in packages/core/src/index.ts

```ts
export interface Position {
  x: number;
  y: number;
  offstage?: boolean;
}
export interface Dancer {
  id: string;
  name: string;
  color: string;
  radius: number;
}
export interface Cone {
  id: string;
  label: string;
  x: number;
  y: number;
}
export interface Section {
  id: string;
  title: string;
  startBeat: number;
  endBeat: number;
  color: string;
}
export interface Formation {
  id: string;
  title: string;
  beat: number;
  transitionBeats: number;
  positions: Record<string, Position>;
}
export interface TimedPoint {
  t: number;
  x: number;
  y: number;
}
export interface TimedPath {
  points: TimedPoint[];
  locked: boolean;
}
export interface AudioAsset {
  id: string;
  name: string;
  url: string;
  duration: number;
  peaks: number[];
}
export interface ProjectDocument {
  id: string;
  title: string;
  bpm: number;
  offsetSeconds: number;
  totalBeats: number;
  stage: { width: number; depth: number };
  dancers: Dancer[];
  cones: Cone[];
  sections: Section[];
  formations: Formation[];
  paths: Record<string, Record<string, TimedPath>>; // key is DESTINATION formation ID
  audio?: AudioAsset;
}
export interface MotionWarning {
  id: string;
  type: "clearance" | "speed" | "boundary" | "path";
  beat: number;
  endBeat: number;
  dancerIds: string[];
  message: string;
  severity: "warning" | "error";
}
```

Stage coordinates are meters: x in [-width/2,width/2], y in [0,depth], audience y=0. All temporal data is global musical beats, quantized to quarter-beats by editing controls; never reset time at section boundaries. At bpm120, beat48 =24 seconds =eight-count7 beat1. `offsetSeconds` is audio timestamp at beat0; audioTimestamp=beat*60/bpm+offsetSeconds. `beatToSeconds(doc,beat)` means choreography seconds (=beat*60/bpm), inverse secondsToBeat excludes offset; callers apply offset for audio.

The first formation is at beat0 with transitionBeats0. Each later formation's transition arrives AT its beat, and starts at beat-transitionBeats. Before transition start hold the previous formation. A destination's saved path is normalized t0..1 over its transition. Paths must begin/end at the corresponding positions. Intentional offstage positions are supported by Position.offstage, and should be treated explicitly rather than confused with missing assignments. Keep sections contiguous covering [0,totalBeats], with editable title and boundaries. Moving section boundaries changes grouping/loop ranges only, not formations, paths or audio.

Core exports: types above; `createDemoDocument(id?:string):ProjectDocument`; `ensurePaths(doc):ProjectDocument`; `evaluateDocument(doc,beat):Record<string,Position>`; `analyzeDocument(doc):MotionWarning[]`; `suggestTransition(doc,toFormationId):ProjectDocument`; `validateDocument(doc):string[]`; `formatCount(beat):string`; `beatToSeconds(doc,beat):number`; `secondsToBeat(doc,seconds):number`; `getActiveFormation(doc,beat):Formation`; `getSectionAt(doc,beat):Section`. Nonmutating utilities; UI snapshots safe. Default demo12dancers,12×8m stage,128beats,6formations,sections Intro[0,32] Verse[32,80] Chorus[80,128], no fake audio. Suggestion updates one transition only, preserves locked paths. Saved points evaluated directly for scrubbing, never solver on playback. Synthetic fixtures labeled synthetic. UI/core can extend via additive exports only; notify other agents.

## JSON envelopes and API

`ProjectSummary={id,title,dancerCount,formationCount,updatedAt,publishedRevision:number|null}`.
`ProjectRecord={id,document:ProjectDocument,version:number,publishedRevision:number|null,updatedAt:string,role?:'editor'|'viewer'}`. Viewer records contain only published snapshot, never latest draft. `Note={id,projectId,revision:number|null,beat,dancerId?:string,author,body,createdAt}`.

All JSON errors `{error:string, code?:string, details?:unknown}`. Validate payload limits and references server-side. No fake success. Header `Authorization: Bearer <share/editor token>` takes precedence over cookies, so a share URL behaves as viewer even in an editor browser. Web share token from URL `?share=...`; API requests must pass header. Native explicit login stores returned editor token only within native app secure storage. Development local editor bootstrap must not become anonymous remote admin.

- `GET /api/health` => `{ok:true}`.
- `GET /api/bootstrap` => `{role:'editor'|'viewer'|'guest',projects:ProjectSummary[],accessToken?:string}`. Local loopback dev without OWNER_PASSWORD may issue an HttpOnly editor cookie (and accessToken for native local development); externally bind only if OWNER_PASSWORD set. Viewer token scopes to exactly one published project. Guest projects empty. Seed a demo when empty.
- `POST /api/session` `{password:string}` => `{role:'editor',accessToken:string}` plus HttpOnly cookie. Logout `DELETE /api/session` invalidates token/cookie.
- `GET /api/projects/:id` => ProjectRecord; editor draft, viewer frozen latest published snapshot.
- `POST /api/projects` `{title?:string,blank?:boolean}` => ProjectRecord (blank can seed minimal two-formation doc; default duplicate demo).
- `PUT /api/projects/:id` `{document,expectedVersion:number}` => ProjectRecord. Compare-and-swap;409 includes latest `details.version`. Do not erase local edit on409. Reject document.id mismatch. Call shared structural validator. Auto saves never publish.
- `POST /api/projects/:id/publish` `{expectedVersion:number,reviewedWarnings?:boolean}` => `{revision:number,project:ProjectRecord}`. Freeze snapshot; analyze current paths; require reviewedWarnings true if model clearance/speed advisories. Structural/invalid path/timing/boundary errors block. Return409 if stale. Latest pointer and snapshot commit together.
- `POST /api/projects/:id/share` => `{token:string,path:string}` path `/?share=<token>`; requires existing published snapshot. A token reads future latest published revisions of only this project, never drafts. Explicit UI explains access. `DELETE /api/projects/:id/share` revokes all its reader tokens.
- `GET /api/projects/:id/notes` => `{notes:Note[]}`; editor sees draft+all published notes, viewer published only. `POST .../notes` `{beat,dancerId?,author,body,revision?:number|null}` => Note. Reader can comment on their shared project's published revision; draft editor comments revision null. Clearly label read-link capability author as unverified display name. Body max2000, author max80.
- `PUT /api/projects/:id/ack` `{revision:number,displayName:string}` => `{ok:true}`. Store explicit revision acknowledgment, identity is editor session/share capability plus display name; not verified individual roster tracking. `GET .../ack` => `{acknowledgments:[{revision,displayName,createdAt}]}` editor only. Mention prototype capability identity limitation in README.
- `POST /api/projects/:id/audio?name=<encoded filename>` raw audio binary Content-Type actual; editor only; cap30MB; immutable persisted object, validate signature/type basic MP3/WAV/M4A/Ogg, return `{id,name,url,duration:0,peaks:[]}`. Browser decode supplies measured duration and derived peaks in subsequent document save; server cannot trust these for production but validates bounded metadata. URL `/api/media/:id`. Media GET requires editor or same-project reader authorization and supports range streaming; browser audio web fetches blob via authenticated API client then objectURL. Native audio stream bearer supported. No fake waveform.

Server exports `createApp({dataDir?,ownerPassword?,allowLocalBootstrap?})` => `{server,close}` if useful for tests. Entry `apps/server/index.mjs` listens env HOST default127.0.0.1 PORT default3001. Serve built root dist/web as same origin in production (SPA fallback excludes /api). `APP_ORIGIN` optional dev origin accepted5173 + server origin; enforce Origin/Fetch-Metadata for browser mutations; allow originless native bearer requests. No wildcard CORS. Local development prototype explicitly not production multi-tenant auth.

## Root build shape

Root package.json deps react/react-dom/lucide-react; dev typescript/vite/@vitejs/plugin-react/@types/react/@types/react-dom/@types/node. No server deps. `npm run dev` launches API3001 + Vite5173 proxy /api. `npm run build` tsc web/core then vite build into dist/web. `npm start` API+static on3001. `npm test` Node --test tests/*.test.{mjs,ts}. Root owns test orchestration and README. Native source apps/mobile uses Expo+React Native, separate npm install in that directory; shared core relative import. Native portrait navigation; landscape-only stage editor AND viewer, route orientation requests plus viewport rotate gate, preserve tick/state on transition and restore portrait on exit. Styles can be refined after functioning app.
