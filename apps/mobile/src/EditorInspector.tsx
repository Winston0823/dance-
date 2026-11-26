import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import {
  ensurePaths,
  suggestTransition,
  formatCount,
  type ProjectDocument,
  type MotionWarning,
} from "../../../packages/core/src/index.ts";
import {
  UI_PALETTE as P,
  DANCER_PALETTE,
} from "../../../packages/core/src/palette.ts";
import {
  numeric,
  changePosition,
  changeWaypoint,
  addWaypoint,
  removeWaypoint,
  changeTiming,
  changeSection,
  editablePath,
} from "./editing.ts";

type Props = {
  warnings: MotionWarning[];
  doc: ProjectDocument;
  formationId: string;
  selected: string;
  onSelect: (id: string) => void;
  onModify: (fn: (d: ProjectDocument) => ProjectDocument) => boolean;
  coneId: string;
  coneFocus: number;
  onCone: (id: string) => void;
  canUndo: boolean;
  onUndo: () => void;
  onSeek: (beat: number) => void;
  onFormation: (id: string, beat: number) => void;
};
function Action({
  title,
  onPress,
  disabled = false,
  active = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, active && s.active, disabled && { opacity: 0.35 }]}
    >
      <Text style={[s.action, active && { color: "white" }]}>{title}</Text>
    </Pressable>
  );
}
function Input({
  label,
  value,
  onChange,
  numeric: isNumeric = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.caption}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={isNumeric ? "numbers-and-punctuation" : "default"}
        style={s.input}
      />
    </View>
  );
}
const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
export default function EditorInspector({
  warnings,
  doc,
  formationId,
  selected,
  onSelect,
  onModify,
  coneId,
  coneFocus,
  onCone,
  canUndo,
  onUndo,
  onSeek,
  onFormation,
}: Props) {
  const [tool, setTool] = useState<"cast" | "route" | "timing" | "cones">(
    "cast",
  );
  const [x, setX] = useState(""),
    [y, setY] = useState(""),
    [name, setName] = useState("");
  const [waypoint, setWaypoint] = useState(1),
    [wx, setWX] = useState(""),
    [wy, setWY] = useState(""),
    [wt, setWT] = useState("");
  const [arrival, setArrival] = useState(""),
    [duration, setDuration] = useState(""),
    [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState(doc.sections[0].id),
    [sectionTitle, setSectionTitle] = useState(""),
    [sectionStart, setSectionStart] = useState(""),
    [sectionEnd, setSectionEnd] = useState("");
  const section =
    doc.sections.find((s) => s.id === sectionId) ?? doc.sections[0];
  useEffect(() => {
    setSectionTitle(section.title);
    setSectionStart(String(section.startBeat));
    setSectionEnd(String(section.endBeat));
  }, [section]);
  const [cx, setCX] = useState(""),
    [cy, setCY] = useState(""),
    [coneLabel, setConeLabel] = useState("");
  const f =
    doc.formations.find((f) => f.id === formationId) ?? doc.formations[0];
  const previous = doc.formations[doc.formations.indexOf(f) - 1];
  const dancer = doc.dancers.find((d) => d.id === selected);
  const path = doc.paths[f.id]?.[selected];
  const cone = doc.cones.find((c) => c.id === coneId);
  useEffect(() => {
    const p = f.positions[selected];
    if (p) {
      setX(String(p.x));
      setY(String(p.y));
    }
    setName(dancer?.name ?? "");
  }, [f, selected, dancer?.name]);
  useEffect(() => {
    setWaypoint(1);
  }, [f.id, selected]);
  useEffect(() => {
    const p = path?.points[waypoint];
    if (p) {
      setWX(String(p.x));
      setWY(String(p.y));
      setWT(String(+(p.t * 100).toFixed(3)));
    }
  }, [path, waypoint]);
  useEffect(() => {
    setArrival(String(f.beat));
    setDuration(String(f.transitionBeats));
    setTitle(f.title);
  }, [f]);
  useEffect(() => {
    if (cone) {
      setCX(String(cone.x));
      setCY(String(cone.y));
      setConeLabel(cone.label);
    }
  }, [cone]);
  useEffect(() => {
    if (coneId) setTool("cones");
  }, [coneId, coneFocus]);
  const apply = (fn: (d: ProjectDocument) => ProjectDocument) => onModify(fn);
  const label = (value: string, what: string) => {
    if (!value.trim() || value.length > 120)
      throw new Error(`${what} must contain 1–120 characters.`);
    return value.trim();
  };
  return (
    <ScrollView
      style={s.wrap}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 5 }}
      >
        {(["cast", "route", "timing", "cones"] as const).map((t) => (
          <Action
            key={t}
            title={
              t === "cast"
                ? "Dancers"
                : t === "route"
                  ? "Route"
                  : t === "timing"
                    ? "Timing"
                    : "Cones"
            }
            active={tool === t}
            onPress={() => setTool(t)}
          />
        ))}
      </ScrollView>
      <Text style={s.caption}>SELECT FORMATION</Text>
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 5 }}
        showsHorizontalScrollIndicator
      >
        {doc.formations.map((formation) => (
          <Action
            key={formation.id}
            title={formation.title + " · " + formatCount(formation.beat)}
            active={formation.id === f.id}
            onPress={() => onFormation(formation.id, formation.beat)}
          />
        ))}
      </ScrollView>
      <Text style={s.heading}>{f.title}</Text>
      <Text style={s.caption}>
        Arrival {formatCount(f.beat)} · global beat {f.beat}
      </Text>
      <Action title="Show arrival position" onPress={() => onSeek(f.beat)} />
      {tool !== "cones" && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          horizontal
          contentContainerStyle={{ gap: 5 }}
          showsHorizontalScrollIndicator
        >
          {doc.dancers.map((d, i) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              onPress={() => onSelect(d.id)}
              style={[
                s.person,
                selected === d.id && {
                  borderColor: P.primary,
                  backgroundColor: P.selection,
                },
              ]}
            >
              <View
                style={[
                  s.dot,
                  {
                    backgroundColor: DANCER_PALETTE[i % DANCER_PALETTE.length],
                  },
                ]}
              />
              <Text style={s.action}>{d.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {tool === "cast" && dancer && (
        <>
          <Input label="Dancer name" value={name} onChange={setName} />
          <Action
            title="Rename dancer"
            onPress={() =>
              apply((d) => {
                d.dancers.find((p) => p.id === selected)!.name = label(
                  name,
                  "Dancer name",
                );
                return d;
              })
            }
          />
          <Input
            label="Position X · metres"
            numeric
            value={x}
            onChange={setX}
          />
          <Input
            label="Position Y · metres"
            numeric
            value={y}
            onChange={setY}
          />
          <Action
            title="Apply formation position"
            onPress={() =>
              apply((d) =>
                changePosition(
                  d,
                  f.id,
                  selected,
                  numeric(x, "X"),
                  numeric(y, "Y"),
                ),
              )
            }
          />
          <Text style={s.caption}>
            Moving a formation position updates unlocked incoming/outgoing
            endpoints. Locked routes must be unlocked first.
          </Text>
          <Action
            title="Add dancer"
            onPress={() => {
              const id = newId("d");
              const added = apply((d) => {
                d.dancers.push({
                  id,
                  name: `Dancer ${d.dancers.length + 1}`,
                  color:
                    DANCER_PALETTE[d.dancers.length % DANCER_PALETTE.length],
                  radius: 0.32,
                });
                for (const f of d.formations)
                  f.positions[id] = { x: 0, y: d.stage.depth / 2 };
                return ensurePaths(d);
              });
              if (added) onSelect(id);
            }}
          />
          <Action
            title="Remove selected dancer"
            disabled={doc.dancers.length <= 1}
            onPress={() =>
              Alert.alert(
                "Remove dancer?",
                `${dancer.name} will be removed from every draft formation and route. Published revisions stay unchanged.`,
                [
                  { text: "Cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                      apply((d) => {
                        d.dancers = d.dancers.filter((p) => p.id !== selected);
                        for (const f of d.formations)
                          delete f.positions[selected];
                        for (const paths of Object.values(d.paths))
                          delete paths[selected];
                        return d;
                      });
                      onSelect(doc.dancers.find((p) => p.id !== selected)!.id);
                    },
                  },
                ],
              )
            }
          />
        </>
      )}
      {tool === "route" && (
        <>
          <Text style={s.caption}>
            {previous
              ? `INCOMING: ${previous.title} → ${f.title}\nBeats ${f.beat - f.transitionBeats}–${f.beat} (${f.transitionBeats} beats)`
              : "The first formation has no incoming route."}
          </Text>
          {path && (
            <>
              <Action
                title={path.locked ? "Unlock route" : "Lock route"}
                active={path.locked}
                onPress={() =>
                  apply((d) => {
                    d.paths[f.id][selected].locked = !path.locked;
                    return d;
                  })
                }
              />
              <Action
                title={
                  path.interpolation === "smooth"
                    ? "Smooth curve selected · use straight"
                    : "Straight segments selected · use smooth"
                }
                disabled={path.locked}
                onPress={() =>
                  apply((d) => {
                    const p = editablePath(d, f.id, selected);
                    p.interpolation =
                      p.interpolation === "smooth" ? "linear" : "smooth";
                    return d;
                  })
                }
              />
              <Text style={s.caption}>
                Curves use the same canonical sampled trajectory for display,
                playback and clearance checks. Endpoints follow formation
                positions.
              </Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                horizontal
                contentContainerStyle={{ gap: 5 }}
              >
                {path.points.slice(1, -1).map((p, i) => (
                  <Action
                    key={i}
                    title={`Point ${i + 1} · ${Math.round(p.t * 100)}%`}
                    active={waypoint === i + 1}
                    onPress={() => setWaypoint(i + 1)}
                  />
                ))}
              </ScrollView>
              {path.points[waypoint] && waypoint < path.points.length - 1 && (
                <>
                  <Input
                    label="Waypoint X · metres"
                    numeric
                    value={wx}
                    onChange={setWX}
                  />
                  <Input
                    label="Waypoint Y · metres"
                    numeric
                    value={wy}
                    onChange={setWY}
                  />
                  <Input
                    label="Waypoint time · % of transition"
                    numeric
                    value={wt}
                    onChange={setWT}
                  />
                  <Action
                    title="Move waypoint"
                    disabled={path.locked}
                    onPress={() =>
                      apply((d) =>
                        changeWaypoint(
                          d,
                          f.id,
                          selected,
                          waypoint,
                          numeric(wx, "Waypoint X"),
                          numeric(wy, "Waypoint Y"),
                          numeric(wt, "Waypoint time") / 100,
                        ),
                      )
                    }
                  />
                  <Action
                    title="Remove waypoint"
                    disabled={path.locked}
                    onPress={() => {
                      apply((d) => removeWaypoint(d, f.id, selected, waypoint));
                      setWaypoint(Math.max(1, waypoint - 1));
                    }}
                  />
                </>
              )}
              <Action
                title="Add waypoint in widest interval"
                disabled={path.locked || path.points.length >= 64}
                onPress={() => apply((d) => addWaypoint(d, f.id, selected))}
              />
              <Action
                title="Suggest incoming transition routes"
                disabled={!f.transitionBeats}
                onPress={() => apply((d) => suggestTransition(d, f.id))}
              />
              <Text style={s.caption}>
                Suggestions preserve all locked routes and may leave planning
                warnings.
              </Text>
            </>
          )}
        </>
      )}
      {tool === "timing" && (
        <>
          <Input label="Formation title" value={title} onChange={setTitle} />
          <Input
            label="Arrival · global beat"
            numeric
            value={arrival}
            onChange={setArrival}
          />
          <Input
            label="Incoming transition · beats"
            numeric
            value={duration}
            onChange={setDuration}
          />
          <Action
            title="Apply formation timing"
            onPress={() => {
              let target: number | undefined;
              const applied = apply((d) => {
                const at = numeric(arrival, "Arrival beat");
                const changed = changeTiming(
                  d,
                  f.id,
                  at,
                  numeric(duration, "Transition duration"),
                );
                changed.formations.find((p) => p.id === f.id)!.title = label(
                  title,
                  "Formation title",
                );
                target = at;
                return changed;
              });
              if (applied && target !== undefined) onSeek(target);
            }}
          />
          <Text style={s.caption}>
            Quarter-beat increments. Arrival stays after the previous formation
            and before the next transition. First arrival and duration are zero.
            Timing edits never ripple other formations or music.
          </Text>
          <Text style={s.heading}>Choreography sections</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            horizontal
            contentContainerStyle={{ gap: 5 }}
          >
            {doc.sections.map((s) => (
              <Action
                key={s.id}
                title={s.title}
                active={section.id === s.id}
                onPress={() => setSectionId(s.id)}
              />
            ))}
          </ScrollView>
          <Input
            label="Section title"
            value={sectionTitle}
            onChange={setSectionTitle}
          />
          <Input
            label="Section start · global beat"
            numeric
            value={sectionStart}
            onChange={setSectionStart}
          />
          <Input
            label="Section end · global beat"
            numeric
            value={sectionEnd}
            onChange={setSectionEnd}
          />
          <Action
            title="Apply section grouping"
            onPress={() =>
              apply((d) =>
                changeSection(
                  d,
                  section.id,
                  sectionTitle,
                  numeric(sectionStart, "Section start"),
                  numeric(sectionEnd, "Section end"),
                ),
              )
            }
          />
          <Text style={s.caption}>
            Adjacent boundaries follow this range. Formations, saved routes and
            audio never move when section grouping changes.
          </Text>
        </>
      )}
      {tool === "cones" && (
        <>
          <Text style={s.caption}>
            Cones are visual stage references; they are not automatic collision
            obstacles.
          </Text>
          {doc.cones.map((c) => (
            <Action
              key={c.id}
              title={`▲ ${c.label}`}
              active={coneId === c.id}
              onPress={() => onCone(c.id)}
            />
          ))}
          <Action
            title="Add cone at stage centre"
            onPress={() => {
              const id = newId("cone");
              const added = apply((d) => {
                d.cones.push({
                  id,
                  label: `Cone ${d.cones.length + 1}`,
                  x: 0,
                  y: d.stage.depth / 2,
                });
                return d;
              });
              if (added) onCone(id);
            }}
          />
          {cone && (
            <>
              <Input
                label="Cone label"
                value={coneLabel}
                onChange={setConeLabel}
              />
              <Input
                label="Cone X · metres"
                numeric
                value={cx}
                onChange={setCX}
              />
              <Input
                label="Cone Y · metres"
                numeric
                value={cy}
                onChange={setCY}
              />
              <Action
                title="Apply cone"
                onPress={() =>
                  apply((d) => {
                    const c = d.cones.find((p) => p.id === coneId)!;
                    c.label = label(coneLabel, "Cone label");
                    c.x = numeric(cx, "Cone X");
                    c.y = numeric(cy, "Cone Y");
                    if (
                      Math.abs(c.x) > d.stage.width / 2 ||
                      c.y < 0 ||
                      c.y > d.stage.depth
                    )
                      throw new Error(
                        "Keep cones inside the stage so they remain selectable.",
                      );
                    return d;
                  })
                }
              />
              <Action
                title="Remove cone"
                onPress={() => {
                  apply((d) => {
                    d.cones = d.cones.filter((p) => p.id !== coneId);
                    return d;
                  });
                  onCone("");
                }}
              />
            </>
          )}
        </>
      )}
      <Text style={s.caption}>
        {warnings.length} planning warnings · these are model estimates
      </Text>
      {warnings.slice(0, 12).map((w) => (
        <Action
          key={w.id}
          title={formatCount(w.beat) + " · " + w.message}
          onPress={() => {
            if (w.dancerIds[0]) onSelect(w.dancerIds[0]);
            onSeek(w.beat);
          }}
        />
      ))}
      <Action title="Undo last edit" disabled={!canUndo} onPress={onUndo} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  wrap: {
    width: 240,
    borderLeftWidth: 1,
    borderColor: P.line,
    backgroundColor: P.paper,
  },
  content: { padding: 12, gap: 9, paddingBottom: 30 },
  button: {
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: P.selection,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  active: { backgroundColor: P.primary },
  action: { fontSize: 12, color: P.primary, fontWeight: "600" },
  heading: { fontSize: 17, color: P.ink, fontWeight: "700" },
  caption: { color: P.muted, fontSize: 11, lineHeight: 17 },
  input: {
    minHeight: 44,
    padding: 9,
    borderWidth: 1,
    borderColor: P.line,
    backgroundColor: "white",
    borderRadius: 7,
    color: P.ink,
  },
  person: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: P.line,
    borderRadius: 8,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
