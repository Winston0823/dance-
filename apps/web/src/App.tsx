import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleHelp,
  TrafficCone,
  Copy,
  Grid2X2,
  Home,
  LayoutList,
  LockKeyhole,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  UnlockKeyhole,
  Users,
  X,
} from "lucide-react";
import {
  createDemoDocument,
  ensurePaths,
  evaluateDocument,
  analyzeDocument,
  suggestTransition,
  formatCount,
  getActiveFormation,
  getPathSamples,
  type ProjectDocument,
} from "../../../packages/core/src/index.ts";
import Stage from "./Stage";
import { getPositionEditAvailability, movePositionAtTime } from "./auto-position.ts";
import Timeline from "./Timeline";
import { getAudioUploadMime, importAudioFile } from "./audio-import.ts";
import { retimeFormation, resizeTransition } from "./timeline-edit.ts";
import {
  insertRouteWaypoint,
  moveRouteWaypoint,
} from "../../../packages/core/src/route-edit.ts";
import { DANCER_PALETTE } from "../../../packages/core/src/palette.ts";
type RecordData = {
  id: string;
  document: ProjectDocument;
  version: number;
  publishedRevision: number | null;
  role?: string;
};
type Summary = {
  id: string;
  title: string;
  dancerCount: number;
  formationCount: number;
  publishedRevision: number | null;
};
type Note = {
  id: string;
  beat: number;
  body: string;
  author: string;
  revision: number | null;
  dancerId?: string;
};
const token = new URLSearchParams(location.search).get("share");
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
) {
  const raw = body instanceof File;
  const r = await fetch("/api" + path, {
    method,
    headers: {
      ...(body
        ? {
            "Content-Type": raw
              ? getAudioUploadMime(body as File)
              : "application/json",
          }
        : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? (raw ? (body as File) : JSON.stringify(body)) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: r.status,
    });
  return data;
}
const uid = () => crypto.randomUUID();
export default function App() {
  const [doc, setDoc] = useState<ProjectDocument>(() => createDemoDocument());
  const docRef = useRef(doc);
  docRef.current = doc;
  const version = useRef(0);
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState("guest");
  const [projects, setProjects] = useState<Summary[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<number | null>(null);
  const [panel, setPanel] = useState("roster");
  const [mobileTools, setMobileTools] = useState(false);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const loadSequence = useRef(0);
  const modalRef = useRef<HTMLElement>(null);
  const [route, setRoute] = useState("home");
  const [selected, setSelected] = useState<string | null>(null);
  const [beat, setBeat] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [snap, setSnap] = useState(true);
  const [paths, setPaths] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loop, setLoop] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(32);
  const [modal, setModal] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState("");
  const noteInFlight = useRef(false);
  const [newDancerName, setNewDancerName] = useState("");
  const [pendingDancerRemoval, setPendingDancerRemoval] = useState<
    string | null
  >(null);
  const [author, setAuthor] = useState(
    localStorage.getItem("danceform-name") || "",
  );
  const audioKey = doc.audio
    ? `${doc.id}:${doc.audio.id}:${doc.audio.url}`
    : "";
  const [audioSource, setAudioSource] = useState({
    key: "",
    url: "",
    error: "",
  });
  const audioUrl = audioSource.key === audioKey ? audioSource.url : "";
  const audioError = audioSource.key === audioKey ? audioSource.error : "";
  const [audioRetry, setAudioRetry] = useState(0);
  const [importing, setImporting] = useState(false);
  const importSerial = useRef(0);
  const importController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const audio = useRef<HTMLAudioElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const history = useRef<ProjectDocument[]>([]);
  const future = useRef<ProjectDocument[]>([]);
  const dirty = useRef(false);
  const gesture = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const saveInFlight = useRef<Promise<void> | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const roleRef = useRef(role);
  roleRef.current = role;
  const gestureSnapshot = useRef<ProjectDocument | null>(null);
  const beginEdit = () => {
    if (!gesture.current) {
      gesture.current = true;
      gestureSnapshot.current = docRef.current;
    }
  };
  const endEdit = () => {
    gesture.current = false;
    gestureSnapshot.current = null;
  };
  const [ack, setAck] = useState(false);
  const [updatedRevision, setUpdatedRevision] = useState<number | null>(null);
  const audioSeekSerial = useRef(0);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const seek = (next: number) => {
    if (!Number.isFinite(next)) return;
    const value = Math.max(0, Math.min(docRef.current.totalBeats, next));
    setBeat(value);
    beatRef.current = value;
    audioSeekSerial.current++;
    const el = audio.current;
    if (el && audioUrl && el.readyState >= 1) {
      el.currentTime = Math.max(
        0,
        (value * 60) / docRef.current.bpm + docRef.current.offsetSeconds,
      );
    }
  };
  const playbackRef = useRef({ playing, loop, loopStart, loopEnd });
  playbackRef.current = { playing, loop, loopStart, loopEnd };
  const togglePlayback = () => {
    const state = playbackRef.current;
    if (!state.playing && docRef.current.audio && !audioUrl) {
      setError(
        audioError || "Music is still loading. Try Play when it is ready.",
      );
      return;
    }
    if (
      !state.playing &&
      (beatRef.current >= docRef.current.totalBeats ||
        (state.loop &&
          (beatRef.current < state.loopStart ||
            beatRef.current >= state.loopEnd)))
    )
      seek(state.loop ? state.loopStart : 0);
    setPlaying(!state.playing);
  };
  const practice = role === "viewer";
  const active =
    doc.formations.find(
      (f, i) => i > 0 && beat >= f.beat - f.transitionBeats && beat < f.beat,
    ) || getActiveFormation(doc, beat);
  const current = active;
  const positions = evaluateDocument(doc, beat);
  const warnings = useMemo(() => analyzeDocument(doc), [doc]);
  const dancer = doc.dancers.find((d) => d.id === selected);
  const routeFormation =
    current?.id === doc.formations[0]?.id ? doc.formations[1] : current;
  const routeGeometry = useMemo(
    () =>
      Object.fromEntries(
        doc.dancers.map((d) => {
          const path = doc.paths[routeFormation?.id]?.[d.id];
          const convert = (p: { x: number; y: number }) => ({
            x: p.x + doc.stage.width / 2,
            y: doc.stage.depth - p.y,
          });
          return [
            d.id,
            path
              ? {
                  path: getPathSamples(path).map(convert),
                  waypoints: path.points.map(convert),
                }
              : {},
          ];
        }),
      ),
    [doc, routeFormation?.id],
  );
  const routeTargetRef = useRef<string | undefined>(routeFormation?.id);
  routeTargetRef.current = routeFormation?.id;
  const path =
    routeFormation && selected
      ? doc.paths[routeFormation.id]?.[selected]
      : undefined;
  const positionLocked = (id: string) => getPositionEditAvailability(doc, beat, id).locked;
  const canPosition = (id: string) => !practice && !playing && getPositionEditAvailability(doc, beat, id).canEdit;
  const updatePosition = (id: string, point: {x: number; y: number}) => {
    if (practice || playbackRef.current.playing) return;
    const result = movePositionAtTime(docRef.current, beatRef.current, id, point, uid());
    if (result.error) setError(result.error);
    else if (result.document !== docRef.current) {
      change(result.document);
      if (result.beat !== beatRef.current) seek(result.beat);
    }
  };
  const load = async (id: string): Promise<boolean> => {
    if (dirty.current) {
      await save();
      if (dirty.current) {
        setError(
          "Your local changes are not saved. Resolve the save issue before switching projects.",
        );
        return false;
      }
    }
    const sequence = ++loadSequence.current;
    importController.current?.abort();
    setImporting(false);
    const beforeLoad = docRef.current;
    try {
      const r: RecordData = await api("/projects/" + id);
      if (sequence !== loadSequence.current) return false;
      if (docRef.current !== beforeLoad || dirty.current) {
        setError(
          "Your choreography changed while this project was loading. Finish saving, then open the project again.",
        );
        return false;
      }
      version.current = r.version;
      setDoc(r.document);
      docRef.current = r.document;
      setRevision(r.publishedRevision);
      setSelected(
        r.document.dancers.find(
          (d) => d.id === localStorage.getItem("danceform-dancer-" + id),
        )?.id ||
          r.document.dancers[0]?.id ||
          null,
      );
      setBeat(0);
      setPlaying(false);
      setLoop(false);
      setLoopStart(0);
      setLoopEnd(Math.min(32, r.document.totalBeats));
      setNote("");
      setNotes([]);
      setMobileTools(false);
      setStatus("All changes saved");
      setLoaded(true);
      loadedRef.current = true;
      endEdit();
      if (timer.current) clearTimeout(timer.current);
      dirty.current = false;
      history.current = [];
      future.current = [];
      const fetchedNotes = (await api("/projects/" + id + "/notes")).notes;
      if (sequence !== loadSequence.current) return false;
      if (docRef.current.id === id) setNotes(fetchedNotes);
      setAck(false);
      setUpdatedRevision(null);
      if (!token && localStorage.getItem("danceform-recovery-" + id))
        setModal("recovery");
      return true;
    } catch (e) {
      if (sequence === loadSequence.current) setError((e as Error).message);
      return false;
    }
  };
  useEffect(() => {
    api("/bootstrap")
      .then((b) => {
        setRole(b.role);
        roleRef.current = b.role;
        setProjects(b.projects);
        if (b.projects[0]) void load(b.projects[0].id);
        else {
          setStatus("Sign in to your studio");
          setModal("login");
        }
      })
      .catch((e) => {
        setError(e.message);
        setStatus("Could not connect");
      });
  }, []);
  const save = async () => {
    if (saveInFlight.current) {
      await saveInFlight.current;
      return;
    }
    if (!dirty.current || roleRef.current === "viewer" || !loadedRef.current)
      return;
    const snapshot = docRef.current;
    saving.current = true;
    setStatus("Saving…");
    const request = (async () => {
      try {
        const r: RecordData = await api("/projects/" + snapshot.id, "PUT", {
          document: snapshot,
          expectedVersion: version.current,
        });
        if (docRef.current.id !== snapshot.id) return;
        version.current = r.version;
        dirty.current = docRef.current !== snapshot;
        setStatus(dirty.current ? "Unsaved changes" : "All changes saved");
        if (!dirty.current)
          localStorage.removeItem("danceform-recovery-" + snapshot.id);
        else
          localStorage.setItem(
            "danceform-recovery-" + snapshot.id,
            JSON.stringify(docRef.current),
          );
      } catch (e) {
        if (docRef.current.id !== snapshot.id) return;
        setStatus(
          (e as { status?: number }).status === 409
            ? "Conflict · local work kept"
            : "Save failed · local work kept",
        );
        setError((e as Error).message);
        localStorage.setItem(
          "danceform-recovery-" + snapshot.id,
          JSON.stringify(docRef.current),
        );
      } finally {
        saving.current = false;
        if (dirty.current && docRef.current !== snapshot)
          timer.current = setTimeout(() => void saveRef.current(), 800);
      }
    })();
    saveInFlight.current = request;
    try {
      await request;
    } finally {
      if (saveInFlight.current === request) saveInFlight.current = null;
    }
  };
  saveRef.current = save;
  const change = (next: ProjectDocument, remember = true) => {
    if (
      roleRef.current === "viewer" ||
      !loadedRef.current ||
      next === docRef.current
    )
      return;
    if (remember && gesture.current && gestureSnapshot.current) {
      history.current.push(gestureSnapshot.current);
      gestureSnapshot.current = null;
      future.current = [];
    }
    if (remember && !gesture.current) {
      history.current.push(docRef.current);
      if (history.current.length > 80) history.current.shift();
      future.current = [];
    }
    setDoc(next);
    docRef.current = next;
    dirty.current = true;
    setStatus("Unsaved changes");
    localStorage.setItem("danceform-recovery-" + next.id, JSON.stringify(next));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(), 700);
  };
  const undo = () => {
    const prev = history.current.pop();
    if (prev) {
      future.current.push(docRef.current);
      change(prev, false);
    }
  };
  const redo = () => {
    const next = future.current.pop();
    if (next) {
      history.current.push(docRef.current);
      change(next, false);
    }
  };
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal("");
        setMobileTools(false);
        return;
      }
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      if (
        e.code === "Space" &&
        !(e.target as HTMLElement).closest("button,a,[role=button]")
      ) {
        e.preventDefault();
        togglePlayback();
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        seek(
          beatRef.current +
            (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 8 : 0.25),
        );
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setModal("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doc.totalBeats, audioUrl, audioError, loaded, practice]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      importController.current?.abort();
    };
  }, []);
  useEffect(() => {
    const portrait = window.matchMedia(
      "(max-width: 1100px) and (orientation: portrait)",
    );
    const pauseForRotation = () => {
      if (portrait.matches) {
        setPlaying(false);
        setMobileTools(false);
      }
    };
    pauseForRotation();
    portrait.addEventListener("change", pauseForRotation);
    return () => portrait.removeEventListener("change", pauseForRotation);
  }, []);
  useEffect(() => {
    if (!mobileTools) return;
    const trigger = toolsButton.current;
    const frame = requestAnimationFrame(() => {
      inspector.current
        ?.querySelector<HTMLButtonElement>(".mobile-inspector-close")
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (
        (inspector.current?.contains(document.activeElement) ||
          document.activeElement === document.body) &&
        trigger?.isConnected &&
        trigger.getClientRects().length
      )
        trigger.focus({ preventScroll: true });
    };
  }, [mobileTools]);
  useEffect(() => {
    if (!playing) {
      audio.current?.pause();
      return;
    }
    let last = performance.now();
    let frame: number;
    const el = audio.current;
    let audioStarted = false;
    let audioFinished = false;
    let disposed = false;
    let playAttempt = 0;
    let seenSeek = audioSeekSerial.current;
    const startAudio = (at: number) => {
      if (!el || !audioUrl) return;
      const attempt = ++playAttempt;
      const requestedSeek = audioSeekSerial.current;
      audioStarted = true;
      const failed = () => {
        if (
          disposed ||
          attempt !== playAttempt ||
          requestedSeek !== audioSeekSerial.current
        )
          return;
        audioStarted = false;
        setPlaying(false);
        setError("Music playback was blocked. Press Play to try again.");
      };
      try {
        el.currentTime = Math.max(0, at);
        el.playbackRate = speed;
        void el.play().catch(failed);
      } catch {
        failed();
      }
    };
    const initial = (beatRef.current * 60) / doc.bpm + doc.offsetSeconds;
    if (
      audioUrl &&
      initial >= 0 &&
      (!doc.audio?.duration || initial < doc.audio.duration)
    )
      startAudio(initial);
    else if (doc.audio?.duration && initial >= doc.audio.duration)
      audioFinished = true;
    const tick = (now: number) => {
      const delta = ((((now - last) / 1000) * doc.bpm) / 60) * speed;
      last = now;
      if (seenSeek !== audioSeekSerial.current) {
        seenSeek = audioSeekSerial.current;
        const at = (beatRef.current * 60) / doc.bpm + doc.offsetSeconds;
        playAttempt++;
        audioStarted = false;
        audioFinished = !!doc.audio?.duration && at >= doc.audio.duration;
        if (at < 0 || audioFinished) el?.pause();
        else if (audioUrl) startAudio(at);
      }
      if (audioStarted && el?.ended) {
        audioStarted = false;
        audioFinished = true;
      }
      let next =
        audioStarted && el
          ? ((el.currentTime - doc.offsetSeconds) * doc.bpm) / 60
          : beatRef.current + delta;
      if (
        !audioStarted &&
        !audioFinished &&
        audioUrl &&
        (next * 60) / doc.bpm + doc.offsetSeconds >= 0
      )
        startAudio((next * 60) / doc.bpm + doc.offsetSeconds);
      if (loop && next >= loopEnd) {
        next = loopStart + ((next - loopStart) % (loopEnd - loopStart));
        const at = (next * 60) / doc.bpm + doc.offsetSeconds;
        playAttempt++;
        audioStarted = false;
        audioFinished = !!doc.audio?.duration && at >= doc.audio.duration;
        if (el && audioUrl) {
          if (at < 0 || audioFinished) {
            el.pause();
            el.currentTime = Math.max(0, at);
          } else startAudio(at);
        }
      }
      if (next >= doc.totalBeats) {
        setPlaying(false);
        next = Math.min(next, doc.totalBeats);
      }
      beatRef.current = next;
      setBeat(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      playAttempt++;
      cancelAnimationFrame(frame);
      el?.pause();
    };
  }, [
    playing,
    speed,
    loop,
    loopStart,
    loopEnd,
    doc.bpm,
    doc.totalBeats,
    doc.offsetSeconds,
    audioUrl,
  ]);
  useEffect(() => {
    if (!doc.audio) {
      setAudioSource({ key: "", url: "", error: "" });
      return;
    }
    setPlaying(false);
    setAudioSource({ key: audioKey, url: "", error: "" });
    let objectUrl = "";
    const controller = new AbortController();
    fetch(doc.audio.url, {
      signal: controller.signal,
      headers: token ? { Authorization: "Bearer " + token } : {},
    })
      .then((r) => {
        if (!r.ok) throw Error("Music could not be loaded");
        return r.blob();
      })
      .then((b) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(b);
        setAudioSource({ key: audioKey, url: objectUrl, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted && e.name !== "AbortError")
          setAudioSource({ key: audioKey, url: "", error: e.message });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioKey, audioRetry]);
  useEffect(() => {
    if (!practice || !loaded) return;
    let cancelled = false;
    const interval = setInterval(() => {
      void api("/projects/" + doc.id)
        .then((r: RecordData) => {
          if (!cancelled && r.publishedRevision !== revision)
            setUpdatedRevision(r.publishedRevision);
        })
        .catch(() => {});
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [practice, loaded, doc.id, revision]);
  const selectFormation = (_id: string) => {
    setPlaying(false);
  };
  const editFormation = (update: (d: ProjectDocument) => void) => {
    const n = structuredClone(docRef.current);
    update(n);
    change(ensurePaths(n));
  };
  const moveDancer = (id: string, p: { x: number; y: number }) => {
    updatePosition(id, {
      x: p.x - docRef.current.stage.width / 2,
      y: docRef.current.stage.depth - p.y,
    });
  };
  const hasLocks = (id: string | undefined) =>
    !!id && Object.values(docRef.current.paths[id] || {}).some((p) => p.locked);
  const addFormation = (sourceId?: string) => {
    if (docRef.current.formations.length >= 500) {
      setError("This project supports at most 500 formations.");
      return;
    }
    const n = structuredClone(docRef.current);
    const source = n.formations.find((f) => f.id === sourceId);
    let at = source
      ? Math.min(
          n.totalBeats,
          source.beat +
            Math.min(
              8,
              ((n.formations.find((f) => f.beat > source.beat)?.beat ??
                n.totalBeats + 0.25) -
                source.beat) /
                2,
            ),
        )
      : Math.round(beat * 4) / 4;
    at = Math.round(at * 4) / 4;
    const prev = [...n.formations].reverse().find((f) => f.beat < at);
    const next = n.formations.find((f) => f.beat > at);
    if (!prev || n.formations.some((f) => f.beat === at)) {
      setError("Choose an empty count after the first formation.");
      return;
    }
    if (hasLocks(next?.id)) {
      setError(
        "Unlock the next formation’s approved routes before inserting a formation.",
      );
      return;
    }
    const id = uid();
    n.formations.push({
      id,
      title: source ? source.title + " copy" : "New formation",
      beat: at,
      transitionBeats: Math.min(8, at - prev.beat),
      positions: source
        ? structuredClone(source.positions)
        : evaluateDocument(n, at),
    });
    n.formations.sort((a, b) => a.beat - b.beat);
    if (next)
      next.transitionBeats = Math.min(next.transitionBeats, next.beat - at);
    change(ensurePaths(n));
    seek(at);
  };
  const deleteFormation = () => {
    if (!current || current.id === doc.formations[0].id) return;
    const index = doc.formations.findIndex((f) => f.id === current.id);
    const next = doc.formations[index + 1];
    if (hasLocks(current.id) || hasLocks(next?.id)) {
      setError(
        "Unlock this formation and the next formation’s approved routes before deleting.",
      );
      return;
    }
    const n = structuredClone(doc);
    n.formations = n.formations.filter((f) => f.id !== current.id);
    delete n.paths[current.id];
    change(ensurePaths(n));
    seek(n.formations[index - 1].beat);
  };
  const moveTiming = (id: string, value: number) => {
    const result = retimeFormation(docRef.current, id, value);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.document === docRef.current) return;
    change(result.document);
    seek(result.document.formations.find((f) => f.id === id)!.beat);
    setPlaying(false);
  };
  const changeTransition = (id: string, duration: number) => {
    const result = resizeTransition(docRef.current, id, duration);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.document === docRef.current) return;
    change(result.document);
    setPlaying(false);
    seek(result.document.formations.find((f) => f.id === id)!.beat);
  };
  const focusRoute = (dancerId: string) => {
    const target = docRef.current.formations.find(
      (f) => f.id === routeTargetRef.current,
    );
    if (!target) return;
    setSelected(dancerId);
    setPlaying(false);
    seek(target.beat);
  };
  const insertRoute = (
    id: string,
    p: { x: number; y: number },
  ): number | null => {
    const n = docRef.current,
      target = routeTargetRef.current;
    if (roleRef.current === "viewer" || !target) return null;
    const result = insertRouteWaypoint(n, target, id, {
      x: p.x - n.stage.width / 2,
      y: n.stage.depth - p.y,
    });
    if (!result) {
      setError(
        n.paths[target]?.[id]?.locked
          ? "Unlock the approved route before bending it."
          : "This route cannot accept another bend. Use Add waypoint for a stationary route.",
      );
      return null;
    }
    change(result.document);
    focusRoute(id);
    return result.index;
  };
  const moveWaypoint = (
    id: string,
    index: number,
    p: { x: number; y: number },
  ) => {
    const n = docRef.current,
      target = routeTargetRef.current;
    if (roleRef.current === "viewer" || !target) return;
    const next = moveRouteWaypoint(n, target, id, index, {
      x: p.x - n.stage.width / 2,
      y: n.stage.depth - p.y,
    });
    if (next === n) return;
    change(next);
    focusRoute(id);
  };
  const addWaypoint = () => {
    if (!selected || !path || path.locked || path.points.length >= 64) return;
    const n = structuredClone(doc);
    const points = n.paths[routeFormation!.id][selected].points;
    let index = 0;
    for (let i = 1; i < points.length - 1; i++)
      if (points[i + 1].t - points[i].t > points[index + 1].t - points[index].t)
        index = i;
    const a = points[index],
      b = points[index + 1];
    points.splice(index + 1, 0, {
      t: (a.t + b.t) / 2,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });
    change(n);
    focusRoute(selected);
  };
  const addDancer = () => {
    const name = newDancerName.trim();
    if (!name || name.length > 200 || docRef.current.dancers.length >= 100)
      return;
    const id = uid();
    editFormation((n) => {
      n.dancers.push({
        id,
        name,
        color: DANCER_PALETTE[n.dancers.length % DANCER_PALETTE.length],
        radius: 0.25,
      });
      n.formations.forEach(
        (f) => (f.positions[id] = { x: 0, y: Math.min(1, n.stage.depth / 2) }),
      );
    });
    setSelected(id);
    setModal("");
  };
  const removeDancer = () => {
    const id = pendingDancerRemoval;
    if (!id || docRef.current.dancers.length <= 1) return;
    editFormation((n) => {
      n.dancers = n.dancers.filter((d) => d.id !== id);
      n.formations.forEach((f) => delete f.positions[id]);
      Object.values(n.paths).forEach((paths) => delete paths[id]);
    });
    setSelected(docRef.current.dancers[0]?.id || null);
    setPendingDancerRemoval(null);
    setModal("");
  };
  const setPathMode = (mode: "linear" | "smooth") => {
    const target = routeTargetRef.current,
      n = docRef.current;
    if (!target || !selected) return;
    const route = n.paths[target]?.[selected];
    if (!route || route.locked || (route.interpolation || "linear") === mode)
      return;
    const next = structuredClone(n);
    next.paths[target][selected].interpolation = mode;
    change(next);
  };
  const createProject = async () => {
    try {
      await save();
      if (dirty.current)
        throw Error(
          "Save or recover your local changes before creating another project.",
        );
      const r = await api("/projects", "POST", {
        title: "Untitled choreography",
        blank: true,
      });
      setProjects((ps) => [
        ...ps,
        {
          id: r.id,
          title: r.document.title,
          dancerCount: r.document.dancers.length,
          formationCount: r.document.formations.length,
          publishedRevision: null,
        },
      ]);
      await load(r.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const goRoute = (next: string) => {
    setPlaying(false);
    setMobileTools(false);
    setRoute(next);
  };
  const upload = async (f: File) => {
    if (!loadedRef.current || roleRef.current === "viewer") return;
    const projectId = docRef.current.id;
    const sequence = loadSequence.current;
    const serial = ++importSerial.current;
    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    const isCurrent = () =>
      mounted.current &&
      !controller.signal.aborted &&
      serial === importSerial.current &&
      projectId === docRef.current.id &&
      sequence === loadSequence.current;
    setImporting(true);
    setPlaying(false);
    setError("");
    try {
      const result = await importAudioFile(f, {
        isCurrent,
        signal: controller.signal,
        uploadFile: (original, signal) =>
          api(
            "/projects/" +
              projectId +
              "/audio?name=" +
              encodeURIComponent(original.name),
            "POST",
            original,
            signal,
          ),
      });
      if (result.status !== "imported" || !isCurrent()) return;
      change({
        ...docRef.current,
        audio: result.asset,
      });
    } catch (e) {
      if (isCurrent())
        setError("Music could not be imported: " + (e as Error).message);
    } finally {
      if (mounted.current && serial === importSerial.current)
        setImporting(false);
    }
  };
  const publish = async () => {
    if (importing) {
      setError("Wait for the music import to finish before publishing.");
      return;
    }
    const projectId = docRef.current.id;
    const sequence = loadSequence.current;
    await save();
    if (docRef.current.id !== projectId || sequence !== loadSequence.current)
      return;
    if (dirty.current) {
      setError("Save your latest changes before publishing.");
      return;
    }
    try {
      const r = await api("/projects/" + projectId + "/publish", "POST", {
        expectedVersion: version.current,
        reviewedWarnings: true,
      });
      if (docRef.current.id !== projectId || sequence !== loadSequence.current)
        return;
      setRevision(r.revision);
      version.current = Math.max(version.current, r.project.version);
      setModal("published");
    } catch (e) {
      if (docRef.current.id === projectId && sequence === loadSequence.current)
        setError((e as Error).message);
    }
  };
  const share = async () => {
    const projectId = docRef.current.id;
    const sequence = loadSequence.current;
    try {
      const r = await api("/projects/" + projectId + "/share", "POST");
      if (docRef.current.id !== projectId || sequence !== loadSequence.current)
        return;
      setShareUrl(location.origin + r.path);
      setModal("share");
    } catch (e) {
      if (docRef.current.id === projectId && sequence === loadSequence.current)
        setError((e as Error).message);
    }
  };
  const addNote = async () => {
    if (!note.trim() || !author.trim() || noteInFlight.current) return;
    const projectId = docRef.current.id;
    const sequence = loadSequence.current;
    const submittedNote = note;
    noteInFlight.current = true;
    try {
      localStorage.setItem("danceform-name", author);
      const n = await api("/projects/" + projectId + "/notes", "POST", {
        beat: Math.round(beat * 4) / 4,
        dancerId: selected || undefined,
        author,
        body: note,
        revision: practice ? revision : null,
      });
      if (docRef.current.id !== projectId || sequence !== loadSequence.current)
        return;
      setNotes((ns) => [...ns, n]);
      setNote((current) => (current === submittedNote ? "" : current));
    } catch (e) {
      if (docRef.current.id === projectId && sequence === loadSequence.current)
        setError((e as Error).message);
    } finally {
      noteInFlight.current = false;
    }
  };
  useEffect(() => {
    if (selected && loaded)
      localStorage.setItem("danceform-dancer-" + doc.id, selected);
  }, [selected, loaded, doc.id]);
  useEffect(() => {
    if (!modal || !modalRef.current) return;
    setPlaying(false);
    const prior = document.activeElement as HTMLElement | null;
    const el = modalRef.current;
    const targets = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        ),
      );
    (
      el.querySelector<HTMLElement>("[data-autofocus]") || targets()[0]
    )?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const list = targets(),
        first = list[0],
        last = list.at(-1);
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", trap);
    return () => {
      el.removeEventListener("keydown", trap);
      prior?.focus();
    };
  }, [modal]);
  useEffect(() => {
    setProjects((list) =>
      list.map((p) =>
        p.id === doc.id
          ? {
              ...p,
              title: doc.title,
              dancerCount: doc.dancers.length,
              formationCount: doc.formations.length,
              publishedRevision: revision,
            }
          : p,
      ),
    );
  }, [doc.id, doc.title, doc.dancers.length, doc.formations.length, revision]);
  const enterStage = () => {
    setRoute("stage");
    setPanel("roster");
  };
  return (
    <div className={"app route-" + route + (practice ? " practice" : "")}>
      <audio
        ref={audio}
        src={audioUrl || undefined}
        preload="auto"
        onLoadedMetadata={() => seek(beatRef.current)}
        onError={() => {
          if (!audioUrl) return;
          setPlaying(false);
          setAudioSource({
            key: audioKey,
            url: "",
            error:
              "This browser could not play the imported audio. Retry or replace the music.",
          });
        }}
      />
      <input
        ref={file}
        hidden
        type="file"
        accept=".mp3,.wav,.m4a,.mp4,.ogg,.oga,.opus,audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/x-m4a"
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <header className="app-header">
        <a className="brand" href="/" aria-label="DanceForm home">
          <TrafficCone className="brand-cone" size={30} strokeWidth={1.8} />
          <b>
            danceform<span>STUDIO</span>
          </b>
        </a>
        <div className="project-heading">
          <button
            className="project-title"
            onClick={() => !practice && setModal("settings")}
          >
            {doc.title}
            <ChevronDown size={15} />
          </button>
          <span data-testid="save-status" className="save-status">
            <i className={status === "All changes saved" ? "saved" : ""} />
            {practice ? "Published revision " + revision : status}
          </span>
        </div>
        <div className="header-actions">
          <button
            aria-label="Undo"
            title="Undo (Ctrl Z)"
            disabled={!history.current.length || practice}
            onClick={undo}
          >
            <RotateCcw size={17} />
          </button>
          <button
            aria-label="Redo"
            title="Redo (Ctrl Shift Z)"
            disabled={!future.current.length || practice}
            onClick={redo}
          >
            <RotateCw size={17} />
          </button>
          <span className="header-divider" />
          {practice ? (
            <button className="primary" onClick={() => setModal("ack")}>
              {ack ? <Check size={15} /> : null}
              {ack ? "Revision acknowledged" : "Acknowledge revision"}
            </button>
          ) : (
            <>
              <button className="outline" onClick={() => setModal("publish")}>
                Publish{revision ? " · r" + revision : ""}
              </button>
              <button className="primary" onClick={share}>
                <Share2 size={15} /> Share
              </button>
            </>
          )}
        </div>
      </header>
      {importing && (
        <div className="update-banner" role="status">
          <span>Importing music…</span>
          <button
            onClick={() => {
              importController.current?.abort();
              importSerial.current++;
              setImporting(false);
            }}
          >
            Cancel import
          </button>
        </div>
      )}
      {doc.audio && !audioUrl && (
        <div className="update-banner" role="status">
          <span>
            {audioError ? "Music unavailable: " + audioError : "Loading music…"}
          </span>
          {audioError && (
            <button
              onClick={() => {
                setError("");
                setAudioRetry((n) => n + 1);
              }}
            >
              Retry music
            </button>
          )}
        </div>
      )}
      {updatedRevision && (
        <div className="update-banner">
          <span>Revision {updatedRevision} is ready for practice.</span>
          <button onClick={() => void load(doc.id)}>
            Load latest revision
          </button>
        </div>
      )}
      {status.startsWith("Conflict") && (
        <div className="update-banner">
          <span>A newer draft exists. Your local work is preserved.</span>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(doc, null, 2)], {
                type: "application/json",
              });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "danceform-local-recovery.json";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download local copy
          </button>
          <button
            onClick={() => {
              dirty.current = false;
              void load(doc.id);
            }}
          >
            Load server draft
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={15} />
          </button>
        </div>
      )}
      <div className="mobile-home">
        <div className="mobile-page-title">
          <span className="eyebrow">YOUR REHEARSAL, IN SYNC</span>
          <h1>
            {route === "notes"
              ? "Rehearsal notes"
              : route === "projects"
                ? "Your projects"
                : "Good things take practice."}
          </h1>
          <p>
            {practice
              ? "Your place. Your path. Your next eight."
              : "Make space for your next idea."}
          </p>
        </div>
        {route === "notes" ? (
          <div className="mobile-notes">
            <div className="note-composer">
              <label>
                AT GLOBAL BEAT
                <input
                  aria-label="Mobile note beat"
                  type="number"
                  min="0"
                  max={doc.totalBeats}
                  step=".25"
                  value={Math.round(beat * 4) / 4}
                  onChange={(e) => seek(Math.round(+e.target.value * 4) / 4)}
                />
              </label>
              <input
                aria-label="Your display name"
                placeholder="Your display name"
                value={author}
                maxLength={80}
                onChange={(e) => setAuthor(e.target.value)}
              />
              <textarea
                aria-label="Rehearsal note"
                placeholder="Leave a rehearsal note…"
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                className="primary"
                disabled={!note.trim() || !author.trim()}
                onClick={addNote}
              >
                Add at {formatCount(beat)}
              </button>
            </div>
            {notes.map((n) => (
              <article key={n.id}>
                <small>
                  {formatCount(n.beat)} · {n.author}
                  {n.revision !== null && n.revision !== revision
                    ? " · Earlier revision r" + n.revision
                    : ""}
                </small>
                <p>{n.body}</p>
              </article>
            ))}
          </div>
        ) : (
          <>
            <button className="mobile-project-card" onClick={enterStage}>
              <div className="mini-stage">
                {doc.dancers.map((d, i) => (
                  <i
                    key={d.id}
                    style={{
                      left: 15 + (i % 4) * 22 + "%",
                      top: 20 + Math.floor(i / 4) * 26 + "%",
                    }}
                  />
                ))}
              </div>
              <span className="eyebrow">
                {practice ? "PUBLISHED CHOREOGRAPHY" : "CONTINUE CREATING"}
              </span>
              <h2>{doc.title}</h2>
              <p>
                {doc.dancers.length} dancers · {doc.formations.length}{" "}
                formations
              </p>
              <span className="primary">
                {practice ? "Open practice" : "Open studio"} →
              </span>
            </button>
            <div className="mobile-home-actions">
              {!practice && (
                <>
                  <button
                    className="outline"
                    onClick={() => setModal("settings")}
                  >
                    <Settings2 size={15} />
                    Project settings
                  </button>
                  <button className="outline" onClick={createProject}>
                    <Plus size={15} />
                    New project
                  </button>
                </>
              )}
            </div>
            {dancer && (
              <section className="spot-card">
                <div className="panel-heading">
                  <h2>Your spot</h2>
                  <span>{formatCount(beat)}</span>
                </div>
                <select
                  aria-label="Choose your dancer"
                  value={selected || ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {doc.dancers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p>
                  <strong>{positions[dancer.id].x.toFixed(1)} m</strong> from
                  center ·{" "}
                  <strong>{positions[dancer.id].y.toFixed(1)} m</strong> from
                  audience edge
                </p>
                <p>
                  Next:{" "}
                  {doc.formations.find((f) => f.beat > beat)?.title ||
                    "End of choreography"}{" "}
                  {doc.formations.find((f) => f.beat > beat)
                    ? "· " +
                      formatCount(
                        doc.formations.find((f) => f.beat > beat)!.beat,
                      )
                    : ""}
                </p>
                <div className="spot-neighbors">
                  {doc.dancers
                    .filter((d) => d.id !== dancer.id)
                    .sort(
                      (a, b) =>
                        Math.hypot(
                          positions[a.id].x - positions[dancer.id].x,
                          positions[a.id].y - positions[dancer.id].y,
                        ) -
                        Math.hypot(
                          positions[b.id].x - positions[dancer.id].x,
                          positions[b.id].y - positions[dancer.id].y,
                        ),
                    )
                    .slice(0, 2)
                    .map((d) => (
                      <span key={d.id}>
                        {d.name} ·{" "}
                        {Math.hypot(
                          positions[d.id].x - positions[dancer.id].x,
                          positions[d.id].y - positions[dancer.id].y,
                        ).toFixed(1)}{" "}
                        m
                      </span>
                    ))}
                </div>
              </section>
            )}
            {route === "projects" &&
              projects
                .filter((p) => p.id !== doc.id)
                .map((p) => (
                  <button
                    className="project-list-item"
                    key={p.id}
                    onClick={() =>
                      void load(p.id).then((ok) => {
                        if (ok) enterStage();
                      })
                    }
                  >
                    {p.title}
                    <span>{p.dancerCount} dancers</span>
                  </button>
                ))}
          </>
        )}
      </div>
      <div className="editor-shell">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={panel === "roster" ? "active" : ""}
              onClick={() => setPanel("roster")}
              title="Dancers"
            >
              <Users size={19} />
            </button>
            <button
              className={panel === "formations" ? "active" : ""}
              onClick={() => setPanel("formations")}
              title="Formations"
            >
              <LayoutList size={19} />
            </button>
            <button
              className={panel === "notes" ? "active" : ""}
              onClick={() => setPanel("notes")}
              title="Notes"
            >
              <MessageSquare size={19} />
            </button>
            <button
              className={panel === "cones" ? "active" : ""}
              onClick={() => setPanel("cones")}
              title="Reference cones"
              aria-label="Reference cones"
            >
              <TrafficCone size={19} />
            </button>
            <button
              className={panel === "projects" ? "active" : ""}
              onClick={() => setPanel("projects")}
              title="Projects"
            >
              <Grid2X2 size={19} />
            </button>
          </div>
          <div className="sidebar-content">
            <div className="panel-heading">
              <h2>
                {panel === "roster"
                  ? "Dancers"
                  : panel === "formations"
                    ? "Formations"
                    : panel === "notes"
                      ? "Rehearsal notes"
                      : panel === "cones"
                        ? "Reference cones"
                        : "Projects"}
              </h2>
              <span>
                {panel === "roster"
                  ? doc.dancers.length
                  : panel === "formations"
                    ? doc.formations.length
                    : ""}
              </span>
            </div>
            {panel === "roster" && (
              <>
                <p className="panel-description">
                  {practice
                    ? "Find yourself in the formation."
                    : "A place for everyone."}
                </p>
                {practice && (
                  <select
                    className="find-me"
                    aria-label="Find me"
                    value={selected || ""}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Find me…</option>
                    {doc.dancers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="roster-list">
                  {doc.dancers.map((d, i) => (
                    <button
                      key={d.id}
                      className={
                        "roster-row " + (d.id === selected ? "selected" : "")
                      }
                      onClick={() => setSelected(d.id)}
                    >
                      <span
                        className="avatar"
                        style={{
                          background: DANCER_PALETTE[i % DANCER_PALETTE.length],
                        }}
                      >
                        {d.name.slice(0, 1)}
                      </span>
                      <span>
                        {d.name}
                        <small>{String(i + 1).padStart(2, "0")}</small>
                      </span>
                      {d.id === selected ? (
                        <span className="selected-indicator" />
                      ) : null}
                    </button>
                  ))}
                </div>
                {!practice && (
                  <button
                    className="add-row"
                    disabled={doc.dancers.length >= 100}
                    onClick={() => {
                      setNewDancerName("");
                      setModal("add-dancer");
                    }}
                  >
                    <Plus size={15} /> Add dancer
                  </button>
                )}
              </>
            )}
            {panel === "cones" && (
              <>
                <p className="panel-description">
                  Shared stage reference marks.
                </p>
                {doc.cones.map((c) => (
                  <div className="cone-editor" key={c.id}>
                    <div className="cone-editor-title">
                      <TrafficCone size={17} />
                      <input
                        aria-label="Reference cone label"
                        disabled={practice}
                        maxLength={200}
                        value={c.label}
                        onChange={(e) => {
                          const n = structuredClone(docRef.current);
                          n.cones.find((q) => q.id === c.id)!.label =
                            e.target.value;
                          change(n);
                        }}
                      />
                    </div>
                    <div className="coordinate-fields">
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis}>
                          {axis.toUpperCase()} (m)
                          <input
                            aria-label={c.label + " " + axis}
                            type="number"
                            step=".25"
                            disabled={practice}
                            value={c[axis]}
                            onChange={(e) => {
                              const n = structuredClone(docRef.current),
                                value = +e.target.value;
                              if (!Number.isFinite(value)) return;
                              n.cones.find((q) => q.id === c.id)![axis] =
                                axis === "x"
                                  ? Math.max(
                                      -n.stage.width / 2,
                                      Math.min(n.stage.width / 2, value),
                                    )
                                  : Math.max(0, Math.min(n.stage.depth, value));
                              change(n);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    {!practice && (
                      <button
                        className="danger-link"
                        onClick={() =>
                          change({
                            ...doc,
                            cones: doc.cones.filter((q) => q.id !== c.id),
                          })
                        }
                      >
                        <Trash2 size={12} />
                        Remove mark
                      </button>
                    )}
                  </div>
                ))}
                {!practice && (
                  <button
                    className="add-row"
                    disabled={doc.cones.length >= 100}
                    onClick={() =>
                      change({
                        ...doc,
                        cones: [
                          ...doc.cones,
                          { id: uid(), label: "Reference cone", x: 0, y: 1 },
                        ],
                      })
                    }
                  >
                    <TrafficCone size={16} />
                    Add cone
                  </button>
                )}
              </>
            )}
            {panel === "formations" && (
              <>
                {doc.formations.map((f, i) => (
                  <button
                    key={f.id}
                    className={
                      "formation-row " +
                      (f.id === current?.id ? "selected" : "")
                    }
                    onClick={() => {
                      selectFormation(f.id);
                      seek(f.beat);
                    }}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <b>
                      {f.title}
                      <small>{formatCount(f.beat)}</small>
                    </b>
                  </button>
                ))}
                {!practice && (
                  <button className="add-row" onClick={() => addFormation()}>
                    <Plus size={15} /> Add at playhead
                  </button>
                )}
              </>
            )}
            {panel === "notes" && (
              <>
                <p className="panel-description">Every note has its moment.</p>
                {notes.map((n) => (
                  <button
                    className="note-card"
                    key={n.id}
                    aria-disabled={
                      n.revision !== null &&
                      (!practice || n.revision !== revision)
                    }
                    onClick={() => {
                      if (
                        n.revision !== null &&
                        (!practice || n.revision !== revision)
                      ) {
                        setError(
                          "This note belongs to published revision r" +
                            n.revision +
                            ". Its beat is not mapped onto this draft or a different published revision.",
                        );
                        return;
                      }
                      seek(n.beat);
                    }}
                  >
                    <small>
                      {formatCount(n.beat)} ·{" "}
                      {n.revision ? "r" + n.revision : "Draft"}
                      {n.revision !== null && n.revision !== revision
                        ? " · Earlier revision"
                        : ""}
                    </small>
                    <p>{n.body}</p>
                    <span>
                      {n.author} <small>· display name</small>
                    </span>
                  </button>
                ))}
                <div className="note-composer">
                  <label>At {formatCount(beat)}</label>
                  <input
                    placeholder="Your display name"
                    value={author}
                    maxLength={80}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                  <textarea
                    placeholder="Leave a rehearsal note…"
                    maxLength={2000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={!note.trim() || !author.trim()}
                    onClick={addNote}
                  >
                    Add note
                  </button>
                </div>
              </>
            )}
            {panel === "projects" && (
              <>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className="project-list-item"
                    onClick={() => void load(p.id)}
                  >
                    {p.title}
                    <small>
                      {p.dancerCount} dancers · {p.formationCount} formations
                    </small>
                  </button>
                ))}
                {!practice && (
                  <button className="add-row" onClick={createProject}>
                    <Plus size={15} /> New project
                  </button>
                )}
              </>
            )}
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setModal("help")}>
              <CircleHelp size={16} /> A little guidance
            </button>
            <span>Made for the work between the counts.</span>
          </div>
        </aside>
        <main className="workspace">
          <div className="workspace-toolbar">
            <div>
              <button
                className="mobile-back"
                aria-label="Back home"
                onClick={() => goRoute("home")}
              >
                <ArrowLeft size={18} />
              </button>
              <span className="eyebrow">
                {practice ? "FOLLOW YOUR PART" : "FORMATION"}
              </span>
              <h1>
                {current?.title || "Stage"} <span>{formatCount(beat)}</span>
              </h1>
            </div>
            <div className="stage-controls">
              <button
                ref={toolsButton}
                className="mobile-tools-button outline"
                aria-controls="selection-tools"
                aria-expanded={mobileTools}
                onClick={() => setMobileTools(!mobileTools)}
              >
                <Settings2 size={14} />
                Tools
              </button>
              <button
                className={paths ? "active" : ""}
                aria-pressed={paths}
                onClick={() => setPaths(!paths)}
              >
                Routes
              </button>
              <button
                className={snap ? "active" : ""}
                aria-pressed={snap}
                onClick={() => setSnap(!snap)}
              >
                Snap
              </button>
              {!practice && <span className="hint">Edits save automatically</span>}
            </div>
          </div>
          <Stage
            onEditStart={beginEdit}
            onEditEnd={endEdit}
            width={doc.stage.width}
            height={doc.stage.depth}
            dancers={doc.dancers.map((d, index) => ({
              ...d,
              color: DANCER_PALETTE[index % DANCER_PALETTE.length],
              routeLocked: !!doc.paths[routeFormation?.id]?.[d.id]?.locked,
              position: {
                x: (positions[d.id]?.x || 0) + doc.stage.width / 2,
                y: doc.stage.depth - (positions[d.id]?.y || 0),
              },
              locked: positionLocked(d.id),
              positionUnavailable: !canPosition(d.id),
              ...routeGeometry[d.id],
            }))}
            cones={doc.cones.map((c) => ({
              ...c,
              name: c.label,
              x: c.x + doc.stage.width / 2,
              y: doc.stage.depth - c.y,
            }))}
            selected={selected}
            editing={!playing && !practice}
            onSelect={setSelected}
            onMove={moveDancer}
            onConeMove={(id, p) =>
              editFormation((n) => {
                const c = n.cones.find((c) => c.id === id)!;
                c.x = p.x - n.stage.width / 2;
                c.y = n.stage.depth - p.y;
              })
            }
            onRouteInsert={insertRoute}
            onRouteLocked={() =>
              setError(
                "This route is locked. Select its dancer, then use Unlock approved route in the inspector.",
              )
            }
            onWaypoint={moveWaypoint}
            snap={snap}
            showPaths={paths}
            practice={practice}
          />
          <Timeline
            count={beat}
            total={doc.totalBeats}
            playing={playing}
            speed={speed}
            bpm={doc.bpm}
            formations={doc.formations.map((f) => ({
              id: f.id,
              name: f.title,
              count: f.beat,
              transitionBeats: f.transitionBeats,
            }))}
            sections={doc.sections.map((s) => ({
              id: s.id,
              name: s.title,
              start: s.startBeat,
              end: s.endBeat,
            }))}
            selected={current?.id || ""}
            onSelect={selectFormation}
            onSeek={(n) => {
              seek(snap ? Math.round(n * 4) / 4 : n);
            }}
            onPlay={togglePlayback}
            onSpeed={setSpeed}
            onAdd={() => addFormation()}
            zoom={zoom}
            onZoom={setZoom}
            loop={loop}
            onLoop={() => setLoop(!loop)}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onLoopRange={(a, b) => {
              a = Math.round(a * 4) / 4;
              b = Math.round(b * 4) / 4;
              if (
                Number.isFinite(a) &&
                Number.isFinite(b) &&
                a >= 0 &&
                b > a &&
                b <= doc.totalBeats
              ) {
                setLoopStart(a);
                setLoopEnd(b);
              }
            }}
            waveform={doc.audio?.peaks || []}
            audioDuration={doc.audio?.duration || 0}
            audioOffsetSeconds={doc.offsetSeconds}
            onAudio={() => !practice && file.current?.click()}
            audioName={doc.audio?.name}
            practice={practice}
            onTiming={moveTiming}
            onTransition={changeTransition}
            onEditStart={beginEdit}
            onEditEnd={endEdit}
            notes={notes
              .filter((n) =>
                practice ? n.revision === revision : n.revision === null,
              )
              .map((n) => ({ id: n.id, beat: n.beat, label: n.body }))}
            warnings={warnings.map((w) => ({
              id: w.id,
              beat: w.beat,
              label: w.message,
            }))}
          />
        </main>
        <aside
          ref={inspector}
          id="selection-tools"
          className={"inspector" + (mobileTools ? " mobile-open" : "")}
        >
          <div className="panel-heading">
            <h2>{practice ? "Your part" : "Selection"}</h2>
            <button
              className="mobile-inspector-close"
              aria-label="Close tools"
              onClick={() => setMobileTools(false)}
            >
              <X size={18} />
            </button>
          </div>
          {dancer ? (
            <>
              <div className="selection-heading">
                <span
                  className="large-avatar"
                  style={{
                    background:
                      DANCER_PALETTE[
                        doc.dancers.indexOf(dancer) % DANCER_PALETTE.length
                      ],
                  }}
                >
                  {dancer.name[0]}
                </span>
                <h2>
                  {dancer.name}
                  <small>
                    {practice
                      ? "Follow your route"
                      : "Dancer · " +
                        String(doc.dancers.indexOf(dancer) + 1).padStart(
                          2,
                          "0",
                        )}
                  </small>
                </h2>
              </div>
              {!practice && (
                <label className="field-label">
                  NAME
                  <input
                    maxLength={200}
                    required
                    value={dancer.name}
                    onChange={(e) =>
                      editFormation((n) => {
                        n.dancers.find((d) => d.id === selected)!.name =
                          e.target.value;
                      })
                    }
                  />
                </label>
              )}
              <div className="inspector-section">
                <h3>
                  Position <span>meters</span>
                </h3>
                <div className="coordinate-fields">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      {axis.toUpperCase()}
                      <input
                        aria-label={axis + " position in meters"}
                        type="number"
                        step=".25"
                        disabled={
                          !canPosition(selected!)
                        }
                        value={Number(
                          (positions[selected!]?.[axis] || 0).toFixed(
                            2,
                          ),
                        )}
                        onFocus={beginEdit}
                        onBlur={endEdit}
                        onChange={(e) => {
                          if (!canPosition(selected!) || e.target.value === "") return;
                          updatePosition(selected!, {
                            ...evaluateDocument(docRef.current, beatRef.current)[selected!],
                            [axis]: Number(e.target.value),
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="hint">
                  {selected && positionLocked(selected)
                    ? "Unlock this dancer’s incoming and outgoing routes to adjust position."
                    : playing
                      ? "Pause at any count to move dancers."
                      : selected && !getPositionEditAvailability(doc, beat, selected).canEdit
                        ? getPositionEditAvailability(doc, beat, selected).error
                        : `Editing count ${formatCount(beat)}. Drag or type a position; a key is added automatically. Hold keys snap to quarter beats.`}
                </p>
              </div>
              <div className="inspector-section">
                <h3>
                  {routeFormation
                    ? "Route to " + routeFormation.title
                    : "Transition route"}
                </h3>
                <p className="hint">
                  {routeFormation
                    ? "Drag a route line to bend it, or use the waypoint fields below."
                    : "Add a second formation to create transition routes."}
                </p>
                <div
                  className="route-modes"
                  role="group"
                  aria-label="Route shape"
                >
                  <button
                    aria-pressed={
                      (path?.interpolation || "linear") === "linear"
                    }
                    disabled={practice || !path || path.locked}
                    onClick={() => setPathMode("linear")}
                  >
                    Straight
                  </button>
                  <button
                    aria-pressed={path?.interpolation === "smooth"}
                    disabled={practice || !path || path.locked}
                    onClick={() => setPathMode("smooth")}
                  >
                    Smooth
                  </button>
                </div>
                <p className="hint">
                  Shape changes use the same saved motion during rehearsal.
                  Review route warnings after changing shape.
                </p>
                {path?.interpolation === "smooth" &&
                  path.points.length === 2 && (
                    <p className="hint">
                      Two-point routes stay visually straight. Drag the route or
                      add a waypoint to shape a curve.
                    </p>
                  )}
                <button
                  className={"wide-button " + (path?.locked ? "active" : "")}
                  disabled={practice || !path}
                  onClick={() => {
                    const n = structuredClone(doc);
                    n.paths[routeFormation!.id][selected!].locked =
                      !path?.locked;
                    change(n);
                  }}
                >
                  {path?.locked ? (
                    <LockKeyhole size={15} />
                  ) : (
                    <UnlockKeyhole size={15} />
                  )}{" "}
                  {path?.locked
                    ? "Unlock approved route"
                    : "Lock approved route"}
                </button>
                {!practice && (
                  <>
                    <button
                      className="wide-button"
                      disabled={
                        !path || path.locked || path.points.length >= 64
                      }
                      onClick={addWaypoint}
                    >
                      <Plus size={14} /> Add waypoint
                    </button>
                    {path?.points.slice(1, -1).map((point, index) => (
                      <div className="waypoint-editor" key={index}>
                        <span>
                          Waypoint {index + 1} · {Math.round(point.t * 100)}%
                        </span>
                        <div className="coordinate-fields">
                          {(["x", "y"] as const).map((axis) => (
                            <label key={axis}>
                              {axis.toUpperCase()}
                              <input
                                aria-label={
                                  "Waypoint " + (index + 1) + " " + axis
                                }
                                type="number"
                                step=".25"
                                disabled={path.locked}
                                value={Number(point[axis].toFixed(2))}
                                onChange={(e) => {
                                  const n = docRef.current,
                                    target = routeTargetRef.current;
                                  if (!target || !selected) return;
                                  change(
                                    moveRouteWaypoint(
                                      n,
                                      target,
                                      selected,
                                      index,
                                      { ...point, [axis]: +e.target.value },
                                    ),
                                  );
                                }}
                              />
                            </label>
                          ))}
                          <button
                            disabled={path.locked}
                            aria-label={"Remove waypoint " + (index + 1)}
                            onClick={() => {
                              const n = structuredClone(doc);
                              n.paths[routeFormation!.id][
                                selected!
                              ].points.splice(index + 1, 1);
                              change(n);
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="wide-button suggest"
                      disabled={!routeFormation}
                      onClick={() => {
                        if (!routeFormation) return;
                        change(
                          suggestTransition(docRef.current, routeFormation.id),
                        );
                        setPaths(true);
                      }}
                    >
                      <Sparkles size={14} /> Suggest transition routes
                    </button>
                    <p className="hint">
                      Deterministic suggestions for this transition. Locked
                      routes are preserved.
                    </p>
                  </>
                )}
              </div>
              {practice && (
                <div className="inspector-section">
                  <h3>Nearby at this count</h3>
                  {doc.dancers
                    .filter((d) => d.id !== selected)
                    .sort(
                      (a, b) =>
                        Math.hypot(
                          positions[a.id].x - positions[selected!].x,
                          positions[a.id].y - positions[selected!].y,
                        ) -
                        Math.hypot(
                          positions[b.id].x - positions[selected!].x,
                          positions[b.id].y - positions[selected!].y,
                        ),
                    )
                    .slice(0, 3)
                    .map((d) => (
                      <p key={d.id} className="neighbor">
                        {d.name}
                        <span>
                          {Math.hypot(
                            positions[d.id].x - positions[selected!].x,
                            positions[d.id].y - positions[selected!].y,
                          ).toFixed(1)}{" "}
                          m
                        </span>
                      </p>
                    ))}
                </div>
              )}
            </>
          ) : (
            <p className="panel-description">Select a dancer on the stage.</p>
          )}
          {!practice && dancer && (
            <button
              className="danger-link"
              disabled={doc.dancers.length <= 1}
              title={
                doc.dancers.length <= 1
                  ? "Keep at least one dancer in the project"
                  : undefined
              }
              onClick={() => {
                if (docRef.current.dancers.length > 1) {
                  setPendingDancerRemoval(dancer.id);
                  setModal("remove-dancer");
                }
              }}
            >
              <Trash2 size={12} /> Remove dancer
            </button>
          )}
          {!practice && current && (
            <div className="inspector-section">
              <h3>Formation timing</h3>
              <label className="field-label">
                TITLE
                <input
                  value={current.title}
                  onChange={(e) =>
                    editFormation((n) => {
                      n.formations.find((f) => f.id === current.id)!.title =
                        e.target.value;
                    })
                  }
                />
              </label>
              <div className="coordinate-fields">
                <label>
                  ARRIVE
                  <input
                    aria-label="Formation arrival beat"
                    type="number"
                    step=".25"
                    min="0"
                    max={doc.totalBeats}
                    value={current.beat}
                    disabled={current.id === doc.formations[0].id}
                    onChange={(e) => moveTiming(current.id, +e.target.value)}
                  />
                </label>
                <label>
                  TRAVEL
                  <input
                    aria-label="Transition duration beats"
                    type="number"
                    step=".25"
                    min="0"
                    max={
                      current.beat -
                      (doc.formations[
                        doc.formations.findIndex((f) => f.id === current.id) - 1
                      ]?.beat || 0)
                    }
                    value={current.transitionBeats}
                    disabled={current.id === doc.formations[0].id}
                    onChange={(e) =>
                      changeTransition(current.id, +e.target.value)
                    }
                  />
                </label>
              </div>
              <button
                className="wide-button"
                onClick={() => addFormation(current.id)}
              >
                <Copy size={13} /> Duplicate formation
              </button>
              <button
                className="wide-button"
                disabled={current.id === doc.formations[0].id}
                onClick={deleteFormation}
              >
                <Trash2 size={13} /> Delete formation
              </button>
            </div>
          )}
          <div className="inspector-section warnings">
            <h3>
              Route review <span>{warnings.length}</span>
            </h3>
            <p className="hint">Rehearsal prompts, not a safety guarantee.</p>
            {warnings.slice(0, 12).map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  seek(w.beat);
                  setSelected(w.dancerIds[0] || null);
                  setPaths(true);
                }}
              >
                <span className="warning-dot" />
                <span>
                  {w.message}
                  <small>{formatCount(w.beat)}</small>
                </span>
              </button>
            ))}
            {!warnings.length && (
              <p className="hint">
                No issues found by the current route checks.
              </p>
            )}
          </div>
        </aside>
      </div>
      <div className="rotate-gate">
        <Smartphone size={44} />
        <h2>A little more room to move.</h2>
        <p>Rotate your phone to landscape to open the stage and timeline.</p>
        <button className="outline" onClick={() => setRoute("home")}>
          Back to home
        </button>
      </div>
      <nav className="mobile-nav">
        {[
          { id: "home", icon: Home, label: "Home" },
          { id: "notes", icon: MessageSquare, label: "Notes" },
          { id: "projects", icon: Grid2X2, label: "Projects" },
        ].map((n) => (
          <button
            key={n.id}
            className={route === n.id ? "active" : ""}
            onClick={() => goRoute(n.id)}
          >
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
      </nav>
      {modal && (
        <div
          className="modal-backdrop"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setModal("");
          }}
        >
          <section
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal("")}
            >
              <X size={19} />
            </button>
            {modal === "add-dancer" ? (
              <>
                <h2>A place in the formation.</h2>
                <p>
                  Add a dancer to this project’s roster and every formation.
                  Their starting mark can be moved at the opening count.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addDancer();
                  }}
                >
                  <label className="field-label">
                    DANCER NAME
                    <input
                      data-autofocus
                      aria-label="New dancer name"
                      autoComplete="off"
                      required
                      maxLength={200}
                      value={newDancerName}
                      onChange={(e) => setNewDancerName(e.target.value)}
                    />
                  </label>
                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="outline"
                      onClick={() => setModal("")}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary"
                      type="submit"
                      disabled={
                        !newDancerName.trim() || doc.dancers.length >= 100
                      }
                    >
                      <Plus size={15} />
                      Add dancer
                    </button>
                  </div>
                </form>
              </>
            ) : modal === "remove-dancer" ? (
              <>
                <h2>
                  Remove{" "}
                  {doc.dancers.find((d) => d.id === pendingDancerRemoval)
                    ?.name || "this dancer"}
                  ?
                </h2>
                <p>
                  This removes the dancer from the roster, every formation, and
                  their saved routes. You can restore the whole change with
                  Undo.
                </p>
                <div className="dialog-actions">
                  <button
                    data-autofocus
                    className="outline"
                    onClick={() => setModal("")}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary danger-action"
                    onClick={removeDancer}
                  >
                    <Trash2 size={15} />
                    Remove dancer
                  </button>
                </div>
              </>
            ) : modal === "recovery" ? (
              <>
                <h2>Pick up your unsaved work?</h2>
                <p>
                  A local recovery copy is available for this project. Restore
                  it as a draft, or continue with the saved server version.
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    try {
                      const recovered = JSON.parse(
                        localStorage.getItem("danceform-recovery-" + doc.id)!,
                      );
                      change(recovered);
                      setModal("");
                    } catch {
                      setError("The recovery copy could not be read.");
                    }
                  }}
                >
                  Restore local draft
                </button>
                <button
                  className="wide-button"
                  onClick={() => {
                    localStorage.removeItem("danceform-recovery-" + doc.id);
                    setModal("");
                  }}
                >
                  Use saved version
                </button>
              </>
            ) : modal === "publish" ? (
              <>
                <span className="eyebrow">READY FOR REHEARSAL</span>
                <h2>Publish this revision?</h2>
                <p>
                  Share your current saved formations, routes, timing, and music
                  with dancers. Your next edits stay in draft until you publish
                  again.
                </p>
                <div className="publish-summary">
                  <strong>{doc.title}</strong>
                  <span>
                    {doc.dancers.length} dancers · {doc.formations.length}{" "}
                    formations · {doc.sections.length} sections
                  </span>
                  <span>{warnings.length} route advisories to review</span>
                </div>
                <p className="hint">
                  Publishing confirms you reviewed the route advisories. Invalid
                  paths or stage boundaries must be fixed first.
                </p>
                <button className="primary" onClick={publish}>
                  Publish reviewed revision
                </button>
              </>
            ) : modal === "published" ? (
              <>
                <Check className="success-icon" />
                <h2>Ready for your dancers.</h2>
                <p>
                  Revision {revision} is published. Your shared practice link
                  now shows this revision.
                </p>
                <button className="primary" onClick={share}>
                  Get practice link
                </button>
              </>
            ) : modal === "share" ? (
              <>
                <h2>Bring everyone into formation.</h2>
                <p>
                  Anyone with this link can view the latest published revision,
                  leave a note, and acknowledge it. They cannot edit your
                  choreography.
                </p>
                <div className="copy-field">
                  <input readOnly value={shareUrl} />
                  <button
                    aria-label="Copy practice link"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => setStatus("Practice link copied"))
                        .catch(() =>
                          setError(
                            "Copy failed. Select the practice link and copy it manually.",
                          ),
                        )
                    }
                  >
                    <Copy size={18} />
                  </button>
                </div>
                <button
                  className="danger-link"
                  onClick={async () => {
                    try {
                      await api("/projects/" + doc.id + "/share", "DELETE");
                      setShareUrl("");
                      setModal("");
                      setStatus("Practice links revoked");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Revoke all practice links
                </button>
              </>
            ) : modal === "settings" ? (
              <>
                <h2>Project settings</h2>
                <label className="field-label">
                  PROJECT TITLE
                  <input
                    maxLength={200}
                    required
                    value={doc.title}
                    onChange={(e) => change({ ...doc, title: e.target.value })}
                  />
                </label>
                <div className="coordinate-fields">
                  <label>
                    WIDTH (m)
                    <input
                      type="number"
                      min="2"
                      max="100"
                      value={doc.stage.width}
                      onChange={(e) =>
                        change({
                          ...doc,
                          stage: {
                            ...doc.stage,
                            width: Math.max(
                              2,
                              Math.min(100, +e.target.value || 2),
                            ),
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    DEPTH (m)
                    <input
                      type="number"
                      min="2"
                      max="100"
                      value={doc.stage.depth}
                      onChange={(e) =>
                        change({
                          ...doc,
                          stage: {
                            ...doc.stage,
                            depth: Math.max(
                              2,
                              Math.min(100, +e.target.value || 2),
                            ),
                          },
                        })
                      }
                    />
                  </label>
                </div>
                <div className="coordinate-fields">
                  <label>
                    TEMPO (BPM)
                    <input
                      type="number"
                      min="30"
                      max="300"
                      value={doc.bpm}
                      onChange={(e) =>
                        change({
                          ...doc,
                          bpm: Math.max(
                            20,
                            Math.min(400, +e.target.value || 20),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    AUDIO OFFSET (s)
                    <input
                      key={`${doc.id}:${doc.offsetSeconds}`}
                      aria-label="Audio offset seconds"
                      type="number"
                      step=".1"
                      min={-86400}
                      max={86400}
                      defaultValue={doc.offsetSeconds}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        const value = e.currentTarget.value.trim();
                        const offset = Number(value);
                        if (
                          !value ||
                          !Number.isFinite(offset) ||
                          Math.abs(offset) > 86400
                        ) {
                          e.currentTarget.value = String(
                            docRef.current.offsetSeconds,
                          );
                          setError(
                            "Enter an audio offset between −86400 and 86400 seconds.",
                          );
                          return;
                        }
                        if (offset !== docRef.current.offsetSeconds)
                          change({ ...docRef.current, offsetSeconds: offset });
                      }}
                    />
                  </label>
                </div>
                {doc.audio && (
                  <div className="publish-summary">
                    <span>Music: {doc.audio.name}</span>
                    <button
                      className="text-button"
                      onClick={() => {
                        importController.current?.abort();
                        importSerial.current++;
                        setImporting(false);
                        setPlaying(false);
                        const next = { ...docRef.current };
                        delete next.audio;
                        change(next);
                      }}
                    >
                      Remove music
                    </button>
                  </div>
                )}
                <label className="field-label">
                  DURATION (GLOBAL BEATS)
                  <input
                    type="number"
                    step=".25"
                    min={doc.formations.at(-1)!.beat}
                    value={doc.totalBeats}
                    onChange={(e) => {
                      const value = Math.round(+e.target.value * 4) / 4;
                      const last = doc.sections.at(-1)!;
                      if (
                        value < doc.formations.at(-1)!.beat ||
                        value <= last.startBeat
                      )
                        return;
                      const n = structuredClone(doc);
                      n.totalBeats = value;
                      n.sections.at(-1)!.endBeat = value;
                      change(n);
                      setLoopEnd((v) => Math.min(v, value));
                      if (beat > value) seek(value);
                    }}
                  />
                </label>
                <h3 className="icon-heading">
                  <TrafficCone size={16} /> Reference cones
                </h3>
                {doc.cones.map((c) => (
                  <div className="section-editor" key={c.id}>
                    <input
                      aria-label="Cone name"
                      value={c.label}
                      onChange={(e) => {
                        const n = structuredClone(doc);
                        n.cones.find((q) => q.id === c.id)!.label =
                          e.target.value;
                        change(n);
                      }}
                    />
                    <button
                      aria-label={"Remove " + c.label}
                      onClick={() =>
                        change({
                          ...doc,
                          cones: doc.cones.filter((q) => q.id !== c.id),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  className="wide-button"
                  onClick={() =>
                    change({
                      ...doc,
                      cones: [
                        ...doc.cones,
                        { id: uid(), label: "Reference cone", x: 0, y: 1 },
                      ],
                    })
                  }
                >
                  <TrafficCone size={16} /> Add cone
                </button>
                <p className="hint">
                  Drag cones on stage while editing a formation.
                </p>
                <h3>Sections</h3>
                {doc.sections.map((s, i) => (
                  <div className="section-settings-row" key={s.id}>
                    <div className="section-editor">
                      <input
                        aria-label="Section title"
                        value={s.title}
                        onChange={(e) => {
                          const n = structuredClone(doc);
                          n.sections[i].title = e.target.value;
                          change(n);
                        }}
                      />
                      <input
                        aria-label="Section end beat"
                        type="number"
                        value={s.endBeat}
                        disabled={i === doc.sections.length - 1}
                        onChange={(e) => {
                          const end = Math.round(+e.target.value * 4) / 4;
                          if (
                            end <= s.startBeat ||
                            end >= doc.sections[i + 1].endBeat
                          )
                            return;
                          const n = structuredClone(doc);
                          n.sections[i].endBeat = end;
                          n.sections[i + 1].startBeat = end;
                          change(n);
                        }}
                      />
                    </div>
                    <div className="section-row-actions">
                      <button
                        disabled={
                          s.endBeat - s.startBeat < 0.5 ||
                          doc.sections.length >= 100
                        }
                        onClick={() => {
                          const n = structuredClone(doc);
                          const split =
                            Math.round((s.startBeat + s.endBeat) * 2) / 4;
                          n.sections[i].endBeat = split;
                          n.sections.splice(i + 1, 0, {
                            id: uid(),
                            title: s.title + " B",
                            startBeat: split,
                            endBeat: s.endBeat,
                            color: s.color,
                          });
                          change(n);
                        }}
                      >
                        <Plus size={12} /> Split section
                      </button>
                      <button
                        disabled={doc.sections.length === 1}
                        onClick={() => {
                          const n = structuredClone(doc);
                          if (i > 0) n.sections[i - 1].endBeat = s.endBeat;
                          else n.sections[1].startBeat = 0;
                          n.sections.splice(i, 1);
                          change(n);
                        }}
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button className="primary" onClick={() => setModal("")}>
                  Done
                </button>
              </>
            ) : modal === "ack" ? (
              <>
                <h2>Ready for revision {revision}?</h2>
                <p>
                  Confirm you have reviewed this published choreography. Your
                  display name is self-reported.
                </p>
                <input
                  placeholder="Your display name"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={!author.trim()}
                  onClick={async () => {
                    const projectId = docRef.current.id;
                    const sequence = loadSequence.current;
                    try {
                      await api("/projects/" + projectId + "/ack", "PUT", {
                        revision,
                        displayName: author,
                      });
                      if (
                        docRef.current.id !== projectId ||
                        sequence !== loadSequence.current
                      )
                        return;
                      localStorage.setItem("danceform-name", author);
                      setAck(true);
                      setModal("");
                    } catch (e) {
                      if (
                        docRef.current.id === projectId &&
                        sequence === loadSequence.current
                      )
                        setError((e as Error).message);
                    }
                  }}
                >
                  Acknowledge this revision
                </button>
              </>
            ) : modal === "login" ? (
              <>
                <h2>Welcome to your studio.</h2>
                <p>Enter your studio owner password to continue.</p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await api("/session", "POST", {
                        password: new FormData(e.currentTarget).get("password"),
                      });
                      location.reload();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                  <button className="primary">Sign in</button>
                </form>
              </>
            ) : (
              <>
                <h2>A little guidance.</h2>
                <p>
                  Pause at any count, then drag or type a position for
                  dancers. Scrub the timeline to rehearse saved routes. Add
                  waypoints or suggest a transition, then lock routes you
                  approve.
                </p>
                <p>
                  <kbd>Space</kbd> Play / pause
                  <br />
                  <kbd>← →</kbd> Step a quarter count
                  <br />
                  <kbd>Shift + ← →</kbd> Step eight counts
                  <br />
                  <kbd>Ctrl / ⌘ Z</kbd> Undo
                  <br />
                  <kbd>Esc</kbd> Leave edit mode
                </p>
                <p>
                  Publish when your draft is ready. Sharing always opens the
                  current published revision.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
