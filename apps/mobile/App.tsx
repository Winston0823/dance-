import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  Share,
  useWindowDimensions,
  AppState,
  BackHandler,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ScreenOrientation from "expo-screen-orientation";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import {
  evaluateDocument,
  analyzeDocument,
  formatCount,
  getSectionAt,
  beatToSeconds,
  getActiveFormation,
  type ProjectDocument,
} from "../../packages/core/src/index.ts";
import {
  api,
  ApiError,
  readConnection,
  storeConnection,
  type Connection,
  type ProjectRecord,
  type ProjectSummary,
  type Note,
} from "./src/api";
import Stage from "./src/Stage";
import Timeline from "./src/Timeline";
import {
  NativeSeekController,
  playbackBoundary,
  audioHasEnded,
  audioStartBoundary,
} from "./src/audio-clock.ts";
import EditorInspector from "./src/EditorInspector";
import { checked, sameScope, drainSave } from "./src/editing.ts";
import { UI_PALETTE } from "../../packages/core/src/palette.ts";

const C = { ...UI_PALETTE, accent: UI_PALETTE.primary };
const copyDocument = (d: ProjectDocument): ProjectDocument =>
  JSON.parse(JSON.stringify(d));
function Button({
  title,
  onPress,
  primary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      style={[s.button, primary && s.primary, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.buttonText, primary && { color: "white" }]}>{title}</Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  number = false,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  number?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={s.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        secureTextEntry={secure}
        keyboardType={number ? "numbers-and-punctuation" : "default"}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DanceForm />
    </SafeAreaProvider>
  );
}
function DanceForm() {
  const dimensions = useWindowDimensions(),
    landscape = dimensions.width > dimensions.height;
  const [route, setRoute] = useState<"home" | "notes" | "stage">("home");
  const [connection, setConnection] = useState<Connection | null>(null),
    [serverInput, setServerInput] = useState(
      Platform.OS === "android"
        ? "http://10.0.2.2:3001"
        : "http://localhost:3001",
    ),
    [password, setPassword] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [role, setRole] = useState("guest"),
    [record, setRecord] = useState<ProjectRecord | null>(null),
    [doc, setDoc] = useState<ProjectDocument | null>(null);
  const [selected, setSelected] = useState(""),
    [beat, setBeat] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1),
    [loop, setLoop] = useState<[number, number] | null>(null),
    [edit, setEdit] = useState(false);
  const [status, setStatus] = useState("Connect to your rehearsal server."),
    [error, setError] = useState(""),
    [notes, setNotes] = useState<Note[]>([]),
    [author, setAuthor] = useState(""),
    [note, setNote] = useState("");
  const [history, setHistory] = useState<ProjectDocument[]>([]),
    [audioEnabled, setAudioEnabled] = useState(true),
    [busy, setBusy] = useState(false),
    [updateAvailable, setUpdateAvailable] = useState<number | null>(null);
  const [editingFormationId, setEditingFormationId] = useState("");
  const [coneId, setConeId] = useState("");
  const [coneFocus, setConeFocus] = useState(0);
  const [castPicker, setCastPicker] = useState(false);
  const [communicating, setCommunicating] = useState(false);
  const posting = useRef(false);
  const requestGeneration = useRef(0),
    loading = useRef(false),
    saveTask = useRef<Promise<boolean> | null>(null);
  const docRef = useRef(doc),
    versionRef = useRef(0),
    savedJSON = useRef(""),
    saving = useRef(false),
    conflicted = useRef(false),
    connectionRef = useRef(connection),
    recordRef = useRef(record),
    beatRef = useRef(0),
    playRef = useRef(false);
  docRef.current = doc;
  connectionRef.current = connection;
  recordRef.current = record;
  beatRef.current = beat;
  playRef.current = playing;
  const editor = role === "editor" && record?.role !== "viewer";
  const audioSource = useMemo(
    () =>
      doc?.audio && connection && audioEnabled
        ? {
            uri: connection.server + doc.audio.url,
            headers: { Authorization: `Bearer ${connection.token}` },
          }
        : null,
    [doc?.audio?.id, connection?.server, connection?.token, audioEnabled],
  );
  const player = useAudioPlayer(audioSource, { updateInterval: 100 });
  const audioStatus = useAudioPlayerStatus(player);
  const audioStatusRef = useRef(audioStatus);
  audioStatusRef.current = audioStatus;
  const seekController = useMemo(
    () =>
      new NativeSeekController(player, () => {
        setError(
          "Music could not seek. Check the connection or turn Music off for count-only rehearsal.",
        );
        setPlaying(false);
      }),
    [player],
  );
  useEffect(() => () => seekController.pause(), [seekController]);
  const orientationQueue = useRef<Promise<unknown>>(Promise.resolve());
  const warnings = useMemo(() => (doc ? analyzeDocument(doc) : []), [doc]);
  const selectedDancer = doc?.dancers.find((d) => d.id === selected);
  const formation = doc
    ? ((edit
        ? doc.formations.find((f) => f.id === editingFormationId)
        : undefined) ??
      doc.formations.find(
        (f) =>
          f.transitionBeats > 0 &&
          beat > f.beat - f.transitionBeats &&
          beat <= f.beat,
      ) ??
      getActiveFormation(doc, beat))
    : undefined;

  useEffect(() => {
    readConnection()
      .then((c) => {
        if (c) {
          setConnection(c);
          setServerInput(c.server);
          connect(c).catch((e) => setError(e.message));
        }
      })
      .catch(() => setError("Saved connection unavailable. Reconnect below."));
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);
  useEffect(() => {
    const target =
      route === "stage"
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    orientationQueue.current = orientationQueue.current
      .catch(() => {})
      .then(() => ScreenOrientation.lockAsync(target))
      .catch(() => {});
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (route === "home") return false;
      setPlaying(false);
      setRoute("home");
      return true;
    });
    return () => back.remove();
  }, [route]);
  useEffect(
    () => () => {
      orientationQueue.current = orientationQueue.current
        .catch(() => {})
        .then(() =>
          ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP,
          ),
        )
        .catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (audioStatus.error && audioEnabled && doc?.audio) {
      setPlaying(false);
      setError(
        "Music could not load. Check the server connection or choose Music off for count-only rehearsal.",
      );
    }
  }, [audioStatus.error, audioEnabled, doc?.audio?.id]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        setPlaying(false);
        player.pause();
      } else if (recordRef.current && connectionRef.current) {
        loadNotes().catch(() => {});
        void checkRevision();
      }
    });
    return () => listener.remove();
  }, [player]);
  useEffect(() => {
    if (editor || !record || !connection) return;
    const timer = setInterval(() => void checkRevision(), 20000);
    return () => clearInterval(timer);
  }, [editor, record?.id, connection?.token]);
  useEffect(() => {
    if (
      loop &&
      doc &&
      !doc.sections.some(
        (s) => s.startBeat === loop[0] && s.endBeat === loop[1],
      )
    )
      setLoop(null);
  }, [doc?.sections, loop]);
  useEffect(() => {
    if (route !== "stage" || !landscape) setPlaying(false);
  }, [route, landscape]);
  useEffect(() => {
    if (
      !doc ||
      !editor ||
      JSON.stringify(doc) === savedJSON.current ||
      conflicted.current
    )
      return;
    setStatus("Unsaved changes");
    const timer = setTimeout(() => void flushSave(), 650);
    return () => clearTimeout(timer);
  }, [doc]);
  useEffect(() => {
    if (!playing || !doc) return;
    let frame = 0;
    let anchor = performance.now(),
      anchorBeat = beatRef.current;
    let ended = false;
    seekController.pause();
    const startAudio = (at: number) => {
      const duration =
        player.duration > 0 ? player.duration : (doc.audio?.duration ?? 0);
      const boundary = audioStartBoundary(at, duration);
      if (boundary === "past-end") {
        ended = true;
        seekController.pause();
        setPlaying(false);
        setStatus(
          "This count is past the music end · turn Music off to continue with counts",
        );
        return false;
      }
      if (boundary === "ready" && player.isLoaded)
        void seekController.start(at, rate);
      return true;
    };
    const initialAudioTime = beatToSeconds(doc, anchorBeat) + doc.offsetSeconds;
    if (doc.audio && audioEnabled && !startAudio(initialAudioTime))
      return () => seekController.pause();
    const tick = () => {
      if (ended) return;
      const elapsed = (performance.now() - anchor) / 1000;
      let next = anchorBeat + ((elapsed * doc.bpm) / 60) * rate;
      if (doc.audio && audioEnabled) {
        const at = beatToSeconds(doc, next) + doc.offsetSeconds;
        if (seekController.phase === "idle" && at >= 0 && !startAudio(at))
          return;
        if (seekController.phase === "audio")
          next = Math.max(
            0,
            ((player.currentTime - doc.offsetSeconds) * doc.bpm) / 60,
          );
        else if (
          seekController.phase === "seeking" ||
          (at >= 0 && !player.isLoaded)
        ) {
          next = beatRef.current;
          anchorBeat = next;
          anchor = performance.now();
        }
      }
      const boundary = playbackBoundary(next, doc.totalBeats, loop);
      next = boundary.beat;
      if (boundary.looped) {
        anchorBeat = next;
        anchor = performance.now();
        seekController.pause();
        if (doc.audio && audioEnabled) {
          const at = beatToSeconds(doc, next) + doc.offsetSeconds;
          if (!startAudio(at)) {
            setBeat(next);
            return;
          }
        }
      }
      if (boundary.ended) {
        setBeat(next);
        setPlaying(false);
        return;
      }
      const duration =
        player.duration > 0 ? player.duration : (doc.audio?.duration ?? 0);
      if (
        !boundary.looped &&
        seekController.phase === "audio" &&
        doc.audio &&
        audioEnabled &&
        audioHasEnded(player.currentTime, duration, audioStatusRef.current)
      ) {
        setBeat(next);
        setPlaying(false);
        setStatus("Music ended · turn Music off to continue with counts");
        return;
      }
      setBeat(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      ended = true;
      cancelAnimationFrame(frame);
      seekController.pause();
    };
  }, [
    playing,
    rate,
    loop,
    doc?.bpm,
    doc?.totalBeats,
    doc?.offsetSeconds,
    doc?.audio?.id,
    audioEnabled,
    player,
    seekController,
  ]);

  function commitProject(next: ProjectRecord, c: Connection) {
    checked(next.document);
    savedJSON.current = JSON.stringify(next.document);
    versionRef.current = next.version;
    conflicted.current = false;
    recordRef.current = next;
    docRef.current = next.document;
    connectionRef.current = c;
    setConnection(c);
    setRecord(next);
    setDoc(next.document);
    setSelected(next.document.dancers[0]?.id ?? "");
    setEditingFormationId(next.document.formations[0]?.id ?? "");
    setConeId("");
    setCastPicker(false);
    setBeat(0);
    setLoop(null);
    setNote("");
    setEdit(false);
    setHistory([]);
    setUpdateAvailable(null);
    setStatus(
      next.role === "viewer"
        ? "Published · v" + next.publishedRevision
        : "All changes saved",
    );
  }
  async function connect(input?: Connection) {
    if (loading.current) return;
    if (!(await flushSave())) {
      setError(
        "Save or export your local recovery copy before changing connections.",
      );
      return;
    }
    const ticket = ++requestGeneration.current;
    loading.current = true;
    setBusy(true);
    setError("");
    setPlaying(false);
    try {
      const source = input?.server ?? serverInput.trim();
      const url = new URL(source);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error("Enter a complete http:// or https:// server address.");
      let c: Connection = {
        server: url.origin,
        token: input?.token ?? url.searchParams.get("share") ?? "",
      };
      let boot = await api<{
        role: string;
        projects: ProjectSummary[];
        accessToken?: string;
      }>(c, "/api/bootstrap");
      if (boot.role === "guest" && password && !url.searchParams.has("share")) {
        const session = await api<{ accessToken: string }>(c, "/api/session", {
          method: "POST",
          body: JSON.stringify({ password }),
        });
        c = { ...c, token: session.accessToken };
        boot = await api(c, "/api/bootstrap");
      }
      if (boot.role === "guest")
        throw new Error(
          "Enter the owner password or use a valid, unrevoked published rehearsal link.",
        );
      if (boot.accessToken) c = { ...c, token: boot.accessToken };
      if (!boot.projects[0])
        throw new Error("This connection has no accessible projects.");
      const next = await api<ProjectRecord>(
        c,
        "/api/projects/" + boot.projects[0].id,
      );
      if (ticket !== requestGeneration.current) return;
      commitProject(next, c);
      setRole(boot.role);
      setProjects(boot.projects);
      setPassword("");
      await storeConnection(c);
      await loadNotes(next.id, c);
    } catch (e) {
      if (ticket === requestGeneration.current) setError((e as Error).message);
    } finally {
      if (ticket === requestGeneration.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  }
  async function loadProject(
    id: string,
    c = connectionRef.current,
    discard = false,
  ) {
    if (!c || loading.current) return;
    if (!discard && !(await flushSave()))
      throw new Error(
        "Save or export your current local changes before switching projects.",
      );
    if (discard) {
      while (saveTask.current) await saveTask.current;
    }
    const ticket = ++requestGeneration.current;
    loading.current = true;
    setBusy(true);
    setPlaying(false);
    try {
      const next = await api<ProjectRecord>(c, "/api/projects/" + id);
      if (ticket !== requestGeneration.current) return;
      commitProject(next, c);
      await loadNotes(id, c);
    } finally {
      if (ticket === requestGeneration.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  }
  async function checkRevision() {
    const c = connectionRef.current,
      r = recordRef.current;
    if (!c || !r || r.role !== "viewer") return;
    try {
      const next = await api<ProjectRecord>(c, `/api/projects/${r.id}`);
      if (!sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        return;
      if ((next.publishedRevision ?? 0) > (r.publishedRevision ?? 0))
        setUpdateAvailable(next.publishedRevision);
    } catch (e) {
      if (!sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        return;
      setError(
        "Could not check for rehearsal updates: " + (e as Error).message,
      );
    }
  }
  async function loadNotes(
    id = recordRef.current?.id,
    c = connectionRef.current,
  ) {
    if (!c || !id) return;
    const result = await api<{ notes: Note[] }>(c, `/api/projects/${id}/notes`);
    if (sameScope(c, connectionRef.current, id, recordRef.current?.id))
      setNotes(result.notes);
  }
  async function flushSave(): Promise<boolean> {
    // A pending debounce must not save a draft during an explicit discard/reload.
    if (loading.current) return false;
    const saved = await drainSave(
      saveTask,
      () =>
        !docRef.current ||
        recordRef.current?.role !== "editor" ||
        JSON.stringify(docRef.current) === savedJSON.current,
      async () => {
        const current = docRef.current!,
          c = connectionRef.current,
          r = recordRef.current;
        if (!c || !r || conflicted.current || loading.current) return false;
        const serialized = JSON.stringify(current),
          version = versionRef.current,
          generation = requestGeneration.current;
        saving.current = true;
        setStatus("Saving…");
        try {
          const next = await api<ProjectRecord>(c, "/api/projects/" + r.id, {
            method: "PUT",
            body: JSON.stringify({
              document: current,
              expectedVersion: version,
            }),
          });
          if (
            !sameScope(
              c,
              connectionRef.current,
              r.id,
              recordRef.current?.id,
              generation,
              requestGeneration.current,
            )
          )
            return false;
          versionRef.current = next.version;
          recordRef.current = next;
          setRecord(next);
          savedJSON.current = serialized;
          setStatus(
            JSON.stringify(docRef.current) === serialized
              ? "All changes saved"
              : "Unsaved changes",
          );
          return true;
        } catch (e) {
          if (
            !sameScope(
              c,
              connectionRef.current,
              r.id,
              recordRef.current?.id,
              generation,
              requestGeneration.current,
            )
          )
            return false;
          if (e instanceof ApiError && e.status === 409) {
            conflicted.current = true;
            setError(
              "A newer draft exists. Export a local recovery copy, then explicitly reload to compare changes.",
            );
          } else setError((e as Error).message);
          setStatus("Not saved");
          return false;
        } finally {
          saving.current = false;
        }
      },
    );
    return saved && !loading.current;
  }
  function modify(fn: (d: ProjectDocument) => ProjectDocument) {
    const current = docRef.current;
    if (!current || !editor || loading.current) return false;
    try {
      const next = checked(fn(copyDocument(current)));
      setPlaying(false);
      setHistory((h) => [...h.slice(-29), copyDocument(current)]);
      docRef.current = next;
      setDoc(next);
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  function undoEdit() {
    if (loading.current) return;
    const previous = history.at(-1);
    if (!previous) return;
    setPlaying(false);
    docRef.current = previous;
    setDoc(previous);
    setHistory((h) => h.slice(0, -1));
    if (!previous.dancers.some((d) => d.id === selected))
      setSelected(previous.dancers[0].id);
    if (!previous.cones.some((c) => c.id === coneId)) setConeId("");
    if (!previous.formations.some((f) => f.id === editingFormationId))
      setEditingFormationId(previous.formations[0].id);
    setBeat((value) => Math.min(value, previous.totalBeats));
  }
  function selectCone(id: string) {
    setConeId(id);
    setConeFocus((n) => n + 1);
  }
  function selectFormation(id: string, at: number) {
    setEditingFormationId(id);
    seek(at);
  }
  function seek(next: number) {
    setPlaying(false);
    player.pause();
    setBeat(Math.max(0, Math.min(doc?.totalBeats ?? 0, next)));
  }
  function openStage(editMode = false) {
    setEditingFormationId(formation?.id ?? doc?.formations[0]?.id ?? "");
    setEdit(editMode && editor);
    setRoute("stage");
  }
  async function publish(reviewed = false, reviewedJSON?: string) {
    if (!connection || !record || !doc || loading.current) return;
    if (!(await flushSave())) {
      setError("Finish saving before publishing.");
      return;
    }
    const current = docRef.current!,
      currentRecord = recordRef.current!,
      c = connectionRef.current!;
    if (currentRecord.role !== "editor") return;
    const snapshot = JSON.stringify(current),
      currentWarnings = analyzeDocument(current);
    if (reviewed && reviewedJSON !== snapshot) {
      setError(
        "The draft changed after warning review. Review the current warnings again.",
      );
      return;
    }
    if (currentWarnings.some((w) => w.severity === "error")) {
      setError("Fix invalid paths or boundary warnings before publishing.");
      return;
    }
    if (currentWarnings.length && !reviewed) {
      Alert.alert(
        "Review before publishing",
        `${currentWarnings.length} planning warnings. These are model estimates; test transitions in rehearsal.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Publish with reviewed warnings",
            onPress: () => void publish(true, snapshot),
          },
        ],
      );
      return;
    }
    loading.current = true;
    setBusy(true);
    try {
      const result = await api<{ revision: number; project: ProjectRecord }>(
        c,
        `/api/projects/${currentRecord.id}/publish`,
        {
          method: "POST",
          body: JSON.stringify({
            expectedVersion: versionRef.current,
            reviewedWarnings: reviewed,
          }),
        },
      );
      if (
        !sameScope(
          c,
          connectionRef.current,
          currentRecord.id,
          recordRef.current?.id,
        )
      )
        return;
      recordRef.current = result.project;
      setRecord(result.project);
      setStatus(`Published · v${result.revision}`);
      Alert.alert(
        "Published",
        `Dancers can now open revision ${result.revision}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  async function share() {
    if (!connection || !record) return;
    try {
      const result = await api<{ path: string }>(
        connection,
        `/api/projects/${record.id}/share`,
        { method: "POST" },
      );
      await Share.share({ message: connection.server + result.path });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addNote() {
    const c = connectionRef.current,
      r = recordRef.current,
      body = note.trim(),
      name = author.trim();
    if (!c || !r || !body || !name || posting.current) return;
    posting.current = true;
    setCommunicating(true);
    try {
      await api(c, "/api/projects/" + r.id + "/notes", {
        method: "POST",
        body: JSON.stringify({
          beat: Math.round(beatRef.current * 4) / 4,
          ...(selected ? { dancerId: selected } : {}),
          author: name,
          body,
          revision: r.role === "editor" ? null : r.publishedRevision,
        }),
      });
      if (!sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        return;
      setNote((value) => (value.trim() === body ? "" : value));
      await loadNotes(r.id, c);
    } catch (e) {
      if (sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        setError((e as Error).message);
    } finally {
      posting.current = false;
      setCommunicating(false);
    }
  }
  async function acknowledge() {
    const c = connectionRef.current,
      r = recordRef.current;
    if (!c || !r?.publishedRevision || posting.current) return;
    if (!author.trim()) {
      setRoute("notes");
      setError(
        "Enter your display name, then return to the stage to acknowledge this revision.",
      );
      return;
    }
    setCommunicating(true);
    try {
      await api(c, "/api/projects/" + r.id + "/ack", {
        method: "PUT",
        body: JSON.stringify({
          revision: r.publishedRevision,
          displayName: author.trim(),
        }),
      });
      if (sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        setStatus("You acknowledged v" + r.publishedRevision);
    } catch (e) {
      if (sameScope(c, connectionRef.current, r.id, recordRef.current?.id))
        setError((e as Error).message);
    } finally {
      setCommunicating(false);
    }
  }
  function openNote(n: Note) {
    if (
      n.revision !== null &&
      (editor || n.revision !== record?.publishedRevision)
    ) {
      Alert.alert(
        "Published revision note",
        `This note belongs to revision ${n.revision}. Its count is shown for reference and will not seek within a draft or a different revision.`,
      );
      return;
    }
    seek(n.beat);
    openStage();
  }
  const updateNotice = updateAvailable ? (
    <Button
      title={`Revision ${updateAvailable} is available · Reload`}
      onPress={() =>
        void loadProject(doc!.id).catch((e) => setError(e.message))
      }
    />
  ) : null;

  if (route === "stage" && doc && !landscape)
    return (
      <SafeAreaView style={[s.app, s.center]}>
        <StatusBar hidden />
        <Text style={s.eyebrow}>DANCEFORM REHEARSAL</Text>
        <Text style={s.rotate}>↻</Text>
        <Text style={s.h1}>Turn your phone sideways</Text>
        <Text style={s.description}>
          The stage editor and viewer use landscape so you can see the whole
          team and timeline.
        </Text>
        <Button title="Back to home" onPress={() => setRoute("home")} />
      </SafeAreaView>
    );
  if (route === "stage" && doc && landscape) {
    const positions = evaluateDocument(doc, beat),
      me = positions[selected];
    const neighbors = doc.dancers
      .filter((d) => d.id !== selected)
      .map((d) => ({
        name: d.name,
        distance:
          positions[d.id] && me
            ? Math.hypot(positions[d.id].x - me.x, positions[d.id].y - me.y)
            : Infinity,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2);
    return (
      <SafeAreaView style={s.app} edges={["left", "right", "bottom"]}>
        <StatusBar hidden />
        <View style={s.stageHeader}>
          <Button title="‹ Home" onPress={() => setRoute("home")} />
          <View style={{ flex: 1 }}>
            <Text style={s.stageTitle}>
              {doc.title} · {getSectionAt(doc, beat)?.title}
            </Text>
            <Text style={s.small}>
              {editor ? "Draft" : `Published v${record?.publishedRevision}`} ·{" "}
              {status}
            </Text>
          </View>
          <Button title="Notes" onPress={() => setRoute("notes")} />
          {editor && (
            <Button
              title={edit ? "Done editing" : "Edit"}
              primary={edit}
              onPress={() => {
                setPlaying(false);
                if (!edit) {
                  setEditingFormationId(formation?.id ?? doc.formations[0].id);
                  setBeat(formation?.beat ?? beat);
                }
                setEdit(!edit);
              }}
            />
          )}
        </View>
        {updateNotice}
        {error ? (
          <Pressable onPress={() => setError("")} style={s.error}>
            <Text style={s.errorText}>{error} ×</Text>
          </Pressable>
        ) : null}
        <View style={s.stageBody}>
          <Stage
            doc={doc}
            beat={beat}
            selected={selected}
            onSelect={setSelected}
            formationId={formation?.id ?? ""}
            editing={edit && editor}
            selectedCone={coneId}
            onCone={selectCone}
          />
          {edit && editor ? (
            <EditorInspector
              warnings={warnings}
              doc={doc}
              formationId={formation?.id ?? doc.formations[0].id}
              selected={selected}
              onSelect={setSelected}
              onModify={modify}
              coneId={coneId}
              coneFocus={coneFocus}
              onCone={setConeId}
              canUndo={history.length > 0}
              onUndo={undoEdit}
              onSeek={seek}
              onFormation={selectFormation}
            />
          ) : (
            <ScrollView
              style={s.inspector}
              contentContainerStyle={{ padding: 12, gap: 9 }}
            >
              <Text style={s.eyebrow}>MY REHEARSAL</Text>
              <Text style={s.h2}>
                {selectedDancer?.name ?? "Choose a dancer"}
              </Text>
              <Button
                title={castPicker ? "Close dancer list" : "Choose my dancer"}
                onPress={() => setCastPicker(!castPicker)}
              />
              {castPicker &&
                doc.dancers.map((person) => (
                  <Button
                    key={person.id}
                    title={person.name}
                    primary={selected === person.id}
                    onPress={() => {
                      setSelected(person.id);
                      setCastPicker(false);
                      setStatus("Following " + person.name);
                    }}
                  />
                ))}
              <Text style={s.description}>
                Near {neighbors.map((n) => n.name.split(" ")[0]).join(" and ")}
              </Text>
              <Text style={s.small}>
                {me
                  ? Math.abs(me.x).toFixed(1) +
                    " m " +
                    (me.x < 0 ? "stage right" : "stage left") +
                    " · " +
                    me.y.toFixed(1) +
                    " m from front"
                  : ""}
              </Text>
              {record?.role === "viewer" && record.publishedRevision && (
                <Button
                  title="Acknowledge revision"
                  onPress={() => void acknowledge()}
                />
              )}
              <Text style={s.small}>{warnings.length} planning warnings</Text>
              {warnings.slice(0, 12).map((w) => (
                <Button
                  key={w.id}
                  title={formatCount(w.beat) + " · " + w.message}
                  onPress={() => {
                    if (w.dancerIds[0]) setSelected(w.dancerIds[0]);
                    seek(w.beat);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={s.transport}
        >
          <Button
            title={playing ? "Ⅱ Pause" : "▶ Play"}
            primary
            onPress={() => {
              if (beat >= doc.totalBeats) setBeat(0);
              setPlaying(!playing);
            }}
          />
          <Text style={s.count}>8-count {formatCount(beat)}</Text>
          <Text style={s.small}>{beatToSeconds(doc, beat).toFixed(1)} s</Text>
          <Button title="−1" onPress={() => seek(Math.floor(beat) - 1)} />
          <Button title="+1" onPress={() => seek(Math.floor(beat) + 1)} />
          <Button
            title={`${rate}×`}
            onPress={() => {
              setPlaying(false);
              setRate(rate === 1 ? 0.5 : rate === 0.5 ? 0.75 : 1);
            }}
          />
          <Button
            title={loop ? "Loop on" : "Loop section"}
            onPress={() => {
              const section = getSectionAt(doc, beat);
              setLoop(loop ? null : [section.startBeat, section.endBeat]);
            }}
          />
          <Button
            title={audioEnabled ? "Music on" : "Music off"}
            disabled={!doc.audio}
            onPress={() => {
              setPlaying(false);
              setAudioEnabled(!audioEnabled);
            }}
          />
        </ScrollView>
        <Timeline
          doc={doc}
          beat={beat}
          onSeek={seek}
          selectedFormation={formation?.id}
          onFormation={(id, at) => {
            setEditingFormationId(id);
            seek(at);
          }}
          onSection={(start, end) => {
            setLoop([start, end]);
            seek(start);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.app}>
      <StatusBar style="dark" />
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.page}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.row}>
          <Text style={s.brand}>DanceForm</Text>
          <Text style={s.pill}>{connection ? role : "Not connected"}</Text>
        </View>
        {error ? (
          <Pressable style={s.error} onPress={() => setError("")}>
            <Text style={s.errorText}>{error} ×</Text>
          </Pressable>
        ) : null}
        {updateNotice}
        {route === "notes" && doc ? (
          <>
            <Button title="‹ Home" onPress={() => setRoute("home")} />
            <Text style={s.h1}>Rehearsal notes</Text>
            <Text style={s.description}>
              {doc.title} · 8-count {formatCount(beat)}
            </Text>
            <Field
              label="Your display name"
              value={author}
              onChange={setAuthor}
            />
            <Field label="Note at this count" value={note} onChange={setNote} />
            <Button
              title="Post note"
              primary
              disabled={communicating || !note.trim() || !author.trim()}
              onPress={() => void addNote()}
            />
            <Text style={s.small}>
              Display names on shared links are unverified.
            </Text>
            {notes.map((n) => (
              <Pressable key={n.id} style={s.card} onPress={() => openNote(n)}>
                <Text style={s.eyebrow}>
                  8-COUNT {formatCount(n.beat)} ·{" "}
                  {n.revision ? `V${n.revision}` : "DRAFT"}
                </Text>
                <Text style={s.description}>{n.body}</Text>
                <Text style={s.small}>{n.author}</Text>
              </Pressable>
            ))}
            {!notes.length && (
              <Text style={s.description}>
                No notes yet. Add a cue your team can find at the right count.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={s.eyebrow}>YOUR REHEARSAL SPACE</Text>
            <Text style={s.h1}>{"Every dancer.\nOne shared plan."}</Text>
            <Text style={s.description}>
              Find your place, follow the counts, and keep the team moving
              together.
            </Text>
            {doc && (
              <View style={s.card}>
                <Text style={s.eyebrow}>
                  {editor
                    ? "WORKING DRAFT"
                    : `PUBLISHED · V${record?.publishedRevision}`}
                </Text>
                <Text style={s.h2}>{doc.title}</Text>
                <Text style={s.description}>
                  {doc.dancers.length} dancers · {doc.sections.length} sections
                </Text>
                <Text style={s.small}>{status}</Text>
                <Button
                  title="Open rehearsal →"
                  primary
                  onPress={() => openStage()}
                />
                {editor && (
                  <Button
                    title="Edit choreography"
                    onPress={() => openStage(true)}
                  />
                )}
                <View style={s.row}>
                  <Button title="Notes" onPress={() => setRoute("notes")} />
                  <Button
                    title="Reload latest"
                    onPress={() =>
                      Alert.alert(
                        "Reload project?",
                        "Unsaved local changes will be discarded.",
                        [
                          { text: "Cancel" },
                          {
                            text: "Reload",
                            onPress: () =>
                              void loadProject(doc.id, undefined, true).catch(
                                (e) => setError(e.message),
                              ),
                          },
                        ],
                      )
                    }
                  />
                </View>
                {editor && (
                  <View style={s.row}>
                    <Button title="Publish" onPress={() => void publish()} />
                    <Button
                      title="Share published"
                      disabled={!record?.publishedRevision}
                      onPress={() => void share()}
                    />
                  </View>
                )}
              </View>
            )}
            {projects.length > 1 && (
              <>
                <Text style={s.eyebrow}>PROJECTS</Text>
                {projects.map((p) => (
                  <Pressable
                    key={p.id}
                    style={s.card}
                    onPress={() =>
                      void loadProject(p.id).catch((e) => setError(e.message))
                    }
                  >
                    <Text style={s.h2}>{p.title}</Text>
                    <Text style={s.small}>
                      {p.dancerCount} dancers · {p.formationCount} formations
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
            {doc && editor && (
              <View style={s.row}>
                <Button title="Retry save" onPress={() => void flushSave()} />
                <Button
                  title="Export local recovery"
                  onPress={() =>
                    void Share.share({
                      message: JSON.stringify(docRef.current, null, 2),
                    }).catch((e) => setError(e.message))
                  }
                />
              </View>
            )}
            <View style={s.card}>
              <Text style={s.h2}>
                {connection ? "Server connection" : "Connect your team"}
              </Text>
              <Text style={s.description}>
                Paste a shared rehearsal link or your server address. For a
                physical phone, use your computer’s local network address.
              </Text>
              <Field
                label="Server address or shared link"
                value={serverInput}
                onChange={setServerInput}
              />
              <Field
                label="Owner password (editors only)"
                value={password}
                onChange={setPassword}
                secure
              />
              <Button
                title={busy ? "Connecting…" : "Connect"}
                primary
                disabled={busy}
                onPress={() => void connect()}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.paper },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 18,
  },
  page: { padding: 24, gap: 20, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  brand: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -1,
    color: C.accent,
  },
  pill: {
    fontSize: 11,
    backgroundColor: C.selection,
    color: C.accent,
    padding: 9,
    borderRadius: 16,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.6,
    fontWeight: "700",
    color: C.muted,
  },
  h1: {
    fontSize: 35,
    lineHeight: 41,
    fontWeight: "700",
    letterSpacing: -1.1,
    color: C.ink,
  },
  h2: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5, color: C.ink },
  description: { fontSize: 14, lineHeight: 22, color: C.muted },
  small: { fontSize: 11, lineHeight: 17, color: C.muted },
  button: {
    minHeight: 44,
    paddingHorizontal: 15,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.selection,
    borderRadius: 11,
  },
  primary: { backgroundColor: C.accent },
  buttonText: { fontSize: 12, fontWeight: "600", color: C.accent },
  card: {
    padding: 22,
    gap: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
  },
  field: { gap: 5 },
  label: { fontSize: 11, color: C.muted },
  input: {
    minHeight: 44,
    borderColor: C.line,
    borderWidth: 1,
    paddingHorizontal: 12,
    borderRadius: 9,
    fontSize: 14,
    color: C.ink,
    backgroundColor: "white",
  },
  error: { backgroundColor: C.riskSurface, padding: 10, borderRadius: 9 },
  errorText: { fontSize: 12, color: C.risk },
  rotate: { fontSize: 70, color: C.accent },
  stageHeader: {
    minHeight: 48,
    paddingHorizontal: 12,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  stageTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  stageBody: { flex: 1, flexDirection: "row", minHeight: 90 },
  inspector: { maxWidth: 180, borderLeftWidth: 1, borderColor: C.line },
  transport: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderColor: C.line,
  },
  count: { fontSize: 13, fontWeight: "700", color: C.ink },
});
